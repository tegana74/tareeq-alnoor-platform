"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

type ActionResult = { ok: boolean; error?: string }

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") return null
  return user
}

async function requireTeacher() {
  const user = await getCurrentUser()
  if (!user) return null
  if (user.role === "ADMIN") return user
  if (user.role !== "TEACHER" || !user.teacherId) return null
  return user as typeof user & { teacherId: string }
}

// ============================= الفصول =============================

const chapterSchema = z.object({
  subjectId: z.string().min(1, "المادة مطلوبة"),
  name: z.string().min(2, "اسم الفصل قصير"),
})

export async function createBankChapterAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin()
  if (!user) return { ok: false, error: "غير مصرح" }

  const parsed = chapterSchema.safeParse({
    subjectId: formData.get("subjectId"),
    name: formData.get("name"),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const max = await prisma.bankChapter.aggregate({ where: { subjectId: parsed.data.subjectId }, _max: { order: true } })
  await prisma.bankChapter.create({
    data: {
      subjectId: parsed.data.subjectId,
      name: parsed.data.name,
      order: (max._max.order ?? 0) + 1,
    },
  })
  return { ok: true }
}

export async function deleteBankChapterAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin()
  if (!user) return { ok: false, error: "غير مصرح" }

  const chapterId = String(formData.get("chapterId") ?? "")
  if (!chapterId) return { ok: false, error: "معرف الفصل مطلوب" }

  await prisma.bankChapter.delete({ where: { id: chapterId } })
  return { ok: true }
}

// ============================= الأسئلة =============================

const questionSchema = z.object({
  chapterId: z.string().min(1, "الفصل مطلوب"),
  text: z.string().min(2, "نص السؤال قصير"),
  type: z.enum(["MCQ", "ESSAY"]).default("MCQ"),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  points: z.coerce.number().int().min(1).max(50).default(1),
  correctAnswer: z.string().optional(),
  explanation: z.string().optional(),
  option0: z.string().optional(),
  option1: z.string().optional(),
  option2: z.string().optional(),
  option3: z.string().optional(),
})

export async function createBankQuestionAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin()
  if (!user) return { ok: false, error: "غير مصرح" }

  const parsed = questionSchema.safeParse({
    chapterId: formData.get("chapterId"),
    text: formData.get("text"),
    type: formData.get("type"),
    difficulty: formData.get("difficulty"),
    points: formData.get("points"),
    correctAnswer: formData.get("correctAnswer"),
    explanation: formData.get("explanation"),
    option0: formData.get("option0"),
    option1: formData.get("option1"),
    option2: formData.get("option2"),
    option3: formData.get("option3"),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const options: string[] = []
  for (const key of ["option0", "option1", "option2", "option3"]) {
    const v = String(formData.get(key) ?? "").trim()
    if (v) options.push(v)
  }

  const count = await prisma.bankQuestion.count({ where: { chapterId: parsed.data.chapterId } })
  await prisma.bankQuestion.create({
    data: {
      chapterId: parsed.data.chapterId,
      text: parsed.data.text,
      type: parsed.data.type as "MCQ" | "ESSAY",
      difficulty: parsed.data.difficulty,
      points: parsed.data.points,
      correctAnswer: parsed.data.correctAnswer || null,
      explanation: parsed.data.explanation || null,
      options: options.length > 0 ? options : undefined,
    },
  })
  return { ok: true }
}

export async function deleteBankQuestionAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin()
  if (!user) return { ok: false, error: "غير مصرح" }

  const questionId = String(formData.get("questionId") ?? "")
  if (!questionId) return { ok: false, error: "معرف السؤال مطلوب" }

  await prisma.bankQuestion.delete({ where: { id: questionId } })
  return { ok: true }
}
