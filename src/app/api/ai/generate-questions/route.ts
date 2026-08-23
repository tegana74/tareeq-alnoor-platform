import { NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { AI_MODEL } from "@/lib/constants"

// ============================= Request Schema =============================

const requestSchema = z.object({
  lessonName: z.string().min(1, "اسم الدرس مطلوب").max(200),
  count: z.number().int().min(1, "عدد الأسئلة يجب أن يكون على الأقل 1").max(20, "الحد الأقصى 20 سؤال"),
  questionType: z.enum(["MCQ", "TRUE_FALSE", "ESSAY", "MIXED"]).default("MCQ"),
  language: z.enum(["ar", "en"]).default("ar"),
})

// ============================= AI Response Validation =============================

const aiQuestionSchema = z.object({
  question: z.string().min(1),
  type: z.enum(["MCQ", "TRUE_FALSE", "ESSAY"]),
  options: z.array(z.string()).optional().default([]),
  correctAnswer: z.union([z.string(), z.number(), z.null()]).optional().default(null),
  difficulty: z.string().optional().default("متوسط"),
})

export type AIGeneratedQuestion = z.infer<typeof aiQuestionSchema>

// ============================= Validated Question =============================

export interface ValidatedQuestion {
  question: string
  type: "MCQ" | "ESSAY"
  options: string[]
  correctAnswer: number | null
  difficulty: string
  originalType: "MCQ" | "TRUE_FALSE" | "ESSAY"
}

export interface InvalidQuestion {
  question: string
  reason: string
}

// ============================= Prompt Builder =============================

function buildPrompt(lessonName: string, count: number, questionType: string, language: string): string {
  const langInstruction = language === "en"
    ? "Write everything in English."
    : "اكتب كل شيء باللغة العربية."

  const typeInstructions: Record<string, string> = {
    MCQ: language === "en"
      ? `Generate ${count} multiple-choice questions about "${lessonName}". Each question must have exactly 4 options and one correct answer. Return JSON array: [{"question":"text","type":"MCQ","options":["a","b","c","d"],"correctAnswer":"the exact correct option text","difficulty":"easy|medium|hard"}]. ${langInstruction} Return ONLY valid JSON, no other text.`
      : `قم بتوليد ${count} أسئلة اختيار من متعدد عن درس "${lessonName}". كل سؤال يجب أن يحتوي على 4 خيارات بالضبط وإجابة صحيحة واحدة. أرجع النتيجة حصرياً كمصفوفة JSON: [{"question":"نص","type":"MCQ","options":["1","2","3","4"],"correctAnswer":"نص الخيار الصحيح","difficulty":"سهل|متوسط|صعب"}]. ${langInstruction} لا تضف أي نصوص أخرى.`,

    TRUE_FALSE: language === "en"
      ? `Generate ${count} true/false questions about "${lessonName}". Each question must have exactly 2 options: ["True","False"]. correctAnswer must be exactly "True" or "False". Return JSON array: [{"question":"text","type":"TRUE_FALSE","options":["True","False"],"correctAnswer":"True or False","difficulty":"easy|medium|hard"}]. ${langInstruction} Return ONLY valid JSON, no other text.`
      : `قم بتوليد ${count} أسئلة صح أو خطأ عن درس "${lessonName}". كل سؤال يجب أن يحتوي على خيارين فقط: ["صح","خطأ"]. الإجابة الصحيحة يجب أن تكون "صح" أو "خطأ" بالضبط. أرجع النتيجة حصرياً كمصفوفة JSON: [{"question":"نص","type":"TRUE_FALSE","options":["صح","خطأ"],"correctAnswer":"صح أو خطأ","difficulty":"سهل|متوسط|صعب"}]. ${langInstruction} لا تضف أي نصوص أخرى.`,

    ESSAY: language === "en"
      ? `Generate ${count} essay questions about "${lessonName}". These are open-ended questions with no options and no correct answer. Return JSON array: [{"question":"text","type":"ESSAY","options":[],"correctAnswer":null,"difficulty":"easy|medium|hard"}]. ${langInstruction} Return ONLY valid JSON, no other text.`
      : `قم بتوليد ${count} أسئلة مقالية عن درس "${lessonName}". هذه أسئلة مفتوحة بدون خيارات وبدون إجابة صحيحة محددة. أرجع النتيجة حصرياً كمصفوفة JSON: [{"question":"نص","type":"ESSAY","options":[],"correctAnswer":null,"difficulty":"سهل|متوسط|صعب"}]. ${langInstruction} لا تضف أي نصوص أخرى.`,

    MIXED: language === "en"
      ? `Generate ${count} mixed questions about "${lessonName}". Include a mix of MCQ (4 options), TRUE_FALSE (2 options: "True"/"False"), and ESSAY (no options). For MCQ: correctAnswer is the exact option text. For TRUE_FALSE: correctAnswer is "True" or "False". For ESSAY: correctAnswer is null. Return JSON array: [{"question":"text","type":"MCQ|TRUE_FALSE|ESSAY","options":[...],"correctAnswer":"...","difficulty":"easy|medium|hard"}]. ${langInstruction} Return ONLY valid JSON, no other text.`
      : `قم بتوليد ${count} أسئلة متنوعة عن درس "${lessonName}". اجمع بين اختيار من متعدد MCQ (4 خيارات) وصح أو خطأ TRUE_FALSE (خياران: "صح"/"خطأ") ومقالي ESSAY (بدون خيارات). لأسئلة MCQ: الإجابة الصحيحة هي نص الخيار. لأسئلة TRUE_FALSE: الإجابة "صح" أو "خطأ". لأسئلة ESSAY: الإجابة null. أرجع النتيجة حصرياً كمصفوفة JSON: [{"question":"نص","type":"MCQ|TRUE_FALSE|ESSAY","options":[...],"correctAnswer":"...","difficulty":"سهل|متوسط|صعب"}]. ${langInstruction} لا تضف أي نصوص أخرى.`,
  }

  return typeInstructions[questionType] ?? typeInstructions["MCQ"]
}

// ============================= Validation & Conversion =============================

/** Validate and convert a single AI-generated question. Returns ValidatedQuestion or InvalidQuestion. */
export function validateAIQuestion(
  raw: AIGeneratedQuestion,
  index: number,
  language: string
): ValidatedQuestion | InvalidQuestion {
  const label = `السؤال ${index + 1}`
  const q = raw.question?.trim()
  if (!q || q.length < 3) {
    return { question: q || `(${label})`, reason: `${label}: نص السؤال فارغ أو قصير جداً` }
  }

  // ---- ESSAY ----
  if (raw.type === "ESSAY") {
    if (raw.options && raw.options.length > 0) {
      return { question: q, reason: `${label}: سؤال مقالي يجب أن لا يحتوي على خيارات` }
    }
    return {
      question: q,
      type: "ESSAY",
      options: [],
      correctAnswer: null,
      difficulty: raw.difficulty ?? "متوسط",
      originalType: "ESSAY",
    }
  }

  // ---- TRUE_FALSE ----
  if (raw.type === "TRUE_FALSE") {
    const opts = raw.options ?? []
    if (opts.length !== 2) {
      return { question: q, reason: `${label}: سؤال صح/خطأ يجب أن يحتوي على خيارين فقط، وجد ${opts.length}` }
    }

    // Validate the options are actually true/false variants
    const tfAr = ["صح", "خطأ"]
    const tfEn = ["True", "False"]
    const normalizedOpts = opts.map(o => o.trim())

    const isAr = normalizedOpts.every((o, i) => {
      const norm = o.replace(/[أإآ]/g, "ا")
      return /^(صح|صحيح)$/i.test(norm) && i === 0 || /^(خطا|خطأ)$/i.test(norm) && i === 1
    })
    const isEn = normalizedOpts.every((o, i) => {
      return /^true$/i.test(o) && i === 0 || /^false$/i.test(o) && i === 1
    })

    if (!isAr && !isEn) {
      // Try reordering: maybe Gemini swapped them
      const isArSwap = normalizedOpts.length === 2 &&
        /^(خطا|خطأ)$/i.test(normalizedOpts[0].replace(/[أإآ]/g, "ا")) &&
        /^(صح|صحيح)$/i.test(normalizedOpts[1].replace(/[أإآ]/g, "ا"))
      const isEnSwap = normalizedOpts.length === 2 &&
        /^false$/i.test(normalizedOpts[0]) &&
        /^true$/i.test(normalizedOpts[1])

      if (!isArSwap && !isEnSwap) {
        return { question: q, reason: `${label}: خيارات سؤال صح/خطأ غير صالحة: [${opts.join(", ")}]` }
      }
    }

    // Determine correct answer index
    const answer = raw.correctAnswer
    let correctIdx: number | null = null

    if (typeof answer === "number") {
      if (answer === 0 || answer === 1) correctIdx = answer
    } else if (typeof answer === "string") {
      const norm = answer.trim().replace(/[أإآ]/g, "ا").toLowerCase()
      if (/^(صح|صحيح|true|0)$/.test(norm)) correctIdx = 0
      else if (/^(خطا|خطأ|false|1)$/.test(norm)) correctIdx = 1
    }

    if (correctIdx === null || (correctIdx !== 0 && correctIdx !== 1)) {
      return { question: q, reason: `${label}: الإجابة الصحيحة لسؤال صح/خطأ يجب أن تكون 0 أو 1، وجد: ${String(answer)}` }
    }

    // Normalize options to canonical form
    const canonicalOpts = language === "en" ? tfEn : tfAr

    return {
      question: q,
      type: "MCQ", // TRUE_FALSE stored as MCQ with 2 options
      options: canonicalOpts,
      correctAnswer: correctIdx,
      difficulty: raw.difficulty ?? "متوسط",
      originalType: "TRUE_FALSE",
    }
  }

  // ---- MCQ ----
  const opts = raw.options ?? []
  if (opts.length < 2 || opts.length > 6) {
    return { question: q, reason: `${label}: عدد خيارات MCQ غير صالح (${opts.length})، يجب أن يكون بين 2 و 6` }
  }

  const answer = raw.correctAnswer
  if (answer === null || answer === undefined) {
    return { question: q, reason: `${label}: الإجابة الصحيحة مفقودة` }
  }

  let correctIdx: number | null = null

  // If answer is a number, treat as index
  if (typeof answer === "number") {
    if (Number.isInteger(answer) && answer >= 0 && answer < opts.length) {
      correctIdx = answer
    }
  }

  // If answer is a string, try to match to an option
  if (correctIdx === null && typeof answer === "string") {
    const trimmed = answer.trim()
    // Try exact match first
    const exactIdx = opts.findIndex(o => o.trim() === trimmed)
    if (exactIdx >= 0) {
      correctIdx = exactIdx
    } else {
      // Try normalized match (alef normalization, case-insensitive)
      const normAnswer = trimmed.replace(/[أإآ]/g, "ا").toLowerCase()
      const normIdx = opts.findIndex(o =>
        o.trim().replace(/[أإآ]/g, "ا").toLowerCase() === normAnswer
      )
      if (normIdx >= 0) correctIdx = normIdx
    }

    // Try numeric string
    if (correctIdx === null) {
      const num = Number(trimmed)
      if (Number.isInteger(num) && num >= 0 && num < opts.length) {
        correctIdx = num
      }
    }
  }

  // STRICT: No fallback to 0. If we can't resolve, it's INVALID.
  if (correctIdx === null) {
    return {
      question: q,
      reason: `${label}: تعذّر تحويل الإجابة الصحيحة "${String(answer)}" إلى فهرس صالح ضمن الخيارات [${opts.join(", ")}]`,
    }
  }

  return {
    question: q,
    type: "MCQ",
    options: opts.map(o => o.trim()),
    correctAnswer: correctIdx,
    difficulty: raw.difficulty ?? "متوسط",
    originalType: "MCQ",
  }
}

// ============================= Route Handler =============================

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }
    if (user.role !== "TEACHER" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 })
    }

    const ip = await getClientIp()
    const rl = await rateLimit(`ai:${user.id}:${ip}`, 10, 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "طلبات كثيرة، حاول بعد قليل" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      )
    }

    const body = await req.json()
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { lessonName, count, questionType, language } = parsed.data

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "خدمة الذكاء الاصطناعي غير متوفرة حالياً" },
        { status: 503 }
      )
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: AI_MODEL })

    const prompt = buildPrompt(lessonName, count, questionType, language)
    const result = await model.generateContent(prompt)

    const responseText = result.response.text()
    const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim()

    let rawQuestions: unknown
    try {
      rawQuestions = JSON.parse(cleanJson)
    } catch {
      return NextResponse.json(
        { error: "فشل تحليل استجابة الذكاء الاصطناعي — حاول مرة أخرى" },
        { status: 502 }
      )
    }

    if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
      return NextResponse.json(
        { error: "لم يتم توليد أسئلة — حاول مرة أخرى" },
        { status: 502 }
      )
    }

    const validated: ValidatedQuestion[] = []
    const invalid: InvalidQuestion[] = []

    for (let i = 0; i < rawQuestions.length; i++) {
      const parseResult = aiQuestionSchema.safeParse(rawQuestions[i])
      if (!parseResult.success) {
        invalid.push({
          question: typeof rawQuestions[i]?.question === "string" ? rawQuestions[i].question : `سؤال ${i + 1}`,
          reason: `السؤال ${i + 1}: بنية غير صالحة — ${parseResult.error.issues[0]?.message ?? "خطأ"}`,
        })
        continue
      }

      const result = validateAIQuestion(parseResult.data, i, language)
      if ("reason" in result) {
        invalid.push(result)
      } else {
        validated.push(result)
      }
    }

    return NextResponse.json({ questions: validated, invalid })
  } catch (error: unknown) {
    console.error("AI generate error:", error instanceof Error ? error.message : "unknown")
    return NextResponse.json(
      { error: "حدث خطأ غير متوقع" },
      { status: 500 }
    )
  }
}
