import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, ClipboardList, Lock, Wallet } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { formatDate, formatPrice } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ChangePasswordForm } from "./change-password-form"

export const metadata: Metadata = { title: "حسابي" }

export default async function ProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const [subscriptions, notifications, attempts] = await Promise.all([
    prisma.subscription.findMany({
      where: { userId: user.id, status: "active" },
      include: { course: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.examAttempt.count({ where: { userId: user.id } }),
  ])

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="hover:text-amber-600">
          الرئيسية
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-bold text-navy">حسابي</span>
      </nav>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-l from-navy to-royal p-6 text-white">
          <div className="flex flex-wrap items-center gap-5">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 text-3xl font-black">
              {user.firstName[0]}
            </span>
            <div className="flex-1">
              <h1 className="text-2xl font-black">
                {user.firstName} {user.middleName} {user.lastName}
              </h1>
              <p className="mt-1 text-sm text-slate-300" dir="ltr">
                {user.phone}
              </p>
              <p className="text-sm text-slate-300">عضو منذ {formatDate(user.createdAt)}</p>
            </div>
            <div className="flex gap-3">
              <div className="rounded-2xl bg-white/10 px-4 py-3 text-center">
                <p className="text-lg font-black text-amber-400">🪙 {user.points}</p>
                <p className="text-xs text-slate-300">نقطة</p>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 text-center">
                <p className="text-lg font-black text-amber-400">{formatPrice(user.walletBalance)}</p>
                <p className="text-xs text-slate-300">رصيد</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:grid-cols-2">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-black text-navy">اشتراكاتي ({subscriptions.length})</h2>
              <Button href="/courses" variant="ghost" size="sm">
                تصفح الكورسات
              </Button>
            </div>
            <div className="space-y-2">
              {subscriptions.map((s) => (
                <Link
                  key={s.id}
                  href={`/courses/${s.courseId}/sections`}
                  className="flex items-center justify-between rounded-xl border border-slate-100 p-3 transition-colors hover:border-amber-200 hover:bg-amber-50/40"
                >
                  <span className="text-sm font-bold text-navy">📚 {s.course.name}</span>
                  <span className="text-xs font-bold text-mint-dark">مفعل</span>
                </Link>
              ))}
              {subscriptions.length === 0 && (
                <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-400">
                  لم تشترك في أي كورس بعد
                </p>
              )}
            </div>
          </div>

          <div>
            <h2 className="mb-3 font-black text-navy">آخر التنبيهات</h2>
            <div className="space-y-2">
              {notifications.map((n) => (
                <div key={n.id} className="rounded-xl border border-slate-100 p-3">
                  <p className="text-sm font-bold text-navy">{n.title}</p>
                  <p className="text-xs text-slate-500">{n.body}</p>
                </div>
              ))}
              {notifications.length === 0 && (
                <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-400">
                  لا توجد تنبيهات
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-t border-slate-100 p-6 sm:grid-cols-3">
          <Button href="/wallet" variant="outline">
            <Wallet className="h-4 w-4" />
            فواتيري والمحفظة
          </Button>
          <Button href="/courses" variant="outline">
            <ClipboardList className="h-4 w-4" />
            متابعة دراستي
          </Button>
          <Button href={`/courses`} variant="outline">
            عدد الاختبارات التي أديتها: {attempts}
          </Button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Lock className="h-5 w-5 text-navy" />
          <h2 className="font-black text-navy">تغيير كلمة المرور</h2>
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  )
}
