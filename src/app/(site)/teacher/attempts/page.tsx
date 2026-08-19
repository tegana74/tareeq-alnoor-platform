import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft, ClipboardList, ExternalLink } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { formatDateTime } from "@/lib/utils"

export const metadata: Metadata = { title: "محاولات الطلاب" }

export default async function TeacherAttemptsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (user.role !== "TEACHER" || !user.teacherId) redirect("/teacher")

  const attempts = await prisma.examAttempt.findMany({
    where: {
      exam: { section: { course: { teacherId: user.teacherId } } },
    },
    include: {
      user: true,
      exam: { include: { section: { include: { course: true } } } },
      answers: { select: { id: true, questionId: true, gradedBy: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  const essayPending = (a: (typeof attempts)[number]) =>
    a.answers.filter((x) => x.gradedBy === null).length

  const statusLabels: Record<string, { text: string; cls: string }> = {
    in_progress: { text: "قيد الحل", cls: "bg-slate-100 text-slate-500" },
    submitted: { text: "بانتظار التصحيح", cls: "bg-amber-100 text-amber-700" },
    graded: { text: "مصحح", cls: "bg-mint-50 text-mint-dark" },
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/teacher" className="hover:text-amber-600">
          لوحة المدرس
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-bold text-navy">محاولات الطلاب</span>
      </nav>

      <h1 className="mb-6 flex items-center gap-2 text-2xl font-black text-navy">
        <ClipboardList className="h-7 w-7 text-amber-500" />
        محاولات الطلاب
      </h1>

      {attempts.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-14 text-center">
          <p className="font-bold text-slate-500">لا توجد محاولات بعد</p>
          <p className="mt-1 text-sm text-slate-400">ستظهر محاولات طلابك فور حلهم للاختبارات</p>
        </div>
      ) : (
        <div className="space-y-4">
          {attempts.map((a) => {
            const st = statusLabels[a.status] ?? { text: a.status, cls: "bg-slate-100 text-slate-500" }
            const pending = essayPending(a)
            const resultHref = `/courses/${a.exam.section.courseId}/sections/${a.exam.sectionId}/exam/${a.examId}/result/${a.id}`
            return (
              <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-navy">
                      {a.user.firstName} {a.user.middleName} {a.user.lastName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {a.exam.title} — {a.exam.section.course.name}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {a.finishedAt ? formatDateTime(a.finishedAt) : "لم يُسلَّم بعد"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      <span className="block text-lg font-black text-navy">
                        {Number(a.score)}/{Number(a.totalScore)}
                      </span>
                      {a.isPassed !== null && (
                        <span className={a.isPassed ? "text-xs font-bold text-mint-dark" : "text-xs font-bold text-rose-500"}>
                          {a.isPassed ? "ناجح" : "راسب"}
                        </span>
                      )}
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${st.cls}`}>{st.text}</span>
                    {pending > 0 && (
                      <a
                        href="/teacher/grading"
                        className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-600 hover:bg-rose-200"
                      >
                        {pending} {pending === 1 ? "مقالي" : "مقالية"} بانتظار
                      </a>
                    )}
                    <a
                      href={resultHref}
                      target="_blank"
                      className="flex items-center gap-1 rounded-lg border-2 border-amber-500 px-3 py-1.5 text-xs font-black text-amber-600 hover:bg-amber-50"
                    >
                      عرض الإجابات
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
