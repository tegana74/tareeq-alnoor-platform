import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { CalendarPlus, ChevronLeft, Gift, Sparkles } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { getUserSubscriptions } from "@/lib/subscriptions"
import { formatDateTime } from "@/lib/utils"
import { RedeemForm } from "./store-redeem"

export const metadata: Metadata = { title: "المتجر — استبدل نقاطك" }

export default async function StorePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const [items, subscriptions, pointsLog] = await Promise.all([
    prisma.storeItem.findMany({ where: { isActive: true }, orderBy: { pointsCost: "asc" } }),
    user.role === "STUDENT" ? getUserSubscriptions(user.id) : [],
    prisma.pointsTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ])

  const courses = subscriptions.map((s) => ({ id: s.courseId, name: s.course.name }))

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="hover:text-amber-600">
          الرئيسية
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-bold text-navy">المتجر</span>
      </nav>

      <div className="mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-l from-amber-500 to-rose-500 p-6 text-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
                <Sparkles className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm text-amber-100">رصيد النقاط</p>
                <p className="text-3xl font-black">{user.points} نقطة</p>
              </div>
            </div>
            <div className="rounded-2xl bg-white/15 px-4 py-3 text-sm text-amber-50">
              <p className="font-black">كيف تكسب النقاط؟</p>
              <p>أكمل مشاهدة محاضرة = 5 نقاط · أنهِ اختبار = 5 نقاط</p>
            </div>
          </div>
        </div>
      </div>

      <h2 className="mb-4 text-lg font-black text-navy">استبدل نقاطك</h2>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-400">
          لا توجد عروض حالياً — عد لاحقاً
        </p>
      ) : (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <CalendarPlus className="h-6 w-6" />
              </span>
              <p className="font-black text-navy">{item.title}</p>
              {item.description && <p className="mb-2 mt-1 text-xs text-slate-500">{item.description}</p>}
              <p className="mb-4 text-sm font-black text-amber-600">
                {item.value} يوم اشتراك · {item.pointsCost} نقطة
              </p>
              <div className="mt-auto">
                <RedeemForm itemId={item.id} courses={courses} />
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-4 text-lg font-black text-navy">سجل النقاط</h2>
      {pointsLog.length === 0 ? (
        <p className="rounded-2xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-400">
          لا توجد حركات نقاط بعد
        </p>
      ) : (
        <div className="divide-y divide-slate-50 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {pointsLog.map((t) => (
            <div key={t.id} className="flex items-center gap-4 px-5 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Gift className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <p className="font-bold text-navy">{t.reason}</p>
                <p className="text-xs text-slate-500">{formatDateTime(t.createdAt)}</p>
              </div>
              <p className={t.points >= 0 ? "font-black text-mint-dark" : "font-black text-rose-600"}>
                {t.points >= 0 ? "+" : "−"}{Math.abs(t.points)} نقطة
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
