import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft, GraduationCap, Radio, UsersRound, Wallet } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { formatPrice } from "@/lib/utils"

export const metadata: Metadata = { title: "إحصائيات المعلم | لوحة الإدارة" }

export default async function AdminTeacherStatsPage({
  params,
}: {
  params: Promise<{ teacherId: string }>
}) {
  const { teacherId } = await params

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: {
      user: { select: { firstName: true, lastName: true, phone: true, isBlocked: true } },
      _count: { select: { courses: true, liveSessions: true } },
      courses: { select: { id: true } },
    },
  })
  if (!teacher) notFound()

  const courseIds = teacher.courses.map((c) => c.id)

  const [subscriptions, invoices, commissionSetting, adminCommissionSetting] = await Promise.all([
    prisma.subscription.findMany({
      where: { courseId: { in: courseIds } },
      select: { userId: true, user: { select: { year: { select: { id: true, name: true } } } } },
    }),
    prisma.invoice.findMany({
      where: { status: "PAID", type: "SUBSCRIBE", courseId: { in: courseIds } },
      select: { amount: true, createdAt: true },
    }),
    prisma.setting.findUnique({ where: { key: "finance.teacherCommission" } }),
    prisma.setting.findUnique({ where: { key: "finance.adminCommission" } }),
  ])

  const commission = Math.max(0, Math.min(100, Number(commissionSetting?.value ?? "50")))
  const adminCommission = Math.max(0, Math.min(100, Number(adminCommissionSetting?.value ?? "50")))
  const totalStudents = new Set(subscriptions.map((s) => s.userId)).size

  const byYear = new Map<string, { id: string; name: string; count: number }>()
  const seen = new Set<string>()
  for (const s of subscriptions) {
    const y = s.user.year
    const key = y?.id ?? "none"
    if (seen.has(s.userId)) continue
    seen.add(s.userId)
    const row = byYear.get(key) ?? { id: key, name: y?.name ?? "بدون مرحلة", count: 0 }
    row.count += 1
    byYear.set(key, row)
  }
  const stages = [...byYear.values()].sort((a, b) => b.count - a.count)

  const monthly = new Map<string, { label: string; total: number }>()
  let totalRevenue = 0
  for (const inv of invoices) {
    const amount = Number(inv.amount)
    totalRevenue += amount
    const date = new Date(inv.createdAt)
    const key = `${date.getFullYear()}-${date.getMonth()}`
    const label = date.toLocaleDateString("ar-EG", { month: "long", year: "numeric" })
    const row = monthly.get(key) ?? { label, total: 0 }
    row.total += amount
    monthly.set(key, row)
  }
  const months = [...monthly.values()].sort((a, b) => (a.label < b.label ? 1 : -1))

  const totalOwed = Math.round(totalRevenue * (commission / 100) * 100) / 100
  const totalAdmin = Math.round(totalRevenue * (adminCommission / 100) * 100) / 100

  const statCard = (icon: React.ReactNode, label: string, value: string, sub?: string) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
        {icon}
      </div>
      <p className="text-2xl font-black text-navy">{value}</p>
      <p className="text-sm font-bold text-slate-500">{label}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  )

  return (
    <div className="space-y-6">
      <Link
        href="/admin/teachers"
        className="inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-amber-600"
      >
        <ChevronLeft className="h-4 w-4" />
        المعلمون
      </Link>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-royal-50 text-xl font-black text-royal">
          {teacher.name[0]}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black text-navy">{teacher.name}</h1>
          <p className="text-sm text-slate-500">
            {teacher.title ?? "بدون تخصص"}
            {teacher.bio ? ` · ${teacher.bio}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {teacher.isFeatured && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-600">مميز</span>
          )}
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              teacher.user
                ? teacher.user.isBlocked
                  ? "bg-rose-50 text-rose-600"
                  : "bg-mint-50 text-mint-dark"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {teacher.user ? (teacher.user.isBlocked ? "محظور" : "حساب مفعل") : "بدون حساب"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCard(<UsersRound className="h-5 w-5" />, "إجمالي الطلاب", String(totalStudents))}
        {statCard(<GraduationCap className="h-5 w-5" />, "الكورسات", String(teacher._count.courses))}
        {statCard(<Radio className="h-5 w-5" />, "الجلسات المباشرة", String(teacher._count.liveSessions))}
        {statCard(<Wallet className="h-5 w-5" />, "إجمالي الإيرادات", formatPrice(totalRevenue))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-black text-navy">الطلاب حسب المرحلة</h2>
          {stages.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">لا يوجد طلاب مشتركون بعد</p>
          ) : (
            <div className="space-y-3">
              {stages.map((s) => (
                <div key={s.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-bold text-navy">{s.name}</span>
                    <span className="font-black text-amber-600">{s.count} طالب</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-amber-400 to-orange-500"
                      style={{ width: `${Math.max(4, Math.round((s.count / totalStudents) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-1 text-lg font-black text-navy">توزيع الإيرادات</h2>
          <p className="mb-4 text-xs text-slate-400">
            المعلم {commission}% · الإدارة {adminCommission}% من إيرادات الاشتراكات المدفوعة لكل شهر
          </p>
          {months.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">لا توجد إيرادات بعد</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-black text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-right">الشهر</th>
                    <th className="px-4 py-2 text-right">الإيرادات</th>
                    <th className="px-4 py-2 text-right">المعلم ({commission}%)</th>
                    <th className="px-4 py-2 text-right">الإدارة ({adminCommission}%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {months.map((m) => (
                    <tr key={m.label}>
                      <td className="px-4 py-3 font-bold text-navy">{m.label}</td>
                      <td className="px-4 py-3 text-slate-500">{formatPrice(m.total)}</td>
                      <td className="px-4 py-3 font-black text-mint-dark">
                        {formatPrice(Math.round(m.total * (commission / 100) * 100) / 100)}
                      </td>
                      <td className="px-4 py-3 font-black text-royal">
                        {formatPrice(Math.round(m.total * (adminCommission / 100) * 100) / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-mint-50 px-4 py-3">
              <span className="text-sm font-bold text-mint-dark">إجمالي مستحق المعلم حتى الآن</span>
              <span className="font-black text-mint-dark">{formatPrice(totalOwed)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-royal-50 px-4 py-3">
              <span className="text-sm font-bold text-royal">إجمالي نصيب الإدارة حتى الآن</span>
              <span className="font-black text-royal">{formatPrice(totalAdmin)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
