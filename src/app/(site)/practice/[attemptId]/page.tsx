import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { CheckCircle2, ChevronLeft, Medal, XCircle } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { classNames, formatDateTime } from "@/lib/utils"
import { PracticeRunner } from "./runner"

export const metadata: Metadata = { title: "اختبار الممارسة" }

interface PracticeAttemptProps {
  params: Promise<{ attemptId: string }>
}

interface StoredQuestion {
  id: string
  text: string
  type: string
  points: number
  options: string[]
  correctAnswer: string | null
}

export default async function PracticeAttemptPage({ params }: PracticeAttemptProps) {
  const { attemptId } = await params
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const attempt = await prisma.personalExamAttempt.findUnique({ where: { id: attemptId } })
  if (!attempt || attempt.userId !== user.id) notFound()

  const questions = attempt.questions as unknown as StoredQuestion[]

  // المحاولة انتهت → عرض المراجعة
  if (attempt.finishedAt) {
    const answers = (attempt.answers ?? {}) as Record<string, string>
    const score = Number(attempt.score ?? 0)
    const total = Number(attempt.totalScore ?? 0)
    const pct = total > 0 ? Math.round((score / total) * 100) : 0
    const passed = pct >= 50

    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Link href="/practice" className="hover:text-amber-600">
            بنك الأسئلة
          </Link>
          <ChevronLeft className="h-4 w-4" />
          <span className="font-bold text-navy">النتيجة</span>
        </nav>

        <div
          className={classNames(
            "mb-8 rounded-3xl p-8 text-center text-white",
            passed ? "bg-gradient-to-l from-mint to-mint-dark" : "bg-gradient-to-l from-rose-500 to-rose-600"
          )}
        >
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
            {passed ? <Medal className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
          </span>
          <h1 className="text-xl font-black">{attempt.title}</h1>
          <p className="mt-2 text-4xl font-black">
            {score} / {total}
          </p>
          <p className="mt-1 text-white/80">
            {pct}% — {passed ? "أداء جيد، واصل التدريب!" : "راجع الدرس وأعد المحاولة 💪"}
          </p>
          <p className="mt-2 text-xs text-white/70">{formatDateTime(attempt.finishedAt)}</p>
        </div>

        <div className="space-y-4">
          {questions.map((q, i) => {
            const options = q.options ?? []
            const userIndex = answers[q.id] !== undefined ? Number(answers[q.id]) : -1
            const correctIndex = q.correctAnswer !== null ? Number(q.correctAnswer) : -1
            const isCorrect = userIndex === correctIndex
            return (
              <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <p className="font-bold text-navy">
                    <span className="ml-1 text-amber-500">س{i + 1}:</span> {q.text}
                  </p>
                  <span
                    className={classNames(
                      "shrink-0 rounded-full px-3 py-1 text-xs font-bold",
                      isCorrect ? "bg-mint-50 text-mint-dark" : userIndex === -1 ? "bg-slate-100 text-slate-500" : "bg-rose-50 text-rose-600"
                    )}
                  >
                    {isCorrect ? "✓ صحيح" : userIndex === -1 ? "لم تُجب" : "✗ خطأ"}
                  </span>
                </div>
                <div className="space-y-2">
                  {options.map((option, oi) => {
                    const selected = oi === userIndex
                    const right = oi === correctIndex
                    return (
                      <div
                        key={oi}
                        className={classNames(
                          "flex items-center gap-3 rounded-xl border-2 px-4 py-2.5 text-sm font-bold",
                          right
                            ? "border-mint bg-mint-50 text-mint-dark"
                            : selected
                              ? "border-rose-300 bg-rose-50 text-rose-600"
                              : "border-slate-100 text-slate-600"
                        )}
                      >
                        {right ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : selected ? <XCircle className="h-4 w-4 shrink-0 text-rose-500" /> : <span className="h-4 w-4 shrink-0" />}
                        {option}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-6 flex gap-3">
          <Button href="/practice" variant="navy" className="flex-1">
            تدرب مجدداً
          </Button>
          <Button href="/results" variant="outline" className="flex-1">
            تحليل نتائجي
          </Button>
        </div>
      </div>
    )
  }

  return (
    <PracticeRunner
      attemptId={attempt.id}
      title={attempt.title}
      questions={questions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        points: q.points,
        options: q.options ?? [],
      }))}
    />
  )
}
