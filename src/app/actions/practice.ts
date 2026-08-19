"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

const createSchema = z.object({
  chapterId: z.string().min(1, "اختر الفصل"),
  count: z.coerce.number().int().min(3).max(20),
})

export type CreatePracticeResult = { ok: boolean; error?: string; attemptId?: string }

export async function createPracticeExamAction(
  _prev: unknown,
  formData: FormData
): Promise<CreatePracticeResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول أولاً" }

  const parsed = createSchema.safeParse({
    chapterId: String(formData.get("chapterId") ?? ""),
    count: formData.get("count") ?? 10,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const { chapterId, count } = parsed.data
  const chapter = await prisma.bankChapter.findUnique({
    where: { id: chapterId },
    include: { subject: true },
  })
  if (!chapter || !chapter.isActive) return { ok: false, error: "الفصل غير موجود" }

  const all = await prisma.bankQuestion.findMany({ where: { chapterId } })
  if (all.length === 0) return { ok: false, error: "لا توجد أسئلة في هذا الفصل بعد" }

  // اختيار عشوائي للأسئلة
  const shuffled = [...all].sort(() => Math.random() - 0.5).slice(0, Math.min(count, all.length))

  const questions = shuffled.map((q) => ({
    id: q.id,
    text: q.text,
    type: q.type,
    points: q.points,
    options: (q.options as string[] | null) ?? [],
    correctAnswer: q.correctAnswer,
  }))

  const attempt = await prisma.personalExamAttempt.create({
    data: {
      userId: user.id,
      title: `ممارسة ${chapter.subject.name} — ${chapter.name}`,
      questions,
      totalScore: questions.reduce((a, q) => a + q.points, 0),
    },
  })

  return { ok: true, attemptId: attempt.id }
}
