"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, ChevronLeft, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { classNames } from "@/lib/utils"

interface Question {
  id: string
  text: string
  type: string
  points: number
  options: string[]
}

interface ExamRunnerProps {
  courseId: string
  sectionId: string
  examId: string
  attemptId: string
  examTitle: string
  durationMinutes: number
  questions: Question[]
}

export function ExamRunner({
  courseId,
  sectionId,
  examId,
  attemptId,
  examTitle,
  durationMinutes,
  questions,
}: ExamRunnerProps) {
  const router = useRouter()
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [timeLeft, setTimeLeft] = useState(durationMinutes * 60)
  const [submitting, setSubmitting] = useState(false)
  const loadedRef = useRef(false)

  // تحميل الإجابات المحفوظة سابقاً
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void fetch(`/api/exams/attempts/${attemptId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.answers && typeof data.answers === "object") {
          setAnswers((prev) => ({ ...prev, ...data.answers }))
        }
      })
  }, [attemptId])

  // المؤقت
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timer)
          void submitExam()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // حفظ تلقائي عند تغيير الإجابة
  useEffect(() => {
    if (Object.keys(answers).length === 0) return
    const t = setTimeout(() => {
      void fetch(`/api/exams/attempts/${attemptId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      }).catch(() => {})
    }, 1000)
    return () => clearTimeout(t)
  }, [answers, attemptId])

  async function submitExam() {
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/exams/attempts/${attemptId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      })
      if (res.ok) {
        const data = await res.json()
        router.push(
          `/courses/${courseId}/sections/${sectionId}/exam/${examId}/result/${data.attemptId}`
        )
        router.refresh()
      } else {
        const err = await res.json().catch(() => ({ error: "حدث خطأ" }))
        alert(err.error)
        setSubmitting(false)
      }
    } catch {
      alert("حدث خطأ في الاتصال")
      setSubmitting(false)
    }
  }

  const q = questions[current]
  const answeredCount = questions.filter((question) => answers[question.id]).length
  const hours = Math.floor(timeLeft / 3600)
  const minutes = Math.floor((timeLeft % 3600) / 60)
  const seconds = timeLeft % 60
  const timeColor = timeLeft < 300 ? "text-rose-600 animate-pulse" : "text-navy"

  if (!q) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <p className="text-lg font-bold text-slate-500">لا توجد أسئلة في هذا الاختبار</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* الشريط العلوي */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <h1 className="text-lg font-black text-navy">{examTitle}</h1>
          <p className="text-xs text-slate-500">
            أجب عن جميع الأسئلة ثم اضغط «تسليم»
          </p>
        </div>
        <div className={classNames("flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2 font-mono text-xl font-black", timeColor)}>
          <span className="text-xs font-bold">⏱</span>
          {hours > 0 && `${String(hours).padStart(2, "0")}:`}
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </div>
      </div>

      {/* التنقل بين الأسئلة */}
      <div className="mb-6 flex flex-wrap gap-2">
        {questions.map((question, i) => {
          const answered = Boolean(answers[question.id])
          return (
            <button
              key={question.id}
              onClick={() => setCurrent(i)}
              className={classNames(
                "flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold transition-colors",
                i === current
                  ? "bg-amber-500 text-white"
                  : answered
                    ? "bg-mint-50 text-mint-dark"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              )}
            >
              {i + 1}
            </button>
          )
        })}
        <span className="mr-auto flex items-center gap-1 self-center text-sm font-bold text-slate-500">
          <CheckCircle2 className="h-4 w-4 text-mint" />
          {answeredCount}/{questions.length}
        </span>
      </div>

      {/* السؤال */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <p className="text-lg font-extrabold leading-8 text-navy">
            <span className="ml-2 text-amber-500">س{q.points}:</span>
            {q.text}
          </p>
          <span className="shrink-0 rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-600">
            {q.points} درجة
          </span>
        </div>

        {q.type === "MCQ" ? (
          <div className="space-y-3">
            {q.options.map((option, i) => {
              const selected = answers[q.id] === String(i)
              return (
                <button
                  key={i}
                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: String(i) }))}
                  className={classNames(
                    "flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-right transition-colors",
                    selected
                      ? "border-amber-400 bg-amber-50"
                      : "border-slate-200 hover:border-amber-200 hover:bg-amber-50/40"
                  )}
                >
                  <span
                    className={classNames(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black",
                      selected ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {["أ", "ب", "ج", "د", "هـ", "و"][i] ?? i + 1}
                  </span>
                  <span className="font-bold text-navy">{option}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <textarea
            value={answers[q.id] ?? ""}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
            placeholder="اكتب إجابتك هنا..."
            className="min-h-48 w-full rounded-2xl border-2 border-slate-200 p-4 text-base leading-8 outline-none transition-colors focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
          />
        )}

        <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-6">
          <Button
            variant="outline"
            disabled={current === 0}
            onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
            السابق
          </Button>
          {current < questions.length - 1 ? (
            <Button onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}>
              التالي
              <ChevronLeft className="h-4 w-4 rotate-180" />
            </Button>
          ) : (
            <Button variant="mint" onClick={submitExam} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              تسليم الإجابات
            </Button>
          )}
        </div>

        {answeredCount < questions.length && (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            لديك {questions.length - answeredCount} سؤال لم تُجب عنه بعد
          </p>
        )}

        {timeLeft > 0 && timeLeft < 300 && (
          <p className="mt-2 flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-600">
            <AlertTriangle className="h-4 w-4" />
            الوقت يكاد ينتهي! سيتم تسليم إجاباتك تلقائياً بعد {timeLeft} ثانية
          </p>
        )}
      </div>
    </div>
  )
}
