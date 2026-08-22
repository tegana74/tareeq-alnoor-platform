"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

type ActionResult = { ok: boolean; error?: string }

async function user() {
  const u = await getCurrentUser()
  if (!u) return null
  if (u.role === "ADMIN") return u as typeof u & { teacherId: string | null }
  if (u.role !== "TEACHER" || !u.teacherId) return null
  return u as typeof u & { teacherId: string }
}

const liveSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(2, "عنوان الجلسة قصير"),
  description: z.string().optional(),
  courseId: z.string().optional(),
  startAt: z.string().min(1, "تاريخ البث مطلوب"),
  durationMinutes: z.coerce.number().int().min(5).max(720).default(60),
  url: z.string().optional(),
  isFree: z.union([z.literal("on"), z.undefined()]).transform((v) => v === "on"),
  maxCapacity: z.coerce.number().int().min(0).default(0),
  price: z.coerce.number().min(0).default(0),
})

async function canManage(teacherId: string | null, courseId?: string, role?: string) {
  if (role === "ADMIN") return true
  if (!teacherId) return false
  if (!courseId) return true
  const course = await prisma.course.findFirst({ where: { id: courseId, teacherId } })
  return Boolean(course)
}

export async function saveLiveSessionAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const u = await user()
  if (!u) return { ok: false, error: "غير مصرح" }

  const parsed = liveSchema.safeParse({
    id: formData.get("id") ?? undefined,
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    courseId: formData.get("courseId") || undefined,
    startAt: formData.get("startAt"),
    durationMinutes: formData.get("durationMinutes") || undefined,
    url: formData.get("url") || undefined,
    isFree: formData.get("isFree") ?? undefined,
    maxCapacity: formData.get("maxCapacity"),
    price: formData.get("price"),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  if (parsed.data.courseId && !(await canManage(u.teacherId, parsed.data.courseId, u.role))) {
    return { ok: false, error: "لا تملك هذا الكورس" }
  }

  const startAt = new Date(parsed.data.startAt)
  if (isNaN(startAt.getTime())) return { ok: false, error: "التاريخ غير صحيح" }
  const data = {
    title: parsed.data.title,
    description: parsed.data.description || null,
    courseId: parsed.data.courseId ?? null,
    startAt,
    durationMinutes: parsed.data.durationMinutes,
    url: parsed.data.url || null,
    isFree: parsed.data.isFree,
    maxCapacity: parsed.data.maxCapacity,
    price: parsed.data.isFree ? 0 : parsed.data.price,
  }

  if (parsed.data.id) {
    const existing = await prisma.liveSession.findFirst({
      where: { id: parsed.data.id, teacherId: u.teacherId ?? undefined },
    })
    if (!existing && u.role !== "ADMIN") return { ok: false, error: "الجلسة غير موجودة" }
    await prisma.liveSession.update({ where: { id: parsed.data.id }, data })
    return { ok: true }
  }

  let ownerTeacherId: string | null = u.teacherId

  if (!ownerTeacherId && parsed.data.courseId) {
    const course = await prisma.course.findUnique({ where: { id: parsed.data.courseId }, select: { teacherId: true } })
    ownerTeacherId = course?.teacherId ?? null
  }

  if (!ownerTeacherId) {
    return { ok: false, error: "يجب تحديد كورس لربط الجلسة بمعلم" }
  }

  const session = await prisma.liveSession.create({
    data: { ...data, teacherId: ownerTeacherId },
  })

  if (session.courseId) {
    const subs = await prisma.subscription.findMany({
      where: { courseId: session.courseId, status: "active" },
      select: { userId: true },
    })
    await prisma.notification.createMany({
      data: subs.map((s) => ({
        userId: s.userId,
        title: `بث مباشر جديد: ${session.title}`,
        body: `جلسة مباشرة يوم ${startAt.toLocaleString("ar-EG")}`,
        link: `/live/${session.id}`,
      })),
    })
  } else {
    const students = await prisma.user.findMany({
      where: { role: "STUDENT" },
      select: { id: true },
    })
    await prisma.notification.createMany({
      data: students.map((s) => ({
        userId: s.id,
        title: `بث مباشر: ${session.title}`,
        body: Number(session.price) > 0
          ? `حصة مدفوعة ${session.price} ج.م يوم ${startAt.toLocaleString("ar-EG")}`
          : `حصة مجانية يوم ${startAt.toLocaleString("ar-EG")}`,
        link: `/live/${session.id}`,
      })),
    })
  }
  return { ok: true }
}

export async function deleteLiveSessionAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const u = await user()
  if (!u) return { ok: false, error: "غير مصرح" }
  const id = String(formData.get("id") ?? "")
  const session = await prisma.liveSession.findUnique({ where: { id } })
  if (!session) return { ok: false, error: "غير موجودة" }
  if (u.role !== "ADMIN" && session.teacherId !== u.teacherId) return { ok: false, error: "غير مصرح" }
  await prisma.liveSession.delete({ where: { id } })
  return { ok: true }
}
