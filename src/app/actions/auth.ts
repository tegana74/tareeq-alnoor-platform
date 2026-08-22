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
  getCurrentUser,
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

export async function directLoginAction(phone: string, password: string): Promise<VerifyOtpResult> {
  const normalized = phone.replace(/[^0-9+]/g, "")
  const ip = await getClientIp()

  const rl = await rateLimit(`login:${ip}`, 10, 15 * 60 * 1000)
  if (!rl.allowed) return { ok: false, error: "محاولات كثيرة، حاول بعد 15 دقيقة" }

  const recentFailures = await prisma.loginAttempt.count({
    where: {
      phone: normalized,
      success: false,
      createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
    },
  })
  if (recentFailures >= 5) {
    return { ok: false, error: "محاولات دخول كثيرة، حاول بعد 15 دقيقة" }
  }

  const user = await prisma.user.findUnique({ where: { phone: normalized } })
  if (!user) {
    await prisma.loginAttempt.create({ data: { phone: normalized, ip, success: false } })
    return { ok: false, error: "رقم الهاتف غير مسجل" }
  }
  if (user.isBlocked) return { ok: false, error: "الحساب محظور" }
  if (!user.isActive) return { ok: false, error: "الحساب غير مفعل" }

  const valid = await (await import("@/lib/auth")).verifyPassword(password, user.password)
  if (!valid) {
    await prisma.loginAttempt.create({ data: { phone: normalized, ip, success: false } })
    return { ok: false, error: "كلمة المرور غير صحيحة" }
  }

  await prisma.loginAttempt.create({ data: { phone: normalized, ip, success: true } })

  const token = await (await import("@/lib/auth")).createSession(user.id)

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
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

export type ChangePasswordResult = { ok: boolean; error?: string }

export async function changePasswordAction(
  _prev: unknown,
  formData: FormData
): Promise<ChangePasswordResult> {
  const currentPassword = String(formData.get("currentPassword") ?? "")
  const newPassword = String(formData.get("newPassword") ?? "")
  const confirmPassword = String(formData.get("confirmPassword") ?? "")

  if (newPassword.length < 6) return { ok: false, error: "كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف" }
  if (newPassword !== confirmPassword) return { ok: false, error: "كلمة المرور غير متطابقة" }
  if (currentPassword === newPassword) return { ok: false, error: "كلمة المرور الجديدة مختلفة عن الحالية" }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول أولاً" }

  const valid = await (await import("@/lib/auth")).verifyPassword(currentPassword, user.password)
  if (!valid) return { ok: false, error: "كلمة المرور الحالية غير صحيحة" }

  const hashed = await hashPassword(newPassword)
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed } })

  return { ok: true }
}

export type ResetPasswordResult = { ok: boolean; error?: string }

export async function sendResetOtpAction(
  _prev: unknown,
  formData: FormData
): Promise<SendOtpResult> {
  const phone = String(formData.get("phone") ?? "")
  const phoneCheck = phoneSchema.safeParse(phone)
  if (!phoneCheck.success) return { ok: false, error: phoneCheck.error.issues[0].message }

  const ip = await getClientIp()
  const rl = await rateLimit(`reset:${ip}:${phone}`, 3, 15 * 60 * 1000)
  if (!rl.allowed) return { ok: false, error: "طلبات كثيرة، حاول بعد قليل" }

  const normalized = phone.replace(/[^0-9+]/g, "")
  const user = await prisma.user.findUnique({ where: { phone: normalized } })
  if (!user) return { ok: false, error: "رقم الهاتف غير مسجل لدينا" }

  const { sendOtp: sendOtpFn } = await import("@/lib/auth")
  const result = await sendOtpFn(normalized, user.password)
  if (!result.ok) return { ok: false, error: result.error ?? "فشل إرسال الكود" }

  return { ok: true, expiresIn: result.expiresIn, devCode: result.devCode }
}

export async function resetPasswordAction(
  phone: string,
  code: string,
  newPassword: string
): Promise<ResetPasswordResult> {
  if (newPassword.length < 6) return { ok: false, error: "كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف" }

  const { verifyOtp: verifyOtpFn } = await import("@/lib/auth")
  const result = await verifyOtpFn(phone, code)
  if (!result.ok) return { ok: false, error: result.error ?? "الكود غير صحيح" }

  const normalized = phone.replace(/[^0-9+]/g, "")
  const hashed = await hashPassword(newPassword)
  await prisma.user.update({ where: { phone: normalized }, data: { password: hashed } })

  return { ok: true }
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
