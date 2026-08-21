"use client"

import React, { useState, useTransition } from "react"
import { saveAIQuestionsAction } from "@/app/actions/teacher-content"
import { useRouter } from "next/navigation"

interface Props {
  sectionId: string
}

export default function AIGenerator({ sectionId }: Props) {
  const [lessonName, setLessonName] = useState("")
  const [count, setCount] = useState(5)
  const [loading, setLoading] = useState(false)
  const [generatedQuestions, setGeneratedQuestions] = useState<any[]>([])
  const [saveMsg, setSaveMsg] = useState("")
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleGenerate = async () => {
    setLoading(true)
    setSaveMsg("")
    try {
      const res = await fetch("/api/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonName, count }),
      })
      const data = await res.json()
      if (data.questions) {
        setGeneratedQuestions(data.questions)
      } else {
        alert("حدث خطأ: " + data.error)
      }
    } catch (error) {
      console.error(error)
      alert("فشل الاتصال بالذكاء الاصطناعي.")
    } finally {
      setLoading(false)
    }
  }

  const saveQuestions = async (type: "EXAM" | "HOMEWORK") => {
    setSaveMsg("")
    const fd = new FormData()
    fd.set("sectionId", sectionId)
    fd.set("examType", type)
    fd.set("questions", JSON.stringify(generatedQuestions))

    startTransition(async () => {
      const res = await saveAIQuestionsAction({ ok: false }, fd)
      if (res.ok) {
        const label = type === "EXAM" ? "الاختبار" : "الواجب"
        setSaveMsg(`تم حفظ ${generatedQuestions.length} سؤال في ${label} بنجاح!`)
        setGeneratedQuestions([])
        try { await router.refresh() } catch { /* ignore */ }
      } else {
        alert("خطأ: " + res.error)
      }
    })
  }

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 mb-8">
      <h2 className="text-2xl font-bold text-amber-500 mb-4">مساعد الذكاء الاصطناعي (Gemini)</h2>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <input
          type="text"
          placeholder="اسم الدرس (مثال: المنادى، الممنوع من الصرف)"
          className="flex-1 p-3 bg-slate-800 text-white rounded-xl border border-slate-700"
          value={lessonName}
          onChange={(e) => setLessonName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
        />
        <input
          type="number"
          min="1"
          max="20"
          className="w-24 p-3 bg-slate-800 text-white rounded-xl border border-slate-700"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <button
          onClick={handleGenerate}
          disabled={loading || !lessonName}
          className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-6 py-3 rounded-xl disabled:opacity-50 transition-colors"
        >
          {loading ? "جاري التوليد..." : "توليد الأسئلة"}
        </button>
      </div>

      {generatedQuestions.length > 0 && (
        <div className="space-y-4 mt-6">
          <h3 className="text-xl font-semibold text-white">الأسئلة المقترحة:</h3>
          {generatedQuestions.map((q, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded-xl border border-slate-700">
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-lg font-bold text-slate-200">
                  {idx + 1}. {q.question}
                </h4>
                <span
                  className={`px-2 py-1 text-xs rounded-md ${
                    q.difficulty === "سهل"
                      ? "bg-green-500/20 text-green-400"
                      : q.difficulty === "صعب"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-yellow-500/20 text-yellow-400"
                  }`}
                >
                  {q.difficulty}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {q.options.map((opt: string, i: number) => (
                  <div
                    key={i}
                    className={`p-2 rounded-lg text-sm ${
                      opt === q.correctAnswer
                        ? "bg-green-600/20 border border-green-500/50 text-green-400 font-bold"
                        : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {opt}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex gap-4 mt-6 border-t border-slate-700 pt-6">
            <button
              onClick={() => saveQuestions("HOMEWORK")}
              disabled={isPending}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl disabled:opacity-50 transition-colors"
            >
              {isPending ? "جاري الحفظ..." : "إضافة إلى الواجب"}
            </button>
            <button
              onClick={() => saveQuestions("EXAM")}
              disabled={isPending}
              className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl disabled:opacity-50 transition-colors"
            >
              {isPending ? "جاري الحفظ..." : "إضافة إلى الاختبار"}
            </button>
          </div>
        </div>
      )}

      {saveMsg && (
        <div className="mt-4 rounded-xl bg-green-500/10 border border-green-500/30 p-3 text-center text-green-400 font-bold">
          {saveMsg}
        </div>
      )}
    </div>
  )
}
