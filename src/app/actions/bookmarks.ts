"use server"

import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export type BookmarkResult = { ok: boolean; error?: string }

export async function toggleBookmarkAction(_prev: unknown, formData: FormData): Promise<BookmarkResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول أولاً" }
  if (user.role !== "STUDENT") return { ok: false, error: "الإشارات المرجعية متاحة للطلاب فقط" }

  const videoId = String(formData.get("videoId") ?? "") || null
  const bookId = String(formData.get("bookId") ?? "").trim()
  if (!videoId && !bookId) return { ok: false, error: "اختر محاضرة أو ملفاً" }

  if (videoId) {
    const video = await prisma.video.findUnique({ where: { id: videoId } })
    if (!video) return { ok: false, error: "المحاضرة غير موجودة" }
    const existing = await prisma.bookmark.findFirst({ where: { userId: user.id, videoId } })
    if (existing) {
      await prisma.bookmark.delete({ where: { id: existing.id } })
      return { ok: true }
    }
    await prisma.bookmark.create({ data: { userId: user.id, videoId: videoId ?? undefined } })
    return { ok: true }
  }

  const book = await prisma.book.findUnique({ where: { id: bookId } })
  if (!book) return { ok: false, error: "الملف غير موجود" }
  const existing = await prisma.bookmark.findFirst({ where: { userId: user.id, bookId } })
  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } })
    return { ok: true }
  }
  await prisma.bookmark.create({ data: { userId: user.id, bookId: bookId || undefined } })
  return { ok: true }
}
