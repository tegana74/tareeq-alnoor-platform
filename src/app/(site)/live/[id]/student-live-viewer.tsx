"use client"

// LIVE-8C/8D — Student LiveKit Viewer
// مشاهد أساساً: لا كاميرا، لا مشاركة شاشة، لا نشر بيانات — إطلاقاً.
// LIVE-8D: heartbeat أثناء المشاهدة الفعلية + retry داخلي + مؤشر جودة الشبكة.
// LIVE-9E: الميكروفون وحده يُسمح به، وفقط بعد منح صريح من المعلم يصل كصلاحية
// من خادم LiveKit (ParticipantPermissionsChanged). لا رسالة DataChannel تفتح
// الميكروفون: الرسائل قابلة للانتحال، والصلاحية لا. عند إعادة الاتصال أو
// الانفصال نعود إلى المنع الافتراضي لأن التوكن نفسه يصدر بلا صلاحية نشر.

import { useEffect, useRef, useState, useCallback } from "react"
import { Radio, Loader2, Mic, MicOff, MonitorPlay, MonitorUp, Volume2, AlertCircle, Wifi, ShieldX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RoomEvent, DisconnectReason, Track, type RemoteTrack } from "livekit-client"
import {
  connectStudentSubscriber,
  attachRemoteTrackHandlers,
  shouldUseLiveKitViewer,
  type StudentSubscriberHandle,
} from "@/lib/live-classroom/student-subscriber"
import {
  bindMicrophonePermission,
  disableStudentMicrophone,
  enableStudentMicrophone,
  readRoomMicrophonePermission,
} from "@/lib/live-classroom/student-microphone"
import { isScreenShareRemoteTrack } from "@/lib/live-classroom/publisher-media"
import { useHeartbeat } from "@/lib/live-classroom/use-heartbeat"
import type { LiveSessionStatus } from "@/lib/live-classroom/types"

type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "error"

interface StudentLiveViewerProps {
  sessionId: string
  status: LiveSessionStatus
}

const QUALITY_LABELS: Record<string, string> = {
  excellent: "ممتازة",
  good: "متوسط",
  poor: "ضعيفة",
}

