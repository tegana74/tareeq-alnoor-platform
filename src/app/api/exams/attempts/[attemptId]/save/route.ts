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
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 })
  }

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: { answers: true },
  })
  if (!attempt || attempt.userId !== user.id) {
    return NextResponse.json({ error: "غير موجود" }, { status: 404 })
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "تم تسليم هذا الاختبار بالفعل" }, { status: 400 })
  }

  const { answers } = parsed.data
  const existing = new Map(attempt.answers.map((a) => [a.questionId, a]))

  for (const [questionId, userAnswer] of Object.entries(answers)) {
    if (userAnswer === undefined || userAnswer === null) continue
    if (existing.has(questionId)) {
      await prisma.examAnswer.updateMany({
        where: { attemptId, questionId },
        data: { userAnswer },
      })
    } else {
      await prisma.examAnswer.create({
        data: { attemptId, questionId, userAnswer },
      })
    }
  }

  return NextResponse.json({ ok: true })
}
