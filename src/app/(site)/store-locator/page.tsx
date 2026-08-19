import type { Metadata } from "next"
import Link from "next/link"
import { MapPin, Phone } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { classNames } from "@/lib/utils"

export const metadata: Metadata = { title: "منافذ البيع" }

export default async function StoreLocatorPage({
  searchParams,
}: {
  searchParams: Promise<{ gov?: string }>
}) {
  const { gov } = await searchParams

  const stores = await prisma.storeLocator.findMany({
    where: { isActive: true },
    orderBy: [{ governorate: "asc" }, { name: "asc" }],
  })
  const governorates = [...new Set(stores.map((s) => s.governorate))].sort()
  const selected = gov && governorates.includes(gov) ? gov : null
  const filtered = selected ? stores.filter((s) => s.governorate === selected) : stores

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-black text-navy">منافذ البيع</h1>
        <p className="mt-2 text-sm text-slate-500">اشترِ كروت الشحن وأكواد الاشتراك من أقرب منفذ لك</p>
      </div>

      {governorates.length > 0 && (
        <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/store-locator"
            className={classNames(
              "rounded-full px-4 py-2 text-sm font-black transition-colors",
              !selected ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            الكل ({stores.length})
          </Link>
          {governorates.map((g) => (
            <Link
              key={g}
              href={`/store-locator?gov=${encodeURIComponent(g)}`}
              className={classNames(
                "rounded-full px-4 py-2 text-sm font-black transition-colors",
                selected === g ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {g}
            </Link>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
          <MapPin className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-bold text-slate-500">
            {stores.length === 0 ? "لا توجد منافذ بيع بعد" : "لا توجد منافذ في هذه المحافظة"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-amber-300 hover:shadow-md">
              <span className="mb-3 inline-block rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-600">
                {s.governorate}
              </span>
              <h3 className="flex items-center gap-2 font-black text-navy">
                <MapPin className="h-4 w-4 shrink-0 text-amber-500" />
                {s.name}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">{s.address}</p>
              {s.phone && (
                <a
                  href={`tel:${s.phone}`}
                  dir="ltr"
                  className="mt-3 flex items-center gap-2 text-sm font-black text-royal hover:underline"
                >
                  <Phone className="h-4 w-4" />
                  {s.phone}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
