"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { classNames } from "@/lib/utils"

interface PracticeQuestion {
  id: string
  text: string
  type: string
  points: number
  options: string[]
}

interface PracticeRunnerProps {
  attemptId: string
  title: string
  questions: PracticeQuestion[]
}

export function PracticeRunner({ attemptId, title, questions }: PracticeRunnerProps) {
  const router = useRouter()
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const loadedRef = useRef(false)

  // استئناف الإجابات المحفوظة
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void fetch(`/api/practice/${attemptId}/save`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
  }, [attemptId])

  // حفظ تلقائي
  useEffect(() => {
    if (Object.keys(answers).length === 0) return
    const t = setTimeout(() => {
      void fetch(`/api/practice/${attemptId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      }).catch(() => {})
    }, 1000)
    return () => clearTimeout(t)
  }, [answers, attemptId])

  async function submit() {
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/practice/${attemptId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.attemptId) {
          router.push(`/practice/${data.attemptId}`)
          router.refresh()
          return
        }
      }
      const err = await res.json().catch(() => ({ error: "حدث خطأ" }))
      alert(err.error)
      setSubmitting(false)
    } catch {
      alert("حدث خطأ في الاتصال")
      setSubmitting(false)
    }
  }

  const q = questions[current]
  const answeredCount = questions.filter((question) => answers[question.id]).length

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-navy">{title}</h1>
          <p className="text-xs text-slate-500">
            أجبت على {answeredCount} من {questions.length} أسئلة
          </p>
        </div>
        <div className="flex items-center gap-1">
          {questions.map((question, i) => (
            <button
              key={question.id}
              onClick={() => setCurrent(i)}
              className={classNames(
                "h-8 w-8 rounded-full text-xs font-black transition-colors",
                i === current
                  ? "bg-amber-500 text-white"
                  : answers[question.id] !== undefined
                    ? "bg-mint text-white"
                    : "bg-slate-200 text-slate-500 hover:bg-slate-300"
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6">
        <p className="mb-5 text-lg font-bold leading-relaxed text-navy">
          <span className="ml-2 rounded-lg bg-amber-100 px-2 py-1 text-sm font-black text-amber-600">
            س{current + 1}
          </span>
          {q.text}
        </p>
        <div className="space-y-3">
          {q.options.map((option, oi) => {
            const selected = answers[q.id] === String(oi)
            return (
              <button
                key={oi}
                onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: String(oi) }))}
                className={classNames(
                  "flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-right font-bold transition-all",
                  selected
                    ? "border-amber-500 bg-amber-50 text-navy"
                    : "border-slate-100 text-slate-600 hover:border-amber-300 hover:bg-amber-50/50"
                )}
              >
                <span
                  className={classNames(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black",
                    selected ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-500"
                  )}
                >
                  {selected ? <CheckCircle2 className="h-4 w-4" /> : String.fromCharCode(0x0623 + oi)}
                </span>
                {option}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="outline" size="md" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
          <ChevronRight className="h-4 w-4" />
          السابق
        </Button>
        {current < questions.length - 1 ? (
          <Button variant="navy" size="md" onClick={() => setCurrent((c) => c + 1)}>
            <ChevronLeft className="h-4 w-4" />
            التالي
          </Button>
        ) : (
          <Button
            size="md"
            disabled={submitting}
            onClick={submit}
            className="bg-gradient-to-l from-mint to-mint-dark"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            إنهاء وتصحيح
          </Button>
        )}
      </div>
    </div>
  )
}
