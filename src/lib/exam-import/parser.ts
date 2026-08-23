/**
 * محلل أسئلة الاستيراد — نقي 100% (بلا I/O) ليكون قابلاً للاختبار الكامل.
 * يدعم التنسيقات الشائعة A/B/C (عربي وإنجليزي) + صح/خطأ + مقالي.
 */

import { OPTION_LETTERS } from "@/lib/exam-labels"

export type ImportedType = "MCQ" | "TRUE_FALSE" | "ESSAY"

export interface ImportedQuestion {
  order: number
  text: string
  type: ImportedType
  options: string[]
  correctAnswer: number | null
  points: number
  explanation?: string
}

export interface InvalidQuestion {
  order: number
  text: string
  reason: string
}

export interface ParseResult {
  questions: ImportedQuestion[]
  invalid: InvalidQuestion[]
}

// ===== الحدود (قرارات مسجلة — انظر تقرير FIX-5 §Limits) =====
export const IMPORT_LIMITS = {
  maxQuestions: 200,
  maxQuestionLength: 1000,
  maxOptionLength: 300,
  minOptions: 2,
  maxOptions: 4,
  defaultPoints: 1,
} as const

const LETTER_LABELS: Record<string, number> = {}
for (const [lang, letters] of Object.entries(OPTION_LETTERS)) {
  letters.forEach((l, i) => {
    LETTER_LABELS[l] = i
    if (lang === "ar" && l === "هـ") LETTER_LABELS["ها"] = i // تسامح صيغ الهاء
  })
}

const RE_QUESTION = /^\s*(\d{1,3})\s*[.،)\-－]\s*(.*)$/
const RE_ANSWER = /^(?:الإجابة(?!s*\s*النموذجية)|الاجابة(?!s*\s*النموذجية)|Answer(?:\s+Key)?)\s*[:：\-]?\s*(.+)$/i
const RE_POINTS = /^(?:الدرجة|الدرجات|Points?)\s*[:：\-]\s*(\d{1,3})/i
const RE_MODEL_ANSWER = /^(?:الإجابة النموذجية|Model Answer)\s*[:：\-]\s*([\s\S]+)$/i
const RE_OPTION_LINE = /^([أ-يa-zA-Z])\s*[.．\-)\]::]\s+(.+)$/

function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

function optionIndexOf(letterLabel: string): number | null {
  const key = letterLabel.trim()
  if (key in LETTER_LABELS) return LETTER_LABELS[key]
  const lower = key.toLowerCase()
  for (const [k, v] of Object.entries(LETTER_LABELS)) {
    if (k.toLowerCase() === lower) return v
  }
  return null
}

/** مطابقة نص الإجابة مع أحد الخيارات (تسامح تشكيل/مسافات) */
function matchOptionIndex(answerText: string, options: string[]): number | null {
  const norm = normalizeText(answerText).replace(/[أإآ]/g, "ا")
  const idx = options.findIndex(
    (o) => normalizeText(o).replace(/[أإآ]/g, "ا") === norm
  )
  return idx >= 0 ? idx : null
}

interface RawBlock {
  order: number
  lines: string[]
}

function splitIntoBlocks(lines: string[]): RawBlock[] {
  const blocks: RawBlock[] = []
  let current: RawBlock | null = null
  for (const raw of lines) {
    const line = raw.replace(/\t/g, " ").trimEnd()
    if (!line.trim()) continue
    const m = line.match(RE_QUESTION)
    if (m && m[2].trim().length > 0) {
      current = { order: Number(m[1]), lines: [m[2].trim()] }
      blocks.push(current)
    } else if (current) {
      current.lines.push(line.trim())
    }
  }
  return blocks
}

