import { cookies } from "next/headers"
import { cache } from "react"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { randomBytes, randomInt } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { Role } from "@/generated/prisma/enums"
import { sendSms } from "@/lib/sms"
import { getClientIp } from "@/lib/rate-limit"

export const SESSION_COOKIE = "tn_session"
const SESSION_DAYS = 30

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

function generateOtp() {
  return String(randomInt(100000, 999999))
}

/**
 * إرسال كود تحقق OTP للهاتف
 * في بيئة التطوير يُطبع الكود في السيرفر ويُعاد في الاستجابة فقط للتطوير.
 */
export async function sendOtp(phone: string, password: string) {
  const normalized = phone.replace(/[^0-9+]/g, "")
  const ip = await getClientIp()

  // حماية من محاولات الدخول المتكررة (حسب الرقم والعنوان)
  const recentFailures = await prisma.loginAttempt.count({
    where: {
      phone: normalized,
      success: false,
      createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
    },
  })
  if (recentFailures >= 5) {
    return { ok: false as const, error: "محاولات دخول كثيرة، حاول بعد 15 دقيقة" }
  }

  const user = await prisma.user.findUnique({ where: { phone: normalized } })

  if (!user) {
    await prisma.loginAttempt.create({ data: { phone: normalized, ip, success: false } })
    return { ok: false as const, error: "رقم الهاتف غير مسجل لدينا" }
  }
  if (user.isBlocked) {
    return { ok: false as const, error: "هذا الحساب محظور، تواصل مع الدعم الفني" }
  }
  if (!user.isActive) {
    return { ok: false as const, error: "هذا الحساب غير مفعل، تواصل مع الدعم الفني" }
  }

  const valid = await verifyPassword(password, user.password)
  if (!valid) {
    await prisma.loginAttempt.create({ data: { phone: normalized, ip, success: false } })
    return { ok: false as const, error: "كلمة المرور غير صحيحة" }
  }

  // منع إرسال أكثر من 3 أكواد لكل رقم خلال 5 دقائق
  const recentCodes = await prisma.otpCode.count({
    where: { phone: normalized, purpose: "login", createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } },
  })
  if (recentCodes >= 3) {
    return { ok: false as const, error: "أرسلت الكثير من الأكواد، حاول بعد قليل" }
  }

  // إبطال الأكواد السابقة
  await prisma.otpCode.updateMany({
    where: { phone: normalized, purpose: "login", used: false },
    data: { used: true },
  })

  const code = generateOtp()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 دقائق

  await prisma.otpCode.create({
    data: { phone: normalized, code, expiresAt, purpose: "login" },
  })

  const isDev = process.env.NODE_ENV === "development"
  await sendSms(normalized, `كود التحقق لمنصة طريق النور: ${code} (صالح 5 دقائق)`)

  return {
    ok: true as const,
    expiresIn: 300,
    devCode: isDev ? code : undefined,
  }
}

/**
 * إرسال كود تحقق لربط ولي الأمر بابنه دون التحقق من كلمة المرور.
 */
export async function sendLinkOtp(phone: string) {
  const normalized = phone.replace(/[^0-9+]/g, "")
  const child = await prisma.user.findUnique({ where: { phone: normalized } })
  if (!child) {
    return { ok: false as const, error: "لا يوجد حساب طالب بهذا الرقم" }
  }
  if (child.role !== "STUDENT") {
    return { ok: false as const, error: "هذا الرقم ليس لحساب طالب" }
  }
  if (child.isBlocked) {
    return { ok: false as const, error: "حساب الطالب محظور" }
  }

  const recentCodes = await prisma.otpCode.count({
    where: { phone: normalized, purpose: "link", createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } },
  })
  if (recentCodes >= 3) {
    return { ok: false as const, error: "أرسلت الكثير من الأكواد، حاول بعد قليل" }
  }

  await prisma.otpCode.updateMany({
    where: { phone: normalized, purpose: "link", used: false },
    data: { used: true },
  })

  const code = generateOtp()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

  await prisma.otpCode.create({
    data: { phone: normalized, code, expiresAt, purpose: "link" },
  })

  const isDev = process.env.NODE_ENV === "development"
  await sendSms(normalized, `كود ربط ولي الأمر في منصة طريق النور: ${code}`)

  return { ok: true as const, expiresIn: 300, devCode: isDev ? code : undefined }
}

