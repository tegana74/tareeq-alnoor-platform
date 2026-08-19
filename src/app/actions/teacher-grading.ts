"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

const gradeSchema = z.object({
  answerId: z.string().min(1),
  points: z.coerce.number().min(0).max(100),
  feedback: z.string().optional(),
})

export type GradeResult = { ok: boolean; error?: string }

export async function gradeEssayAnswerAction(
  _prev: unknown,
  formData: FormData
): Promise<GradeResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "TEACHER") return { ok: false, error: "غير مصرح" }

  const parsed = gradeSchema.safeParse({
    answerId: String(formData.get("answerId") ?? ""),
    points: formData.get("points") ?? 0,
    feedback: String(formData.get("feedback") ?? "").trim() || undefined,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const answer = await prisma.examAnswer.findUnique({
    where: { id: parsed.data.answerId },
    include: {
      attempt: { include: { exam: { include: { section: true } } } },
      question: true,
    },
  })
  if (!answer) return { ok: false, error: "الإجابة غير موجودة" }

  // التحقق أن المدرس يملك هذا الامتحان (المدرس → الكورسات → الأقسام → الامتحانات)
  const teacher = await prisma.teacher.findFirst({ where: { user: { id: user.id } } })
  const ownsCourse = await prisma.course.findFirst({
    where: { teacherId: teacher?.id, sections: { some: { exams: { some: { id: answer.attempt.examId } } } } },
  })
  if (!teacher || !ownsCourse) return { ok: false, error: "لست مدرساً لهذا الامتحان" }

  const maxPoints = Number(answer.question.points)
  const points = Math.min(parsed.data.points, maxPoints)
  const feedback = parsed.data.feedback || (points >= maxPoints / 2 ? "إجابة جيدة" : "راجع الإجابة النموذجية")

  // حفظ تصحيح المعلم
  await prisma.examAnswer.update({
    where: { id: answer.id },
    data: {
      earnedPoints: points,
      isCorrect: points > 0,
      feedback,
      gradedBy: user.id,
      gradedAt: new Date(),
    },
  })

  // إعادة حساب مجموع المحاولة
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: answer.attemptId },
    include: { answers: { include: { question: true } }, exam: { include: { section: true } } },
  })
  if (!attempt) return { ok: false, error: "حدث خطأ" }

  const totalEarned = attempt.answers.reduce((sum, a) => sum + Number(a.earnedPoints), 0)

  // هل انتهى تصحيح كل الأسئلة المقالية؟
  const essayAnswers = attempt.answers.filter((a) => a.question.type === "ESSAY")
  const allEssayGraded = essayAnswers.every((a) => a.gradedBy !== null)
  const status = allEssayGraded ? "graded" : attempt.status
  const totalScore = Number(attempt.exam.totalScore)
  const passed = totalScore > 0 ? totalEarned >= totalScore * 0.5 : undefined

  await prisma.examAttempt.update({
    where: { id: attempt.id },
    data: {
      score: totalEarned,
      totalScore,
      status,
      isPassed: status === "graded" ? passed : attempt.isPassed,
    },
  })

  await prisma.notification.create({
    data: {
      userId: attempt.userId,
      title: "تم تصحيح إجابتك",
      body: `حصلت على ${points} من ${maxPoints} في «${attempt.exam.title}»${feedback ? ` — ${feedback}` : ""}`,
      link: `/courses/${attempt.exam.section.courseId}/sections/${attempt.exam.sectionId}/exam/${attempt.examId}/result/${attempt.id}`,
    },
  })

  return { ok: true }
}
