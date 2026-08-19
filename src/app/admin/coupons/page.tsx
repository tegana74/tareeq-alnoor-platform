import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { formatDate } from "@/lib/utils"
import { CouponForm } from "./coupon-form"

export const metadata: Metadata = { title: "الكوبونات | لوحة الإدارة" }

export default async function AdminCouponsPage() {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-navy">الكوبونات وأكواد الخصم</h1>
        <p className="text-sm text-slate-500">أنشئ أكواد خصم لتحفيز الطلاب</p>
      </div>

      <CouponForm />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="divide-y divide-slate-50">
          {coupons.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <span className="rounded-lg bg-amber-50 px-3 py-1.5 font-mono font-black text-amber-700">
                {c.code}
              </span>
              <p className="text-sm font-bold text-navy">
                {c.discountType === "percentage" ? `${c.discountValue}%` : `${c.discountValue} ج.م`}
              </p>
              <p className="text-xs text-slate-500">
                استخدام: {c.usedCount}/{c.maxUses}
              </p>
              {c.expiresAt && <p className="text-xs text-slate-400">ينتهي {formatDate(c.expiresAt)}</p>}
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${c.isActive ? "bg-mint-50 text-mint-dark" : "bg-slate-100 text-slate-500"}`}>
                {c.isActive ? "مفعل" : "موقوف"}
              </span>
            </div>
          ))}
          {coupons.length === 0 && (
            <p className="p-8 text-center text-sm text-slate-400">لا توجد كوبونات بعد</p>
          )}
        </div>
      </div>
    </div>
  )
}
