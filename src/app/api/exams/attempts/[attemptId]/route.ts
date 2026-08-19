import { NextResponse, NextRequest } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  const { attemptId } = await context.params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: { answers: true },
  })
  if (!attempt || attempt.userId !== user.id) {
    return NextResponse.json({ error: "غير موجود" }, { status: 404 })
  }

  const answers: Record<string, string> = {}
  for (const a of attempt.answers) {
    answers[a.questionId] = a.userAnswer ?? ""
  }

  return NextResponse.json({ answers })
}
