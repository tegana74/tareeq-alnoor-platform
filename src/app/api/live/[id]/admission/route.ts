import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import {
  canManageAdmission,
  isAdmissionManagedSession,
  toAdmissionState,
} from "@/lib/live-classroom/admission"
import {
  ADMISSION_UNAVAILABLE,
  isAdmissionTableMissing,
} from "@/lib/live-classroom/admission-server"

export const dynamic = "force-dynamic"

/**
 * GET /api/live/[id]/admission
 *
 * استعلام خفيف يخدم حالتين:
 * - الطالب: حالته الخاصة فقط (none | pending | approved | rejected)
 * - المعلم المالك/الأدمن: قائمة الطلبات المعلّقة
 *
 * لا يُصدر توكنًا ولا يفتح أي اتصال — قراءة حالة فقط.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }

    const { id } = await ctx.params
    const session = await prisma.liveSession.findUnique({
      where: { id },
      select: { id: true, teacherId: true, url: true, status: true },
    })
    if (!session) {
      return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
    }

    const managed = isAdmissionManagedSession(session.url)

    // ─── المعلم المالك / الأدمن → الطلبات المعلّقة ────────────────
    if (canManageAdmission(user, session)) {
      if (!managed) {
        return NextResponse.json({ role: "manager", managed: false, pending: [], approvedCount: 0 })
      }

      const [rows, approvedCount] = await Promise.all([
        prisma.liveSessionAdmission.findMany({
          where: { sessionId: id, status: "pending" },
          orderBy: { requestedAt: "asc" },
          select: {
            userId: true,
            requestedAt: true,
            user: {
              select: {
                firstName: true,
                middleName: true,
                lastName: true,
                year: { select: { name: true } },
                department: { select: { name: true } },
              },
            },
          },
        }),
        prisma.liveSessionAdmission.count({
          where: { sessionId: id, status: "approved" },
        }),
      ])

      return NextResponse.json({
        role: "manager",
        managed: true,
        approvedCount,
        pending: rows.map((row) => ({
          userId: row.userId,
          requestedAt: row.requestedAt,
          name: `${row.user.firstName} ${row.user.middleName ?? ""} ${row.user.lastName}`
            .replace(/\s+/g, " ")
            .trim(),
          yearName: row.user.year?.name ?? null,
          departmentName: row.user.department?.name ?? null,
        })),
      })
    }

    // ─── الطالب → حالته الخاصة فقط ───────────────────────────────
    const own = managed
      ? await prisma.liveSessionAdmission.findUnique({
          where: { sessionId_userId: { sessionId: id, userId: user.id } },
          select: { status: true, requestedAt: true },
        })
      : null

    return NextResponse.json({
      role: "student",
      managed,
      status: toAdmissionState(own),
      requestedAt: own?.requestedAt ?? null,
    })
  } catch (error) {
    if (isAdmissionTableMissing(error)) {
      console.error("[ADMISSION_STATE] live_session_admissions table missing")
      return NextResponse.json(
        { error: ADMISSION_UNAVAILABLE.error },
        { status: ADMISSION_UNAVAILABLE.status }
      )
    }
    console.error("[ADMISSION_STATE_ERROR]", error)
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 })
  }
}
