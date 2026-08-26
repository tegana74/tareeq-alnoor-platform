"use client"

// LIVE-9B — لوحة «طلبات الدخول» للمعلم المالك/الأدمن.
//
// عرض الطلبات المعلّقة فقط + قبول/رفض. إدارة المشاركين الكاملة (kick/mute) = LIVE-9C.

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, UserCheck, UserX, AlertCircle, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { nextAdmissionPollDelay } from "@/lib/live-classroom/admission"

interface PendingRequest {
  userId: string
  name: string
  requestedAt: string
  yearName: string | null
  departmentName: string | null
}

interface AdmissionPanelProps {
  sessionId: string
}

const TIME_FORMATTER = new Intl.DateTimeFormat("ar-EG", {
  hour: "2-digit",
  minute: "2-digit",
})

/**
 * هوية الطلب الواحد: الطالب + لحظة الطلب.
 * إعادة الطلب بعد الرفض تُحدّث requestedAt على السيرفر، فتصير طلباً بمفتاح جديد.
 */
function requestKey(row: PendingRequest): string {
  return `${row.userId}@${row.requestedAt}`
}

export function AdmissionPanel({ sessionId }: AdmissionPanelProps) {
  const [pending, setPending] = useState<PendingRequest[]>([])
  const [approvedCount, setApprovedCount] = useState(0)
  const [loaded, setLoaded] = useState(false)
  /** الجلسة تُدار بنظام الدخول؟ الجلسات الخارجية لا لوحة لها */
  const [managed, setManaged] = useState(true)
  /** معرّف الطالب الجاري تنفيذ قرار بشأنه — لتعطيل زرّيه فقط */
  const [busyUserId, setBusyUserId] = useState<string>()
  const [errorMsg, setErrorMsg] = useState<string>()
  /**
   * طلبات حُسمت على السيرفر بالفعل، بمفتاح userId@requestedAt.
   *
   * استجابة استعلام انطلقت *قبل* القرار قد تصل *بعده* فتُعيد الصف المحسوم —
   * فنُرشّحه. والمفتاح يضم requestedAt لأن إعادة الطلب بعد الرفض تُحدّثه على
   * السيرفر: الطلب الجديد مفتاحه مختلف فيظهر فوراً، بينما الصورة القديمة وحدها
   * تُرشّح. ثم نُفرغ ما لم يعد السيرفر يُرجعه فلا ينمو المفتاح بلا حد.
   */
  const decidedRef = useRef<Set<string>>(new Set())

  // استعلام خفيف بتباطؤ تدريجي: 4 ثوانٍ عند وجود طلبات، ثم تباطؤ حتى 20 ثانية
  // عند خلوها. لا يتوقف أبداً — الطلب الجديد يُكتشف ثم يعود الإيقاع السريع فوراً.
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    /** جولات متتالية بلا طلبات — تحدد فترة الاستعلام التالية */
    let emptyRounds = 0

    async function load() {
      try {
        const res = await fetch(`/api/live/${sessionId}/admission`)
        if (!active) return
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          if (!active) return
          setErrorMsg(typeof data.error === "string" ? data.error : undefined)
          emptyRounds += 1
          return
        }
        const data = await res.json()
        if (!active) return

        const rows: PendingRequest[] = Array.isArray(data.pending) ? data.pending : []
        const decided = decidedRef.current
        // استجابة تسبق القرار زمنياً لكنها تصل بعده: تحمل صفوفاً محسومة
        const stale = rows.some((row) => decided.has(requestKey(row)))
        // ما لم يعد السيرفر يعدّه معلّقاً لا يحتاج ترشيحاً بعد الآن
        const liveKeys = new Set(rows.map(requestKey))
        for (const key of decided) {
          if (!liveKeys.has(key)) decided.delete(key)
        }
        const visible = rows.filter((row) => !decided.has(requestKey(row)))

        emptyRounds = visible.length > 0 ? 0 : emptyRounds + 1
        setManaged(data.managed !== false)
        setPending(visible)
        // العدّاد من استجابة قديمة يُنقص المقبولين بمقدار القرار الأخير
        if (!stale) {
          setApprovedCount(typeof data.approvedCount === "number" ? data.approvedCount : 0)
        }
        setErrorMsg(undefined)
      } catch {
        // انقطاع مؤقت — الاستعلام التالي يكفي، بلا رسالة خطأ
        emptyRounds += 1
      } finally {
        if (active) setLoaded(true)
      }
    }

    async function tick() {
      try {
        await load()
      } catch {
        // أي إخفاق غير متوقع لا يجوز أن يُسكت اللوحة إلى الأبد
        emptyRounds += 1
      }
      if (!active) return
      timer = setTimeout(tick, nextAdmissionPollDelay(emptyRounds))
    }

    void tick()
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [sessionId])

  const decide = useCallback(
    async (row: PendingRequest, decision: "approve" | "reject") => {
      const { userId } = row
      setBusyUserId(userId)
      setErrorMsg(undefined)
      try {
        const res = await fetch(`/api/live/${sessionId}/admission/${decision}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setErrorMsg(typeof data.error === "string" ? data.error : "تعذر تنفيذ القرار.")
          return
        }
        // القرار نجح على السيرفر → يختفي الطلب من المعلّقة،
        // ولا تُعيده استجابة استعلام كانت جارية أثناء القرار
        decidedRef.current.add(requestKey(row))
        setPending((rows) => rows.filter((r) => r.userId !== userId))
        if (decision === "approve") setApprovedCount((n) => n + 1)
      } catch {
        setErrorMsg("تعذر الاتصال بالخادم. حاول مرة أخرى.")
      } finally {
        setBusyUserId(undefined)
      }
    },
    [sessionId]
  )

  // جلسة برابط خارجي (YouTube/Zoom/Meet) → لا نظام دخول ولا لوحة
  if (loaded && !managed) return null

  return (
    <div className="mb-6 rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-black text-navy">
          <Users className="h-4.5 w-4.5 text-slate-400" />
          طلبات الدخول
          {pending.length > 0 && (
            <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-black text-white">
              {pending.length}
            </span>
          )}
        </h3>
        {approvedCount > 0 && (
          <span className="text-xs font-bold text-slate-400">
            المقبولون: {approvedCount}
          </span>
        )}
      </div>

      {!loaded ? (
        <p className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          جاري تحميل الطلبات...
        </p>
      ) : pending.length === 0 ? (
        <p className="text-xs font-bold text-slate-400">لا توجد طلبات دخول معلّقة.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {pending.map((row) => (
            <li
              key={row.userId}
              className="flex flex-wrap items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-navy">{row.name}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {TIME_FORMATTER.format(new Date(row.requestedAt))}
                  {row.yearName && ` · ${row.yearName}`}
                  {row.departmentName && ` · ${row.departmentName}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void decide(row, "approve")}
                  disabled={busyUserId === row.userId}
                  className="flex items-center gap-1.5"
                >
                  {busyUserId === row.userId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserCheck className="h-4 w-4" />
                  )}
                  قبول
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void decide(row, "reject")}
                  disabled={busyUserId === row.userId}
                  className="flex items-center gap-1.5 border-rose-200 bg-rose-50/50 text-rose-600 hover:bg-rose-50"
                >
                  <UserX className="h-4 w-4" />
                  رفض
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {errorMsg && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-rose-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMsg}
        </p>
      )}
    </div>
  )
}
