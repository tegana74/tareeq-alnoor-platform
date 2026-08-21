"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

type ActionResult = { ok: boolean; error?: string }

async function teacher() {
  const user = await getCurrentUser()
  if (!user) return null
  if (user.role === "ADMIN") return user as typeof user & { teacherId: string | null }
  if (user.role !== "TEACHER" || !user.teacherId) return null
  return user as typeof user & { teacherId: string }
}

async function ownsSection(sectionId: string) {
  const user = await teacher()
  if (!user) return { user: null as null, section: null as null }
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { course: true },
  })
  if (!section) return { user, section: null as null }
  if (user.role !== "ADMIN" && section.course.teacherId !== user.teacherId) {
    return { user, section: null as null }
  }
  return { user, section }
}

// ============================= الأقسام =============================

const sectionSchema = z.object({
  name: z.string().min(2, "اسم القسم قصير"),
  order: z.coerce.number().int().default(0),
})

export async function createSectionAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const user = await teacher()
  if (!user) return { ok: false, error: "غير مصرح" }
  const courseId = String(formData.get("courseId") ?? "")
  const course = user.role === "ADMIN"
    ? await prisma.course.findUnique({ where: { id: courseId } })
    : await prisma.course.findFirst({ where: { id: courseId, teacherId: user.teacherId! } })
  if (!course) return { ok: false, error: "الكورس غير موجود أو لا تملكه" }

  const parsed = sectionSchema.safeParse({ name: formData.get("name"), order: formData.get("order") })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const max = await prisma.section.aggregate({ where: { courseId }, _max: { order: true } })
  await prisma.section.create({
    data: { courseId, name: parsed.data.name, order: parsed.data.order || (max._max.order ?? 0) + 1 },
  })
  return { ok: true }
}

export async function deleteSectionAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const sectionId = String(formData.get("sectionId") ?? "")
  const { user, section } = await ownsSection(sectionId)
  if (!user || !section) return { ok: false, error: "غير مصرح" }
  await prisma.section.delete({ where: { id: sectionId } })
  return { ok: true }
}

// ============================= الدروس (الفيديوهات) =============================

const videoSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(2, "عنوان الدرس قصير"),
  description: z.string().optional(),
  provider: z.enum(["YOUTUBE", "UPLOAD", "VIMEO"]),
  url: z.string().min(5, "رابط الفيديو مطلوب"),
  isFree: z.union([z.literal("on"), z.undefined()]).transform((v) => v === "on"),
  downloadAllowed: z.union([z.literal("on"), z.undefined()]).transform((v) => v === "on"),
  order: z.coerce.number().int().default(0),
})

export async function saveVideoAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const sectionId = String(formData.get("sectionId") ?? "")
  const { user, section } = await ownsSection(sectionId)
  if (!user || !section) return { ok: false, error: "غير مصرح" }

  const parsed = videoSchema.safeParse({
    id: formData.get("id") ?? undefined,
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    provider: formData.get("provider"),
    url: formData.get("url"),
    isFree: formData.get("isFree") ?? undefined,
    downloadAllowed: formData.get("downloadAllowed") ?? undefined,
    order: formData.get("order"),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  if (parsed.data.id) {
    const existing = await prisma.video.findFirst({
      where: { id: parsed.data.id, sectionId },
    })
    if (!existing) return { ok: false, error: "الدرس غير موجود" }
    await prisma.video.update({
      where: { id: parsed.data.id },
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        provider: parsed.data.provider,
        url: parsed.data.url,
        isFree: parsed.data.isFree,
        downloadAllowed: parsed.data.downloadAllowed,
        order: parsed.data.order,
      },
    })
  } else {
    const max = await prisma.video.aggregate({ where: { sectionId }, _max: { order: true } })
    await prisma.video.create({
      data: {
        sectionId,
        title: parsed.data.title,
        description: parsed.data.description || null,
        provider: parsed.data.provider,
        url: parsed.data.url,
        isFree: parsed.data.isFree,
        downloadAllowed: parsed.data.downloadAllowed,
        order: parsed.data.order || (max._max.order ?? 0) + 1,
      },
    })
  }
  return { ok: true }
}

export async function deleteVideoAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const videoId = String(formData.get("videoId") ?? "")
  const video = await prisma.video.findUnique({ where: { id: videoId } })
  if (!video) return { ok: false, error: "غير موجود" }
  const { user, section } = await ownsSection(video.sectionId)
  if (!user || !section) return { ok: false, error: "غير مصرح" }
  await prisma.video.delete({ where: { id: videoId } })
  return { ok: true }
}

// ============================= الكتب =============================

const bookSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(2, "عنوان الكتاب قصير"),
  description: z.string().optional(),
  type: z.enum(["BOOK", "NOTES", "SUMMARY", "FILE"]),
  fileUrl: z.string().min(5, "رابط الملف مطلوب"),
  isFree: z.union([z.literal("on"), z.undefined()]).transform((v) => v === "on"),
  downloadAllowed: z.union([z.literal("on"), z.undefined()]).transform((v) => v === "on"),
  order: z.coerce.number().int().default(0),
})

export async function saveBookAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const sectionId = String(formData.get("sectionId") ?? "")
    const { user, section } = await ownsSection(sectionId)
    if (!user || !section) return { ok: false, error: "غير مصرح" }

    const parsed = bookSchema.safeParse({
      id: formData.get("id") ?? undefined,
      title: formData.get("title"),
      description: formData.get("description") ?? undefined,
      type: formData.get("type"),
      fileUrl: formData.get("fileUrl"),
      isFree: formData.get("isFree") ?? undefined,
      downloadAllowed: formData.get("downloadAllowed") ?? undefined,
      order: formData.get("order"),
    })
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const { id, ...data } = parsed.data
    const bookData = { ...data, description: data.description || null }

    if (id) {
      const existing = await prisma.book.findFirst({ where: { id, sectionId } })
      if (!existing) return { ok: false, error: "الكتاب غير موجود" }
      await prisma.book.update({ where: { id }, data: bookData })
    } else {
      const max = await prisma.book.aggregate({ where: { sectionId }, _max: { order: true } })
      await prisma.book.create({
        data: { ...bookData, sectionId, order: bookData.order || (max._max.order ?? 0) + 1 },
      })
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: "خطأ في الحفظ: " + (e instanceof Error ? e.message : String(e)) }
  }
}

export async function deleteBookAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const bookId = String(formData.get("bookId") ?? "")
  const book = await prisma.book.findUnique({ where: { id: bookId } })
  if (!book) return { ok: false, error: "غير موجود" }
  const { user, section } = await ownsSection(book.sectionId)
  if (!user || !section) return { ok: false, error: "غير مصرح" }
  await prisma.book.delete({ where: { id: bookId } })
  return { ok: true }
}

// ============================= الامتحانات =============================

const examSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(2, "عنوان الاختبار قصير"),
  type: z.enum(["EXAM", "HOMEWORK"]),
  durationMinutes: z.coerce.number().int().min(1).max(300),
  isFree: z.union([z.literal("on"), z.undefined()]).transform((v) => v === "on"),
  order: z.coerce.number().int().default(0),
})

export async function saveExamAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const sectionId = String(formData.get("sectionId") ?? "")
  const { user, section } = await ownsSection(sectionId)
  if (!user || !section) return { ok: false, error: "غير مصرح" }

  const parsed = examSchema.safeParse({
    id: formData.get("id") ?? undefined,
    title: formData.get("title"),
    type: formData.get("type"),
    durationMinutes: formData.get("durationMinutes"),
    isFree: formData.get("isFree") ?? undefined,
    order: formData.get("order"),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  if (parsed.data.id) {
    const existing = await prisma.exam.findFirst({ where: { id: parsed.data.id, sectionId } })
    if (!existing) return { ok: false, error: "الاختبار غير موجود" }
    await prisma.exam.update({
      where: { id: parsed.data.id },
      data: {
        title: parsed.data.title,
        type: parsed.data.type,
        durationMinutes: parsed.data.durationMinutes,
        isFree: parsed.data.isFree,
        order: parsed.data.order,
      },
    })
  } else {
    const max = await prisma.exam.aggregate({ where: { sectionId }, _max: { order: true } })
    await prisma.exam.create({
      data: {
        sectionId,
        title: parsed.data.title,
        type: parsed.data.type,
        durationMinutes: parsed.data.durationMinutes,
        isFree: parsed.data.isFree,
        order: parsed.data.order || (max._max.order ?? 0) + 1,
      },
    })
  }
  return { ok: true }
}

export async function deleteExamAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const examId = String(formData.get("examId") ?? "")
  const exam = await prisma.exam.findUnique({ where: { id: examId } })
  if (!exam) return { ok: false, error: "غير موجود" }
  const { user, section } = await ownsSection(exam.sectionId)
  if (!user || !section) return { ok: false, error: "غير مصرح" }
  await prisma.exam.delete({ where: { id: examId } })
  return { ok: true }
}

// ============================= الأسئلة =============================

const questionSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(2, "نص السؤال قصير"),
  type: z.enum(["MCQ", "ESSAY"]),
  points: z.coerce.number().int().min(1).max(50),
  order: z.coerce.number().int().default(0),
  options: z.array(z.string().optional()).max(4),
  correctAnswer: z.string().optional(),
})

