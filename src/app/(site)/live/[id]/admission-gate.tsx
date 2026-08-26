"use client"

// LIVE-9B — بوابة دخول الطالب (Waiting Room)
//
// لا يتم تركيب مشاهد LiveKit ولا طلب توكن إلا بعد موافقة المعلم.
// مصدر الحقيقة هو الحالة القادمة من السيرفر — لا تُفترض الموافقة من حالة React.

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, LogIn, ShieldCheck, ShieldX, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  ADMISSION_POLL_INTERVAL_MS,
  ALLOW_REREQUEST_AFTER_REJECT,
  shouldPollAdmission,
  toAdmissionState,
  type AdmissionState,
} from "@/lib/live-classroom/admission"

interface AdmissionGateProps {
  sessionId: string
  /** الحالة المقروءة من السيرفر عند تحميل الصفحة (لا افتراضات على العميل) */
  initialState: AdmissionState
  /** تُبلَّغ الغرفة بالحالة الحالية (تستخدمها لمنع تسجيل حضور غير مقبول) */
  onStateChange?: (state: AdmissionState) => void
  /** يُعرض فقط بعد الموافقة — مشاهد LiveKit */
  children: React.ReactNode
}

export function AdmissionGate({
  sessionId,
  initialState,
  onStateChange,
  children,
}: AdmissionGateProps) {
  const [state, setState] = useState<AdmissionState>(initialState)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string>()
  // شريط «تم قبول طلبك» يظهر فقط عند لحظة الانتقال pending → approved
  const [justApproved, setJustApproved] = useState(false)
  const prevStateRef = useRef<AdmissionState>(initialState)

  // ─── إرسال / إعادة إرسال الطلب ────────────────────────────────────────────
  const sendRequest = useCallback(async () => {
    setSubmitting(true)
    setErrorMsg(undefined)
    try {
      const res = await fetch(`/api/live/${sessionId}/admission/request`, {
        method: "POST",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMsg(typeof data.error === "string" ? data.error : "تعذر إرسال طلب الدخول.")
        return
      }
      setState(toAdmissionState({ status: String(data.status) }))
    } catch {
      setErrorMsg("تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.")
    } finally {
      setSubmitting(false)
    }
  }, [sessionId])

  // ─── استعلام خفيف أثناء الانتظار فقط (يتوقف بعد القرار) ────────────────────
  useEffect(() => {
    if (!shouldPollAdmission(state)) return
    let active = true

    async function poll() {
      try {
        const res = await fetch(`/api/live/${sessionId}/admission`)
        if (!res.ok) return
        const data = await res.json()
        if (active && typeof data.status === "string") {
          setState(toAdmissionState({ status: data.status }))
        }
      } catch {
        // انقطاع مؤقت — المحاولة التالية تكفي، لا رسالة خطأ للطالب
      }
    }

    const timer = setInterval(poll, ADMISSION_POLL_INTERVAL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [sessionId, state])

  // ─── إظهار تأكيد القبول لحظة الانتقال فقط ─────────────────────────────────
  useEffect(() => {
    const previous = prevStateRef.current
    prevStateRef.current = state
    onStateChange?.(state)
    if (state !== "approved" || previous === "approved") return

    setJustApproved(true)
    const timer = setTimeout(() => setJustApproved(false), 5000)
    return () => clearTimeout(timer)
  }, [state, onStateChange])

  // ─── الحالة 3: مقبول → المشاهد يعمل الآن (هو من يطلب التوكن) ──────────────
  if (state === "approved") {
    return (
      <>
        {justApproved && (
          <div
            role="status"
            className="mb-3 flex items-center gap-2 rounded-2xl border border-mint-200 bg-mint-50 px-4 py-3"
          >
            <ShieldCheck className="h-5 w-5 shrink-0 text-mint-dark" />
            <p className="text-sm font-black text-mint-dark">
              تم قبول طلبك — جاري الاتصال بالبث المباشر...
            </p>
          </div>
        )}
        {children}
      </>
    )
  }

  return (
    <div className="mb-6 rounded-2xl border-2 border-slate-200 bg-white p-8 text-center shadow-sm">
      {/* ─── الحالة 2: في الانتظار ─────────────────────────────────────────── */}
      {state === "pending" && (
        <div role="status" aria-live="polite">
          <Loader2 className="mx-auto mb-3 h-12 w-12 animate-spin text-blue-500" />
          <h3 className="mb-1 text-lg font-black text-navy">في انتظار موافقة المعلم...</h3>
          <p className="text-sm text-slate-500">
            تم إرسال طلبك. ابقَ في هذه الصفحة، وسيبدأ البث تلقائياً بعد الموافقة.
          </p>
        </div>
      )}

      {/* ─── الحالة 4: مرفوض ───────────────────────────────────────────────── */}
      {state === "rejected" && (
        <div>
          <ShieldX className="mx-auto mb-3 h-12 w-12 text-rose-500" />
          <h3 className="mb-1 text-lg font-black text-navy">لم تتم الموافقة على دخولك</h3>
          <p className="mb-4 text-sm text-slate-500">
            لم يوافق المعلم على طلب دخولك لهذه الحصة.
          </p>
          {ALLOW_REREQUEST_AFTER_REJECT && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void sendRequest()}
              disabled={submitting}
              className="flex items-center gap-1.5 mx-auto"
            >
              {submitting ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin" />
              ) : (
                <LogIn className="h-4.5 w-4.5" />
              )}
              إعادة الطلب
            </Button>
          )}
        </div>
      )}

      {/* ─── الحالة 5: أُخرج من الجلسة (LIVE-9C) ──────────────────────────── */}
      {/* حالة نهائية: لا زر إعادة طلب — السيرفر يتجاهل أي طلب جديد من الطالب،
          ولا يرفعها إلا قبول صريح من المعلم. */}
      {state === "kicked" && (
        <div>
          <ShieldX className="mx-auto mb-3 h-12 w-12 text-rose-500" />
          <h3 className="mb-1 text-lg font-black text-navy">
            تم إخراجك من هذه الجلسة
          </h3>
          <p className="text-sm text-slate-500">
            أخرجك المعلم من الحصة. لا يمكنك الدخول مرة أخرى حتى يعيد قبولك.
          </p>
        </div>
      )}

      {/* ─── الحالة 1: لم يُرسل طلبًا بعد ──────────────────────────────────── */}
      {state === "none" && (
        <div>
          <LogIn className="mx-auto mb-3 h-12 w-12 text-slate-400" />
          <h3 className="mb-1 text-lg font-black text-navy">الحصة مباشرة الآن</h3>
          <p className="mb-4 text-sm text-slate-500">
            أرسل طلب دخول، وسينضم بثك تلقائياً بعد موافقة المعلم.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void sendRequest()}
            disabled={submitting}
            className="flex items-center gap-1.5 mx-auto"
          >
            {submitting ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : (
              <LogIn className="h-4.5 w-4.5" />
            )}
            طلب دخول الحصة
          </Button>
        </div>
      )}

      {errorMsg && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-bold text-rose-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMsg}
        </p>
      )}
    </div>
  )
}
