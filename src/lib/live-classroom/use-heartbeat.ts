"use client"

// LIVE-8D — Heartbeat Hook
// نبضة وجود كل 45 ثانية أثناء مشاهدة LiveKit فعلياً.
// تبدأ فقط عند اتصال ناجح + وصول أول مسار بعيد، وتتوقف عند:
// unmount / مغادرة الغرفة / status ≠ live / إعادة الاتصال (وتُستأنف بعده).

import { useEffect, useRef } from "react"

const HEARTBEAT_INTERVAL_MS = 45_000

export function useHeartbeat(options: {
  sessionId: string
  /** نشطة فقط عندما يشاهد الطالب بثاً فعلياً (اتصال + أول مسار) */
  active: boolean
  /** حالة الجلسة من الـ polling — توقف فوري عند ended/cancelled */
  sessionLive: boolean
}) {
  const { sessionId, active, sessionLive } = options

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stoppedRef = useRef(false)

  useEffect(() => {
    stoppedRef.current = false

    if (!active || !sessionLive) return

    let paused = false

    async function beat() {
      if (paused || stoppedRef.current) return
      try {
        await fetch(`/api/live/${sessionId}/heartbeat`, { method: "POST" })
      } catch {
        // فشل نبضة واحدة غير حاسم — النبضة التالية تعيد المحاولة
      }
    }

    // أول نبضة فورية ثم كل 45 ثانية
    void beat()
    timerRef.current = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS)

    return () => {
      stoppedRef.current = true
      paused = true
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [sessionId, active, sessionLive])
}
