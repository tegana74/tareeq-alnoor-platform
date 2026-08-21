"use client"

import { useState } from "react"
import { Brain, CheckCircle2, HelpCircle, Loader2, Plus, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface GeneratedQuestion {
  question: string
  options: string[]
  correctAnswer: string
  difficulty: string
}

const inputCls =
  "h-10 w-full rounded-lg border-2 border-slate-200 px-3 text-sm font-bold text-navy outline-none focus:border-amber-400"

const difficultyColor: Record<string, string> = {
  "سهل": "bg-emerald-50 text-emerald-600",
  "متوسط": "bg-amber-50 text-amber-600",
  "صعب": "bg-rose-50 text-rose-600",
}

export function AiGenerator({ onAddToExam }: { onAddToExam: (questions: GeneratedQuestion[]) => void }) {
  const [lessonName, setLessonName] = useState("")
  const [count, setCount] = useState(5)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [added, setAdded] = useState(false)

  const allSelected = questions.length > 0 && selected.size === questions.length

  function toggleSelect(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
    setAdded(false)
  }

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(questions.map((_, i) => i)))
    setAdded(false)
  }

  function removeQuestion(i: number) {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i))
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(i)
      for (const s of next) {
        if (s > i) {
          next.delete(s)
          next.add(s - 1)
        }
      }
      return next
    })
    setAdded(false)
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setQuestions([])
    setSelected(new Set())
    setAdded(false)
    try {
      const res = await fetch("/api/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonName, count }),
      })
      if (!res.ok) throw new Error("request failed")
      const data = await res.json()
      const generated: GeneratedQuestion[] = data.questions ?? []
      setQuestions(generated)
      if (!generated.length) setError("لم يتم توليد أي أسئلة، جرّب موضوعاً آخر")
    } catch {
      setError("حدث خطأ أثناء توليد الأسئلة، حاول مجدداً")
    } finally {
      setLoading(false)
    }
  }

  function handleAddToExam() {
    const chosen = questions.filter((_, i) => selected.has(i))
    if (!chosen.length) return
    onAddToExam(chosen)
    setAdded(true)
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
          <Brain className="h-5 w-5 text-amber-500" />
        </span>
        <div>
          <h3 className="font-black text-navy">مولّد الأسئلة الذكي</h3>
          <p className="text-xs text-slate-400">أدخل اسم الدرس ودع الذكاء الاصطناعي يولّد الأسئلة لك</p>
        </div>
      </div>

      <form onSubmit={handleGenerate} className="mt-4 grid gap-3 sm:grid-cols-[1fr_100px_auto] sm:items-end">
        <div>
          <label className="mb-1 block text-xs font-black text-navy">اسم الدرس</label>
          <input
            type="text"
            value={lessonName}
            onChange={(e) => setLessonName(e.target.value)}
            required
            placeholder="مثال: الجملة الاسمية والفعلية في النحو العربي"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-black text-navy">العدد</label>
          <input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
            className={inputCls}
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          توليد
        </Button>
      </form>

      {error && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-600">
          <HelpCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {loading && (
        <div className="mt-6 flex flex-col items-center gap-2 py-8 text-sm font-bold text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
          جارٍ توليد الأسئلة...
        </div>
      )}

      {!loading && questions.length > 0 && (
        <>
          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-xs font-black text-navy hover:text-amber-600"
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border-2 ${
                  allSelected ? "border-amber-400 bg-amber-400" : "border-slate-300 bg-white"
                }`}
              >
                {allSelected && <CheckCircle2 className="h-3 w-3 text-white" />}
              </span>
              تحديد الكل ({selected.size}/{questions.length})
            </button>
            <Button type="button" size="sm" onClick={handleAddToExam} disabled={selected.size === 0}>
              {added ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              إضافة المحدد للامتحان
            </Button>
          </div>

          {added && (
            <p className="mt-3 flex items-center gap-2 text-sm font-bold text-mint-dark">
              <CheckCircle2 className="h-4 w-4" />
              تمت إضافة الأسئلة المحددة إلى الامتحان
            </p>
          )}

          <ul className="mt-3 space-y-2">
            {questions.map((q, i) => {
              const isSelected = selected.has(i)
              const diffClass = difficultyColor[q.difficulty] ?? "bg-slate-50 text-slate-500"
              return (
                <li
                  key={i}
                  className={`rounded-xl border p-3 transition-colors ${
                    isSelected ? "border-amber-300 bg-amber-50" : "border-slate-100 bg-white hover:border-slate-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(i)}
                      className="mt-1 h-4 w-4 accent-amber-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-black text-slate-400">س{i + 1}</span>
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-600">
                          اختيار من متعدد
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${diffClass}`}>
                          {q.difficulty}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-bold text-navy">{q.question}</p>
                      {q.options.length > 0 && (
                        <ul className="mt-1.5 space-y-1">
                          {q.options.map((opt, j) => (
                            <li
                              key={j}
                              className={`text-xs ${
                                opt === q.correctAnswer ? "font-bold text-emerald-600" : "text-slate-500"
                              }`}
                            >
                              {String.fromCharCode(65 + j)}. {opt}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeQuestion(i)}
                      className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
                      aria-label="حذف السؤال"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
