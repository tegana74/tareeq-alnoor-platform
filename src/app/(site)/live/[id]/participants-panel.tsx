"use client"

// LIVE-9C — لوحة «المشاركون» للمعلم المالك/الأدمن.
//
// تعرض من يُسمح له بالدخول (approved / kicked) مع حالة اتصاله الفعلية من LiveKit،
// وتسمح بالإخراج والتراجع عنه. الطلبات المعلّقة تملكها لوحة LIVE-9B فلا تُكرَّر هنا.
//
// كل قرار صلاحية على السيرفر: هذه اللوحة لا تحمل أي منطق تصريحي — تُرسل userId
// فقط، والسيرفر هو من يتحقق من الملكية والدور ومن أن السجل يتبع هذه الجلسة.
//
// LIVE-9E — منح/سحب الميكروفون و«كتم الجميع». الحالة المعروضة تأتي من حضور
// LiveKit عبر مسار المشاركين، لا من حالة محلية: الأزرار تطلب، والسيرفر يقرر،
// والاستعلام التالي هو ما يُثبِّت النتيجة على الشاشة.

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  Loader2,
  Mic,
  MicOff,
  UserCheck,
  UserMinus,
  Users,
  WifiOff,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AdmissionStatus } from "@/lib/live-classroom/admission"
import {
  PARTICIPANT_POLL_INTERVAL_MS,
  PARTICIPANT_REFRESH_DEBOUNCE_MS,
  type ParticipantPresence,
} from "@/lib/live-classroom/participants"

interface RosterRow {
  userId: string
  name: string
  yearName: string | null
  departmentName: string | null
  admission: AdmissionStatus | null
  presence: ParticipantPresence
  joinedAtMs: number | null
  unknown: boolean
  /** null = تعذّر قراءة الحالة من خدمة البث (LIVE-9E) */
  micGranted: boolean | null
  micActive: boolean | null
}

interface ParticipantsPanelProps {
  sessionId: string
  /**
   * عدّاد يتغيّر مع كل حدث اتصال/انفصال في غرفة المعلم.
   *
   * التحديث الأساسي مدفوع بأحداث LiveKit القائمة أصلاً (LIVE-8B/8D) — لا بنية
   * realtime جديدة — والاستعلام الدوري يغطي ما يفوته الحدث.
   */
  revision: number
}

const TIME_FORMATTER = new Intl.DateTimeFormat("ar-EG", {
  hour: "2-digit",
  minute: "2-digit",
})

const PRESENCE_LABELS: Record<ParticipantPresence, string> = {
  connected: "متصل",
  offline: "غير متصل",
  unknown: "الاتصال غير معروف",
}

const PRESENCE_DOTS: Record<ParticipantPresence, string> = {
  connected: "bg-emerald-500",
  offline: "bg-slate-300",
  unknown: "bg-amber-400",
}

