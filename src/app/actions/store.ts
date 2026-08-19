"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { isSubscribed } from "@/lib/subscriptions"

export type StoreResult = { ok: boolean; error?: string; newBalance?: number }

const redeemSchema = z.object({
  itemId: z.string().min(1),
  courseId: z.string().optional(),
})

export async function redeemStoreItemAction(_prev: unknown, formData: FormData): Promise<StoreResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول أولاً" }
  if (user.role === "ADMIN" || user.role === "TEACHER") {
    return { ok: false, error: "المتجر متاح للطلاب فقط" }
  }

  const parsed = redeemSchema.safeParse({
    itemId: String(formData.get("itemId") ?? ""),
    courseId: String(formData.get("courseId") ?? "") || undefined,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const item = await prisma.storeItem.findUnique({ where: { id: parsed.data.itemId } })
  if (!item || !item.isActive) return { ok: false, error: "العنصر غير متاح" }

  const balance = Number(user.points)
  if (balance < item.pointsCost) return { ok: false, error: "رصيد النقاط غير كافٍ" }

  const courseId = parsed.data.courseId
  if (item.kind === "days" && !courseId) {
    return { ok: false, error: "اختر الكورس الذي تريد تمديد اشتراكه" }
  }
  if (courseId && !(await isSubscribed(user.id, courseId))) {
    return { ok: false, error: "يجب أن تكون مشتركاً في هذا الكورس أولاً حتى تستبدل الأيام" }
  }

  const txId = `redeem:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { points: { decrement: item.pointsCost } },
    })
    await tx.pointsTransaction.create({
      data: {
        userId: user.id,
        points: -item.pointsCost,
        reason: `استبدال «${item.title}» في المتجر`,
        dedupKey: txId,
      },
    })
    if (item.kind === "days" && courseId) {
      const sub = await tx.subscription.findUnique({
        where: { userId_courseId: { userId: user.id, courseId } },
      })
      const days = item.value || 30
      if (sub && sub.status === "active" && (!sub.expiresAt || sub.expiresAt > new Date())) {
        const base = sub.expiresAt && sub.expiresAt > new Date() ? sub.expiresAt : new Date()
        await tx.subscription.update({
          where: { id: sub.id },
          data: { expiresAt: new Date(base.getTime() + days * 24 * 60 * 60 * 1000) },
        })
      } else {
        await tx.subscription.upsert({
          where: { userId_courseId: { userId: user.id, courseId } },
          update: { status: "active", expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000) },
          create: {
            userId: user.id,
            courseId,
            price: 0,
            status: "active",
            expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
          },
        })
      }
    }
  })

  return { ok: true, newBalance: balance - item.pointsCost }
}

const itemSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  pointsCost: z.coerce.number().int().positive(),
  kind: z.enum(["days"]).default("days"),
  value: z.coerce.number().int().positive().default(30),
})

export async function createStoreItemAction(_prev: unknown, formData: FormData): Promise<StoreResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") return { ok: false, error: "غير مسموح" }
  const parsed = itemSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    pointsCost: formData.get("pointsCost") ?? 0,
    kind: "days",
    value: formData.get("value") ?? 30,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  await prisma.storeItem.create({ data: parsed.data })
  return { ok: true }
}

export async function toggleStoreItemAction(_prev: unknown, formData: FormData): Promise<StoreResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") return { ok: false, error: "غير مسموح" }
  const id = String(formData.get("id") ?? "")
  const item = await prisma.storeItem.findUnique({ where: { id } })
  if (!item) return { ok: false, error: "غير موجود" }
  await prisma.storeItem.update({ where: { id }, data: { isActive: !item.isActive } })
  return { ok: true }
}
