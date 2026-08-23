"use server"

import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { IMPORT_LIMITS } from "@/lib/exam-import/parser"

export type ImportExamResult =
  | { ok: true; examId: string; importedCount: number }
  | { ok: false; error: string }

function teacher() {
  return getCurrentUser()
}

/** نفس نمط ملكية القسم المستخدم في باقي إجراءات المعلم — userId من الجلسة دائماً */
async function ownsSection(sectionId: string) {
  const user = await teacher()
  if (!user) return { user: null as null, section: null as null }
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { course: { select: { id: true, teacherId: true, isActive: true } } },
  })
  if (!section) return { user, section: null as null }
  if (user.role !== "ADMIN" && section.course.teacherId !== user.teacherId) {
    return { user, section: null as null }
  }
  return { user, section }
}

interface QuestionPayload {
  text?: unknown
  type?: unknown
  options?: unknown
  correctAnswer?: unknown
  points?: unknown
}

export async function importExamAction(
  _prev: unknown,
  formData: FormData
): Promise<ImportExamResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول" }

  const sectionId = String(formData.get("sectionId") ?? "")
  const title = String(formData.get("title") ?? "").trim()
  const examTypeRaw = String(formData.get("examType") ?? "EXAM")
  const durationMinutes = Math.max(1, Number(formData.get("durationMinutes") ?? 45))
  const isFree = String(formData.get("isFree")) === "true"

  if (!sectionId) return { ok: false, error: "القسم مطلوب" }
  if (!title || title.length > 200) return { ok: false, error: "عنوان الاختبار مطلوب (حتى 200 حرف)" }
  if (examTypeRaw !== "EXAM" && examTypeRaw !== "HOMEWORK")
    return { ok: false, error: "نوع الاختبار غير صحيح" }

  // الملكية والصلاحية server-side فقط
  const { user: owner, section } = await ownsSection(sectionId)
  if (!owner || !section) return { ok: false, error: "غير مصرح بالاستيراد إلى هذا القسم" }
  if (!section.course.isActive) return { ok: false, error: "الكورس غير نشط" }

  let payload: QuestionPayload[]
  try {
    payload = JSON.parse(String(formData.get("questions") ?? "[]"))
  } catch {
    return { ok: false, error: "بيانات الأسئلة غير صالحة" }
  }
  if (!Array.isArray(payload) || payload.length === 0)
    return { ok: false, error: "لا توجد أسئلة للاستيراد" }
  if (payload.length > IMPORT_LIMITS.maxQuestions)
    return { ok: false, error: `الحد الأقصى ${IMPORT_LIMITS.maxQuestions} سؤالاً لكل استيراد` }

  // تحقق صارم قبل أي كتابة
  type Row = {
    examId: string
    text: string
    type: "MCQ" | "ESSAY"
    options: string[]
    correctAnswer: string
    points: number
    order: number
  }
  const rows: Omit<Row, "examId">[] = []

  for (let i = 0; i < payload.length; i++) {
    const q = payload[i] as QuestionPayload
    const text = typeof q.text === "string" ? q.text.trim() : ""
    if (text.length < 3 || text.length > IMPORT_LIMITS.maxQuestionLength)
      return { ok: false, error: `السؤال ${i + 1}: نص غير صالح` }

    const rawType = q.type === "TRUE_FALSE" ? "MCQ" : q.type === "ESSAY" ? "ESSAY" : "MCQ"
    const rawTypeFinal = rawType
    const options = Array.isArray(q.options)
      ? q.options.filter((o): o is string => typeof o === "string").map((o) => o.trim()).filter(Boolean)
      : []
    const isTF = q.type === "TRUE_FALSE"
    if (!isTF && rawTypeFinal !== "ESSAY" && options.length < IMPORT_LIMITS.minOptions)
      return { ok: false, error: `السؤال ${i + 1}: عدد الخيارات أقل من ${IMPORT_LIMITS.minOptions}` }
    if (options.length > IMPORT_LIMITS.maxOptions)
      return { ok: false, error: `السؤال ${i + 1}: خيارات أكثر من ${IMPORT_LIMITS.maxOptions}` }

    let correctAnswer: string
    if (isTF) {
      correctAnswer = q.correctAnswer === 1 ? "1" : "0"
    } else if (rawTypeFinal === "ESSAY") {
      // المقالى قد يرد بلا إجابة — التصحيح اليدوي يتكفل به لاحقاً
      correctAnswer = typeof q.correctAnswer === "number" ? String(q.correctAnswer) : ""
    } else if (typeof q.correctAnswer === "number" && Number.isInteger(q.correctAnswer)) {
      if (q.correctAnswer < 0 || q.correctAnswer >= options.length)
        return { ok: false, error: `السؤال ${i + 1}: الإجابة الصحيحة خارج نطاق الخيارات` }
      correctAnswer = String(q.correctAnswer)
    } else {
      return { ok: false, error: `السؤال ${i + 1}: الإجابة الصحيحة مفقودة` }
    }

    const pointsRaw = Number(q.points)
    const points = Number.isFinite(pointsRaw) && pointsRaw > 0 ? Math.min(Math.round(pointsRaw), 100) : IMPORT_LIMITS.defaultPoints

    rows.push({
      text,
      type: options.length === 2 && rawType === "MCQ" && isTF ? ("MCQ" as const) : (rawType as "MCQ" | "ESSAY"),
      options: options.length > 0 ? options : [],
      correctAnswer,
      points,
      order: i + 1,
    })
  }

  const totalScore = rows.reduce((sum, r) => sum + r.points, 0)

  try {
    const examId = await prisma.$transaction(async (tx) => {
      const max = await tx.exam.aggregate({ where: { sectionId }, _max: { order: true } })
      const exam = await tx.exam.create({
        data: {
          sectionId,
          title: title.slice(0, 200),
          type: examTypeRaw,
          durationMinutes,
          isFree,
          order: (max._max.order ?? 0) + 1,
          totalScore,
        },
        select: { id: true },
      })
      await tx.question.createMany({
        data: rows.map((r) => ({ ...r, examId: exam.id })),
      })
      return exam.id
    })

    return { ok: true, examId, importedCount: rows.length }
  } catch (error) {
    console.error("[IMPORT_EXAM_DB_ERROR]", error instanceof Error ? error.message : "unknown")
    return { ok: false, error: "فشل حفظ الاختبار — لم يتم إنشاء شيء، حاول مرة أخرى" }
  }
}
