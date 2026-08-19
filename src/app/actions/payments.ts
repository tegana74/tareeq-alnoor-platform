"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { isSubscribed } from "@/lib/subscriptions"

const proofSchema = z.object({
  courseId: z.string().min(1),
  method: z.enum(["VODAFONE_CASH", "INSTAPAY"]),
  senderName: z.string().min(2, "ط§ظƒطھط¨ ط§ط³ظ… ظ…ط±ط³ظ„ ط§ظ„طھط­ظˆظٹظ„"),
  reference: z.string().min(3, "ط§ظƒطھط¨ ط±ظ‚ظ… ط§ظ„ظ…ط±ط¬ط¹/ط§ظ„ط¥ظٹطµط§ظ„"),
  amount: z.coerce.number().positive("ط§ظ„ظ…ط¨ظ„ط؛ ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ط£ظƒط¨ط± ظ…ظ† طµظپط±"),
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
  if (!user) return { ok: false, error: "ظٹط¬ط¨ طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„ ط£ظˆظ„ط§ظ‹" }

  const courseId = String(formData.get("courseId") ?? "")
  const course = await prisma.course.findUnique({ where: { id: courseId } })
  if (!course) return { ok: false, error: "ط§ظ„ظƒظˆط±ط³ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }

  if (await isSubscribed(user.id, courseId)) {
    return { ok: false, error: "ط£ظ†طھ ظ…ط´طھط±ظƒ ط¨ط§ظ„ظپط¹ظ„ ظپظٹ ظ‡ط°ط§ ط§ظ„ظƒظˆط±ط³" }
  }

  const wallet = Number(user.walletBalance)
  const price = Number(course.price)
  if (wallet < price) {
    return { ok: false, error: "ط±طµظٹط¯ ظ…ط­ظپط¸طھظƒ ط؛ظٹط± ظƒط§ظپظچ â€” ظ‚ظ… ط¨ط´ط­ظ† ط§ظ„ظ…ط­ظپط¸ط© ط£ظˆظ„ط§ظ‹" }
  }

  const newBalance = wallet - price
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { walletBalance: newBalance } }),
    prisma.invoice.create({
      data: {
        userId: user.id,
        courseId,
        type: "SUBSCRIBE",
        amount: price,
        method: "WALLET",
        status: "PAID",
        reviewedAt: new Date(),
        senderName: "ط§ظ„ظ…ط­ظپط¸ط©",
        reference: "wallet",
      },
    }),
    prisma.walletTransaction.create({
      data: {
        userId: user.id,
        amount: -price,
        balanceAfter: newBalance,
        type: "subscribe",
        description: `ط§ظ„ط§ط´طھط±ط§ظƒ ظپظٹ ${course.name}`,
      },
    }),
    prisma.subscription.create({
      data: {
        userId: user.id,
        courseId,
        price,
        status: "active",
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    }),
  ])

  return { ok: true }
}

export async function submitPaymentAction(
  _prev: unknown,
  formData: FormData
): Promise<SubmitPaymentResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "ظٹط¬ط¨ طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„ ط£ظˆظ„ط§ظ‹" }

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

  const { courseId, method, senderName, reference, amount, date, notes, couponCode, imageUrl } = parsed.data

  const course = await prisma.course.findUnique({ where: { id: courseId } })
  if (!course) return { ok: false, error: "ط§ظ„ظƒظˆط±ط³ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }

  if (await isSubscribed(user.id, courseId)) {
    return { ok: false, error: "ط£ظ†طھ ظ…ط´طھط±ظƒ ط¨ط§ظ„ظپط¹ظ„ ظپظٹ ظ‡ط°ط§ ط§ظ„ظƒظˆط±ط³" }
  }

  // طھط·ط¨ظٹظ‚ ط§ظ„ظƒظˆط¨ظˆظ†
  let finalAmount = Number(course.price)
  let couponApplied = false
  if (couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } })
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
      couponApplied = true
      await prisma.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      })
    }
  }

  const invoice = await prisma.invoice.create({
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

  await prisma.paymentProof.create({
    data: {
      invoiceId: invoice.id,
      reference,
      senderName,
      amount: finalAmount,
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

  // ط¥ط´ط¹ط§ط± ظ„ظ„ط£ط¯ظ…ظ†
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } })
  for (const admin of admins) {
    await prisma.notification.create({
      data: {
        userId: admin.id,
        title: "ط·ظ„ط¨ ط¯ظپط¹ ط¬ط¯ظٹط¯",
        body: `${user.firstName} ظٹط±ظٹط¯ ط§ظ„ط§ط´طھط±ط§ظƒ ظپظٹ ${course.name} ط¨ظ‚ظٹظ…ط© ${finalAmount} ط¬.ظ…`,
        link: "/admin/payments",
      },
    })
  }

  return {
    ok: true,
    ...(couponApplied ? {} : {}),
  }
}

export async function redeemCodeAction(
  _prev: unknown,
  formData: FormData
): Promise<SubmitPaymentResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول أولاً" }

  const code = String(formData.get("code") ?? "").trim().toUpperCase()
  if (!code) return { ok: false, error: "اكتب كود الشحن" }

  const insertCode = await prisma.insertCode.findUnique({ where: { code } })
  if (!insertCode) return { ok: false, error: "الكود غير صحيح" }
  if (insertCode.isUsed) return { ok: false, error: "هذا الكود مستخدم من قبل" }

  const value = Number(insertCode.value)
  const newBalance = Number(user.walletBalance) + value

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { walletBalance: newBalance } }),
    prisma.insertCode.update({ where: { id: insertCode.id }, data: { isUsed: true, usedAt: new Date() } }),
    prisma.insertCodeUsage.create({ data: { codeId: insertCode.id, userId: user.id } }),
    prisma.walletTransaction.create({
      data: {
        userId: user.id,
        amount: value,
        balanceAfter: newBalance,
        type: "code",
        description: "شحن محفظة بكود اشتراك",
      },
    }),
  ])

  return { ok: true }
}

export async function chargeWalletAction(
  _prev: unknown,
  formData: FormData
): Promise<SubmitPaymentResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "ظٹط¬ط¨ طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„ ط£ظˆظ„ط§ظ‹" }

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
        title: "ط·ظ„ط¨ ط´ط­ظ† ظ…ط­ظپط¸ط©",
        body: `${user.firstName} ظٹط±ظٹط¯ ط´ط­ظ† ظ…ط­ظپط¸طھظ‡ ط¨ظ‚ظٹظ…ط© ${amount} ط¬.ظ…`,
        link: "/admin/payments",
      },
    })
  }

  return { ok: true }
}
