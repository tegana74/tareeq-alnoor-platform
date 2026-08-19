"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export type RechargeResult = { ok: boolean; error?: string }

const generateSchema = z.object({
  value: z.coerce.number().positive("قيمة الكود يجب أن تكون أكبر من صفر"),
  count: z.coerce.number().int().min(1).max(100),
  center: z.string().optional(),
})

export async function generateCodesAction(_prev: unknown, formData: FormData): Promise<RechargeResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") return { ok: false, error: "غير مسموح" }

  const parsed = generateSchema.safeParse({
    value: formData.get("value") ?? 0,
    count: formData.get("count") ?? 1,
    center: String(formData.get("center") ?? "").trim() || undefined,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const { value, count, center } = parsed.data
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
  const codes: string[] = []
  const seen = new Set<string>()
  let attempts = 0
  while (codes.length < count && attempts < count * 30) {
    attempts++
    let code = ""
    for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random() * chars.length)]
    if (seen.has(code)) continue
    const exists = await prisma.insertCode.findUnique({ where: { code } })
    if (exists) continue
    seen.add(code)
    codes.push(code)
  }
  if (codes.length === 0) return { ok: false, error: "تعذر توليد أكواد فريدة، حاول مجدداً" }

  await prisma.insertCode.createMany({
    data: codes.map((code) => ({ code, value, center })),
  })

  return { ok: true }
}
