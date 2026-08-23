import { NextResponse, NextRequest } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { extractTextFromFile, ExtractError, isImportExtension } from "@/lib/exam-import/extract"
import { parseExamText, IMPORT_LIMITS } from "@/lib/exam-import/parser"

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024 // 10MB — قرار موثق في تقرير FIX-5

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
  if (user.role !== "TEACHER" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "هذه الميزة متاحة للمعلمين فقط" }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "تعذر قراءة الملف المرفوع" }, { status: 400 })
  }

  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "لم يتم إرفاق ملف" }, { status: 400 })
  }

  if (!isImportExtension(file.name)) {
    return NextResponse.json(
      { error: "صيغة غير مدعومة — المسموح: TXT أو DOCX أو PDF" },
      { status: 400 }
    )
  }

  if (file.size > MAX_IMPORT_FILE_SIZE) {
    return NextResponse.json(
      { error: `حجم الملف يتجاوز الحد الأقصى (${MAX_IMPORT_FILE_SIZE / (1024 * 1024)} ميجا)` },
      { status: 400 }
    )
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "الملف فارغ" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  let text: string
  try {
    text = await extractTextFromFile(buffer, file.name)
  } catch (error) {
    if (error instanceof ExtractError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 })
    }
    console.error("[IMPORT_EXTRACT_ERROR]", file.name, error instanceof Error ? error.message : "unknown")
    return NextResponse.json(
      { error: "تعذر قراءة الملف — تأكد من سلامة الملف وصيغته" },
      { status: 422 }
    )
  }

  if (!text.trim()) {
    return NextResponse.json(
      { error: "لم يتم العثور على نص قابل للقراءة داخل الملف", code: "NO_TEXT_FOUND" },
      { status: 422 }
    )
  }

  const parsed = parseExamText(text)

  if (parsed.questions.length === 0 && parsed.invalid.length === 0) {
    return NextResponse.json(
      { error: "لم نتمكن من اكتشاف أسئلة في الملف — تأكد من ترقيم الأسئلة بصيغة: 1. نص السؤال", code: "NO_QUESTIONS" },
      { status: 422 }
    )
  }

  return NextResponse.json({
    fileName: file.name,
    totalDetected: parsed.questions.length + parsed.invalid.length,
    questions: parsed.questions,
    invalid: parsed.invalid,
    stats: {
      MCQ: parsed.questions.filter((q) => q.type === "MCQ").length,
      TRUE_FALSE: parsed.questions.filter((q) => q.type === "TRUE_FALSE").length,
      ESSAY: parsed.questions.filter((q) => q.type === "ESSAY").length,
      maxQuestionsAllowed: IMPORT_LIMITS.maxQuestions,
    },
  })
}
