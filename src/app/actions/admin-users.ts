"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser, hashPassword } from "@/lib/auth"

export type AdminUsersResult = { ok: boolean; error?: string }

const teacherSchema = z.object({
  teacherId: z.string().optional(), // معلم موجود بدون حساب
  name: z.string().min(3, "اكتب اسم المعلم"),
  title: z.string().min(2, "اكتب التخصص (مثال: مدرس اللغة العربية)"),
  phone: z.string().regex(/^01[0-9]{9}$/, "اكتب رقم هاتف صحيح من 11 خانة يبدأ بـ 01"),
  password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل"),
  bio: z.string().optional(),
})

export async function createTeacherAction(_prev: unknown, formData: FormData): Promise<AdminUsersResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") return { ok: false, error: "غير مسموح" }

  const parsed = teacherSchema.safeParse({
    teacherId: String(formData.get("teacherId") ?? "") || undefined,
    name: String(formData.get("name") ?? "").trim(),
    title: String(formData.get("title") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    bio: String(formData.get("bio") ?? "").trim() || undefined,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const phone = parsed.data.phone.replace(/[^0-9]/g, "")
  const existing = await prisma.user.findUnique({ where: { phone } })
  if (existing) return { ok: false, error: "رقم الهاتف مستخدم من قبل" }

  const passwordHash = await hashPassword(parsed.data.password)

  const nameParts = parsed.data.name.trim().split(/\s+/)
  const firstName = nameParts[0]
  const lastName = nameParts.slice(1).join(" ") || firstName

  try {
    if (parsed.data.teacherId) {
      const teacher = await prisma.teacher.findUnique({ where: { id: parsed.data.teacherId }, include: { user: true } })
      if (!teacher) return { ok: false, error: "المعلم المحدد غير موجود" }
      if (teacher.user) return { ok: false, error: "هذا المعلم لديه حساب بالفعل" }
      await prisma.$transaction([
        prisma.teacher.update({
          where: { id: teacher.id },
          data: { name: parsed.data.name, title: parsed.data.title, bio: parsed.data.bio },
        }),
        prisma.user.create({
          data: {
            phone,
            password: passwordHash,
            firstName,
            lastName,
            role: "TEACHER",
            teacherId: teacher.id,
          },
        }),
      ])
      return { ok: true }
    }

    await prisma.$transaction(async (tx) => {
      const teacher = await tx.teacher.create({
        data: { name: parsed.data.name, title: parsed.data.title, bio: parsed.data.bio },
      })
      await tx.user.create({
        data: {
          phone,
          password: passwordHash,
          firstName,
          lastName,
          role: "TEACHER",
          teacherId: teacher.id,
        },
      })
    })
    return { ok: true }
  } catch {
    return { ok: false, error: "تعذر إنشاء المعلم" }
  }
}

export async function toggleTeacherBlockAction(_prev: unknown, formData: FormData): Promise<AdminUsersResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") return { ok: false, error: "غير مسموح" }
  const id = String(formData.get("id") ?? "")
  const teacher = await prisma.teacher.findUnique({ where: { id }, include: { user: true } })
  if (!teacher) return { ok: false, error: "غير موجود" }

  if (teacher.user) {
    await prisma.user.update({ where: { id: teacher.user.id }, data: { isBlocked: !teacher.user.isBlocked } })
    await prisma.session.deleteMany({ where: { userId: teacher.user.id } })
  } else {
    await prisma.teacher.update({ where: { id }, data: { isActive: !teacher.isActive } })
  }
  return { ok: true }
}

export async function toggleTeacherFeaturedAction(_prev: unknown, formData: FormData): Promise<AdminUsersResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") return { ok: false, error: "غير مسموح" }
  const id = String(formData.get("id") ?? "")
  const teacher = await prisma.teacher.findUnique({ where: { id } })
  if (!teacher) return { ok: false, error: "غير موجود" }
  await prisma.teacher.update({ where: { id }, data: { isFeatured: !teacher.isFeatured } })
  return { ok: true }
}

export async function updateTeacherImageAction(_prev: unknown, formData: FormData): Promise<AdminUsersResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") return { ok: false, error: "غير مسموح" }
  const id = String(formData.get("id") ?? "")
  const image = String(formData.get("image") ?? "").trim()
  if (image && !image.startsWith("/api/files/")) return { ok: false, error: "رابط صورة غير صالح" }

  const teacher = await prisma.teacher.findUnique({ where: { id } })
  if (!teacher) return { ok: false, error: "غير موجود" }
  await prisma.teacher.update({ where: { id }, data: { image: image || null } })
  return { ok: true }
}

