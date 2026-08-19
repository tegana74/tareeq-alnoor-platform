"use client"

import { useSearchParams } from "next/navigation"

export function RegisteredNotice() {
  const searchParams = useSearchParams()
  if (searchParams.get("registered") !== "1") return null

  return (
    <div className="rounded-2xl border border-mint-200 bg-mint-50 px-5 py-4 text-center text-sm font-bold text-mint-dark">
      🎉 تم إنشاء حسابك بنجاح! سجّل دخولك الآن وابدأ رحلة التفوق.
    </div>
  )
}
