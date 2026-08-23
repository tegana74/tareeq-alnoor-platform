"use client"

import React, { useState, useTransition } from "react"
import { saveAIQuestionsAction } from "@/app/actions/teacher-content"
import { useRouter } from "next/navigation"
import type { ValidatedQuestion, InvalidQuestion } from "@/app/api/ai/generate-questions/route"

interface Props {
  sectionId: string
}

type QuestionTypeOption = "MCQ" | "TRUE_FALSE" | "ESSAY" | "MIXED"
type LanguageOption = "ar" | "en"

export default function AIGenerator({ sectionId }: Props) {
  const [lessonName, setLessonName] = useState("")
  const [count, setCount] = useState(5)
  const [questionType, setQuestionType] = useState<QuestionTypeOption>("MCQ")
  const [language, setLanguage] = useState<LanguageOption>("ar")
  const [title, setTitle] = useState("")
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [examType, setExamType] = useState<"EXAM" | "HOMEWORK">("EXAM")
  const [isFree, setIsFree] = useState(false)
  const [loading, setLoading] = useState(false)
  const [generatedQuestions, setGeneratedQuestions] = useState<ValidatedQuestion[]>([])
  const [invalidQuestions, setInvalidQuestions] = useState<InvalidQuestion[]>([])
  const [saveMsg, setSaveMsg] = useState("")
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleGenerate = async () => {
    setLoading(true)
    setSaveMsg("")
    setInvalidQuestions([])
    try {
      const res = await fetch("/api/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonName, count, questionType, language }),
      })
      const data = await res.json()
      if (data.questions) {
        setGeneratedQuestions(data.questions)
        setInvalidQuestions(data.invalid ?? [])
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

  const removeQuestion = (index: number) => {
    setGeneratedQuestions((prev) => prev.filter((_, i) => i !== index))
  }

  const saveQuestions = async () => {
    if (!title.trim()) {
      alert(language === "en" ? "Please enter exam title" : "يرجى إدخال عنوان الاختبار")
      return
    }
    if (generatedQuestions.length === 0) {
      alert(language === "en" ? "No valid questions to save" : "لا توجد أسئلة صالحة للحفظ")
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
        setSaveMsg(language === "en" ? "Exam saved successfully!" : "تم حفظ الاختبار بنجاح!")
        setGeneratedQuestions([])
        setInvalidQuestions([])
        setTitle("")
        setLessonName("")
        try { await router.refresh() } catch { /* ignore */ }
      } else {
        alert("خطأ: " + res.error)
      }
    })
  }

  const typeLabels: Record<QuestionTypeOption, string> = {
    MCQ: language === "en" ? "Multiple Choice" : "اختيار من متعدد",
    TRUE_FALSE: language === "en" ? "True / False" : "صح / خطأ",
    ESSAY: language === "en" ? "Essay" : "مقالي",
    MIXED: language === "en" ? "Mixed" : "مختلط",
  }

  const difficultyColor = (d: string) => {
    const norm = d.toLowerCase()
    if (norm === "سهل" || norm === "easy") return "bg-green-500/20 text-green-400"
    if (norm === "صعب" || norm === "hard") return "bg-red-500/20 text-red-400"
    return "bg-yellow-500/20 text-yellow-400"
  }

  const questionTypeLabel = (q: ValidatedQuestion) => {
    if (q.originalType === "TRUE_FALSE") return language === "en" ? "T/F" : "صح/خطأ"
    if (q.type === "ESSAY") return language === "en" ? "Essay" : "مقالي"
    return language === "en" ? "MCQ" : "اختيار"
  }

  const questionTypeBadgeColor = (q: ValidatedQuestion) => {
    if (q.originalType === "TRUE_FALSE") return "bg-blue-500/20 text-blue-400"
    if (q.type === "ESSAY") return "bg-purple-500/20 text-purple-400"
    return "bg-amber-500/20 text-amber-400"
  }

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 mb-8">
      <h2 className="text-2xl font-bold text-amber-500 mb-4">
        {language === "en" ? "AI Question Generator" : "مولّد الأسئلة بالذكاء الاصطناعي"}
      </h2>

      {/* حقول الإدخال */}
      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <input
          type="text"
          placeholder={language === "en" ? "Lesson name (e.g. Photosynthesis)" : "اسم الدرس للتوليد (مثال: المنادى)"}
          className="p-3 bg-slate-800 text-white rounded-xl border border-slate-700 text-sm"
          value={lessonName}
          onChange={(e) => setLessonName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
        />
        <input
          type="number"
          min="1"
          max="20"
          placeholder={language === "en" ? "Number of questions" : "عدد الأسئلة"}
          className="p-3 bg-slate-800 text-white rounded-xl border border-slate-700 text-sm"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </div>

      {/* نوع الأسئلة واللغة */}
      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <select
          value={questionType}
          onChange={(e) => setQuestionType(e.target.value as QuestionTypeOption)}
          className="p-3 bg-slate-800 text-white rounded-xl border border-slate-700 text-sm"
        >
          {(Object.keys(typeLabels) as QuestionTypeOption[]).map((k) => (
            <option key={k} value={k}>{typeLabels[k]}</option>
          ))}
        </select>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as LanguageOption)}
          className="p-3 bg-slate-800 text-white rounded-xl border border-slate-700 text-sm"
        >
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading || !lessonName}
        className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold px-6 py-3 rounded-xl disabled:opacity-50 transition-colors"
      >
        {loading
          ? (language === "en" ? "Generating..." : "جاري التوليد...")
          : (language === "en" ? "Generate Questions" : "توليد الأسئلة")}
      </button>

      {/* تحذيرات الأسئلة غير الصالحة */}
      {invalidQuestions.length > 0 && (
        <div className="mt-4 rounded-xl bg-rose-500/10 border border-rose-500/30 p-4">
          <h4 className="text-sm font-bold text-rose-400 mb-2">
            {language === "en"
              ? `${invalidQuestions.length} invalid question(s) excluded:`
              : `${invalidQuestions.length} سؤال غير صالح تم استبعاده:`}
          </h4>
          <ul className="space-y-1">
            {invalidQuestions.map((iq, i) => (
              <li key={i} className="text-xs text-rose-300">
                <span className="font-bold">{iq.question.slice(0, 60)}{iq.question.length > 60 ? "..." : ""}</span>
                {" — "}
                <span className="text-rose-400">{iq.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* الأسئلة المولدة + حقول الحفظ */}
      {generatedQuestions.length > 0 && (
        <div className="mt-6 space-y-4">
          <h3 className="text-xl font-semibold text-white">
            {language === "en"
              ? `Valid Questions (${generatedQuestions.length})`
              : `الأسئلة الصالحة (${generatedQuestions.length})`}
          </h3>

          {/* حقول إعدادات الاختبار قبل الحفظ */}
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3">
            <h4 className="text-sm font-bold text-slate-300">
              {language === "en" ? "Exam Settings" : "إعدادات الاختبار"}
            </h4>
            <input
              type="text"
              placeholder={language === "en" ? "Exam title" : "عنوان الاختبار (مثال: اختبار على الممنوع من الصرف)"}
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
                <option value="EXAM">{language === "en" ? "Exam" : "اختبار"}</option>
                <option value="HOMEWORK">{language === "en" ? "Homework" : "واجب منزلي"}</option>
              </select>
              <input
                type="number"
                min="1"
                max="300"
                placeholder={language === "en" ? "Duration (minutes)" : "المدة (دقائق)"}
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
                {language === "en" ? "Free exam" : "اختبار مجاني"}
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
                  <div className="flex items-center gap-2 shrink-0 ms-2">
                    <span className={`px-2 py-1 text-xs rounded-md ${questionTypeBadgeColor(q)}`}>
                      {questionTypeLabel(q)}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded-md ${difficultyColor(q.difficulty)}`}>
                      {q.difficulty}
                    </span>
                    <button
                      onClick={() => removeQuestion(idx)}
                      className="text-rose-400 hover:text-rose-300 text-xs font-bold"
                      title={language === "en" ? "Remove" : "حذف"}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {q.type === "MCQ" && q.options.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {q.options.map((opt: string, i: number) => (
                      <div
                        key={i}
                        className={`p-2 rounded-lg text-xs ${
                          i === q.correctAnswer
                            ? "bg-green-600/20 border border-green-500/50 text-green-400 font-bold"
                            : "bg-slate-700 text-slate-300"
                        }`}
                      >
                        {opt}
                      </div>
                    ))}
                  </div>
                )}
                {q.type === "ESSAY" && (
                  <p className="mt-2 text-xs text-slate-400 italic">
                    {language === "en" ? "Essay question — manual grading required" : "سؤال مقالي — يتطلب تصحيحاً يدوياً"}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* زر الحفظ */}
          <div className="border-t border-slate-700 pt-4">
            <button
              onClick={saveQuestions}
              disabled={isPending || !title.trim() || generatedQuestions.length === 0}
              className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl disabled:opacity-50 transition-colors"
            >
              {isPending
                ? (language === "en" ? "Saving..." : "جاري الحفظ...")
                : language === "en"
                  ? `Save ${generatedQuestions.length} question(s) as ${examType === "EXAM" ? "Exam" : "Homework"}`
                  : `حفظ ${generatedQuestions.length} سؤال ك${examType === "EXAM" ? "اختبار" : "واجب"}`}
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
