import type { Metadata } from "next"
import Link from "next/link"
import {
  BookOpen,
  CalendarClock,
  CreditCard,
  Gift,
  Radio,
  Sparkles,
  Ticket,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { formatDateTime, formatPrice } from "@/lib/utils"

export const metadata: Metadata = { title: "لوحة الإدارة" }

const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

function expiringIn7Days() {
  return new Date(Date.now() + 7 * 864e5)
}

export default async function AdminDashboard() {
  const user = await getCurrentUser()

  const [
    students,
    newStudents,
    courses,
    subscriptions,
    revenue,
    monthRevenue,
    pendingCount,
    liveCount,
    liveUpcoming,
    pointsGiven,
    pointsSpent,
    codesUsed,
    coupons,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "STUDENT" } }),
    prisma.user.count({ where: { role: "STUDENT", createdAt: { gte: monthStart } } }),
    prisma.course.count(),
    prisma.subscription.count({ where: { status: "active", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
    prisma.invoice.aggregate({ _sum: { amount: true }, where: { status: "PAID" } }),
    prisma.invoice.aggregate({ _sum: { amount: true }, where: { status: "PAID", createdAt: { gte: monthStart } } }),
    prisma.invoice.count({ where: { status: "PENDING" } }),
    prisma.liveSession.count(),
    prisma.liveSession.count({ where: { startAt: { gte: new Date() } } }),
    prisma.pointsTransaction.aggregate({ _sum: { points: true }, where: { points: { gt: 0 } } }),
    prisma.pointsTransaction.aggregate({ _sum: { points: true }, where: { points: { lt: 0 } } }),
    prisma.insertCode.count({ where: { isUsed: true } }),
    prisma.coupon.aggregate({ _sum: { usedCount: true } }),
  ])

  const [recentInvoices, recentStudents, upcomingLive, expiredSoon] = await Promise.all([
    prisma.invoice.findMany({
      where: { type: "SUBSCRIBE" },
      include: { user: true, course: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.user.findMany({ where: { role: "STUDENT" }, orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.liveSession.findMany({
      where: { startAt: { gte: new Date() } },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
    prisma.subscription.findMany({
      where: {
        status: "active",
        expiresAt: { gte: new Date(), lte: expiringIn7Days() },
      },
      include: { user: true, course: true },
      orderBy: { expiresAt: "asc" },
      take: 5,
    }),
  ])

  const revenueTotal = Number(revenue._sum.amount ?? 0)
  const revenueMonth = Number(monthRevenue._sum.amount ?? 0)

  const statusLabels: Record<string, { text: string; cls: string }> = {
    PENDING: { text: "قيد المراجعة", cls: "bg-amber-50 text-amber-700" },
    PAID: { text: "مدفوعة", cls: "bg-mint-50 text-mint-dark" },
    REJECTED: { text: "مرفوضة", cls: "bg-rose-50 text-rose-600" },
  }

  const cards = [
    { label: "الطلاب", value: String(students), sub: `+${newStudents} هذا الشهر`, icon: Users, color: "bg-royal-50 text-royal" },
    { label: "الكورسات", value: String(courses), sub: "منشورة على المنصة", icon: BookOpen, color: "bg-violet-50 text-violet-600" },
    { label: "اشتراكات نشطة", value: String(subscriptions), sub: "سارية الآن", icon: Wallet, color: "bg-mint-50 text-mint-dark" },
    { label: "جلسات مباشرة", value: String(liveCount), sub: `${liveUpcoming} قادمة`, icon: Radio, color: "bg-rose-50 text-rose-600" },
    { label: "إيرادات الشهر", value: formatPrice(revenueMonth), sub: `الإجمالي ${formatPrice(revenueTotal)}`, icon: TrendingUp, color: "bg-emerald-50 text-emerald-600" },
    { label: "نقاط ممنوحة", value: String(Number(pointsGiven._sum.points ?? 0)), sub: `${Math.abs(Number(pointsSpent._sum.points ?? 0))} مستبدلة`, icon: Sparkles, color: "bg-orange-50 text-orange-600" },
    { label: "أكواد الشحن", value: String(codesUsed), sub: "مستخدمة", icon: Ticket, color: "bg-cyan-50 text-cyan-600" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-navy">لوحة الإدارة</h1>
        <p className="text-sm text-slate-500">نظرة شاملة على أداء المنصة — أهلاً {user?.firstName}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.color}`}>
                <card.icon className="h-5 w-5" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-black text-navy">{card.value}</p>
            <p className="mt-0.5 text-xs font-medium text-slate-400">{card.sub}</p>
          </div>
        ))}
      </div>

      {pendingCount > 0 && (
        <Link
          href="/admin/payments"
          className="flex items-center justify-between rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 transition-colors hover:bg-amber-100/60"
        >
          <div>
            <p className="font-black text-amber-800">لديك {pendingCount} طلب دفع بانتظار المراجعة</p>
            <p className="text-sm text-amber-700">راجع الفواتير وتأكد من إثباتات الدفع لتأكيد الاشتراكات</p>
          </div>
          <CreditCard className="h-6 w-6 text-amber-600" />
        </Link>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 font-black text-navy">
              <CreditCard className="h-5 w-5 text-amber-600" /> آخر فواتير الاشتراك
            </h2>
            <Link href="/admin/payments" className="text-xs font-bold text-amber-600 hover:underline">
              الكل
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentInvoices.map((inv) => {
              const status = statusLabels[inv.status] ?? { text: inv.status, cls: "bg-slate-100 text-slate-600" }
              return (
                <div key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-navy">
                      {inv.user.firstName} {inv.user.lastName}
                    </span>
                    <span className="block text-xs text-slate-500">{inv.course?.name ?? "—"}</span>
                  </span>
                  <span className="text-xs text-slate-400">{formatDateTime(inv.createdAt)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${status.cls}`}>{status.text}</span>
                  <span className="text-sm font-black text-navy">{formatPrice(inv.amount)}</span>
                </div>
              )
            })}
            {recentInvoices.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-400">لا توجد اشتراكات بعد</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 font-black text-navy">
              <CalendarClock className="h-5 w-5 text-rose-600" /> اشتراكات تنتهي قريباً
            </h2>
            <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-600">
              خلال 7 أيام
            </span>
          </div>
          <div className="divide-y divide-slate-50">
            {expiredSoon.map((sub) => (
              <div key={sub.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-navy">
                    {sub.user.firstName} {sub.user.lastName}
                  </span>
                  <span className="block text-xs text-slate-500">{sub.course.name}</span>
                </span>
                <span className="text-xs font-bold text-rose-600">{formatDateTime(sub.expiresAt!)}</span>
              </div>
            ))}
            {expiredSoon.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-400">لا توجد اشتراكات تنتهي هذا الأسبوع</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 font-black text-navy">
              <Radio className="h-5 w-5 text-rose-600" /> الجلسات المباشرة القادمة
            </h2>
            <Link href="/admin/recharge-codes" className="text-xs font-bold text-amber-600 hover:underline">
              أكواد الشحن
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {upcomingLive.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1 text-sm font-bold text-navy">{s.title}</span>
                <span className="text-xs text-slate-500">{formatDateTime(s.startAt)}</span>
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                  {s.durationMinutes} د
                </span>
              </div>
            ))}
            {upcomingLive.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-400">لا توجد جلسات قادمة</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 font-black text-navy">
              <UserPlus className="h-5 w-5 text-royal" /> أحدث الطلاب
          </h2>
          <Link href="/admin/users" className="text-xs font-bold text-amber-600 hover:underline">
            إدارة الطلاب
          </Link>
        </div>
        <div className="divide-y divide-slate-50">
          {recentStudents.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-royal-50 text-sm font-black text-royal">
                {s.firstName?.[0] ?? "؟"}
              </span>
              <span className="min-w-0 flex-1 text-sm font-bold text-navy">
                {s.firstName} {s.lastName}
              </span>
              <span className="text-xs text-slate-500" dir="ltr">
                {s.phone}
              </span>
              <span className="text-xs text-slate-400">{formatDateTime(s.createdAt)}</span>
              <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                <Gift className="h-3 w-3" /> {s.points} نقطة
              </span>
            </div>
          ))}
          {recentStudents.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-400">لا يوجد طلاب بعد</p>
          )}
        </div>
      </section>
      </div>
    </div>
  )
}
