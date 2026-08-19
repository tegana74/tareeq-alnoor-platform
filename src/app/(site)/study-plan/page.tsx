import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { BookOpenCheck, CalendarDays } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { classNames } from "@/lib/utils"
import { FinishButton } from "./finish-button"

export const metadata: Metadata = { title: "خطة المذاكرة" }

export default async function StudyPlanPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (user.role !== "STUDENT") return null

  const weeks = await prisma.studyPlanWeek.findMany({
    where: { isActive: true },
    include: {
      subjects: {
        include: { finishes: { where: { userId: user.id } } },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { order: "asc" },
  })

  const totalSubjects = weeks.reduce((n, w) => n + w.subjects.length, 0)
  const totalFinished = weeks.reduce(
    (n, w) => n + w.subjects.filter((s) => s.finishes.length > 0).length,
    0
  )
  const pct = totalSubjects === 0 ? 0 : Math.round((totalFinished / totalSubjects) * 100)

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-navy">خطة المذاكرة</h1>
          <p className="mt-1 text-sm text-slate-500">نظّم مذاكرتك أسبوعاً بأسبوع وضَع علامة عند إتمام كل مادة</p>
        </div>
        <div className="min-w-56 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between text-xs font-black">
            <span className="text-slate-500">تقدّمك</span>
            <span className="text-navy">
              {totalFinished} / {totalSubjects} ({pct}%)
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={classNames("h-full rounded-full transition-all", pct === 100 ? "bg-mint-dark" : "bg-amber-500")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {weeks.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-bold text-slate-500">خطة المذاكرة لم تُنشر بعد — تابعنا قريباً</p>
        </div>
      ) : (
        <div className="space-y-6">
          {weeks.map((week) => {
            const done = week.subjects.filter((s) => s.finishes.length > 0).length
            const wPct = week.subjects.length === 0 ? 0 : Math.round((done / week.subjects.length) * 100)
            return (
              <div key={week.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
                  <div>
                    <h2 className="font-black text-navy">{week.title}</h2>
                    {week.description && <p className="mt-0.5 text-xs text-slate-500">{week.description}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={classNames("h-full rounded-full", wPct === 100 ? "bg-mint-dark" : "bg-amber-500")}
                        style={{ width: `${wPct}%` }}
                      />
                    </div>
                    <span className="text-xs font-black text-slate-500">
                      {done}/{week.subjects.length}
                    </span>
                  </div>
                </div>

                {week.subjects.length === 0 ? (
                  <p className="p-5 text-center text-xs text-slate-400">لا توجد مواد في هذا الأسبوع بعد</p>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {week.subjects.map((s) => (
                      <div key={s.id} className="flex items-start gap-3 px-5 py-4">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                          <BookOpenCheck className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={classNames("font-black", s.finishes.length > 0 ? "text-mint-dark line-through decoration-mint-dark/50" : "text-navy")}>
                            {s.subject}
                          </p>
                          {Array.isArray(s.tasks) && (s.tasks as string[]).length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {(s.tasks as string[]).map((t, i) => (
                                <li key={i} className="flex items-center gap-1.5 text-xs text-slate-500">
                                  <span className="h-1 w-1 rounded-full bg-slate-300" />
                                  {t}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <FinishButton subjectId={s.id} finished={s.finishes.length > 0} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
