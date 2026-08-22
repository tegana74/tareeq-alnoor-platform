"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { isSubscribed } from "@/lib/subscriptions"

const proofSchema = z.object({
  courseId: z.string().min(1),
  method: z.enum(["VODAFONE_CASH", "INSTAPAY"]),
  senderName: z.string().min(2, "اكتب اسم مرسلي التحويل"),
  reference: z.string().min(3, "اكتب رقم المرجع/الايصال"),
  amount: z.coerce.number().positive("المبلغ يجب ان يكون اكبر من صفر"),
  date: z.string().optional(),
  notes: z.string().optional(),
  couponCode: z.string().optional(),
  imageUrl: z.string().optional(),
})

export type SubmitPaymentResult = { ok: boolean; error?: string }

export async function payFromWalletAction(
  _prev: unknown,
  formData: FormData
): Promise<SubmitPaymentResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول اولا" }

  const courseId = String(formData.get("courseId") ?? "")
  const course = await prisma.course.findUnique({ where: { id: courseId } })
  if (!course) return { ok: false, error: "الكورس غير موجود" }

  if (await isSubscribed(user.id, courseId)) {
    return { ok: false, error: "انت مشترك بالفعل في هذا الكورس" }
  }

  const price = Number(course.price)

  const result = await prisma.$transaction(async (tx) => {
    const freshUser = await tx.user.findUnique({ where: { id: user.id } })
    if (!freshUser) throw new Error("USER_NOT_FOUND")
    const wallet = Number(freshUser.walletBalance)
    if (wallet < price) throw new Error("INSUFFICIENT_BALANCE")

    const newBalance = wallet - price
    await tx.user.update({ where: { id: user.id }, data: { walletBalance: newBalance } })

    await tx.invoice.create({
      data: {
        userId: user.id,
        courseId,
        type: "SUBSCRIBE",
        amount: price,
        method: "WALLET",
        status: "PAID",
        reviewedAt: new Date(),
        senderName: "المحفظة",
        reference: "wallet",
      },
    })

    await tx.walletTransaction.create({
      data: {
        userId: user.id,
        amount: -price,
        balanceAfter: newBalance,
        type: "subscribe",
        description: `الاشتراك في ${course.name}`,
      },
    })

    await tx.subscription.create({
      data: {
        userId: user.id,
        courseId,
        price,
        status: "active",
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    })

    return { ok: true as const }
  }).catch((e: unknown) => {
    if (e instanceof Error && e.message === "INSUFFICIENT_BALANCE") {
      return { ok: false as const, error: "رصيد محفظتك غير كافٍ" }
    }
    if (e instanceof Error && e.message === "USER_NOT_FOUND") {
      return { ok: false as const, error: "يجب تسجيل الدخول اولا" }
    }
    throw e
  })

  if (!result.ok) return { ok: false, error: result.error }

  return { ok: true }
}

export async function submitPaymentAction(
  _prev: unknown,
  formData: FormData
): Promise<SubmitPaymentResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول اولا" }

  const parsed = proofSchema.safeParse({
    courseId: String(formData.get("courseId") ?? ""),
    method: String(formData.get("method") ?? ""),
    senderName: String(formData.get("senderName") ?? "").trim(),
    reference: String(formData.get("reference") ?? "").trim(),
    amount: formData.get("amount") ?? 0,
    date: String(formData.get("date") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    couponCode: String(formData.get("couponCode") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const { courseId, method, senderName, reference, date, notes, couponCode, imageUrl } = parsed.data

  const course = await prisma.course.findUnique({ where: { id: courseId } })
  if (!course) return { ok: false, error: "الكورس غير موجود" }

  if (await isSubscribed(user.id, courseId)) {
    return { ok: false, error: "انت مشترك بالفعل في هذا الكورس" }
  }

  const invoice = await prisma.$transaction(async (tx) => {
    let finalAmount = Number(course.price)

    if (couponCode) {
      const coupon = await tx.coupon.findUnique({ where: { code: couponCode } })
      if (
        coupon &&
        coupon.isActive &&
        coupon.usedCount < coupon.maxUses &&
        (!coupon.expiresAt || coupon.expiresAt > new Date())
      ) {
        if (coupon.discountType === "percentage") {
          finalAmount = Math.max(0, finalAmount - (finalAmount * Number(coupon.discountValue)) / 100)
        } else {
          finalAmount = Math.max(0, finalAmount - Number(coupon.discountValue))
        }

        const updated = await tx.coupon.updateMany({
          where: { id: coupon.id, usedCount: { lt: coupon.maxUses } },
          data: { usedCount: { increment: 1 } },
        })
        if (updated.count === 0) throw new Error("COUPON_RACE")
      }
    }

    const inv = await tx.invoice.create({
      data: {
        userId: user.id,
        courseId,
        type: "SUBSCRIBE",
        amount: finalAmount,
        method,
        senderName,
        reference,
        notes,
        status: "PENDING",
      },
    })

    await tx.paymentProof.create({
      data: {
        invoiceId: inv.id,
        reference,
        senderName,
        amount: finalAmount,
        date: date ? new Date(date) : null,
        imageUrl: imageUrl ?? "",
      },
    })

    if (imageUrl) {
      await tx.invoice.update({
        where: { id: inv.id },
        data: { proofImage: imageUrl },
      })
    }

    return inv
  }).catch((e: unknown) => {
    if (e instanceof Error && e.message === "COUPON_RACE") {
      return null
    }
    throw e
  })

  if (!invoice) {
    return { ok: false, error: "تم استخدام هذا الكوبون من قبل" }
  }

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } })
  for (const admin of admins) {
    await prisma.notification.create({
      data: {
        userId: admin.id,
        title: "طلب دفع جديد",
        body: `${user.firstName} يريد الاشتراك في ${course.name} بقيمة ${invoice.amount} ج.م`,
        link: "/admin/payments",
      },
    })
  }

  return { ok: true }
}

