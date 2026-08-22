"use server"

import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { SUBSCRIPTION_DAYS } from "@/lib/constants"

function requireAdmin() {
  return getCurrentUser().then((user) => {
    if (!user) throw new Error("يجب تسجيل الدخول")
    if (user.role !== "ADMIN") throw new Error("غير مصرح")
    return user
  })
}

// الموافقة على فاتورة دفع (اشتراك أو شحن محفظة)
export async function approveInvoiceAction(invoiceId: string) {
  const admin = await requireAdmin()

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice || invoice.status !== "PENDING") {
    return { ok: false, error: "الفاتورة غير موجودة أو تمت مراجعتها بالفعل" }
  }

  if (invoice.type === "SUBSCRIBE" && invoice.courseId) {
    const existing = await prisma.subscription.findUnique({
      where: { userId_courseId: { userId: invoice.userId, courseId: invoice.courseId } },
    })
    if (existing) {
      return { ok: false, error: "هذا الطالب مشترك بالفعل في الكورس" }
    }
  }

  const user = await prisma.user.findUnique({ where: { id: invoice.userId } })
  if (!user) return { ok: false, error: "الطالب غير موجود" }

  const amount = Number(invoice.amount)

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.updateMany({
        where: { id: invoice.id, status: "PENDING" },
        data: {
          status: "PAID",
          reviewedById: admin.id,
          reviewedAt: new Date(),
        },
      })
      if (updated.count === 0) throw new Error("ALREADY_REVIEWED")

      if (invoice.type === "SUBSCRIBE" && invoice.courseId) {
        await tx.subscription.create({
          data: {
            userId: invoice.userId,
            courseId: invoice.courseId,
            price: amount,
            status: "active",
            expiresAt: new Date(Date.now() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000),
          },
        })
      } else if (invoice.type === "WALLET_CHARGE") {
        await tx.user.update({
          where: { id: invoice.userId },
          data: { walletBalance: { increment: amount } },
        })
        const freshUser = await tx.user.findUnique({ where: { id: invoice.userId } })
        await tx.walletTransaction.create({
          data: {
            userId: invoice.userId,
            amount,
            balanceAfter: Number(freshUser?.walletBalance ?? 0),
            type: "charge",
            invoiceId: invoice.id,
            description: "شحن المحفظة",
          },
        })
      }

      await tx.notification.create({
        data: {
          userId: invoice.userId,
          title:
            invoice.type === "SUBSCRIBE" ? "تم تفعيل اشتراكك" : "تم شحن محفظتك",
          body:
            invoice.type === "SUBSCRIBE"
              ? "تم تأكيد دفعك وتفعيل اشتراكك بنجاح، بالتوفيق في مذاكرتك!"
              : `تم إضافة ${amount} ج.م إلى محفظتك`,
          link: invoice.type === "SUBSCRIBE" ? "/wallet" : "/wallet",
        },
      })
    })
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "ALREADY_REVIEWED") {
      return { ok: false, error: "تمت مراجعة الفاتورة بالفعل" }
    }
    throw e
  }

  return { ok: true }
}

// رفض فاتورة
export async function rejectInvoiceAction(invoiceId: string, reason: string) {
  const admin = await requireAdmin()

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice || invoice.status !== "PENDING") {
    return { ok: false, error: "الفاتورة غير موجودة أو تمت مراجعتها بالفعل" }
  }

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "REJECTED",
        rejectedReason: reason || "بيانات غير مكتملة",
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    }),
    prisma.notification.create({
      data: {
        userId: invoice.userId,
        title: "تم رفض طلب الدفع",
        body: `عذراً، تم رفض طلبك بسبب: ${reason || "بيانات غير مكتملة"} — تواصل معنا للمساعدة`,
        link: "/wallet",
      },
    }),
  ])

  return { ok: true }
}
