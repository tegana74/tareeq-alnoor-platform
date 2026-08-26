import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { checkAttendanceAdmission } from "@/lib/live-classroom/admission-server"

/**
 * LIVE-8D — Heartbeat
 *
 * POST /api/live/[id]/heartbeat
 * نبضة وجود خفيفة (كل 45 ثانية من المشاهد المتصل فعلياً بـ LiveKit).
 *
 * - نفس حراسة attend بالكامل (auth / course access / booking / live / time window)
 * - LIVE-9C: نفس بوابة الدخول أيضاً — الطالب المطرود لا تُقبل نبضاته
 * - Idempotent: يؤكد سجل الحضور عبر upsert (update: {}) — لا يسجلات مكررة أبداً
 * - لا يكتب أي حالة على LiveSession ولا يغيّر attendance semantics القديمة
 */
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })

  const { id } = await ctx.params
  const session = await prisma.liveSession.findUnique({
    where: { id },
    include: {
      bookings: { where: { userId: user.id } },
    },
  })
  if (!session) return NextResponse.json({ error: "غير موجودة" }, { status: 404 })

  // 1. التحقق من صلاحيات الوصول الأساسية للكورس
  const hasAccess =
    session.isFree ||
    !session.courseId ||
    (await canAccessCourse(user, session.courseId))
  if (!hasAccess) return NextResponse.json({ error: "غير مصرح" }, { status: 403 })

  // 2. التحقق من صلاحيات الدفع / الحجز (نفس قواعد attend)
  const isPaidSession = !session.isFree && Number(session.price) > 0
  const booking = session.bookings[0]
  const canWatch = !isPaidSession || booking?.status === "booked" || user.role === "ADMIN" || user.teacherId === session.teacherId
  if (!canWatch) return NextResponse.json({ error: "يجب حجز الحصة أولاً" }, { status: 403 })

  // 3. النبضات فقط أثناء البث المباشر الفعلي
  if (session.status !== "live") {
    return NextResponse.json({ error: "البث ليس مباشراً الآن في النظام" }, { status: 400 })
  }

  // 4. داخل النافذة الزمنية فقط
  const start = new Date(session.startAt)
  const end = new Date(start.getTime() + session.durationMinutes * 60000)
  const now = new Date()
  if (now < start || now > end) return NextResponse.json({ error: "خارج وقت البث الزمني" }, { status: 400 })

  // 5. LIVE-9C — بوابة الدخول: نبضة من طالب مطرود لا تُقبل
  const admission = await checkAttendanceAdmission(user, session)
  if (!admission.ok) {
    return NextResponse.json({ error: admission.error }, { status: admission.status })
  }

  // 6. Idempotent — يؤكد الحضور دون إنشاء تكرار (@@unique([userId, sessionId]))
  await prisma.liveSessionAttendance.upsert({
    where: { userId_sessionId: { userId: user.id, sessionId: id } },
    create: { userId: user.id, sessionId: id },
    update: {},
  })

  return NextResponse.json({ ok: true })
}
