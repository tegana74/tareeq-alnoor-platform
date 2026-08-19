"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser, sendLinkOtp, verifyLinkOtp } from "@/lib/auth"
import { rateLimit, getClientIp } from "@/lib/rate-limit"

const phoneSchema = z.string().regex(/^01[0-9]{9}$/, "رقم الهاتف يجب أن يكون 11 رقم يبدأ بـ 01")
const linkSchema = z.object({
  phone: z.string().regex(/^01[0-9]{9}$/, "رقم الهاتف يجب أن يكون 11 رقم يبدأ بـ 01"),
  code: z.string().regex(/^[0-9]{6}$/, "الكود 6 أرقام"),
})

export type ParentResult = { ok: boolean; error?: string; devCode?: string; expiresIn?: number }

export async function sendLinkOtpAction(_prev: unknown, formData: FormData): Promise<ParentResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "PARENT") return { ok: false, error: "غير مصرح" }

  const phone = String(formData.get("phone") ?? "")
  if (!phoneSchema.safeParse(phone).success) return { ok: false, error: "أدخل رقم هاتف صحيح مكوّن من 11 رقم" }

  const ip = await getClientIp()
  const rl = await rateLimit(`link-otp:${ip}:${phone}`, 5, 15 * 60 * 1000)
  if (!rl.allowed) return { ok: false, error: "طلبات كثيرة، حاول بعد قليل" }

  const result = await sendLinkOtp(phone)
  if (!result.ok) return { ok: false, error: result.error }

  return { ok: true, expiresIn: result.expiresIn, devCode: result.devCode }
}

export async function linkChildAction(_prev: unknown, formData: FormData): Promise<ParentResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "PARENT") return { ok: false, error: "غير مصرح" }

  const parsed = linkSchema.safeParse({
    phone: String(formData.get("phone") ?? ""),
    code: String(formData.get("code") ?? ""),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const child = await prisma.user.findUnique({ where: { phone: parsed.data.phone } })
  if (!child || child.role !== "STUDENT") return { ok: false, error: "لا يوجد حساب طالب بهذا الرقم" }
  if (child.isBlocked) return { ok: false, error: "حساب الطالب محظور" }

  const existing = await prisma.parentChildLink.findUnique({
    where: { parentId_childId: { parentId: user.id, childId: child.id } },
  })
  if (existing) return { ok: false, error: "هذا الطالب مضاف بالفعل إلى حسابك" }

  const otpResult = await verifyLinkOtp(parsed.data.phone, parsed.data.code)
  if (!otpResult.ok) return { ok: false, error: otpResult.error }

  await prisma.parentChildLink.create({
    data: { parentId: user.id, childId: child.id },
  })

  await prisma.notification.create({
    data: {
      userId: child.id,
      title: "تم ربط حسابك بولي أمرك",
      body: `تم ربط حسابك بحساب ولي أمر جديد وسيتمكن من متابعة تقدمك`,
      link: "/profile",
    },
  })

  return { ok: true }
}

export async function removeChildLinkAction(_prev: unknown, formData: FormData): Promise<ParentResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "PARENT") return { ok: false, error: "غير مصرح" }

  const childId = String(formData.get("childId") ?? "")
  if (!childId) return { ok: false, error: "بيانات غير صحيحة" }

  await prisma.parentChildLink.deleteMany({
    where: { parentId: user.id, childId },
  })
  return { ok: true }
}