export async function saveQuestionAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const examId = String(formData.get("examId") ?? "")
  const exam = await prisma.exam.findUnique({ where: { id: examId } })
  if (!exam) return { ok: false, error: "الاختبار غير موجود" }
  const { user, section } = await ownsSection(exam.sectionId)
  if (!user || !section) return { ok: false, error: "غير مصرح" }

  const type = String(formData.get("type") ?? "MCQ")
  const options: string[] = []
  for (const key of ["option0", "option1", "option2", "option3"]) {
    const v = String(formData.get(key) ?? "").trim()
    options.push(v)
  }
  const correctAnswer =
    type === "MCQ" ? String(formData.get("correctAnswer") ?? "0") : String(formData.get("correctAnswer") ?? "").trim()

  const parsed = questionSchema.safeParse({
    id: formData.get("id") ?? undefined,
    text: formData.get("text"),
    type,
    points: formData.get("points"),
    order: formData.get("order"),
    options,
    correctAnswer: correctAnswer || undefined,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const data = {
    text: parsed.data.text,
    type: parsed.data.type as "MCQ" | "ESSAY",
    points: parsed.data.points,
    order: parsed.data.order,
    options:
      parsed.data.type === "MCQ"
        ? (parsed.data.options.filter(Boolean) as string[])
        : undefined,
    correctAnswer: parsed.data.correctAnswer || null,
  }

  if (parsed.data.id) {
    const existing = await prisma.question.findFirst({ where: { id: parsed.data.id, examId } })
    if (!existing) return { ok: false, error: "السؤال غير موجود" }
    await prisma.question.update({ where: { id: parsed.data.id }, data })
  } else {
    const max = await prisma.question.aggregate({ where: { examId }, _max: { order: true } })
    await prisma.question.create({
      data: { ...data, examId, order: parsed.data.order || (max._max.order ?? 0) + 1 },
    })
  }

  // تحديث مجموع درجات الاختبار
  const total = await prisma.question.aggregate({ where: { examId }, _sum: { points: true } })
  await prisma.exam.update({ where: { id: examId }, data: { totalScore: total._sum.points ?? 0 } })

  return { ok: true }
}

export async function deleteQuestionAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const questionId = String(formData.get("questionId") ?? "")
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { exam: true },
  })
  if (!question) return { ok: false, error: "غير موجود" }
  const { user, section } = await ownsSection(question.exam?.sectionId ?? "")
  if (!user || !section) return { ok: false, error: "غير مصرح" }
  await prisma.question.delete({ where: { id: questionId } })
  if (question.examId) {
    const total = await prisma.question.aggregate({ where: { examId: question.examId }, _sum: { points: true } })
    await prisma.exam.update({
      where: { id: question.examId },
      data: { totalScore: total._sum.points ?? 0 },
    })
  }
  return { ok: true }
}

// ============================= أسئلة الذكاء الاصطناعي =============================

export async function saveAIQuestionsAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult> {
  const sectionId = String(formData.get("sectionId") ?? "")
  const examType = String(formData.get("examType") ?? "EXAM") as "EXAM" | "HOMEWORK"
  const questionsJson = String(formData.get("questions") ?? "[]")

  if (!sectionId) return { ok: false, error: "معرف القسم مطلوب" }

  const { user, section } = await ownsSection(sectionId)
  if (!user || !section) return { ok: false, error: "غير مصرح" }

  let questions: { question: string; options: string[]; correctAnswer: string; difficulty: string }[]
  try {
    questions = JSON.parse(questionsJson)
  } catch {
    return { ok: false, error: "بيانات الأسئلة غير صالحة" }
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    return { ok: false, error: "لا توجد أسئلة للحفظ" }
  }

  const title = examType === "HOMEWORK" ? `واجب بالذكاء الاصطناعي — ${section.name}` : `اختبار بالذكاء الاصطناعي — ${section.name}`

  const max = await prisma.exam.aggregate({ where: { sectionId }, _max: { order: true } })
  const exam = await prisma.exam.create({
    data: {
      sectionId,
      title,
      type: examType,
      durationMinutes: examType === "HOMEWORK" ? 0 : 60,
      order: (max._max.order ?? 0) + 1,
    },
  })

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const correctIdx = q.options.indexOf(q.correctAnswer)
    await prisma.question.create({
      data: {
        examId: exam.id,
        text: q.question,
        type: "MCQ",
        points: q.difficulty === "صعب" ? 3 : q.difficulty === "متوسط" ? 2 : 1,
        order: i + 1,
        options: q.options,
        correctAnswer: String(correctIdx >= 0 ? correctIdx : 0),
      },
    })
  }

  const total = await prisma.question.aggregate({ where: { examId: exam.id }, _sum: { points: true } })
  await prisma.exam.update({ where: { id: exam.id }, data: { totalScore: total._sum.points ?? 0 } })

  return { ok: true }
}
