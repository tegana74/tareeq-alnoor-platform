"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

const couponSchema = z.object({
  code: z.string().min(2).toUpperCase(),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.coerce.number().positive(),
  maxUses: z.coerce.number().int().positive().default(1),
})

export async function createCouponAction(_prev: unknown, formData: FormData) {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") return { ok: false, error: "غير مصرح" }

  const parsed = couponSchema.safeParse({
    code: String(formData.get("code") ?? "").trim(),
    discountType: String(formData.get("discountType") ?? "percentage"),
    discountValue: formData.get("discountValue") ?? 0,
    maxUses: formData.get("maxUses") ?? 1,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const { code, discountType, discountValue, maxUses } = parsed.data
  if (discountType === "percentage" && discountValue > 100) {
    return { ok: false, error: "النسبة يجب أن تكون 100 أو أقل" }
  }

  try {
    await prisma.coupon.create({ data: { code, discountType, discountValue, maxUses } })
  } catch {
    return { ok: false, error: "الكود موجود بالفعل" }
  }
  return { ok: true }
}