/**
 * التحقق من كود الربط دون إنشاء جلسة.
 */
export async function verifyLinkOtp(phone: string, code: string) {
  const normalized = phone.replace(/[^0-9+]/g, "")

  const otp = await prisma.otpCode.findFirst({
    where: { phone: normalized, purpose: "link", used: false },
    orderBy: { createdAt: "desc" },
  })

  if (!otp || otp.expiresAt < new Date()) {
    return { ok: false as const, error: "الكود غير صحيح أو منتهي الصلاحية" }
  }
  if (otp.attempts >= 5) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } })
    return { ok: false as const, error: "الكود غير صحيح أو منتهي الصلاحية" }
  }
  if (otp.code !== code) {
    const attempts = otp.attempts + 1
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts } })
    if (attempts >= 5) {
      await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } })
      return { ok: false as const, error: "محاولات كثيرة، أعد إرسال كود جديد" }
    }
    return { ok: false as const, error: "الكود غير صحيح" }
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } })
  return { ok: true as const }
}

/**
 * التحقق من الكود وإنشاء جلسة
 */
export async function verifyOtp(phone: string, code: string) {
  const normalized = phone.replace(/[^0-9+]/g, "")

  const otp = await prisma.otpCode.findFirst({
    where: { phone: normalized, purpose: "login", used: false },
    orderBy: { createdAt: "desc" },
  })

  if (!otp || otp.expiresAt < new Date()) {
    return { ok: false as const, error: "الكود غير صحيح أو منتهي الصلاحية" }
  }
  if (otp.attempts >= 5) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } })
    return { ok: false as const, error: "الكود غير صحيح أو منتهي الصلاحية" }
  }
  if (otp.code !== code) {
    const attempts = otp.attempts + 1
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts },
    })
    if (attempts >= 5) {
      await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } })
      return { ok: false as const, error: "محاولات كثيرة، أعد إرسال كود جديد" }
    }
    return { ok: false as const, error: "الكود غير صحيح" }
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } })

  const user = await prisma.user.findUnique({ where: { phone: normalized } })
  if (!user) {
    return { ok: false as const, error: "لم يتم العثور على المستخدم" }
  }

  const token = await createSession(user.id)

  return { ok: true as const, token, user: publicUser(user) }
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  await prisma.session.create({
    data: { token, userId, expiresAt },
  })

  return token
}

export function publicUser(user: {
  id: string
  phone: string
  firstName: string
  middleName: string | null
  lastName: string
  email: string | null
  role: Role
  avatar: string | null
  points: number
  walletBalance: unknown
  yearId: string | null
  departmentId: string | null
}) {
  return {
    id: user.id,
    phone: user.phone,
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    points: user.points,
    walletBalance: Number(user.walletBalance),
    yearId: user.yearId,
    departmentId: user.departmentId,
    name: `${user.firstName} ${user.middleName ?? ""} ${user.lastName}`.trim(),
  }
}

export type PublicUser = ReturnType<typeof publicUser>

/**
 * الحصول على المستخدم الحالي (سيرفر سايد)
 */
export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          year: true,
          department: true,
          teacherProfile: true,
        },
      },
    },
  })

  if (!session || session.expiresAt < new Date()) {
    return null
  }

  return session.user
})

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}

export async function requireRole(...roles: Role[]) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!roles.includes(user.role)) redirect("/")
  return user
}

export async function logout() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) {
    await prisma.session.deleteMany({ where: { token } })
  }
  cookieStore.delete(SESSION_COOKIE)
}
