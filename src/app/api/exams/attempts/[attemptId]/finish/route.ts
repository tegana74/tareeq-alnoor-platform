import { NextResponse, NextRequest } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { awardPoints } from "@/lib/points"

const schema = z.object({
  answers: z.record(z.string(), z.string()),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  const { attemptId } = await context.params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 })
  }

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: true,
      exam: { include: { questions: true } },
    },
  })
  if (!attempt || attempt.userId !== user.id) {
    return NextResponse.json({ error: "غير موجود" }, { status: 404 })
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "تم تسليم هذا الاختبار بالفعل" }, { status: 400 })
  }

  const { answers } = parsed.data

  // حفظ الإجابات
  const existing = new Map(attempt.answers.map((a) => [a.questionId, a]))
  for (const [questionId, userAnswer] of Object.entries(answers)) {
    if (userAnswer === undefined || userAnswer === null) continue
    if (existing.has(questionId)) {
      await prisma.examAnswer.updateMany({ where: { attemptId, questionId }, data: { userAnswer } })
    } else {
      await prisma.examAnswer.create({ data: { attemptId, questionId, userAnswer } })
    }
  }

  // التصحيح الآلي لأسئلة الاختيار من متعدد
  let score = 0
  const questions = attempt.exam.questions
  for (const question of questions) {
    const userAnswer = answers[question.id]
    if (!userAnswer) continue
    if (question.type === "MCQ" && question.correctAnswer !== null) {
      const isCorrect = userAnswer === question.correctAnswer
      if (isCorrect) score += question.points
      await prisma.examAnswer.updateMany({
        where: { attemptId, questionId: question.id },
        data: { isCorrect, earnedPoints: isCorrect ? question.points : 0, gradedBy: "auto" },
      })
    } else if (question.type === "AUTO_ESSAY") {
      // تصحيح آلي بسيط: نقطة على مجرد الإجابة، والمدرس يراجع لاحقاً
      await prisma.examAnswer.updateMany({
        where: { attemptId, questionId: question.id },
        data: { gradedBy: "auto" },
      })
    }
  }

  const hasEssay = questions.some((q) => q.type === "ESSAY")
  const totalScore = questions.reduce((a, q) => a + q.points, 0)

  const updated = await prisma.examAttempt.update({
    where: { id: attemptId },
    data: {
      finishedAt: new Date(),
      score,
      totalScore,
      status: hasEssay ? "submitted" : "graded",
      isPassed: score >= totalScore * 0.5,
    },
  })

  // منح نقاط تفاعل للطالب
  await awardPoints(user.id, 5, `exam:${attemptId}`, `أدى ${attempt.exam.title}`)

  return NextResponse.json({ ok: true, attemptId: updated.id })
}
