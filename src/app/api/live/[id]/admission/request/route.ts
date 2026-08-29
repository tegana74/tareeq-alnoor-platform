import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import {
  ADMISSION_RATE_LIMITED,
  ADMISSION_REQUEST_LIMIT,
  canManageAdmission,
  canRequestAdmission,
  isAdmissionManagedSession,
  resolveRequestOutcome,
  toAdmissionState,
} from "@/lib/live-classroom/admission"
import {
  ADMISSION_UNAVAILABLE,
  checkStudentSessionAccess,
  isAdmissionTableMissing,
} from "@/lib/live-classroom/admission-server"
import { checkRateLimit } from "@/lib/live-classroom/rate-limit"
import type { LiveSessionStatus } from "@/lib/live-classroom/types"

export const dynamic = "force-dynamic"

/**
 * POST /api/live/[id]/admission/request
 *
 * الطالب يطلب الدخول. لا يُصدر توكن ولا يمنح أي وصول إلى LiveKit —
 * ينشئ سجل pending فقط بانتظار قرار المعلم.
 *
 * Idempotent: طلب موجود pending لا يُنشئ سجلًا جديدًا.
 */
export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    // ─── 1. المصادقة ─────────────────────────────────────────────
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }

    // ─── 2. الجلسة ───────────────────────────────────────────────
    const { id } = await ctx.params
    const session = await prisma.liveSession.findUnique({
      where: { id },
      include: { bookings: { where: { userId: user.id } } },
    })
    if (!session) {
      return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
    }

    // ─── 3. المعلم المالك/الأدمن لا يطلب دخولًا ──────────────────
    if (canManageAdmission(user, session)) {
      return NextResponse.json(
        { error: "المعلم لا يحتاج إلى طلب دخول" },
        { status: 400 }
      )
    }
    if (user.role === "TEACHER") {
      return NextResponse.json(
        { error: "غير مصرح لك بدخول هذه الجلسة" },
        { status: 403 }
      )
    }

    // ─── 4. حد معدّل بعد إثبات الهوية والدور (LIVE-9F/S2) ────────────
    // بعد الفحوص المجانية وقبل أي قراءة اشتراك أو كتابة سجل: نقرة متكررة لا
    // تفتح مسار قاعدة بيانات جديداً. المفتاح هو الجلسة + الطالب المصادَق عليه،
    // فلا يستهلك مجهول الهوية حصة أحد ولا تُقيَّد جلسة بسبب أخرى.
    if (
      !checkRateLimit(
        `admission_request_${id}_${user.id}`,
        ADMISSION_REQUEST_LIMIT.max,
        ADMISSION_REQUEST_LIMIT.windowMs
      )
    ) {
      return NextResponse.json(
        { error: ADMISSION_RATE_LIMITED.error },
        { status: ADMISSION_RATE_LIMITED.status }
      )
    }

    // ─── 5. الجلسات الخارجية (YouTube/Zoom/Meet) بلا نظام دخول ───
    if (!isAdmissionManagedSession(session.url)) {
      return NextResponse.json(
        { error: "هذه الجلسة لا تستخدم نظام طلبات الدخول" },
        { status: 400 }
      )
    }

    // ─── 6. صلاحيات الكورس والحجز (كما هي، بلا تخفيف) ────────────
    const access = await checkStudentSessionAccess(user, session)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    // ─── 7. حالة الجلسة تسمح بالطلب ──────────────────────────────
    if (!canRequestAdmission(session.status as LiveSessionStatus)) {
      return NextResponse.json(
        { error: "لا يمكن طلب الدخول لهذه الجلسة" },
        { status: 400 }
      )
    }

    // ─── 8. إنشاء/تحديث الطلب — idempotent ───────────────────────
    const where = { sessionId_userId: { sessionId: id, userId: user.id } }
    const existing = await prisma.liveSessionAdmission.findUnique({ where })
    const outcome = resolveRequestOutcome(toAdmissionState(existing))

    if (outcome === "create") {
      try {
        const created = await prisma.liveSessionAdmission.create({
          data: { sessionId: id, userId: user.id, status: "pending" },
        })
        return NextResponse.json({
          status: toAdmissionState(created),
          requestedAt: created.requestedAt,
          created: true,
        })
      } catch (error) {
        // طلبان متزامنان → القيد الفريد يمنع التكرار؛ نعيد قراءة السجل القائم
        if ((error as { code?: unknown })?.code !== "P2002") throw error
        const raced = await prisma.liveSessionAdmission.findUnique({ where })
        return NextResponse.json({
          status: toAdmissionState(raced),
          requestedAt: raced?.requestedAt ?? null,
          created: false,
        })
      }
    }

    if (outcome === "reset-to-pending") {
      const reset = await prisma.liveSessionAdmission.update({
        where,
        data: {
          status: "pending",
          requestedAt: new Date(),
          decidedAt: null,
          decidedBy: null,
        },
      })
      return NextResponse.json({
        status: toAdmissionState(reset),
        requestedAt: reset.requestedAt,
        created: false,
      })
    }

    // pending أو approved — لا تغيير على الإطلاق
    return NextResponse.json({
      status: toAdmissionState(existing),
      requestedAt: existing?.requestedAt ?? null,
      created: false,
    })
  } catch (error) {
    if (isAdmissionTableMissing(error)) {
      console.error("[ADMISSION_REQUEST] live_session_admissions table missing")
      return NextResponse.json(
        { error: ADMISSION_UNAVAILABLE.error },
        { status: ADMISSION_UNAVAILABLE.status }
      )
    }
    console.error("[ADMISSION_REQUEST_ERROR]", error)
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 })
  }
}
