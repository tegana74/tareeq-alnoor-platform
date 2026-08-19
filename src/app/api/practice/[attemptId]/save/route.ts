import { NextResponse, NextRequest } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const schema = z.object({
  answers: z.record(z.string(), z.string()),
})

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  const { attemptId } = await context.params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })

  const attempt = await prisma.personalExamAttempt.findUnique({ where: { id: attemptId } })
  if (!attempt || attempt.userId !== user.id) {
    return NextResponse.json({ error: "غير موجود" }, { status: 404 })
  }

  return NextResponse.json({ answers: attempt.answers ?? {} })
}

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

  await prisma.personalExamAttempt.update({
    where: { id: attemptId },
    data: { answers: parsed.data.answers as object },
  })

  return NextResponse.json({ ok: true })
}
