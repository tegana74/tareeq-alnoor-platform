import type { Metadata } from "next"
import { MapPin } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { StoreLocatorForm, StoreLocatorActions } from "./store-locator-form"

export const metadata: Metadata = { title: "منافذ البيع | لوحة الإدارة" }

export default async function AdminStoreLocatorPage() {
  const stores = await prisma.storeLocator.findMany({ orderBy: { governorate: "asc" } })
  const active = stores.filter((s) => s.isActive).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-navy">منافذ البيع ({stores.length})</h1>
          <p className="text-sm text-slate-500">{active} منفذ نشط يظهر للطلاب</p>
        </div>
        <StoreLocatorForm />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="divide-y divide-slate-50">
          {stores.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <MapPin className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-black text-navy">{s.name}</p>
                <p className="text-xs text-slate-500">
                  {s.governorate} · {s.address}
                  {s.phone ? ` · ${s.phone}` : ""}
                </p>
              </div>
              <StoreLocatorActions id={s.id} active={s.isActive} />
            </div>
          ))}
          {stores.length === 0 && (
            <p className="p-8 text-center text-sm text-slate-400">لا توجد منافذ بيع — أضف أول منفذ</p>
          )}
        </div>
      </div>
    </div>
  )
}
