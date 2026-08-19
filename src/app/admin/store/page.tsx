import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { StoreItemForm, StoreItemToggle } from "./store-form"

export const metadata: Metadata = { title: "المتجر | لوحة الإدارة" }

export default async function AdminStorePage() {
  const items = await prisma.storeItem.findMany({ orderBy: { createdAt: "desc" } })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-navy">المتجر بالنقاط</h1>
        <p className="text-sm text-slate-500">عروض يستبدلها الطلاب بنقاط المذاكرة</p>
      </div>

      <StoreItemForm />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="divide-y divide-slate-50">
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-black text-navy">{item.title}</p>
                {item.description && <p className="text-xs text-slate-500">{item.description}</p>}
              </div>
              <p className="text-sm font-black text-amber-600">
                {item.value} يوم · {item.pointsCost} نقطة
              </p>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  item.isActive ? "bg-mint-50 text-mint-dark" : "bg-slate-100 text-slate-500"
                }`}
              >
                {item.isActive ? "مفعل" : "موقوف"}
              </span>
              <StoreItemToggle id={item.id} />
            </div>
          ))}
          {items.length === 0 && <p className="p-8 text-center text-sm text-slate-400">لا توجد عروض بعد</p>}
        </div>
      </div>
    </div>
  )
}