export function ParticipantsPanel({ sessionId, revision }: ParticipantsPanelProps) {
  const [rows, setRows] = useState<RosterRow[]>([])
  const [connectedCount, setConnectedCount] = useState(0)
  const [loaded, setLoaded] = useState(false)
  /** الجلسة تُدار بنظام المشاركين؟ الجلسات الخارجية لا لوحة لها */
  const [managed, setManaged] = useState(true)
  /** تعذّر الوصول إلى خدمة البث — القائمة تبقى ظاهرة بحالة اتصال غير معروفة */
  const [roomReachable, setRoomReachable] = useState(true)
  const [busyUserId, setBusyUserId] = useState<string>()
  /** «كتم الجميع» جارٍ — نداء واحد يشمل كل الصفوف فلا يصلح busyUserId له */
  const [mutingAll, setMutingAll] = useState(false)
  /** الصف الذي طُلب إخراجه وينتظر تأكيداً — تأكيد داخل الصف بلا نافذة متصفح */
  const [confirmingUserId, setConfirmingUserId] = useState<string>()
  const [errorMsg, setErrorMsg] = useState<string>()
  const [warningMsg, setWarningMsg] = useState<string>()

  /**
   * حالات حُسمت على السيرفر بالفعل: userId → الحالة الجديدة.
   *
   * استجابة استعلام انطلقت *قبل* القرار قد تصل *بعده* فتُعيد الحالة القديمة.
   * نُبقي القرار ظاهراً حتى يتفق السيرفر معه، ثم نُفرغ المفتاح فلا ينمو بلا حد.
   */
  const decidedRef = useRef<Map<string, AdmissionStatus>>(new Map())

  /**
   * `keepErrorMsg` — استعلام يُطلَب بعد فشل عملية لكشف ما جرى فعلاً: يُحدِّث حالة
   * المشاركين ولا يمسّ رسالة الخطأ المعروضة، فنجاح الاستعلام ليس نجاحاً للعملية.
   */
  const load = useCallback(async (options?: { keepErrorMsg?: boolean }) => {
    const keepErrorMsg = options?.keepErrorMsg === true
    try {
      const res = await fetch(`/api/live/${sessionId}/participants`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (!keepErrorMsg) {
          setErrorMsg(typeof data.error === "string" ? data.error : undefined)
        }
        return
      }
      const data = await res.json()

      const incoming: RosterRow[] = Array.isArray(data.participants)
        ? data.participants
        : []
      const decided = decidedRef.current
      // ما اتفق عليه السيرفر لم يعد يحتاج تثبيتاً محلياً
      for (const row of incoming) {
        if (decided.get(row.userId) === row.admission) decided.delete(row.userId)
      }
      const visible = incoming.map((row) => {
        const pinned = decided.get(row.userId)
        return pinned ? { ...row, admission: pinned } : row
      })

      setManaged(data.managed !== false)
      setRoomReachable(data.roomReachable !== false)
      setRows(visible)
      setConnectedCount(
        typeof data.connectedCount === "number" ? data.connectedCount : 0
      )
      if (!keepErrorMsg) setErrorMsg(undefined)
    } catch {
      // انقطاع مؤقت — الاستعلام التالي يكفي، بلا رسالة خطأ
    } finally {
      setLoaded(true)
    }
  }, [sessionId])

  // استعلام أمان كل 12 ثانية — أبطأ من لوحة الطلبات لأن هذا المسار وحده
  // يُصدر نداءً خارجياً إلى LiveKit.
  useEffect(() => {
    let active = true
    const guarded = () => {
      if (active) void load()
    }
    guarded()
    const timer = setInterval(guarded, PARTICIPANT_POLL_INTERVAL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [load])

  // حدث اتصال/انفصال في الغرفة → تحديث مُجمَّع (أحداث متلاحقة = نداء واحد)
  useEffect(() => {
    if (revision === 0) return
    const timer = setTimeout(() => void load(), PARTICIPANT_REFRESH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [revision, load])

  const kick = useCallback(
    async (userId: string) => {
      setBusyUserId(userId)
      setErrorMsg(undefined)
      setWarningMsg(undefined)
      try {
        const res = await fetch(`/api/live/${sessionId}/participants/kick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setErrorMsg(
            typeof data.error === "string" ? data.error : "تعذر إخراج الطالب."
          )
          return
        }
        decidedRef.current.set(userId, "kicked")
        setRows((current) =>
          current.map((row) =>
            row.userId === userId
              ? { ...row, admission: "kicked", presence: "offline", joinedAtMs: null }
              : row
          )
        )
        setConnectedCount((n) => Math.max(0, n - 1))
        // الحظر نجح لكن الإخراج الفوري من الغرفة لم يتم — تحذير لا خطأ
        if (typeof data.warning === "string") setWarningMsg(data.warning)
        setConfirmingUserId(undefined)
      } catch {
        setErrorMsg("تعذر الاتصال بالخادم. حاول مرة أخرى.")
      } finally {
        setBusyUserId(undefined)
      }
    },
    [sessionId]
  )

  // التراجع عن الإخراج = موافقة صريحة جديدة عبر مسار LIVE-9B نفسه
  const readmit = useCallback(
    async (userId: string) => {
      setBusyUserId(userId)
      setErrorMsg(undefined)
      setWarningMsg(undefined)
      try {
        const res = await fetch(`/api/live/${sessionId}/admission/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setErrorMsg(
            typeof data.error === "string" ? data.error : "تعذر إعادة القبول."
          )
          return
        }
        decidedRef.current.set(userId, "approved")
        setRows((current) =>
          current.map((row) =>
            row.userId === userId ? { ...row, admission: "approved" } : row
          )
        )
      } catch {
        setErrorMsg("تعذر الاتصال بالخادم. حاول مرة أخرى.")
      } finally {
        setBusyUserId(undefined)
      }
    },
    [sessionId]
  )

  /**
   * منح/سحب صلاحية الميكروفون لطالب واحد (LIVE-9E).
   *
   * لا نُثبِّت الحالة محلياً كما في القبول: صلاحية الميكروفون تعيش في LiveKit
   * وحده، والاستعلام الدوري يقرأها من هناك. نعرض ما أعاده السيرفر فقط.
   *
   * LIVE-9F: micGranted قد تعود null = «الحالة غير معروفة» (فشل RPC). في هذه
   * الحالة لا نكتب حالة مخترعة على الصف — نُبقي ما هو معروض ونُعيد الاستعلام
   * فوراً بدل انتظار دورة الـ 12 ثانية، فيُظهر LiveKit ما جرى فعلاً.
   */
  const micAction = useCallback(
    async (userId: string, action: "grant" | "revoke") => {
      setBusyUserId(userId)
      setErrorMsg(undefined)
      setWarningMsg(undefined)
      try {
        const res = await fetch(`/api/live/${sessionId}/microphone`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, action }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setErrorMsg(
            typeof data.error === "string"
              ? data.error
              : "تعذر تحديث صلاحية الميكروفون."
          )
          // خطأ خادم قد يقع بعد تطبيق الصلاحية فعلاً — لا نُخمّن، نقرأ من جديد.
          // الرسالة تبقى: الاستعلام يصحّح الحالة ولا يلغي إبلاغ المعلم بالفشل.
          if (res.status >= 500) void load({ keepErrorMsg: true })
          return
        }
        const granted = data.micGranted
        if (typeof granted === "boolean") {
          setRows((current) =>
            current.map((row) =>
              row.userId === userId
                ? {
                    ...row,
                    micGranted: granted,
                    micActive: granted ? row.micActive : false,
                  }
                : row
            )
          )
        }
        if (typeof data.warning === "string") setWarningMsg(data.warning)
        // لم تُطبَّق العملية أو الحالة غير معروفة → إعادة قراءة فورية
        if (data.applied === false || typeof granted !== "boolean") void load()
      } catch {
        setErrorMsg("تعذر الاتصال بالخادم. حاول مرة أخرى.")
      } finally {
        setBusyUserId(undefined)
      }
    },
    [sessionId, load]
  )

  /** سحب الميكروفون من كل طالب متصل يملكه — لا يشمل المعلم ولا الأدمن */
  const muteAll = useCallback(async () => {
    setMutingAll(true)
    setErrorMsg(undefined)
    setWarningMsg(undefined)
    try {
      const res = await fetch(`/api/live/${sessionId}/microphone/mute-all`, {
        method: "POST",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMsg(
          typeof data.error === "string" ? data.error : "تعذر كتم الجميع."
        )
        return
      }
      setRows((current) =>
        current.map((row) =>
          // الهويات غير المعروفة (المعلم/المشرف في الغرفة) ليست أهدافاً للكتم
          row.unknown ? row : { ...row, micGranted: false, micActive: false }
        )
      )
      if (typeof data.warning === "string") setWarningMsg(data.warning)
      // فشل جزئي؟ الاستعلام التالي يُظهر من بقي يملك الصلاحية فعلاً
      if (typeof data.failed === "number" && data.failed > 0) void load()
    } catch {
      setErrorMsg("تعذر الاتصال بالخادم. حاول مرة أخرى.")
    } finally {
      setMutingAll(false)
    }
  }, [sessionId, load])

  /**
   * زر «كتم الجميع» بلا هدف = زر مضلِّل، فيُخفى حتى يوجد من يُكتم.
   *
   * الهويات غير المعروفة مستثناة: «كتم الجميع» يعمل على سجل دخول هذه الجلسة
   * حصراً، فصلاحية هوية لا نعرف صاحبها (المعلم مثلاً) ليست هدفاً ممكناً.
   */
  const anyMicGranted = rows.some((row) => !row.unknown && row.micGranted === true)

  // جلسة برابط خارجي (YouTube/Zoom/Meet) → لا غرفة LiveKit ولا لوحة
  if (loaded && !managed) return null
  return (
    <div className="mb-6 rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-black text-navy">
          <Users className="h-4.5 w-4.5 text-slate-400" />
          المشاركون
          {rows.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500">
              {rows.length}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2.5">
          {roomReachable && connectedCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              متصل الآن: {connectedCount}
            </span>
          )}
          {roomReachable && anyMicGranted && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void muteAll()}
              disabled={mutingAll}
              className="flex items-center gap-1.5 border-rose-200 text-rose-600 hover:bg-rose-50"
            >
              {mutingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MicOff className="h-4 w-4" />
              )}
              كتم الجميع
            </Button>
          )}
        </div>
      </div>

      {!roomReachable && loaded && (
        <p className="mb-3 flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
          <WifiOff className="h-4 w-4 shrink-0" />
          تعذّر قراءة حالة الاتصال من خدمة البث — القائمة معروضة دون حالة اتصال.
        </p>
      )}

      {!loaded ? (
        <p className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          جاري تحميل المشاركين...
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs font-bold text-slate-400">
          لا يوجد مشاركون مقبولون بعد.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => {
            const isKicked = row.admission === "kicked"
            const isBusy = busyUserId === row.userId
            const isConfirming = confirmingUserId === row.userId
            // الميكروفون يُدار للمتصلين وحدهم: المنح لطالب غير متصل لا يُخزَّن
            const canMic =
              !isKicked &&
              !row.unknown &&
              roomReachable &&
              row.presence === "connected"
            const micGranted = row.micGranted === true

            return (
              <li
                key={row.userId}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-black text-navy">
                    {!isKicked && (
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${PRESENCE_DOTS[row.presence]}`}
                        aria-hidden="true"
                      />
                    )}
                    {row.unknown ? "مشارك غير معروف" : row.name}
                    {isKicked && (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-600">
                        تم إخراجه
                      </span>
                    )}
                    {!isKicked && !row.unknown && micGranted && (
                      <span
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black ${
                          row.micActive
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-sky-50 text-sky-700"
                        }`}
                      >
                        <Mic className="h-3 w-3" aria-hidden="true" />
                        {row.micActive ? "يتحدث الآن" : "مسموح بالتحدث"}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {isKicked ? "لا يمكنه الدخول حتى تعيد قبوله" : PRESENCE_LABELS[row.presence]}
                    {row.joinedAtMs !== null &&
                      ` · انضم ${TIME_FORMATTER.format(new Date(row.joinedAtMs))}`}
                    {row.yearName && ` · ${row.yearName}`}
                    {row.departmentName && ` · ${row.departmentName}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {canMic && !isConfirming && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void micAction(row.userId, micGranted ? "revoke" : "grant")
                      }
                      disabled={isBusy || mutingAll}
                      className={`flex items-center gap-1.5 ${
                        micGranted
                          ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                          : "border-sky-200 text-sky-700 hover:bg-sky-50"
                      }`}
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : micGranted ? (
                        <MicOff className="h-4 w-4" />
                      ) : (
                        <Mic className="h-4 w-4" />
                      )}
                      {micGranted ? "سحب الميكروفون" : "منح الميكروفون"}
                    </Button>
                  )}
                  {isKicked ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void readmit(row.userId)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5"
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserCheck className="h-4 w-4" />
                      )}
                      إعادة القبول
                    </Button>
                  ) : isConfirming ? (
                    <>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void kick(row.userId)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5"
                      >
                        {isBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserMinus className="h-4 w-4" />
                        )}
                        تأكيد الإخراج
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmingUserId(undefined)}
                        disabled={isBusy}
                      >
                        إلغاء
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmingUserId(row.userId)}
                      disabled={isBusy || row.unknown}
                      className="flex items-center gap-1.5 border-rose-200 text-rose-600 hover:bg-rose-50"
                    >
                      <UserMinus className="h-4 w-4" />
                      إخراج
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {warningMsg && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-amber-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {warningMsg}
        </p>
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
