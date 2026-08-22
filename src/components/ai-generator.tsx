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
  const [title, setTitle] = useState("")
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [examType, setExamType] = useState<"EXAM" | "HOMEWORK">("EXAM")
  const [isFree, setIsFree] = useState(false)
  const [loading, setLoading] = useState(false)
  const [generatedQuestions, setGeneratedQuestions] = useState<Array<{
    question: string
    options: string[]
    correctAnswer: string
    difficulty: string
  }>>([])
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
        if (!title) setTitle(lessonName)
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

  const saveQuestions = async () => {
    if (!title.trim()) {
      alert("يرجى إدخال عنوان الاختبار")
      return
    }
    setSaveMsg("")
    const fd = new FormData()
    fd.set("sectionId", sectionId)
    fd.set("examType", examType)
    fd.set("title", title.trim())
    fd.set("durationMinutes", String(durationMinutes))
    fd.set("isFree", String(isFree))
    fd.set("questions", JSON.stringify(generatedQuestions))

    startTransition(async () => {
      const res = await saveAIQuestionsAction({ ok: false }, fd)
      if (res.ok) {
        setSaveMsg("تم حفظ الاختبار بنجاح!")
        setGeneratedQuestions([])
        setTitle("")
        setLessonName("")
        try { await router.refresh() } catch { /* ignore */ }
      } else {
        alert("خطأ: " + res.error)
      }
    })
  }

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 mb-8">
      <h2 className="text-2xl font-bold text-amber-500 mb-4">مولّد الأسئلة بالذكاء الاصطناعي</h2>

      {/* حقول الإدخال */}
      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <input
          type="text"
          placeholder="اسم الدرس للتوليد (مثال: المنادى)"
          className="p-3 bg-slate-800 text-white rounded-xl border border-slate-700 text-sm"
          value={lessonName}
          onChange={(e) => setLessonName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
        />
        <input
          type="number"
          min="1"
          max="20"
          placeholder="عدد الأسئلة"
          className="p-3 bg-slate-800 text-white rounded-xl border border-slate-700 text-sm"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading || !lessonName}
        className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold px-6 py-3 rounded-xl disabled:opacity-50 transition-colors"
      >
        {loading ? "جاري التوليد..." : "توليد الأسئلة"}
      </button>

      {/* الأسئلة المولدة + حقول الحفظ */}
      {generatedQuestions.length > 0 && (
        <div className="mt-6 space-y-4">
          <h3 className="text-xl font-semibold text-white">الأسئلة المقترحة ({generatedQuestions.length})</h3>

          {/* حقول إعدادات الاختبار قبل الحفظ */}
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3">
            <h4 className="text-sm font-bold text-slate-300">إعدادات الاختبار</h4>
            <input
              type="text"
              placeholder="عنوان الاختبار (مثال: اختبار على الممنوع من الصرف)"
              className="w-full p-3 bg-slate-700 text-white rounded-xl border border-slate-600 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                value={examType}
                onChange={(e) => setExamType(e.target.value as "EXAM" | "HOMEWORK")}
                className="p-3 bg-slate-700 text-white rounded-xl border border-slate-600 text-sm"
              >
                <option value="EXAM">اختبار</option>
                <option value="HOMEWORK">واجب منزلي</option>
              </select>
              <input
                type="number"
                min="1"
                max="300"
                placeholder="المدة (دقائق)"
                className="p-3 bg-slate-700 text-white rounded-xl border border-slate-600 text-sm"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              />
              <label className="flex items-center gap-2 p-3 bg-slate-700 rounded-xl border border-slate-600 text-sm text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFree}
                  onChange={(e) => setIsFree(e.target.checked)}
                  className="h-4 w-4 accent-amber-500"
                />
                اختبار مجاني
              </label>
            </div>
          </div>

          {/* قائمة الأسئلة */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {generatedQuestions.map((q, idx) => (
              <div key={idx} className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-sm font-bold text-slate-200">
                    {idx + 1}. {q.question}
                  </h4>
                  <span
                    className={`px-2 py-1 text-xs rounded-md shrink-0 ms-2 ${
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
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {q.options.map((opt: string, i: number) => (
                    <div
                      key={i}
                      className={`p-2 rounded-lg text-xs ${
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
          </div>

          {/* زر الحفظ الوحيد */}
          <div className="border-t border-slate-700 pt-4">
            <button
              onClick={saveQuestions}
              disabled={isPending || !title.trim()}
              className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl disabled:opacity-50 transition-colors"
            >
              {isPending ? "جاري الحفظ..." : `حفظ ${generatedQuestions.length} سؤال ك${examType === "EXAM" ? "اختبار" : "واجب"}`}
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
