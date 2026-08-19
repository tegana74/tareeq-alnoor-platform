"use server"

import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export type BookingResult = { ok: boolean; error?: string }

export async function bookLiveSessionAction(_prev: unknown, formData: FormData): Promise<BookingResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول أولاً" }
  if (user.role !== "STUDENT") return { ok: false, error: "الحجز متاح للطلاب فقط" }

  const id = String(formData.get("sessionId") ?? "")
  const session = await prisma.liveSession.findUnique({ where: { id } })
  if (!session) return { ok: false, error: "الجلسة غير موجودة" }
  if (session.isFree || Number(session.price) <= 0) return { ok: false, error: "هذه الجلسة مجانية" }
  if (new Date(session.startAt).getTime() <= Date.now()) {
    return { ok: false, error: "انتهت الجلسة — لا يمكن الحجز" }
  }

  const existing = await prisma.sessionBooking.findUnique({
    where: { userId_sessionId: { userId: user.id, sessionId: id } },
  })
  if (existing?.status === "booked") return { ok: false, error: "أنت محجوز مسبقاً في هذه الجلسة" }

  if (session.maxCapacity > 0) {
    const count = await prisma.sessionBooking.count({
      where: { sessionId: id, status: "booked" },
    })
    if (count >= session.maxCapacity) return { ok: false, error: "اكتمل العدد المقرر للجلسة" }
  }

  const price = Number(session.price)
  const wallet = Number(user.walletBalance)
  if (wallet < price) {
    return { ok: false, error: "رصيد محفظتك غير كافٍ — قم بشحن المحفظة أولاً" }
  }

  const newBalance = wallet - price
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { walletBalance: newBalance } }),
    prisma.walletTransaction.create({
      data: {
        userId: user.id,
        amount: -price,
        balanceAfter: newBalance,
        type: "live",
        description: `حجز حصة «${session.title}»`,
      },
    }),
    existing
      ? prisma.sessionBooking.update({ where: { id: existing.id }, data: { status: "booked" } })
      : prisma.sessionBooking.create({ data: { userId: user.id, sessionId: id, status: "booked" } }),
    prisma.notification.create({
      data: {
        userId: user.id,
        title: "تم حجز الحصة",
        body: `تم حجز «${session.title}» بنجاح من محفظتك (${price} جنيه)`,
        link: `/live/${id}`,
      },
    }),
  ])
  return { ok: true }
}

export async function cancelLiveBookingAction(_prev: unknown, formData: FormData): Promise<BookingResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول أولاً" }
  if (user.role !== "STUDENT") return { ok: false, error: "الإلغاء متاح للطلاب فقط" }

  const id = String(formData.get("sessionId") ?? "")
  const session = await prisma.liveSession.findUnique({ where: { id } })
  if (!session) return { ok: false, error: "الجلسة غير موجودة" }
  if (new Date(session.startAt).getTime() <= Date.now()) {
    return { ok: false, error: "بدأت الجلسة — لا يمكن الإلغاء" }
  }

  const booking = await prisma.sessionBooking.findUnique({
    where: { userId_sessionId: { userId: user.id, sessionId: id } },
  })
  if (!booking || booking.status !== "booked") return { ok: false, error: "لا يوجد حجز نشط لإلغائه" }

  const price = Number(session.price)
  const wallet = Number(user.walletBalance)
  const newBalance = wallet + price
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { walletBalance: newBalance } }),
    prisma.walletTransaction.create({
      data: {
        userId: user.id,
        amount: price,
        balanceAfter: newBalance,
        type: "refund",
        description: `استرداد حجز «${session.title}»`,
      },
    }),
    prisma.sessionBooking.update({ where: { id: booking.id }, data: { status: "cancelled" } }),
    prisma.notification.create({
      data: {
        userId: user.id,
        title: "تم إلغاء الحجز",
        body: `تم استرداد ${price} جنيه إلى محفظتك`,
        link: `/live/${id}`,
      },
    }),
  ])
  return { ok: true }
}
