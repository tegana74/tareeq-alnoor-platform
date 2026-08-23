"use server"

import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"

export type BookCompletionResult = { ok: boolean; error?: string }

/**
 * تسجيل إكمال قراءة كتاب («تمت القراءة»).
 * الحماية: مستخدم مسجّل + صلاحية وصول للكورس (أو عنصر مجاني) + ملكية السجل ضمنية
 * لأن userId يُشتق من الجلسة دائمًا ولا يُقبل من العميل. العملية idempotent.
 */
export async function markBookCompletedAction(
  _prev: unknown,
  formData: FormData
): Promise<BookCompletionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول" }
  if (user.role !== "STUDENT") return { ok: false, error: "هذه الميزة متاحة للطلاب فقط" }

  const bookId = String(formData.get("bookId") ?? "")
  if (!bookId) return { ok: false, error: "بيانات غير صحيحة" }

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: { id: true, isFree: true, section: { select: { courseId: true } } },
  })
  if (!book) return { ok: false, error: "غير موجود" }

  const allowed = book.isFree || (await canAccessCourse(user, book.section.courseId))
  if (!allowed) return { ok: false, error: "غير مصرح" }

  await prisma.bookView.upsert({
    where: { userId_bookId: { userId: user.id, bookId } },
    update: { isCompleted: true, completedAt: new Date() },
    create: { userId: user.id, bookId, isCompleted: true },
  })

  return { ok: true }
}
