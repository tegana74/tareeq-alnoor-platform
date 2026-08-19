"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  sendOtp,
  verifyOtp,
  logout as doLogout,
  SESSION_COOKIE,
  hashPassword,
} from "@/lib/auth"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { verifyRecaptcha } from "@/lib/recaptcha"

const phoneSchema = z.string().regex(/^01[0-9]{9}$/, "رقم الهاتف يجب أن يكون 11 رقم يبدأ بـ 01")
const passwordSchema = z.string().min(6, "كلمة المرور يجب ألا تقل عن 6 أحرف")

export type SendOtpResult =
  | { ok: true; devCode?: string; expiresIn: number }
  | { ok: false; error: string }

export async function sendOtpAction(_prev: unknown, formData: FormData): Promise<SendOtpResult> {
  const phone = String(formData.get("phone") ?? "")
  const password = String(formData.get("password") ?? "")

  const phoneCheck = phoneSchema.safeParse(phone)
  if (!phoneCheck.success) return { ok: false, error: phoneCheck.error.issues[0].message }
  const passwordCheck = passwordSchema.safeParse(password)
  if (!passwordCheck.success) return { ok: false, error: passwordCheck.error.issues[0].message }

  const ip = await getClientIp()
  const rl = await rateLimit(`otp:${ip}:${phone}`, 5, 15 * 60 * 1000)
  if (!rl.allowed) return { ok: false, error: "طلبات كثيرة، حاول بعد قليل" }

  const captcha = await verifyRecaptcha(formData.get("g-recaptcha-response") as string | null)
  if (!captcha.ok) return { ok: false, error: captcha.error ?? "فشل التحقق من reCAPTCHA" }

  const result = await sendOtp(phone, password)
  if (!result.ok) return { ok: false, error: result.error }

  return { ok: true, expiresIn: result.expiresIn, devCode: result.devCode }
}

export type VerifyOtpResult = { ok: boolean; error?: string }

export async function verifyOtpAction(
  phone: string,
  code: string
): Promise<VerifyOtpResult> {
  const result = await verifyOtp(phone, code)
  if (!result.ok) return { ok: false, error: result.error }

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  })

  return { ok: true }
}

export async function logoutAction() {
  await doLogout()
  redirect("/")
}

const registerSchema = z
  .object({
    name: z.string().min(3, "اكتب اسمك الكامل"),
    phone: z.string().regex(/^01[0-9]{9}$/, "رقم الهاتف يجب أن يكون 11 رقم يبدأ بـ 01"),
    password: z.string().min(6, "كلمة المرور يجب ألا تقل عن 6 أحرف"),
    confirmPassword: z.string(),
    yearId: z.string().optional(),
    role: z.enum(["STUDENT", "PARENT"]).default("STUDENT"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "كلمة المرور غير متطابقة",
    path: ["confirmPassword"],
  })

export type RegisterResult = { ok: boolean; error?: string }

export async function registerAction(_prev: unknown, formData: FormData): Promise<RegisterResult> {
  const data = {
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    yearId: String(formData.get("yearId") ?? ""),
    role: String(formData.get("role") ?? "STUDENT"),
  }

  const parsed = registerSchema.safeParse(data)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }
  if (parsed.data.role === "STUDENT" && !parsed.data.yearId) {
    return { ok: false, error: "اختر المرحلة الدراسية" }
  }

  const ip = await getClientIp()
  const rl = await rateLimit(`register:${ip}`, 10, 60 * 60 * 1000)
  if (!rl.allowed) return { ok: false, error: "طلبات تسجيل كثيرة، حاول بعد قليل" }

  const captcha = await verifyRecaptcha(formData.get("g-recaptcha-response") as string | null)
  if (!captcha.ok) return { ok: false, error: captcha.error ?? "فشل التحقق من reCAPTCHA" }

  const exists = await prisma.user.findUnique({ where: { phone: data.phone } })
  if (exists) {
    return { ok: false, error: "رقم الهاتف مسجل بالفعل، سجّل دخولك" }
  }

  const password = await hashPassword(data.password)

  // تقسيم الاسم الكامل إلى اسم أول واسم أخير
  const nameParts = data.name.split(/\s+/)
  const firstName = nameParts[0]
  const lastName = nameParts.slice(1).join(" ") || firstName

  await prisma.user.create({
    data: {
      phone: data.phone,
      password,
      firstName,
      lastName,
      yearId: parsed.data.role === "STUDENT" ? parsed.data.yearId : null,
      role: parsed.data.role,
    },
  })

  return { ok: true }
}