export async function moveTeacherAction(_prev: unknown, formData: FormData): Promise<AdminUsersResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") return { ok: false, error: "غير مسموح" }
  const id = String(formData.get("id") ?? "")
  const dir = String(formData.get("dir") ?? "")
  if (dir !== "up" && dir !== "down") return { ok: false, error: "اتجاه غير صالح" }

  const teacher = await prisma.teacher.findUnique({ where: { id } })
  if (!teacher) return { ok: false, error: "غير موجود" }

  const neighbor = await prisma.teacher.findFirst({
    where: dir === "up" ? { sortOrder: { lt: teacher.sortOrder } } : { sortOrder: { gt: teacher.sortOrder } },
    orderBy: dir === "up" ? { sortOrder: "desc" } : { sortOrder: "asc" },
  })
  if (!neighbor) return { ok: true }

  await prisma.$transaction([
    prisma.teacher.update({ where: { id: teacher.id }, data: { sortOrder: neighbor.sortOrder } }),
    prisma.teacher.update({ where: { id: neighbor.id }, data: { sortOrder: teacher.sortOrder } }),
  ])
  return { ok: true }
}

const studentSchema = z.object({
  firstName: z.string().min(2, "اكتب اسم الطالب"),
  lastName: z.string().min(2, "اكتب اسم العائلة"),
  phone: z.string().regex(/^01[0-9]{9}$/, "اكتب رقم هاتف صحيح من 11 خانة يبدأ بـ 01"),
  password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل"),
  yearId: z.string().optional(),
})

export async function createStudentAction(_prev: unknown, formData: FormData): Promise<AdminUsersResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") return { ok: false, error: "غير مسموح" }

  const parsed = studentSchema.safeParse({
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    yearId: String(formData.get("yearId") ?? "") || undefined,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const phone = parsed.data.phone.replace(/[^0-9]/g, "")
  const existing = await prisma.user.findUnique({ where: { phone } })
  if (existing) return { ok: false, error: "رقم الهاتف مستخدم من قبل" }

  const passwordHash = await hashPassword(parsed.data.password)
  await prisma.user.create({
    data: {
      phone,
      password: passwordHash,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      role: "STUDENT",
      yearId: parsed.data.yearId,
    },
  })
  return { ok: true }
}

export async function toggleStudentBlockAction(_prev: unknown, formData: FormData): Promise<AdminUsersResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") return { ok: false, error: "غير مسموح" }
  const id = String(formData.get("id") ?? "")
  const target = await prisma.user.findUnique({ where: { id } })
  if (!target || target.role !== "STUDENT") return { ok: false, error: "غير موجود" }
  await prisma.user.update({ where: { id }, data: { isBlocked: !target.isBlocked } })
  await prisma.session.deleteMany({ where: { userId: id } })
  return { ok: true }
}

export async function grantCourseAction(_prev: unknown, formData: FormData): Promise<AdminUsersResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") return { ok: false, error: "غير مسموح" }

  const studentId = String(formData.get("studentId") ?? "")
  const courseId = String(formData.get("courseId") ?? "")
  const student = await prisma.user.findUnique({ where: { id: studentId } })
  if (!student || student.role !== "STUDENT") return { ok: false, error: "الطالب غير موجود" }
  if (student.isBlocked) return { ok: false, error: "هذا الطالب محظور — أعد تفعيله أولاً" }

  const course = await prisma.course.findUnique({ where: { id: courseId } })
  if (!course || !course.isActive) return { ok: false, error: "الكورس غير موجود" }

  const existing = await prisma.subscription.findFirst({
    where: { userId: studentId, courseId, status: "active", expiresAt: { gt: new Date() } },
  })
  if (existing) return { ok: false, error: "الطالب مشترك بالفعل في هذا الكورس" }

  await prisma.$transaction([
    prisma.subscription.upsert({
      where: { userId_courseId: { userId: studentId, courseId } },
      create: {
        userId: studentId,
        courseId,
        price: 0,
        status: "active",
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
      update: { status: "active", expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
    }),
    prisma.notification.create({
      data: {
        userId: studentId,
        title: "تم فتح كورس لك",
        body: `تم فتح كورس «${course.name}» لك من إدارة المنصة — بالتوفيق`,
        link: `/courses/${courseId}`,
      },
    }),
  ])
  return { ok: true }
}
