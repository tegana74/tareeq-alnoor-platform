import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import type { LiveSessionStatus } from "@/lib/live-classroom/types"

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }

    const { id } = await context.params
    const session = await prisma.liveSession.findUnique({
      where: { id },
      include: {
        attendances: { where: { userId: user.id } },
        bookings: { where: { userId: user.id } },
      },
    })

    if (!session) {
      return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
    }

    // 1. التحقق من صلاحيات الوصول الأساسية للكورس
    const hasAccess =
      session.isFree ||
      !session.courseId ||
      (await canAccessCourse(user, session.courseId))

    if (!hasAccess) {
      return NextResponse.json({ error: "غير مصرح لك بدخول هذه الجلسة" }, { status: 403 })
    }

    // 2. التحقق من صلاحيات الدفع / الحجز
    const isPaidSession = !session.isFree && Number(session.price) > 0
    const booking = session.bookings[0]
    const canWatch = !isPaidSession || booking?.status === "booked" || user.role === "ADMIN" || user.teacherId === session.teacherId

    // 3. احتساب التواريخ والحالة الزمنية (للموثوقية)
    const start = new Date(session.startAt)
    const end = new Date(start.getTime() + session.durationMinutes * 60000)
    const now = new Date()

    const isLiveTime = start.getTime() <= now.getTime() && now.getTime() < end.getTime()
    const isPastTime = now.getTime() >= end.getTime()

    // 4. استخراج يوتيوب للمقارنة
    const url = session.url || ""

    return NextResponse.json({
      status: (session.status || "scheduled") as LiveSessionStatus,
      isLive: isLiveTime,
      isPast: isPastTime,
      canWatch,
      attended: session.attendances.length > 0,
      url,
    })
  } catch (error) {
    console.error("[LIVE_STATUS_API_ERROR]", error)
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 })
  }
}
