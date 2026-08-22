"use server"

import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export type BookingResult = { ok: boolean; error?: string }

export async function bookLiveSessionAction(_prev: unknown, formData: FormData): Promise<BookingResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول اولاً" }
  if (user.role !== "STUDENT") return { ok: false, error: "الحجز متاح للطلاب فقط" }

  const id = String(formData.get("sessionId") ?? "")
  if (!id) return { ok: false, error: "رقم الجلسة مطلوب" }

  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.liveSession.findUnique({ where: { id } })
    if (!session) throw new Error("SESSION_NOT_FOUND")
    if (session.isFree || Number(session.price) <= 0) throw new Error("SESSION_IS_FREE")
    if (new Date(session.startAt).getTime() <= Date.now()) throw new Error("SESSION_ENDED")

    const existing = await tx.sessionBooking.findUnique({
      where: { userId_sessionId: { userId: user.id, sessionId: id } },
    })
    if (existing?.status === "booked") throw new Error("ALREADY_BOOKED")

    if (session.maxCapacity > 0) {
      const count = await tx.sessionBooking.count({
        where: { sessionId: id, status: "booked" },
      })
      if (count >= session.maxCapacity) throw new Error("CAPACITY_FULL")
    }

    const price = Number(session.price)
    const freshUser = await tx.user.findUnique({ where: { id: user.id } })
    if (!freshUser) throw new Error("USER_NOT_FOUND")
    const wallet = Number(freshUser.walletBalance)
    if (wallet < price) throw new Error("INSUFFICIENT_BALANCE")

    const newBalance = wallet - price
    await tx.user.update({ where: { id: user.id }, data: { walletBalance: newBalance } })
    await tx.walletTransaction.create({
      data: {
        userId: user.id,
        amount: -price,
        balanceAfter: newBalance,
        type: "live",
        description: `حجز حصة «${session.title}»`,
      },
    })

    if (existing) {
      await tx.sessionBooking.update({ where: { id: existing.id }, data: { status: "booked" } })
    } else {
      await tx.sessionBooking.create({ data: { userId: user.id, sessionId: id, status: "booked" } })
    }

    await tx.notification.create({
      data: {
        userId: user.id,
        title: "تم حجز الحصة",
        body: `تم حجز «${session.title}» بنجاح من محفظتك (${price} جنيه)`,
        link: `/live/${id}`,
      },
    })

    return { ok: true as const }
  }).catch((e: unknown) => {
    if (e instanceof Error) {
      const map: Record<string, string> = {
        SESSION_NOT_FOUND: "الجلسة غير موجودة",
        SESSION_IS_FREE: "هذه الجلسة مجانية",
        SESSION_ENDED: "انتهت الجلسة — لا يمكن الحجز",
        ALREADY_BOOKED: "انت محجوز مسبقاً في هذه الجلسة",
        CAPACITY_FULL: "اكتمل العدد المقرر للجلسة",
        INSUFFICIENT_BALANCE: "رصيد محفظتك غير كافٍ — قم بشحن المحفظة اولاً",
        USER_NOT_FOUND: "يجب تسجيل الدخول اولاً",
      }
      if (map[e.message]) return { ok: false as const, error: map[e.message] }
    }
    throw e
  })

  return result
}

export async function cancelLiveBookingAction(_prev: unknown, formData: FormData): Promise<BookingResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول اولاً" }
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
  await prisma.$transaction(async (tx) => {
    const freshUser = await tx.user.findUnique({ where: { id: user.id } })
    if (!freshUser) throw new Error("USER_NOT_FOUND")
    const wallet = Number(freshUser.walletBalance)
    const newBalance = wallet + price

    await tx.user.update({ where: { id: user.id }, data: { walletBalance: newBalance } })
    await tx.walletTransaction.create({
      data: {
        userId: user.id,
        amount: price,
        balanceAfter: newBalance,
        type: "refund",
        description: `استرداد حجز «${session.title}»`,
      },
    })
    await tx.sessionBooking.update({ where: { id: booking.id }, data: { status: "cancelled" } })
    await tx.notification.create({
      data: {
        userId: user.id,
        title: "تم إلغاء الحجز",
        body: `تم استرداد ${price} جنيه إلى محفظتك`,
        link: `/live/${id}`,
      },
    })
  })

  return { ok: true }
}
