import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft, ClipboardCheck, Inbox, Star } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { formatDateTime } from "@/lib/utils"
import { EssayGradingForm } from "./grading-form"

export const metadata: Metadata = { title: "تصحيح الإجابات" }

export default async function TeacherGradingPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (user.role !== "TEACHER") redirect("/teacher")

  const teacher = await prisma.teacher.findFirst({ where: { user: { id: user.id } } })
  if (!teacher) redirect("/teacher")

  const attempts = await prisma.examAttempt.findMany({
    where: {
      status: "submitted",
      exam: { section: { course: { teacherId: teacher.id } } },
    },
    include: {
      user: true,
      exam: { include: { section: { include: { course: true } } } },
      answers: {
        include: { question: true },
        orderBy: { id: "asc" },
      },
    },
    orderBy: { finishedAt: "desc" },
  })

  const pendingEssays = attempts.map((a) => ({
    ...a,
    essayAnswers: a.answers.filter((x) => x.question.type === "ESSAY"),
  }))

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/teacher" className="hover:text-amber-600">
          لوحة المدرس
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-bold text-navy">تصحيح الإجابات</span>
      </nav>

      <h1 className="mb-6 flex items-center gap-2 text-2xl font-black text-navy">
        <ClipboardCheck className="h-7 w-7 text-amber-500" />
        تصحيح الإجابات المقالية
      </h1>

      {pendingEssays.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-14 text-center">
          <Inbox className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="font-bold text-slate-500">لا توجد إجابات بانتظار التصحيح</p>
          <p className="mt-1 text-sm text-slate-400">ستظهر هنا إجابات الطلاب المقالية فور تسليمها</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pendingEssays.map((attempt) => {
            const pending = attempt.essayAnswers.filter((x) => x.gradedBy === null)
            if (pending.length === 0) return null
            return (
              <section key={attempt.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-6 py-4">
                  <div>
                    <h2 className="font-black text-navy">
                      {attempt.user.firstName} {attempt.user.middleName} {attempt.user.lastName}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {attempt.exam.title} — {attempt.exam.section.course.name}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-600">
                    {pending.length} {pending.length === 1 ? "سؤال بانتظار" : "أسئلة بانتظار"} التصحيح
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {pending.map((answer) => (
                    <div key={answer.id} className="p-6">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="font-bold text-navy">{answer.question.text}</p>
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-600">
                          <Star className="h-3 w-3" />
                          {Number(answer.question.points)} درجات
                        </span>
                      </div>
                      <div className="mb-3 rounded-xl bg-slate-50 p-4">
                        <p className="text-sm font-bold leading-relaxed text-slate-700">
                          {answer.userAnswer}
                        </p>
                        {answer.question.correctAnswer && (
                          <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-mint-dark">
                            <span className="font-black">إجابة نموذجية:</span>{" "}
                            {answer.question.correctAnswer}
                          </p>
                        )}
                      </div>
                      <EssayGradingForm
                        answerId={answer.id}
                        maxPoints={Number(answer.question.points)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