export async function redeemCodeAction(
  _prev: unknown,
  formData: FormData
): Promise<SubmitPaymentResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول اولاً" }

  const code = String(formData.get("code") ?? "").trim().toUpperCase()
  if (!code) return { ok: false, error: "اكتب كود الشحن" }

  const result = await prisma.$transaction(async (tx) => {
    const insertCode = await tx.insertCode.findUnique({ where: { code } })
    if (!insertCode) throw new Error("INVALID_CODE")
    if (insertCode.isUsed) throw new Error("CODE_USED")

    const value = Number(insertCode.value)

    const freshUser = await tx.user.findUnique({ where: { id: user.id } })
    if (!freshUser) throw new Error("USER_NOT_FOUND")
    const newBalance = Number(freshUser.walletBalance) + value

    await tx.user.update({ where: { id: user.id }, data: { walletBalance: newBalance } })
    await tx.insertCode.update({ where: { id: insertCode.id }, data: { isUsed: true, usedAt: new Date() } })
    await tx.insertCodeUsage.create({ data: { codeId: insertCode.id, userId: user.id } })
    await tx.walletTransaction.create({
      data: {
        userId: user.id,
        amount: value,
        balanceAfter: newBalance,
        type: "code",
        description: "شحن محفظة بكود اشتراك",
      },
    })

    return { ok: true as const }
  }).catch((e: unknown) => {
    if (e instanceof Error && e.message === "INVALID_CODE") {
      return { ok: false as const, error: "الكود غير صحيح" }
    }
    if (e instanceof Error && e.message === "CODE_USED") {
      return { ok: false as const, error: "هذا الكود مستخدم من قبل" }
    }
    if (e instanceof Error && e.message === "USER_NOT_FOUND") {
      return { ok: false as const, error: "يجب تسجيل الدخول اولاً" }
    }
    throw e
  })

  return result
}

export async function chargeWalletAction(
  _prev: unknown,
  formData: FormData
): Promise<SubmitPaymentResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول اولا" }

  const parsed = proofSchema.omit({ courseId: true, couponCode: true }).safeParse({
    method: String(formData.get("method") ?? ""),
    senderName: String(formData.get("senderName") ?? "").trim(),
    reference: String(formData.get("reference") ?? "").trim(),
    amount: formData.get("amount") ?? 0,
    date: String(formData.get("date") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const { method, senderName, reference, amount, date, notes, imageUrl } = parsed.data

  const invoice = await prisma.invoice.create({
    data: {
      userId: user.id,
      type: "WALLET_CHARGE",
      amount,
      method,
      senderName,
      reference,
      notes,
      status: "PENDING",
    },
  })

  await prisma.paymentProof.create({
    data: {
      invoiceId: invoice.id,
      reference,
      senderName,
      amount,
      date: date ? new Date(date) : null,
      imageUrl: imageUrl ?? "",
    },
  })

  if (imageUrl) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { proofImage: imageUrl },
    })
  }

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } })
  for (const admin of admins) {
    await prisma.notification.create({
      data: {
        userId: admin.id,
        title: "طلب شحن محفظة",
        body: `${user.firstName} يريد شحن محفظته بقيمة ${amount} ج.م`,
        link: "/admin/payments",
      },
    })
  }

  return { ok: true }
}
