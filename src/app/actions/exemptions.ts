"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export type ExemptionResult = { ok: boolean; error?: string }

const reasonSchema = z.string().min(10, "اكتب سبباً واضحاً (10 أحرف على الأقل)").max(300)

export async function submitExemptionAction(_prev: unknown, formData: FormData): Promise<ExemptionResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "STUDENT") return { ok: false, error: "غير مصرح" }

  const reason = reasonSchema.safeParse(String(formData.get("reason") ?? "").trim())
  if (!reason.success) return { ok: false, error: reason.error.issues[0].message }
  const details = String(formData.get("details") ?? "").trim().slice(0, 500) || null

  const pending = await prisma.exemptionRequest.count({
    where: { userId: user.id, status: "pending" },
  })
  if (pending > 0) return { ok: false, error: "لديك طلب إعفاء قيد المراجعة بالفعل" }

  await prisma.exemptionRequest.create({
    data: { userId: user.id, reason: reason.data, details },
  })

  await prisma.notification.create({
    data: {
      userId: user.id,
      title: "تم استلام طلب الإعفاء",
      body: "سيراجع فريق الإدارة طلبك وسنخطرك بالنتيجة",
      link: "/exemptions",
    },
  })

  revalidatePath("/exemptions")
  return { ok: true }
}

export async function resolveExemptionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") return

  const id = String(formData.get("id") ?? "")
  const status = String(formData.get("status") ?? "")
  if (!["approved", "rejected"].includes(status)) return

  const request = await prisma.exemptionRequest.findUnique({ where: { id }, include: { user: true } })
  if (!request || request.status !== "pending") return

  await prisma.exemptionRequest.update({
    where: { id },
    data: { status, reviewedAt: new Date() },
  })

  await prisma.notification.create({
    data: {
      userId: request.userId,
      title: status === "approved" ? "تم قبول طلب الإعفاء" : "تم رفض طلب الإعفاء",
      body: status === "approved" ? "تم إعفاؤك بناءً على طلبك، فريق الإدارة" : "نأسف، لم تتم الموافقة على طلبك",
      link: "/exemptions",
    },
  })

  revalidatePath("/admin/exemptions")
}