function classifyBlock(block: RawBlock): ImportedQuestion | InvalidQuestion {
  const order = block.order
  const firstLine = block.lines[0] ?? ""

  let questionText = firstLine
  let options: string[] = []
  let answerRaw: string | null = null
  let modelAnswer: string | null = null
  let points: number = IMPORT_LIMITS.defaultPoints

  for (let i = 1; i < block.lines.length; i++) {
    const line = block.lines[i]

    const model = line.match(RE_MODEL_ANSWER)
    if (model) { modelAnswer = normalizeText(model[1]).slice(0, IMPORT_LIMITS.maxOptionLength); continue }

    const ans = line.match(RE_ANSWER)
    if (ans) { answerRaw = ans[1].trim(); continue }

    const pts = line.match(RE_POINTS)
    if (pts) { points = Math.min(Number(pts[1]), 100); continue }

    // سطر صح/خطأ عاري → خيارات TRUE_FALSE الضمنية
    const bareTF = normalizeText(line).replace(/[أإآ]/g, "ا")
    if (/^(صح|صحيح|خطا|true|false)$/i.test(bareTF) && options.length < 2) {
      options.push(
        /^(true|false)$/i.test(bareTF)
          ? (bareTF.toLowerCase() === "true" ? "True" : "False")
          : normalizeText(line)
      )
      continue
    }

    const opt = line.match(RE_OPTION_LINE)
    if (opt && optionIndexOf(opt[1]) !== null && options.length < IMPORT_LIMITS.maxOptions) {
      const text = normalizeText(opt[2])
      if (text) options.push(text.slice(0, IMPORT_LIMITS.maxOptionLength))
      continue
    }

    // سطر متابعة لنص السؤال
    questionText = normalizeText(`${questionText} ${line}`).slice(0, IMPORT_LIMITS.maxQuestionLength)
  }

  const fail = (reason: string): InvalidQuestion => ({ order, text: questionText, reason })

  if (!questionText || questionText.length < 3) return fail("نص السؤال فارغ أو قصير جداً")

  const isTFWords =
    options.length === 0 &&
    answerRaw !== null &&
    /^(صح|صحيح|true)$/i.test(normalizeText(answerRaw).replace(/[أإآ]/g, "ا"))

  if (options.length === 0 && !isTFWords && answerRaw === null) {
    // مقالي بدون إجابة نموذجية — مسموح
    if (modelAnswer) {
      return {
        order, text: questionText, type: "ESSAY", options: [],
        correctAnswer: null, points,
        explanation: modelAnswer.slice(0, IMPORT_LIMITS.maxOptionLength),
      }
    }
    return {
      order, text: questionText, type: "ESSAY", options: [],
      correctAnswer: null, points,
    }
  }

  // True/False ضمني: الإجابة صح/خطأ بلا خيارات مكتوبة
  if (options.length === 0 && isTFWords) {
    options = ["صح", "خطأ"]
    answerRaw = /true/i.test(answerRaw!) ? "True" : answerRaw!
  } else if (
    options.length === 2 &&
    options.every((o) => /^(صح|خطأ|صحيح|true|false)$/i.test(normalizeText(o).replace(/[أإآ]/g, "ا")))
  ) {
    // MCQ ثنائي صح/خطأ → يُعامل TRUE_FALSE للدلالة
  }

  if (options.length < IMPORT_LIMITS.minOptions)
    return fail(`عدد الخيارات ${options.length} أقل من المطلوب (${IMPORT_LIMITS.minOptions})`)

  if (answerRaw === null) return fail("ناقص الإجابة الصحيحة")

  // تحويل نص الإجابة إلى فهرس
  let correct: number | null = null
  const numeric = answerRaw.match(/^\d{1,2}$/)
  if (numeric) {
    correct = Number(answerRaw) - 1
  } else {
    correct = matchOptionIndex(answerRaw, options)
    if (correct === null) {
      const labelIdx = optionIndexOf(answerRaw.replace(/^(?:خيار|الخيار)\s*/i, "").replace(/[.:\-)]$/, ""))
      if (labelIdx !== null && labelIdx < options.length) correct = labelIdx
    }
    if (correct === null) {
      const tfNorm = normalizeText(answerRaw).replace(/[أإآ]/g, "ا").toLowerCase()
      if (/^(صح|صحيح|true)$/.test(tfNorm)) correct = 0
      else if (/^(خطا|خطأ|false)$/.test(tfNorm)) correct = 1
    }
  }

  if (correct === null || correct < 0 || correct >= options.length)
    return fail("الإجابة الصحيحة لا تطابق أي خيار")

  const hasTFWords = options.some((o) => /^(صح|خطأ|صحيح|true|false)$/i.test(normalizeText(o).replace(/[أإآ]/g, "ا")))
  const type: ImportedType = options.length === 2 && hasTFWords ? "TRUE_FALSE" : "MCQ"

  if (questionText.length > IMPORT_LIMITS.maxQuestionLength)
    return fail("نص السؤال يتجاوز الطول الأقصى")

  return {
    order, text: questionText, type, options, correctAnswer: correct,
    points, ...(modelAnswer ? { explanation: modelAnswer } : {}),
  }
}

/** نقطة الدخول: نص مستخرج ← أسئلة منظمة + غير الصالحة بأسبابها */
export function parseExamText(text: string): ParseResult {
  const safeText = text.normalize("NFC").slice(0, 200_000)
  const lines = safeText.split(/\r?\n/)
  const blocks = splitIntoBlocks(lines)

  const questions: ImportedQuestion[] = []
  const invalid: InvalidQuestion[] = []

  for (const block of blocks.slice(0, IMPORT_LIMITS.maxQuestions + 50)) {
    const result = classifyBlock(block)
    if ("reason" in result) invalid.push(result)
    else questions.push(result)
  }

  // ترقيم موحد بعد الفصل
  questions.forEach((q, i) => (q.order = i + 1))
  invalid.forEach((q, i) => (q.order = i + 1))

  return { questions: questions.slice(0, IMPORT_LIMITS.maxQuestions), invalid }
}
