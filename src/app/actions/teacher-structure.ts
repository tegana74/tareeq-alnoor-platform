"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

type ActionResult = { ok: boolean; error?: string }

async function teacherOrAdmin() {
  const u = await getCurrentUser()
  if (!u) return null
  if (u.role === "ADMIN") return u as typeof u & { teacherId: string | null }
  if (u.role !== "TEACHER" || !u.teacherId) return null
  return u as typeof u & { teacherId: string }
}

const yearSchema = z.object({ name: z.string().trim().min(2, "اكتب اسم المرحلة") })

export async function createYearAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const u = await teacherOrAdmin()
  if (!u) return { ok: false, error: "غير مصرح" }

  const parsed = yearSchema.safeParse({ name: formData.get("name") })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const existing = await prisma.year.findFirst({ where: { name: parsed.data.name } })
  if (existing) return { ok: false, error: "هذه المرحلة موجودة بالفعل" }

  const last = await prisma.year.findFirst({ orderBy: { order: "desc" }, select: { order: true } })
  await prisma.year.create({
    data: { name: parsed.data.name, order: (last?.order ?? 0) + 1 },
  })
  return { ok: true }
}

const courseSchema = z.object({
  name: z.string().trim().min(2, "اكتب اسم الكورس"),
  description: z.string().trim().optional(),
  yearId: z.string().optional(),
  subjectId: z.string().min(1, "اختر المادة"),
  price: z.coerce.number().min(0, "السعر غير صحيح"),
  teacherId: z.string().optional(),
})

export async function createCourseAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const u = await teacherOrAdmin()
  if (!u) return { ok: false, error: "غير مصرح" }

  const parsed = courseSchema.safeParse({
    name: formData.get("name"),
    description: String(formData.get("description") ?? "").trim() || undefined,
    yearId: String(formData.get("yearId") ?? "") || undefined,
    subjectId: formData.get("subjectId"),
    price: formData.get("price"),
    teacherId: String(formData.get("teacherId") ?? "") || undefined,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const subject = await prisma.subject.findFirst({ where: { id: parsed.data.subjectId, isActive: true } })
  if (!subject) return { ok: false, error: "المادة غير موجودة" }

  if (parsed.data.yearId) {
    const year = await prisma.year.findUnique({ where: { id: parsed.data.yearId } })
    if (!year) return { ok: false, error: "المرحلة غير موجودة" }
  }

  let teacherId: string
  if (u.teacherId) {
    teacherId = u.teacherId
  } else {
    const tid = parsed.data.teacherId
    if (!tid) return { ok: false, error: "اختر المعلم" }
    const teacher = await prisma.teacher.findUnique({ where: { id: tid } })
    if (!teacher) return { ok: false, error: "اختر المعلم" }
    teacherId = tid
  }

  await prisma.course.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      yearId: parsed.data.yearId ?? null,
      subjectId: parsed.data.subjectId,
      teacherId,
      price: parsed.data.price,
    },
  })
  return { ok: true }
}

const updateCourseSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, "اكتب اسم الكورس"),
  description: z.string().trim().optional(),
  yearId: z.string().optional(),
  subjectId: z.string().min(1, "اختر المادة"),
  price: z.coerce.number().min(0, "السعر غير صحيح"),
})

export async function updateCourseAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const u = await teacherOrAdmin()
  if (!u) return { ok: false, error: "غير مصرح" }

  const parsed = updateCourseSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: String(formData.get("description") ?? "").trim() || undefined,
    yearId: String(formData.get("yearId") ?? "") || undefined,
    subjectId: formData.get("subjectId"),
    price: formData.get("price"),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const course = await prisma.course.findUnique({ where: { id: parsed.data.id } })
  if (!course) return { ok: false, error: "الكورس غير موجود" }
  if (u.role !== "ADMIN" && course.teacherId !== u.teacherId) return { ok: false, error: "لا تملك هذا الكورس" }

  const subject = await prisma.subject.findFirst({ where: { id: parsed.data.subjectId, isActive: true } })
  if (!subject) return { ok: false, error: "المادة غير موجودة" }

  await prisma.course.update({
    where: { id: course.id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      yearId: parsed.data.yearId ?? null,
      subjectId: parsed.data.subjectId,
      price: parsed.data.price,
    },
  })
  return { ok: true }
}

export async function deleteCourseAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const u = await teacherOrAdmin()
  if (!u) return { ok: false, error: "غير مصرح" }

  const id = String(formData.get("id") ?? "")
  const course = await prisma.course.findUnique({ where: { id } })
  if (!course) return { ok: false, error: "الكورس غير موجود" }
  if (u.role !== "ADMIN" && course.teacherId !== u.teacherId) return { ok: false, error: "لا تملك هذا الكورس" }

  await prisma.course.delete({ where: { id } })
  return { ok: true }
}
