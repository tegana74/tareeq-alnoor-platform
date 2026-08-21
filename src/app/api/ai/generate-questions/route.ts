import { NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { getCurrentUser } from "@/lib/auth"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user || (user.role !== "TEACHER" && user.role !== "ADMIN")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 })
  }

  try {
    const { lessonName, count } = await req.json()

    if (!lessonName || !count) {
      return NextResponse.json({ error: "يرجى توفير اسم الدرس وعدد الأسئلة" }, { status: 400 })
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

    const prompt = `
      أنت خبير تربوي في وضع مناهج اللغة العربية للمرحلة الثانوية والإعدادية في مصر.
      قم بتوليد ${count} أسئلة اختيار من متعدد عن درس "${lessonName}".
      يجب أن تتدرج الأسئلة في الصعوبة من السهل إلى الصعب.
      
      أرجع النتيجة حصرياً بصيغة JSON كمصفوفة (Array) تحتوي على كائنات بالشكل التالي:
      [
        {
          "question": "نص السؤال هنا",
          "options": ["خيار 1", "خيار 2", "خيار 3", "خيار 4"],
          "correctAnswer": "الخيار الصحيح هنا (يجب أن يكون مطابقاً تماماً لأحد الخيارات)",
          "difficulty": "سهل" // أو "متوسط" أو "صعب"
        }
      ]
      لا تقم بإضافة أي نصوص أخرى، ولا تستخدم علامات Markdown (مثل \`\`\`json). أرجع الـ JSON فقط.
    `

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim()
    const questions = JSON.parse(cleanJson)

    return NextResponse.json({ questions })
  } catch (error) {
    console.error("Gemini Error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء توليد الأسئلة" }, { status: 500 })
  }
}
