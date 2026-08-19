import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft, Scale } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { formatDateTime } from "@/lib/utils"
import { AppealReviewForm } from "./appeal-review-form"

export const metadata: Metadata = { title: "التظلمات | لوحة المدرس" }

export default async function TeacherAppealsPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== "TEACHER") redirect("/login")

  const teacher = await prisma.teacher.findFirst({ where: { user: { id: user.id } } })
  if (!teacher) redirect("/teacher")

  const appeals = await prisma.appeal.findMany({
    where: { attempt: { exam: { section: { course: { teacherId: teacher.id } } } } },
    include: {
      user: { select: { firstName: true, lastName: true } },
      attempt: {
        include: {
          exam: { include: { section: { include: { course: true } } } },
          answers: { include: { question: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  })

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link href="/teacher" className="mb-6 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-amber-600">
        <ChevronLeft className="h-4 w-4" />
        لوحة المدرس
      </Link>
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-black text-navy">
        <Scale className="h-7 w-7 text-amber-500" />
        التظلمات
      </h1>

      {appeals.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          لا توجد تظلمات على نتائج طلابك
        </div>
      ) : (
        <div className="space-y-4">
          {appeals.map((a) => {
            const essayAnswers = a.attempt.answers
              .filter((ans) => ans.question.type !== "MCQ")
              .map((ans) => ({
                question: ans.question.text,
                answer: ans.userAnswer ?? "",
                earned: Number(ans.earnedPoints),
                max: Number(ans.question.points),
                feedback: ans.feedback,
              }))
            const resolved = a.status !== "pending"
            return (
              <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-black text-navy">
                    {a.user.firstName} {a.user.lastName}
                    <span className="mr-2 text-sm font-bold text-slate-500">— {a.attempt.exam.title}</span>
                  </p>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${
                      a.status === "approved"
                        ? "bg-mint-50 text-mint-dark"
                        : a.status === "rejected"
                          ? "bg-rose-50 text-rose-600"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {a.status === "approved" ? "مقبول" : a.status === "rejected" ? "مرفوض" : "قيد المراجعة"}
                  </span>
                </div>
                <p className="mb-1 text-sm text-slate-600">{a.reason}</p>
                <p className="mb-4 text-xs text-slate-400">
                  {formatDateTime(a.createdAt)} · الدرجة {Number(a.attempt.score)}/{Number(a.attempt.totalScore)}
                </p>
                {resolved ? (
                  <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                    <span className="font-black text-navy">ردك: </span>
                    {a.response}
                    {a.status === "approved" && a.extraPoints > 0 && (
                      <span className="mr-2 font-black text-mint-dark">+{a.extraPoints} نقطة</span>
                    )}
                  </div>
                ) : (
                  <AppealReviewForm
                    appealId={a.id}
                    currentScore={Number(a.attempt.score)}
                    totalScore={Number(a.attempt.totalScore)}
                    essayAnswers={essayAnswers}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
