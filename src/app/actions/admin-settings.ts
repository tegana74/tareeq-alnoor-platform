"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

const settingsSchema = z.object({
  vodafone: z.string().min(10).max(15),
  instapay: z.string().min(10).max(30),
  teacherCommission: z.coerce.number().min(0).max(100),
  adminCommission: z.coerce.number().min(0).max(100),
  teacherImageShape: z.enum(["circle", "rounded"]),
  teacherImageSize: z.enum(["sm", "md", "lg"]),
})

export async function saveSettingsAction(_prev: unknown, formData: FormData) {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") return { ok: false, error: "غير مصرح" }

  const parsed = settingsSchema.safeParse({
    vodafone: String(formData.get("vodafone") ?? "").trim(),
    instapay: String(formData.get("instapay") ?? "").trim(),
    teacherCommission: formData.get("teacherCommission"),
    adminCommission: formData.get("adminCommission"),
    teacherImageShape: String(formData.get("teacherImageShape") ?? "circle"),
    teacherImageSize: String(formData.get("teacherImageSize") ?? "md"),
  })
  if (!parsed.success) return { ok: false, error: "بيانات غير صحيحة" }

  const { vodafone, instapay, teacherCommission, adminCommission, teacherImageShape, teacherImageSize } = parsed.data
  const entries = [
    ["payment.vodafone", vodafone],
    ["payment.instapay", instapay],
    ["finance.teacherCommission", String(teacherCommission)],
    ["finance.adminCommission", String(adminCommission)],
    ["appearance.teacherImageShape", teacherImageShape],
    ["appearance.teacherImageSize", teacherImageSize],
  ] as const

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  )
  return { ok: true }
}
