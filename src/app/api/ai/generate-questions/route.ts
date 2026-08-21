import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { getCurrentUser } from "@/lib/auth"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "")

interface GeneratedQuestion {
  text: string
  type: "MCQ" | "ESSAY"
  options?: string[]
  correctAnswer?: string
  points: number
  explanation?: string
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user || (user.role !== "TEACHER" && user.role !== "ADMIN")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 })
  }

  const body = await request.json()
  const { topic, count = 5, type = "mixed" } = body as {
    topic: string
    count?: number
    type?: "mcq" | "essay" | "mixed"
  }

  if (!topic || topic.trim().length < 2) {
    return NextResponse.json({ error: "أدخل موضوع الدرس" }, { status: 400 })
  }

  if (count < 1 || count > 20) {
    return NextResponse.json({ error: "عدد الأسئلة يجب أن يكون بين 1 و 20" }, { status: 400 })
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "مفتاح Gemini غير مُعد" }, { status: 500 })
  }

  const typeLabel = type === "mcq" ? "اختيار من متعدد" : type === "essay" ? "مقالي" : "مختلط (MCQ + مقالي)"

  const prompt = `أنت مدرس مصري متخصص. قم بتوليد ${count} سؤالاً تعليمياً باللغة العربية حول الموضوع التالي:

الموضوع: "${topic}"

نوع الأسئلة: ${typeLabel}

أعد النتيجة كـ JSON array فقط، بدون أي نص إضافي. كل سؤال يجب أن يحتوي على:
- "text": نص السؤال
- "type": "MCQ" أو "ESSAY"
- "options": مصفوفة 4 خيارات (فقط لـ MCQ)
- "correctAnswer": رقم الخيار الصحيح 0-3 (فقط لـ MCQ)
- "points": درجة السؤال (1-5)
- "explanation": شرح مختصر للإجابة

الصيغة المطلوبة:
[
  {
    "text": "...",
    "type": "MCQ",
    "options": ["...", "...", "...", "..."],
    "correctAnswer": "0",
    "points": 2,
    "explanation": "..."
  }
]

تأكد من:
- أن الأسئلة دقيقة ومرتبطة بالموضوع
- أن الخيارات مقنعة ولا يوجد خيار واحد显然 خاطئ
- أن الـ MCQ له 4 خيارات دائماً
- أن الأسئلة المقالية واضحة ومحددة`

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })
    const result = await model.generateContent(prompt)
    const response = result.response
    const text = response.text()

    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({ error: "لم يتم التعرف على صيغة الأسئلة" }, { status: 500 })
    }

    const questions: GeneratedQuestion[] = JSON.parse(jsonMatch[0])

    const validated = questions.map((q, i) => ({
      text: q.text || `سؤال ${i + 1}`,
      type: q.type === "ESSAY" ? "ESSAY" : "MCQ",
      options: q.type === "MCQ" ? (q.options || []).slice(0, 4) : undefined,
      correctAnswer: q.type === "MCQ" ? String(q.correctAnswer ?? "0") : undefined,
      points: Math.min(Math.max(Number(q.points) || 1, 1), 5),
      explanation: q.explanation || "",
    }))

    return NextResponse.json({ questions: validated })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطأ غير معروف"
    return NextResponse.json({ error: `فشل توليد الأسئلة: ${msg}` }, { status: 500 })
  }
}
