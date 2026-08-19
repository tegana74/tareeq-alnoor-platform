"use client"

import { useEffect, useRef, useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

export function MarkAttendance({ sessionId, isLive, attended }: { sessionId: string; isLive: boolean; attended: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(attended ? "done" : "idle")
  const marked = useRef(attended)

  useEffect(() => {
    if (!isLive || marked.current) return
    marked.current = true
    setState("loading")
    fetch(`/api/live/${sessionId}/attend`, { method: "POST" })
      .then((r) => setState(r.ok ? "done" : "error"))
      .catch(() => setState("error"))
  }, [isLive, sessionId])

  if (state === "done") {
    return (
      <span className="flex items-center gap-1.5 text-sm font-black text-mint-dark">
        <CheckCircle2 className="h-4 w-4" /> تم تسجيل حضورك
      </span>
    )
  }
  if (state === "loading") {
    return (
      <span className="flex items-center gap-1.5 text-sm font-black text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> جارِ تسجيل الحضور...
      </span>
    )
  }
  if (state === "error") {
    return <span className="text-xs font-bold text-rose-600">تعذر تسجيل الحضور — أعد تحميل الصفحة.</span>
  }
  return <span className="text-sm font-black text-slate-400">{attended ? "حضرت الجلسة" : isLive ? "حضورك يُسجل عند المشاهدة" : "سجل حضورك عند بدء البث"}</span>
}
