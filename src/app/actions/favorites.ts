"use server"

import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export type FavoriteResult = { ok: boolean; error?: string }

export async function toggleFavoriteAction(_prev: unknown, formData: FormData): Promise<FavoriteResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول أولاً" }
  if (user.role !== "STUDENT") return { ok: false, error: "المفضلة متاحة للطلاب فقط" }

  const courseId = String(formData.get("courseId") ?? "")
  const course = await prisma.course.findUnique({ where: { id: courseId } })
  if (!course) return { ok: false, error: "الكورس غير موجود" }

  const existing = await prisma.favorite.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  })
  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } })
    return { ok: true }
  }
  await prisma.favorite.create({ data: { userId: user.id, courseId } })
  return { ok: true }
}
