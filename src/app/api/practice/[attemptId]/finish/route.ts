import { NextResponse, NextRequest } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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
  if (!parsed.success) return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 })

  const attempt = await prisma.personalExamAttempt.findUnique({ where: { id: attemptId } })
  if (!attempt || attempt.userId !== user.id) {
    return NextResponse.json({ error: "غير موجود" }, { status: 404 })
  }
  if (attempt.finishedAt) {
    return NextResponse.json({ error: "تم تسليم هذا الاختبار بالفعل" }, { status: 400 })
  }

  const { answers } = parsed.data
  const questions = attempt.questions as unknown as {
    id: string
    text: string
    type: string
    points: number
    options: string[]
    correctAnswer: string | null
  }[]

  let score = 0
  const detailed = questions.map((q) => {
    const userAnswer = answers[q.id]
    const isMcq = q.type === "MCQ"
    const isCorrect = isMcq && q.correctAnswer !== null && userAnswer === q.correctAnswer
    if (isCorrect) score += q.points
    return {
      questionId: q.id,
      text: q.text,
      type: q.type,
      points: q.points,
      options: q.options,
      correctAnswer: q.correctAnswer,
      userAnswer: userAnswer ?? null,
      isCorrect: isCorrect || null,
    }
  })

  const totalScore = questions.reduce((a, q) => a + q.points, 0)
  await prisma.personalExamAttempt.update({
    where: { id: attemptId },
    data: {
      answers: answers as object,
      score,
      totalScore,
      finishedAt: new Date(),
    },
  })

  return NextResponse.json({ ok: true, attemptId: attempt.id, score, totalScore })
}
