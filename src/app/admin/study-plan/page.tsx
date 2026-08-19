import type { Metadata } from "next"
import { CalendarDays } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { WeekForm, SubjectForm, WeekActions, SubjectActions } from "./study-plan-form"

export const metadata: Metadata = { title: "خطة المذاكرة | لوحة الإدارة" }

export default async function AdminStudyPlanPage() {
  const weeks = await prisma.studyPlanWeek.findMany({
    include: { subjects: { include: { _count: { select: { finishes: true } } }, orderBy: { order: "asc" } } },
    orderBy: { order: "asc" },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-navy">خطة المذاكرة</h1>
          <p className="text-sm text-slate-500">{weeks.length} أسبوع · المواد تظهر للطلاب مع أزرار الإتمام</p>
        </div>
        <WeekForm />
      </div>

      {weeks.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-bold text-slate-500">لا توجد أسابيع بعد — ابدأ بإضافة أول أسبوع</p>
        </div>
      ) : (
        <div className="space-y-4">
          {weeks.map((week) => (
            <div key={week.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
                <div>
                  <h2 className="font-black text-navy">{week.title}</h2>
                  {week.description && <p className="mt-0.5 text-xs text-slate-500">{week.description}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-slate-500">
                    {week.subjects.length} مادة · {week.subjects.reduce((n, s) => n + s._count.finishes, 0)} إتمام
                  </span>
                  <WeekActions id={week.id} active={week.isActive} />
                </div>
              </div>

              <div className="px-5 py-4">
                {week.subjects.length > 0 && (
                  <div className="mb-3 divide-y divide-slate-50 rounded-xl border border-slate-100">
                    {week.subjects.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-navy">{s.subject}</p>
                          {Array.isArray(s.tasks) && (s.tasks as string[]).length > 0 && (
                            <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">
                              {(s.tasks as string[]).join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-[11px] font-black text-mint-dark">{s._count.finishes} إتمام</span>
                          <SubjectActions id={s.id} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <SubjectForm weekId={week.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
