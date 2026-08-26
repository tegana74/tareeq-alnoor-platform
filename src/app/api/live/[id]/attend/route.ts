import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { checkAttendanceAdmission } from "@/lib/live-classroom/admission-server"

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

  // 2. التحقق من صلاحيات الدفع / الحجز
  const isPaidSession = !session.isFree && Number(session.price) > 0
  const booking = session.bookings[0]
  const canWatch = !isPaidSession || booking?.status === "booked" || user.role === "ADMIN" || user.teacherId === session.teacherId
  if (!canWatch) return NextResponse.json({ error: "يجب حجز الحصة أولاً لتسجيل الحضور" }, { status: 403 })

  // 3. منع تسجيل الحضور إذا لم تكن الحالة "live" في قاعدة البيانات
  if (session.status !== "live") {
    return NextResponse.json({ error: "البث ليس مباشراً الآن في النظام" }, { status: 400 })
  }

  // 4. منع تسجيل الحضور خارج الوقت الزمني الفعلي للبث المباشر
  const start = new Date(session.startAt)
  const end = new Date(start.getTime() + session.durationMinutes * 60000)
  const now = new Date()
  if (now < start || now > end) return NextResponse.json({ error: "خارج وقت البث الزمني" }, { status: 400 })

  // 5. LIVE-9C — بوابة الدخول: الطالب المطرود أو غير الموافق عليه لا يسجل حضوراً
  const admission = await checkAttendanceAdmission(user, session)
  if (!admission.ok) {
    return NextResponse.json({ error: admission.error }, { status: admission.status })
  }

  await prisma.liveSessionAttendance.upsert({
    where: { userId_sessionId: { userId: user.id, sessionId: id } },
    create: { userId: user.id, sessionId: id },
    update: {},
  })
  return NextResponse.json({ ok: true })
}
