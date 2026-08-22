import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { CheckCircle2, ChevronLeft, Clock, FileText, Medal, XCircle } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { classNames, formatDateTime } from "@/lib/utils"
import { AppealForm } from "@/components/appeal-form"

interface ResultPageProps {
  params: Promise<{ id: string; sectionId: string; examId: string; attemptId: string }>
}

export const metadata: Metadata = { title: "نتيجة الاختبار" }

export default async function ResultPage({ params }: ResultPageProps) {
  const { id: courseId, sectionId, examId, attemptId } = await params

  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: {
        include: {
          section: { include: { course: true } },
          questions: true,
        },
      },
      answers: { include: { question: true } },
    },
  })

  if (!attempt || attempt.examId !== examId) notFound()

  const course = attempt.exam.section.course
  const isOwner =
    user.role === "ADMIN" || (user.role === "TEACHER" && user.teacherId === course.teacherId)
  if (attempt.userId !== user.id && !isOwner) notFound()

  const answersByQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]))
  const percentage = Number(attempt.totalScore) > 0 ? Math.round((Number(attempt.score) / Number(attempt.totalScore)) * 100) : 0
  const passed = percentage >= 50
  const pendingEssay = attempt.answers.some(
    (a) => a.question.type !== "MCQ" && !a.isCorrect && !a.earnedPoints && a.gradedBy !== "auto"
  )

  const myAppeal =
    user.role === "STUDENT"
      ? await prisma.appeal.findFirst({
          where: { attemptId: attempt.id, userId: user.id },
          orderBy: { createdAt: "desc" },
        })
      : null

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/courses" className="hover:text-amber-600">
          الكورسات
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <Link href={`/courses/${courseId}`} className="hover:text-amber-600">
          {course.name}
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-bold text-navy">النتيجة</span>
      </nav>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {/* بطاقة النتيجة */}
        <div
          className={classNames(
            "p-8 text-center text-white",
            passed ? "bg-gradient-to-l from-mint to-mint-dark" : "bg-gradient-to-l from-rose-500 to-rose-600"
          )}
        >
          <span
            className={classNames(
              "mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/20",
              passed ? "" : ""
            )}
          >
            {passed ? <Medal className="h-10 w-10" /> : <XCircle className="h-10 w-10" />}
          </span>
          <h1 className="text-2xl font-black">{attempt.exam.title}</h1>
          <p className="mt-2 text-4xl font-black">
            {Number(attempt.score)} / {Number(attempt.totalScore)}
          </p>
          <p className="mt-1 text-white/80">نسبة النجاح: {percentage}% — {passed ? "مبروك، ناجح! 🎉" : "حتة غير كده المرة الجاية 💪"}</p>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-white/70">
            <Clock className="h-4 w-4" />
            تم التسليم: {formatDateTime(attempt.finishedAt ?? attempt.startedAt)}
          </p>
        </div>

          <div className="space-y-6 p-6 sm:p-8">
          {pendingEssay && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              ⏳ الأسئلة المقالية جارٍ مراجعتها من المدرس وسيتم إعلان نتيجتها لاحقاً.
            </div>
          )}

          {user.role === "STUDENT" && !pendingEssay && (
            <>
              {myAppeal ? (
                <div
                  className={`rounded-2xl border p-4 ${
                    myAppeal.status === "approved"
                      ? "border-mint bg-mint-50"
                      : myAppeal.status === "rejected"
                        ? "border-rose-200 bg-rose-50"
                        : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <p className="flex items-center gap-1.5 font-black text-navy">
                    {myAppeal.status === "approved"
                      ? "✅ تم قبول تظلمك"
                      : myAppeal.status === "rejected"
                        ? "❌ تم رفض تظلمك"
                        : "⏳ تظلمك قيد المراجعة"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{myAppeal.reason}</p>
                  {myAppeal.response && (
                    <p className="mt-2 rounded-xl bg-white/70 p-3 text-sm text-slate-700">
                      <span className="font-black text-navy">رد المدرس: </span>
                      {myAppeal.response}
                    </p>
                  )}
                </div>
              ) : (
                <AppealForm attemptId={attempt.id} examTitle={attempt.exam.title} />
              )}
            </>
          )}


          <h2 className="text-lg font-black text-navy">مراجعة الإجابات</h2>

          {attempt.exam.questions.map((question, i) => {
            const answer = answersByQuestion.get(question.id)
            const isMcq = question.type === "MCQ"
            const options = (question.options as string[] | null) ?? []
            const correctIndex = question.correctAnswer ? Number(question.correctAnswer) : -1
            const userIndex = answer?.userAnswer !== null && answer?.userAnswer !== undefined ? Number(answer.userAnswer) : -1
            const isCorrect = isMcq && answer?.isCorrect === true
            const notGraded = !isMcq && (!answer?.isCorrect || answer.gradedBy !== "auto")

            return (
              <div key={question.id} className="rounded-2xl border border-slate-200 p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <p className="font-bold text-navy">
                    <span className="me-1 text-amber-500">س{i + 1}:</span> {question.text}
                  </p>
                  <span
                    className={classNames(
                      "shrink-0 rounded-full px-3 py-1 text-xs font-bold",
                      isMcq && isCorrect
                        ? "bg-mint-50 text-mint-dark"
                        : isMcq
                          ? "bg-rose-50 text-rose-600"
                          : notGraded
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {isMcq
                      ? isCorrect
                        ? `✓ ${answer?.earnedPoints ?? 0} درجة`
                        : "✗ إجابة خاطئة"
                      : notGraded
                        ? "بانتظار التصحيح"
                        : `${answer?.earnedPoints ?? 0} درجة`}
                  </span>
                </div>

                {isMcq ? (
                  <div className="space-y-2">
                    {options.map((option, oi) => {
                      const isSelected = oi === userIndex
                      const isRight = oi === correctIndex
                      return (
                        <div
                          key={oi}
                          className={classNames(
                            "flex items-center gap-3 rounded-xl border-2 px-4 py-2.5 text-sm font-bold",
                            isRight
                              ? "border-mint bg-mint-50 text-mint-dark"
                              : isSelected
                                ? "border-rose-300 bg-rose-50 text-rose-600"
                                : "border-slate-100 text-slate-600"
                          )}
                        >
                          {isRight ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-mint" />
                          ) : isSelected ? (
                            <XCircle className="h-4 w-4 shrink-0 text-rose-500" />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0 text-slate-300" />
                          )}
                          {option}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                    <p className="mb-1 font-medium text-slate-500">إجابتك:</p>
                    {answer?.userAnswer ? answer.userAnswer : <span className="text-slate-400">لم تُجب</span>}
                  </div>
                )}
              </div>
            )
          })}

          <div className="pt-2">
            <Button href={`/courses/${courseId}`} variant="navy" size="lg" className="w-full">
              العودة إلى المذاكرة
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
