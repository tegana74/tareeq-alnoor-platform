import { NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { rateLimit, getClientIp } from "@/lib/rate-limit"

const requestSchema = z.object({
  lessonName: z.string().min(1, "اسم الدرس مطلوب").max(200),
  count: z.number().int().min(1, "عدد الأسئلة يجب أن يكون على الأقل 1").max(20, "الحد الأقصى 20 سؤال"),
})

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

    const { lessonName, count } = parsed.data

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "خدمة الذكاء الاصطناعي غير متوفرة حالياً" },
        { status: 503 }
      )
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" })

    const prompt = `أنت خبير تربوي في وضع مناهج اللغة العربية للمرحلة الثانوية والإعدادية في مصر. قم بتوليد ${count} أسئلة اختيار من متعدد عن درس "${lessonName}". أرجع النتيجة حصرياً بصيغة JSON كمصفوفة تحتوي على كائنات بالشكل التالي: [{"question": "نص", "options": ["1", "2", "3", "4"], "correctAnswer": "الخيار", "difficulty": "سهل"}] لا تقم بإضافة أي نصوص أخرى.`

    const result = await model.generateContent(prompt)

    const responseText = result.response.text()
    const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim()
    const questions = JSON.parse(cleanJson)

    return NextResponse.json({ questions })
  } catch (error: any) {
    console.error("AI generate error:", error?.message ?? "unknown")
    return NextResponse.json(
      { error: "حدث خطأ غير متوقع" },
      { status: 500 }
    )
  }
}
