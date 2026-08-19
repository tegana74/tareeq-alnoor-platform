import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { BarChart3, ChevronLeft, Target, TrendingUp } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { classNames, formatDateTime } from "@/lib/utils"

export const metadata: Metadata = { title: "تحليل نتائجي" }

export default async function ResultsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const [examAttempts, practiceAttempts] = await Promise.all([
    prisma.examAttempt.findMany({
      where: { userId: user.id, status: { in: ["graded", "submitted"] } },
      include: {
        exam: {
          include: { section: { include: { course: { include: { subject: true } } } } },
        },
        answers: {
          where: { isCorrect: false, question: { type: "MCQ" } },
          include: { question: true },
          orderBy: { gradedAt: "desc" },
          take: 50,
        },
      },
      orderBy: { finishedAt: "desc" },
      take: 20,
    }),
    prisma.personalExamAttempt.findMany({
      where: { userId: user.id, finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      take: 20,
    }),
  ])

  const graded = examAttempts.filter((a) => a.status === "graded")
  const gradedCount = graded.length
  const avg =
    gradedCount > 0
      ? Math.round(
          (graded.reduce((sum, a) => sum + Number(a.score) / Number(a.totalScore), 0) / gradedCount) * 100
        )
      : 0

  // حساب متوسطات المواد
  const bySubject = new Map<string, { name: string; icon?: string; attempts: number; total: number }>()
  for (const a of graded) {
    const subject = a.exam?.section?.course?.subject
    if (!subject) continue
    const key = subject.id
    const cur = bySubject.get(key) ?? { name: subject.name, icon: subject.icon ?? undefined, attempts: 0, total: 0 }
    cur.attempts++
    cur.total += Math.round((Number(a.score) / Number(a.totalScore)) * 100)
    bySubject.set(key, cur)
  }

  // نقاط الضعف: الأسئلة الأكثر خطأً
  const wrongCount = new Map<string, { text: string; subject: string; times: number }>()
  for (const a of examAttempts) {
    for (const ans of a.answers) {
      const q = ans.question
      const key = q.id
      const cur = wrongCount.get(key) ?? {
        text: q.text,
        subject: a.exam?.section?.course?.subject?.name ?? "عام",
        times: 0,
      }
      cur.times++
      wrongCount.set(key, cur)
    }
  }
  const weakPoints = [...wrongCount.values()].sort((x, y) => y.times - x.times).slice(0, 8)

  const pct = (score: number, total: number) => (total > 0 ? Math.round((score / total) * 100) : 0)

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="hover:text-amber-600">
          الرئيسية
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-bold text-navy">تحليل نتائجي</span>
      </nav>

      <h1 className="mb-6 flex items-center gap-2 text-2xl font-black text-navy">
        <BarChart3 className="h-7 w-7 text-amber-500" />
        تحليل نتائجي
      </h1>

      {/* البطاقات */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold text-slate-500">متوسط الدرجات</p>
          <p className="mt-1 text-3xl font-black text-navy">{gradedCount > 0 ? `${avg}%` : "—"}</p>
          <p className="mt-1 text-xs text-slate-400">{gradedCount} امتحان مكتمل</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold text-slate-500">اختبارات الممارسة</p>
          <p className="mt-1 text-3xl font-black text-mint-dark">{practiceAttempts.length}</p>
          <p className="mt-1 text-xs text-slate-400">من بنك الأسئلة</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold text-slate-500">أضعف نقطة</p>
          <p className="mt-1 truncate text-sm font-black text-navy">
            {weakPoints[0]?.text ?? "لا توجد أخطاء بعد"}
          </p>
          <p className="mt-1 text-xs text-slate-400">{weakPoints[0] ? `${weakPoints[0].times} إجابة خاطئة` : "واصل التدريب!"}</p>
        </div>
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {/* متوسط المواد */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 flex items-center gap-2 font-black text-navy">
            <TrendingUp className="h-5 w-5 text-amber-500" />
            متوسطي حسب المادة
          </h2>
          {bySubject.size === 0 ? (
            <p className="text-sm text-slate-400">لم تكمل أي امتحان بعد</p>
          ) : (
            <div className="space-y-3">
              {[...bySubject.entries()].map(([key, s]) => {
                const avgSubject = Math.round(s.total / s.attempts)
                return (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-bold text-navy">
                        {s.icon ?? ""} {s.name}
                      </span>
                      <span className="font-black text-slate-500">{avgSubject}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={classNames(
                          "h-full rounded-full",
                          avgSubject >= 70 ? "bg-mint" : avgSubject >= 50 ? "bg-amber-500" : "bg-rose-500"
                        )}
                        style={{ width: `${avgSubject}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* نقاط الضعف */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 flex items-center gap-2 font-black text-navy">
            <Target className="h-5 w-5 text-rose-500" />
            نقاط الضعف
          </h2>
          {weakPoints.length === 0 ? (
            <p className="text-sm text-slate-400">ممتاز! لا توجد نقاط ضعف تُذكر</p>
          ) : (
            <ul className="space-y-2">
              {weakPoints.map((w, i) => (
                <li key={i} className="rounded-xl bg-rose-50 px-4 py-2.5">
                  <p className="line-clamp-1 text-sm font-bold text-navy">{w.text}</p>
                  <p className="text-xs text-rose-500">
                    {w.subject} — أخطأت فيها {w.times} {w.times === 1 ? "مرة" : "مرات"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* سجل الامتحانات */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-black text-navy">سجل الامتحانات</h2>
        {graded.length === 0 ? (
          <p className="text-sm text-slate-400">لا توجد امتحانات مكتملة بعد</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-right text-xs text-slate-500">
                  <th className="pb-2 font-bold">الامتحان</th>
                  <th className="pb-2 font-bold">النتيجة</th>
                  <th className="pb-2 font-bold">التاريخ</th>
                  <th className="pb-2 font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {graded.map((a) => {
                  const s = Number(a.score)
                  const t = Number(a.totalScore)
                  const p = pct(s, t)
                  return (
                    <tr key={a.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 font-bold text-navy">{a.exam?.title}</td>
                      <td className="py-2.5">
                        <span
                          className={classNames(
                            "rounded-full px-2.5 py-1 text-xs font-black",
                            p >= 70 ? "bg-mint-50 text-mint-dark" : p >= 50 ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
                          )}
                        >
                          {s}/{t} ({p}%)
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-slate-500">{a.finishedAt ? formatDateTime(a.finishedAt) : "—"}</td>
                      <td className="py-2.5">
                        <span className="text-xs font-bold text-slate-400">مكتمل</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
