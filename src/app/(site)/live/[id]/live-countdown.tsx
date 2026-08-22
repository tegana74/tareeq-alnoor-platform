"use client"

import { useEffect, useState } from "react"
import { Radio } from "lucide-react"

export function LiveCountdown({
  start,
  end,
  kind,
}: {
  start: number
  end: number
  kind: "embed" | "link" | "none"
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const diff = start - now
  const isLive = now >= start && now < end

  if (isLive) {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="flex items-center gap-2 text-sm font-black text-rose-600">
          <Radio className="h-4 w-4 animate-pulse" /> البث مباشر الآن
        </p>
        <p className="text-xs text-slate-500">
          {kind === "link"
            ? "اضغط زر الانضمام بالأعلى ويسجّل حضورك تلقائياً."
            : kind === "embed"
              ? "المشغل يظهر أعلاه — يسجّل حضورك تلقائياً."
              : "الرابط لم يُضف بعد — انتظر المعلم."}
        </p>
      </div>
    )
  }

  if (now >= end) {
    return <p className="text-sm font-medium text-slate-500">انتهت الجلسة.</p>
  }

  if (diff <= 0) {
    return <p className="text-sm font-bold text-rose-600">الجلسة على وشك البدء...</p>
  }

  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)

  const cells: { label: string; value: number }[] = []
  if (d > 0) cells.push({ label: "يوم", value: d })
  cells.push({ label: "ساعة", value: h })
  cells.push({ label: "دقيقة", value: m })
  cells.push({ label: "ثانية", value: s })

  return (
    <div>
      <p className="mb-3 text-sm font-bold text-amber-700">تبدأ الجلسة خلال:</p>
      <div className="flex items-center justify-center gap-3" dir="ltr">
        {cells.map((c) => (
          <div key={c.label} className="flex flex-col items-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-2xl font-black text-navy shadow">
              {String(c.value).padStart(2, "0")}
            </span>
            <span className="mt-1 text-[11px] font-medium text-slate-500" dir="rtl">
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
