import { NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

export async function POST(req: Request) {
  try {
    console.log("1. Checking API Key...")
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error("مفتاح GEMINI_API_KEY غير موجود في إعدادات الخادم.")
    }

    const { lessonName, count } = await req.json()
    console.log("2. Payload received:", { lessonName, count })

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

    const prompt = `أنت خبير تربوي في وضع مناهج اللغة العربية للمرحلة الثانوية والإعدادية في مصر. قم بتوليد ${count} أسئلة اختيار من متعدد عن درس "${lessonName}". أرجع النتيجة حصرياً بصيغة JSON كمصفوفة تحتوي على كائنات بالشكل التالي: [{"question": "نص", "options": ["1", "2", "3", "4"], "correctAnswer": "الخيار", "difficulty": "سهل"}] لا تقم بإضافة أي نصوص أخرى.`

    console.log("3. Sending request to Gemini...")
    const result = await model.generateContent(prompt)

    const responseText = result.response.text()
    console.log("4. Raw Response from Gemini:", responseText)

    const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim()
    const questions = JSON.parse(cleanJson)

    return NextResponse.json({ questions })
  } catch (error: any) {
    console.error("GEMINI FATAL ERROR:", error)
    return NextResponse.json(
      { error: error.message || "حدث خطأ غير معروف" },
      { status: 500 }
    )
  }
}