export function StudentLiveViewer({ sessionId, status }: StudentLiveViewerProps) {
  // LIVE-9A — عنصران دائمان في الـ DOM (لا إزاحة/تركيب شرطي يفقد الـ refs):
  // stage للعرض الرئيسي (شاشة المعلم إن وجدت وإلا الكاميرا) + صورة مصغرة للكاميرا.
  const stageRef = useRef<HTMLVideoElement>(null)
  const pipCamRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const [connection, setConnection] = useState<ConnectionState>("idle")
  // مسارات الفيديو البعيدة مُصنَّفة بالمصدر — الشاشة تتصدر والكاميرا ثانوية
  const [remoteCamTrack, setRemoteCamTrack] = useState<RemoteTrack | null>(null)
  const [remoteScreenTrack, setRemoteScreenTrack] = useState<RemoteTrack | null>(null)
  const [, setHasAudio] = useState(false)
  const [needsUnmute, setNeedsUnmute] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string>()
  const [quality, setQuality] = useState<"excellent" | "good" | "poor" | "unknown" | "lost">("unknown")
  // أول مسار بعيد يصل → الطالب يشاهد فعلاً (يُستخدم لتفعيل الحضور والنبضات)
  const [firstTrackArrived, setFirstTrackArrived] = useState(false)
  /**
   * LIVE-9C — أخرجه المعلم من الغرفة.
   *
   * السبب يأتي من خادم LiveKit نفسه (PARTICIPANT_REMOVED = نداء
   * RoomService.RemoveParticipant) فلا يُلبَس بانقطاع شبكة: لا زر «إعادة
   * المحاولة» بعده، لأن حالة "kicked" في قاعدة البيانات ترفض أي توكن جديد.
   */
  const [removedByHost, setRemovedByHost] = useState(false)

  /**
   * LIVE-9E — حالة الميكروفون.
   *
   * micGranted تُقرأ من صلاحيات المشارك المحلي في الغرفة، لا من حالة نضبطها
   * نحن. micOn تُشتق من أحداث النشر/إلغاء النشر لا من نية المستخدم: عندما يسحب
   * المعلم الصلاحية يُلغي الخادم نشر المسار، فيصل LocalTrackUnpublished
   * ويُطفأ الزر من تلقائه — بلا حاجة إلى إبلاغ من العميل.
   */
  const [micGranted, setMicGranted] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [micBusy, setMicBusy] = useState(false)
  const [micError, setMicError] = useState<string>()

  // retry داخلي — يعيد الاتصال دون إعادة تحميل الصفحة كاملة
  const [connectAttempt, setConnectAttempt] = useState(0)

  const handleRef = useRef<StudentSubscriberHandle | null>(null)
  const detachHandlersRef = useRef<(() => void) | null>(null)
  const detachMicRef = useRef<(() => void) | null>(null)
  const mountedRef = useRef(true)
  const firstTrackRef = useRef(false)

  const hasStage = Boolean(remoteCamTrack || remoteScreenTrack)

  // نبضات الحضور — نشطة فقط عند اتصال فعلي + وصول أول مسار + جلسة live
  useHeartbeat({ sessionId, active: firstTrackArrived && connection === "connected", sessionLive: status === "live" })

  const attachTrack = useCallback((track: RemoteTrack) => {
    if (track.kind === "video") {
      // التوجيه حسب مصدر النشر — لا افتراض بأن أي فيديو هو الكاميرا
      if (isScreenShareRemoteTrack(track)) {
        setRemoteScreenTrack(track)
      } else {
        setRemoteCamTrack(track)
      }
    } else if (track.kind === "audio") {
      const el = audioRef.current
      if (el) {
        track.attach(el)
        el.play().catch(() => {
          // حجب autoplay للمتصفح — ليس فشلاً في LiveKit؛ نعرض زر التشغيل
          if (mountedRef.current) setNeedsUnmute(true)
        })
      }
      setHasAudio(true)
    }
    if (!firstTrackRef.current) {
      firstTrackRef.current = true
      setFirstTrackArrived(true)
      // تسجيل الحضور عبر الـ endpoint الحالي عند أول مسار فعلي (idempotent server-side)
      fetch(`/api/live/${sessionId}/attend`, { method: "POST" }).catch(() => undefined)
    }
  }, [sessionId])

  // ─── الاتصال بالغرفة كمشاهد ───────────────────────────────────────────────
  useEffect(() => {
    if (!shouldUseLiveKitViewer(status, null)) return
    mountedRef.current = true

    async function connect() {
      setConnection("connecting")
      setErrorMsg(undefined)

      try {
        const handle = await connectStudentSubscriber(sessionId)
        if (!mountedRef.current) {
          handle.disconnect()
          return
        }
        handleRef.current = handle

        detachHandlersRef.current = attachRemoteTrackHandlers(handle.room, {
          onVideoTrack: attachTrack,
          onAudioTrack: attachTrack,
          onTrackRemoved: (track) => {
            track.detach()
            if (isScreenShareRemoteTrack(track)) {
              setRemoteScreenTrack((cur) => (cur === track ? null : cur))
            } else if (track.kind === "video") {
              setRemoteCamTrack((cur) => (cur === track ? null : cur))
            } else if (track.kind === "audio") {
              setHasAudio(false)
            }
            // توقف الفيديو ≠ انتهاء الجلسة — تبقى الحالة live من الـ polling
          },
          onParticipantLeft: () => {
            // مغادرة الناشر لا تعني انتهاء الجلسة
            setRemoteCamTrack(null)
            setRemoteScreenTrack(null)
            setHasAudio(false)
          },
        })

        handle.room.on(RoomEvent.Reconnecting, () => {
          if (!mountedRef.current) return
          setConnection("reconnecting")
          // لا نُبقي زر التحدث فعالاً أثناء انقطاع لا نعرف كيف ينتهي
          setMicGranted(false)
          setMicOn(false)
        })
        handle.room.on(RoomEvent.Reconnected, () => {
          if (!mountedRef.current) return
          setConnection("connected")
          // إعادة الاتصال = توكن بلا صلاحية نشر → المنع الافتراضي يعود
          setMicGranted(readRoomMicrophonePermission(handle.room))
          setMicOn(false)
        })
        handle.room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
          if (!mountedRef.current) return
          setMicGranted(false)
          setMicOn(false)
          // LIVE-9C — إخراج بقرار المعلم: حالة نهائية، ولا تُعالَج كإعادة اتصال
          if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
            setRemovedByHost(true)
            setRemoteCamTrack(null)
            setRemoteScreenTrack(null)
            setHasAudio(false)
            setConnection("disconnected")
            return
          }
          setConnection((c) => (c === "reconnecting" ? "reconnecting" : "disconnected"))
        })

        // LIVE-9E — حالة الزر تتبع النشر الفعلي، لا نية المستخدم
        handle.room.on(RoomEvent.LocalTrackPublished, (pub) => {
          if (mountedRef.current && pub.source === Track.Source.Microphone) {
            setMicOn(true)
          }
        })
        handle.room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
          if (mountedRef.current && pub.source === Track.Source.Microphone) {
            setMicOn(false)
          }
        })

        // LIVE-9E — الصلاحية الحالية ثم كل تغيّر لاحق عليها
        setMicGranted(readRoomMicrophonePermission(handle.room))
        detachMicRef.current = bindMicrophonePermission(handle.room, (granted) => {
          if (!mountedRef.current) return
          setMicGranted(granted)
          if (!granted) {
            setMicError(undefined)
            // الخادم ألغى النشر أصلاً؛ هذا تنظيف الجهاز المحلي
            void disableStudentMicrophone(handle.room)
          }
        })

        // جودة الاتصال — حدث على مستوى الغرفة يصدر عن الناشر البعيد
        handle.room.on(
          RoomEvent.ConnectionQualityChanged,
          (q: "excellent" | "good" | "poor" | "unknown" | "lost", participant?: unknown) => {
            if (participant) setQuality(q)
          }
        )

        setConnection("connected")

        // مسارات موجودة مسبقاً (الطالب دخل والمعلم ينشر بالفعل)
        for (const p of handle.room.remoteParticipants.values()) {
          for (const pub of p.trackPublications.values()) {
            const t = pub.track
            if (!t) continue
            attachTrack(t as RemoteTrack)
          }
        }
      } catch (err: unknown) {
        if (!mountedRef.current) return
        const msg = err instanceof Error ? err.message : String(err)
        if (msg === "STUDENT_TOKEN_UNAUTHORIZED") {
          setErrorMsg("غير مصرح لك بمشاهدة هذه الجلسة.")
          setConnection("error")
        } else if (msg === "STUDENT_TOKEN_ERROR") {
          setErrorMsg("تعذر الاتصال بالبث.")
          setConnection("disconnected")
        } else {
          setErrorMsg("تعذر الاتصال بالبث المباشر. جاري إعادة المحاولة...")
          setConnection("disconnected")
        }
      }
    }

    void connect()

    return () => {
      mountedRef.current = false
      detachHandlersRef.current?.()
      detachHandlersRef.current = null
      // LIVE-9E — إلغاء مستمع الصلاحيات قبل قطع الاتصال: الغرفة القديمة قد تُصدر
      // حدثاً أخيراً، ومستمع باقٍ على غرفة مهجورة تسريبٌ لا فائدة منه
      detachMicRef.current?.()
      detachMicRef.current = null
      // detach المسارات البعيدة قبل قطع الاتصال
      const handle = handleRef.current
      if (handle) {
        for (const p of handle.room.remoteParticipants.values()) {
          for (const pub of p.trackPublications.values()) {
            pub.track?.detach()
          }
        }
        handle.disconnect()
      }
      handleRef.current = null
    }
  }, [sessionId, status, connectAttempt, attachTrack])

  // ─── ربط عناصر العرض بعد التركيب/تغير المسارات ────────────────────────────
  // المرحلة الرئيسية: شاشة المعلم إن كانت نشطة، وإلا الكاميرا.
  useEffect(() => {
    const stageEl = stageRef.current
    const pipEl = pipCamRef.current
    if (!stageEl) return

    if (remoteScreenTrack) {
      remoteScreenTrack.attach(stageEl)
      void stageEl.play().catch(() => undefined)
    } else if (remoteCamTrack) {
      remoteCamTrack.attach(stageEl)
      void stageEl.play().catch(() => undefined)
    }

    // الصورة المصغرة تعرض الكاميرا فقط عندما تتصدر الشاشة
    if (pipEl) {
      if (remoteScreenTrack && remoteCamTrack) {
        remoteCamTrack.attach(pipEl)
        void pipEl.play().catch(() => undefined)
      } else {
        pipEl.srcObject = null
      }
    }

    return () => {
      if (remoteScreenTrack) remoteScreenTrack.detach(stageEl)
      if (remoteCamTrack) {
        remoteCamTrack.detach(stageEl)
        if (pipEl) remoteCamTrack.detach(pipEl)
      }
    }
  }, [remoteScreenTrack, remoteCamTrack])

  // ─── زر تشغيل الصوت عند حجب autoplay ──────────────────────────────────────
  const enableAudio = useCallback(() => {
    const el = audioRef.current
    if (el) {
      el.play()
        .then(() => setNeedsUnmute(false))
        .catch(() => undefined)
    }
  }, [])

  /**
   * LIVE-9E — تبديل ميكروفون الطالب.
   *
   * لا نضبط micOn عند النجاح: حدث LocalTrackPublished/Unpublished هو من يضبطه،
   * فتبقى الشاشة مطابقة للنشر الفعلي ولو ألغى الخادم المسار من طرفه.
   */
  const toggleMic = useCallback(async () => {
    const room = handleRef.current?.room
    if (!room) return
    setMicBusy(true)
    setMicError(undefined)
    try {
      if (micOn) {
        await disableStudentMicrophone(room)
      } else {
        const result = await enableStudentMicrophone(room)
        if (!result.ok) setMicError(result.message)
      }
    } finally {
      if (mountedRef.current) setMicBusy(false)
    }
  }, [micOn])

  // ─── retry داخلي بدون reload ───────────────────────────────────────────────
  const retryConnection = useCallback(() => {
    // LIVE-9C — الإخراج بقرار المعلم لا يُعاد منه المحاولة (السيرفر يرفض التوكن)
    if (removedByHost) return
    firstTrackRef.current = false
    setFirstTrackArrived(false)
    setRemoteCamTrack(null)
    setRemoteScreenTrack(null)
    setConnectAttempt((n) => n + 1)
  }, [removedByHost])

  // ─── عدم استخدام المشاهد خارج جلسة LiveKit مباشرة ─────────────────────────
  if (!shouldUseLiveKitViewer(status, null)) return null

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border-2 border-slate-200 bg-black shadow-xl">
      {/* منطقة الفيديو */}
      <div className="relative aspect-video w-full bg-slate-950">
        {/* الصوت البعيد — عنصر مخفي دائمًا (المشاهد لا يرسل صوتًا) */}
        <audio ref={audioRef} autoPlay playsInline className="hidden" />

        {/* LIVE-9A — عنصرا عرض دائمان (لا تركيب شرطي يفقد الـ refs):
            المرحلة = شاشة المعلم إن نشطة وإلا الكاميرا؛ الصورة المصغرة = الكاميرا أثناء مشاركة الشاشة */}
        <video ref={stageRef} className={`h-full w-full object-contain ${hasStage ? "" : "invisible absolute"}`} autoPlay playsInline />

        {remoteScreenTrack && remoteCamTrack && (
          <div className="absolute bottom-3 right-3 z-20 h-[22%] max-h-28 w-[32%] overflow-hidden rounded-lg border border-white/30 bg-slate-900 shadow-lg">
            <video
              ref={pipCamRef}
              className="h-full w-full object-cover scale-x-[-1]"
              autoPlay
              playsInline
            />
          </div>
        )}

        {!hasStage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-slate-400">
            {removedByHost ? (
              <>
                <ShieldX className="mb-3 h-12 w-12 text-rose-500" />
                <p className="text-sm font-black text-rose-400">
                  تم إخراجك من الجلسة بواسطة المعلم
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  لا يمكنك العودة حتى يعيد المعلم قبولك.
                </p>
              </>
            ) : connection === "connecting" ? (
              <>
                <Loader2 className="mb-3 h-12 w-12 animate-spin text-blue-500" />
                <p className="text-sm font-black">جاري الاتصال...</p>
              </>
            ) : connection === "reconnecting" ? (
              <>
                <Loader2 className="mb-3 h-12 w-12 animate-spin text-amber-500" />
                <p className="text-sm font-black">جاري إعادة الاتصال...</p>
              </>
            ) : errorMsg ? (
              <>
                <AlertCircle className="mb-3 h-12 w-12 text-rose-500" />
                <p className="text-sm font-bold text-rose-400">{errorMsg}</p>
                {connection === "disconnected" && (
                  <Button variant="outline" size="sm" onClick={retryConnection} className="mt-4">
                    إعادة المحاولة
                  </Button>
                )}
              </>
            ) : connection === "disconnected" ? (
              <>
                <AlertCircle className="mb-3 h-12 w-12 text-slate-500" />
                <p className="text-sm font-bold">الاتصال منقطع</p>
                <Button variant="outline" size="sm" onClick={retryConnection} className="mt-4">
                  إعادة المحاولة
                </Button>
              </>
            ) : (
              <>
                <MonitorPlay className="mb-3 h-12 w-12 text-slate-600" />
                <p className="text-sm font-bold">جاري انتظار المعلم لبدء إرسال البث...</p>
              </>
            )}
          </div>
        )}

        {/* شارة الحالة المباشرة */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          {/* مؤشر جودة الشبكة */}
          {quality !== "unknown" && hasStage && (
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold shadow-md ${
                quality === "excellent"
                  ? "bg-green-600/90 text-white"
                  : quality === "good"
                    ? "bg-amber-500/90 text-white"
                    : "bg-rose-600/90 text-white"
              }`}
            >
              <Wifi className="h-3 w-3" />
              {QUALITY_LABELS[quality] ?? ""}
            </span>
          )}
          {/* LIVE-9A — شارة «يشارك شاشة» عندما تتصدر الشاشة */}
          {remoteScreenTrack ? (
            <span className="flex items-center gap-1.5 rounded-full bg-blue-600 px-2.5 py-1 text-xs font-black text-white shadow-md">
              <MonitorUp className="h-3 w-3" />
              يشارك الشاشة الآن
            </span>
          ) : null}
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black shadow-md ${
              hasStage ? "bg-rose-600 text-white animate-pulse" : "bg-slate-800 text-slate-300"
            }`}
          >
            {hasStage && <Radio className="h-3 w-3" />}
            {hasStage ? "مباشر الآن" : "بانتظار البث"}
          </span>
        </div>

        {/* مؤشرات حالة الاتصال السفلية */}
        {connection === "connected" && hasStage && (
          <div className="absolute bottom-3 left-3 z-10">
            <span className="rounded-full bg-green-600/90 px-2.5 py-1 text-[11px] font-bold text-white shadow-md">
              متصل
            </span>
          </div>
        )}
        {connection === "reconnecting" && (
          <div className="absolute bottom-3 left-3 z-10">
            <span className="rounded-full bg-amber-500/90 px-2.5 py-1 text-[11px] font-bold text-white shadow-md">
              جاري إعادة الاتصال...
            </span>
          </div>
        )}
      </div>

      {/* LIVE-9E — شريط التحدث: يظهر بظهور الصلاحية ويختفي بسحبها.
          لا زر كاميرا ولا مشاركة شاشة ولا نشر بيانات — الطالب ناشر صوت فقط. */}
      {micGranted && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-4 py-3">
          <p className="text-[11px] font-bold text-slate-300" aria-live="polite">
            {micOn ? "ميكروفونك مفتوح — الجميع يسمعك" : "منحك المعلم صلاحية التحدث"}
          </p>
          <Button
            variant={micOn ? "danger" : "outline"}
            size="sm"
            onClick={() => void toggleMic()}
            disabled={micBusy}
            className="flex items-center gap-1.5"
          >
            {micBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : micOn ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            {micOn ? "إيقاف الميكروفون" : "تشغيل الميكروفون"}
          </Button>
        </div>
      )}

      {micError && (
        <p
          className="flex items-center gap-1.5 bg-rose-950 px-4 py-2 text-[11px] font-bold text-rose-300"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {micError}
        </p>
      )}

      {/* زر تفعيل الصوت عند حجب المتصفح للتشغيل التلقائي */}
      {needsUnmute && (
        <button
          onClick={enableAudio}
          className="flex w-full items-center justify-center gap-2 bg-amber-500 py-3 text-sm font-black text-white transition-colors hover:bg-amber-600"
        >
          <Volume2 className="h-4.5 w-4.5" />
          اضغط لتشغيل الصوت
        </button>
      )}
    </div>
  )
}
