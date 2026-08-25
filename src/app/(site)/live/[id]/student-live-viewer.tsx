"use client"

// LIVE-8C — Student LiveKit Viewer
// مشاهد فقط: لا كاميرا، لا ميكروفون، لا إنشاء مسارات محلية إطلاقاً.

import { useEffect, useRef, useState, useCallback } from "react"
import { Radio, Loader2, MonitorPlay, Volume2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RoomEvent } from "livekit-client"
import {
  connectStudentSubscriber,
  attachRemoteTrackHandlers,
  shouldUseLiveKitViewer,
  type StudentSubscriberHandle,
} from "@/lib/live-classroom/student-subscriber"
import type { LiveSessionStatus } from "@/lib/live-classroom/types"

type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "error"

interface StudentLiveViewerProps {
  sessionId: string
  status: LiveSessionStatus
}

export function StudentLiveViewer({ sessionId, status }: StudentLiveViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const [connection, setConnection] = useState<ConnectionState>("idle")
  const [hasVideo, setHasVideo] = useState(false)
  const [, setHasAudio] = useState(false)
  const [needsUnmute, setNeedsUnmute] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string>()
  // أول مسار بعيد يصل → الطالب يشاهد فعلاً (يُستخدم لتفعيل الحضور)
  const [firstTrackArrived, setFirstTrackArrived] = useState(false)

  const handleRef = useRef<StudentSubscriberHandle | null>(null)
  const detachHandlersRef = useRef<(() => void) | null>(null)
  const mountedRef = useRef(true)
  const firstTrackRef = useRef(false)

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
          // المكون فُكّ تركيبه أثناء الاتصال — نظّف فوراً
          handle.disconnect()
          return
        }
        handleRef.current = handle

        detachHandlersRef.current = attachRemoteTrackHandlers(handle.room, {
          onVideoTrack: (track) => {
            if (!mountedRef.current) return
            const el = videoRef.current
            if (el) {
              track.attach(el)
              el.play().catch(() => undefined)
            }
            setHasVideo(true)
            if (!firstTrackRef.current) {
              firstTrackRef.current = true
              setFirstTrackArrived(true)
            }
          },
          onAudioTrack: (track) => {
            if (!mountedRef.current) return
            const el = audioRef.current
            if (el) {
              track.attach(el)
              el.play().catch(() => {
                // حجب autoplay للمتصفح — ليس فشلاً في LiveKit؛ نعرض زر التشغيل
                if (mountedRef.current) setNeedsUnmute(true)
              })
            }
            setHasAudio(true)
            if (!firstTrackRef.current) {
              firstTrackRef.current = true
              setFirstTrackArrived(true)
            }
          },
          onTrackRemoved: (track) => {
            track.detach()
            if (track.kind === "video") setHasVideo(false)
            if (track.kind === "audio") setHasAudio(false)
            // توقف الفيديو ≠ انتهاء الجلسة — تبقى الحالة live من الـ polling
          },
          onParticipantLeft: () => {
            // مغادرة الناشر لا تعني انتهاء الجلسة
            setHasVideo(false)
            setHasAudio(false)
          },
        })

        handle.room.on(RoomEvent.Reconnecting, () => {
          if (mountedRef.current) setConnection("reconnecting")
        })
        handle.room.on(RoomEvent.Reconnected, () => {
          if (mountedRef.current) setConnection("connected")
        })
        handle.room.on(RoomEvent.Disconnected, () => {
          if (!mountedRef.current) return
          setConnection((c) => (c === "reconnecting" ? "reconnecting" : "disconnected"))
        })

        setConnection("connected")

        // مسارات موجودة مسبقاً (الطالب دخل والمعلم ينشر بالفعل)
        for (const p of handle.room.remoteParticipants.values()) {
          for (const pub of p.trackPublications.values()) {
            const t = pub.track
            if (!t) continue
            if (t.kind === "video") {
              const vEl = videoRef.current
              if (vEl) {
                t.attach(vEl)
                vEl.play().catch(() => undefined)
                setHasVideo(true)
                firstTrackRef.current = true
                setFirstTrackArrived(true)
              }
            }
            if (t.kind === "audio") {
              const aEl = audioRef.current
              if (aEl) {
                t.attach(aEl)
                aEl.play().catch(() => {
                  if (mountedRef.current) setNeedsUnmute(true)
                })
                setHasAudio(true)
                firstTrackRef.current = true
                setFirstTrackArrived(true)
              }
            }
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
  }, [sessionId, status])

  // ─── زر تشغيل الصوت عند حجب autoplay ──────────────────────────────────────
  const enableAudio = useCallback(() => {
    const el = audioRef.current
    if (el) {
      el.play()
        .then(() => setNeedsUnmute(false))
        .catch(() => undefined)
    }
  }, [])

  // ─── عدم استخدام المشاهد خارج جلسة LiveKit مباشرة ─────────────────────────
  if (!shouldUseLiveKitViewer(status, null)) return null

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border-2 border-slate-200 bg-black shadow-xl">
      {/* منطقة الفيديو */}
      <div className="relative aspect-video w-full bg-slate-950">
        {/* الصوت البعيد — عنصر مخفي دائمًا (المشاهد لا يرسل صوتًا) */}
        <audio ref={audioRef} autoPlay playsInline className="hidden" />

        {hasVideo ? (
          <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-center text-slate-400">
            {connection === "connecting" ? (
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.reload()}
                    className="mt-4"
                  >
                    إعادة المحاولة
                  </Button>
                )}
              </>
            ) : connection === "disconnected" ? (
              <>
                <AlertCircle className="mb-3 h-12 w-12 text-slate-500" />
                <p className="text-sm font-bold">الاتصال منقطع</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.reload()}
                  className="mt-4"
                >
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
        <div className="absolute top-3 right-3 z-10">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black shadow-md ${
              hasVideo ? "bg-rose-600 text-white animate-pulse" : "bg-slate-800 text-slate-300"
            }`}
          >
            {hasVideo && <Radio className="h-3 w-3" />}
            {hasVideo ? "مباشر الآن" : "بانتظار البث"}
          </span>
        </div>

        {/* مؤشرات حالة الاتصال السفلية */}
        {connection === "connected" && hasVideo && (
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

      {/* hook marker يُستخدم في الاختبارات — غير مرئي للمستخدم */}
      <AttendanceTrigger sessionId={sessionId} active={firstTrackArrived} />
    </div>
  )
}

/**
 * يسجل الحضور عبر الـ endpoint الحالي عندما يصل أول مسار بعيد فعلي.
 * لا heartbeat هنا (LIVE-8D) — استدعاء واحد فقط، والـ route نفسه يتحقق server-side.
 */
function AttendanceTrigger({ sessionId, active }: { sessionId: string; active: boolean }) {
  useEffect(() => {
    if (!active) return
    let cancelled = false
    fetch(`/api/live/${sessionId}/attend`, { method: "POST" }).catch(() => {
      if (!cancelled) void 0
    })
    return () => {
      cancelled = true
    }
  }, [sessionId, active])

  return null
}
