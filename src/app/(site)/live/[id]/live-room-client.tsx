"use client"

import { useEffect, useState, useTransition, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  CalendarClock,
  Radio,
  Video,
  XCircle,
  AlertCircle,
  Play,
  Square,
  Ban,
  Loader2,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/utils"
import { updateLiveSessionStatusAction } from "@/app/actions/teacher-live"
import { BookingPanel } from "./booking-form"
import { LiveCountdown } from "./live-countdown"
import type { LiveSessionStatus } from "@/lib/live-classroom/types"
import { Room, RoomEvent, VideoPresets, createLocalTracks, LocalVideoTrack } from "livekit-client"

interface LiveRoomClientProps {
  sessionId: string
  initialStatus: LiveSessionStatus
  title: string
  description: string | null
  price: number
  isFree: boolean
  userWallet: number
  hasBooking: boolean
  isManager: boolean
  teacherName: string
  courseName: string | null
  startAt: string
  durationMinutes: number
}

export function LiveRoomClient({
  sessionId,
  initialStatus,
  title,
  description,
  price,
  isFree,
  userWallet,
  hasBooking,
  isManager,
  teacherName,
  courseName,
  startAt,
  durationMinutes,
}: LiveRoomClientProps) {
  const router = useRouter()
  const [status, setStatus] = useState<LiveSessionStatus>(initialStatus)
  const [isLiveTime, setIsLiveTime] = useState(false)
  const [isPastTime, setIsPastTime] = useState(false)
  const [canWatch, setCanWatch] = useState(!(!isFree && price > 0) || hasBooking || isManager)
  const [attended, setAttended] = useState(false)
  const [url, setUrl] = useState("")
  const [pollingError, setPollingError] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string>()

  // ─── LiveKit State ────────────────────────────────────────────────────────
  const [room, setRoom] = useState<Room | null>(null)
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected" | "reconnecting"
  >("disconnected")
  const [mediaError, setMediaError] = useState<string>()
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [micEnabled, setMicEnabled] = useState(true)
  const [localVideoTrack, setLocalVideoTrack] = useState<LocalVideoTrack | null>(null)
  const [hasLeft, setHasLeft] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)

  // 1. Polling لجلب الحالة بشكل مستمر وخفيف (كل 6 ثوانٍ)
  useEffect(() => {
    let active = true

    async function checkStatus() {
      try {
        const res = await fetch(`/api/live/${sessionId}/status`)
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            router.push("/")
            return
          }
          throw new Error("fail")
        }
        const data = await res.json()
        if (active) {
          setStatus(data.status)
          setIsLiveTime(data.isLive)
          setIsPastTime(data.isPast)
          setCanWatch(data.canWatch)
          setAttended(data.attended)
          setUrl(data.url || "")
          setPollingError(false)
        }
      } catch {
        if (active) setPollingError(true)
      }
    }

    // تشغيل فوري ثم تكرار
    void checkStatus()
    const timer = setInterval(checkStatus, 6000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [sessionId, router])

  // 2. تسجيل الحضور تلقائياً عندما تكون الحالة "live"
  useEffect(() => {
    if (status !== "live" || attended || isManager) return

    let active = true
    async function markAttendance() {
      try {
        const res = await fetch(`/api/live/${sessionId}/attend`, { method: "POST" })
        if (res.ok && active) {
          setAttended(true)
        }
      } catch (err) {
        console.error("Attendance error:", err)
      }
    }

    void markAttendance()
    return () => {
      active = false
    }
  }, [status, attended, sessionId, isManager])

  // 3. دالة تغيير حالة الجلسة (للمعلم والأدمن)
  const handleStatusTransition = async (target: LiveSessionStatus) => {
    setActionError(undefined)
    const fd = new FormData()
    fd.set("id", sessionId)
    fd.set("status", target)

    startTransition(async () => {
      const res = await updateLiveSessionStatusAction({ ok: false }, fd)
      if (res.ok) {
        setStatus(target)
        router.refresh()
      } else {
        setActionError(res.error || "فشل تغيير الحالة")
      }
    })
  }

  // ─── LiveKit Publishing Flow ──────────────────────────────────────────────
  const startLiveKitPublishing = useCallback(async () => {
    setActionError(undefined)
    setMediaError(undefined)
    setConnectionState("connecting")
    setHasLeft(false)

    let activeRoom: Room | null = null

    try {
      // 1. Fetch token
      const tokenRes = await fetch(`/api/live/${sessionId}/token`)
      if (!tokenRes.ok) {
        if (tokenRes.status === 401 || tokenRes.status === 403) {
          throw new Error("TOKEN_ERROR_AUTH")
        }
        throw new Error("TOKEN_ERROR")
      }
      const tokenData = await tokenRes.json()
      const { token, url: serverLivekitUrl } = tokenData

      if (!token || !serverLivekitUrl) {
        throw new Error("TOKEN_ERROR_MISSING")
      }

      // 2. Initialize Room
      const r = new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: {
          simulcast: true,
        },
      })
      activeRoom = r
      setRoom(r)

      // Listeners
      r.on(RoomEvent.Connected, () => setConnectionState("connected"))
      r.on(RoomEvent.Disconnected, () => {
        setConnectionState("disconnected")
        setLocalVideoTrack(null)
      })
      r.on(RoomEvent.Reconnecting, () => setConnectionState("reconnecting"))
      r.on(RoomEvent.Reconnected, () => setConnectionState("connected"))

      // 3. Connect to LiveKit Room
      await r.connect(serverLivekitUrl, token)

      // 4. Request camera/mic and publish tracks
      const tracks = await createLocalTracks({
        audio: true,
        video: {
          resolution: VideoPresets.h720.resolution,
        },
      }).catch((err) => {
        const errName = err?.name || err?.toString() || ""
        if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
          throw new Error("MEDIA_PERMISSION_DENIED")
        } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
          throw new Error("MEDIA_DEVICE_NOT_FOUND")
        } else if (errName === "NotReadableError" || errName === "TrackStartError") {
          throw new Error("MEDIA_DEVICE_IN_USE")
        } else {
          throw new Error("MEDIA_PERMISSION_ERROR")
        }
      })

      // Find local video track for preview
      const videoTrack = tracks.find((t) => t.kind === "video")
      if (videoTrack instanceof LocalVideoTrack) {
        setLocalVideoTrack(videoTrack)
      }

      // Publish tracks
      for (const track of tracks) {
        await r.localParticipant.publishTrack(track)
      }

      // 5. Update session status to live (if currently in scheduled or waiting)
      if (status === "scheduled" || status === "waiting") {
        const fd = new FormData()
        fd.set("id", sessionId)
        fd.set("status", "live")

        const res = await updateLiveSessionStatusAction({ ok: false }, fd)
        if (!res.ok) {
          r.disconnect()
          throw new Error("SESSION_STATE_ERROR")
        }
        setStatus("live")
        router.refresh()
      }
    } catch (err: unknown) {
      console.error("[LIVEKIT_PUBLISH_FAIL]", err)
      if (activeRoom) {
        activeRoom.disconnect()
      }
      setRoom(null)
      setConnectionState("disconnected")
      setLocalVideoTrack(null)

      const errMsg = err instanceof Error ? err.message : String(err)
      if (errMsg === "TOKEN_ERROR_AUTH") {
        setActionError("غير مصرح لك ببدء البث لهذه الجلسة.")
      } else if (errMsg === "TOKEN_ERROR" || errMsg === "TOKEN_ERROR_MISSING") {
        setActionError("فشل الحصول على رمز الاتصال بخادم البث.")
      } else if (errMsg === "MEDIA_PERMISSION_DENIED") {
        setMediaError("اسمح للمتصفح باستخدام الكاميرا والميكروفون لبدء البث.")
        setActionError("يرجى تفعيل إذن الوصول للكاميرا والميكروفون.")
      } else if (errMsg === "MEDIA_DEVICE_NOT_FOUND") {
        setMediaError("لم يتم العثور على كاميرا أو ميكروفون متصل بالجهاز.")
        setActionError("لم يتم العثور على أجهزة التقاط الصوت/الصورة.")
      } else if (errMsg === "MEDIA_DEVICE_IN_USE") {
        setMediaError("الكاميرا أو الميكروفون قيد الاستخدام من قِبل برنامج آخر.")
        setActionError("الأجهزة قيد الاستخدام حالياً.")
      } else if (errMsg === "SESSION_STATE_ERROR") {
        setActionError("فشل تحديث حالة البث في قاعدة البيانات.")
      } else {
        setActionError("فشل الاتصال بخدمة البث المباشر. يرجى المحاولة مرة أخرى.")
      }
    }
  }, [sessionId, status, router])

  const toggleCamera = async () => {
    if (!room) return
    const enabled = !cameraEnabled
    setCameraEnabled(enabled)
    await room.localParticipant.setCameraEnabled(enabled)
  }

  const toggleMicrophone = async () => {
    if (!room) return
    const enabled = !micEnabled
    setMicEnabled(enabled)
    await room.localParticipant.setMicrophoneEnabled(enabled)
  }

  const leaveRoom = () => {
    setHasLeft(true)
    if (room) {
      room.disconnect()
    }
    setRoom(null)
    setConnectionState("disconnected")
    setLocalVideoTrack(null)
  }

  const endLiveSession = async () => {
    if (!room) return
    setActionError(undefined)

    startTransition(async () => {
      // 1. stop publishing
      await room.localParticipant.setCameraEnabled(false)
      await room.localParticipant.setMicrophoneEnabled(false)

      // 2. update DB to ended
      const fd = new FormData()
      fd.set("id", sessionId)
      fd.set("status", "ended")

      const res = await updateLiveSessionStatusAction({ ok: false }, fd)
      if (res.ok) {
        // 3. disconnect on success
        room.disconnect()
        setRoom(null)
        setConnectionState("disconnected")
        setLocalVideoTrack(null)
        setStatus("ended")
        router.refresh()
      } else {
        // restore track states on database failure
        await room.localParticipant.setCameraEnabled(cameraEnabled)
        await room.localParticipant.setMicrophoneEnabled(micEnabled)
        setActionError(res.error || "فشل إنهاء البث في قاعدة البيانات")
      }
    })
  }

  // Auto-connect if session is live and teacher refreshed/loaded the page
  useEffect(() => {
    if (status === "live" && isManager && !url && !room && !hasLeft) {
      const t = setTimeout(() => {
        void startLiveKitPublishing()
      }, 0)
      return () => clearTimeout(t)
    }
  }, [status, isManager, url, room, hasLeft, startLiveKitPublishing])

  // Attach local video track to preview element
  useEffect(() => {
    const videoElem = videoRef.current
    if (localVideoTrack && videoElem) {
      localVideoTrack.attach(videoElem)
      return () => {
        localVideoTrack.detach(videoElem)
      }
    }
  }, [localVideoTrack])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (room) {
        room.disconnect()
      }
    }
  }, [room])

  // معالجة يوتيوب المدمج
  const getEmbedUrl = (raw: string) => {
    if (!raw) return null
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
    const match = raw.match(regExp)
    const id = match && match[2].length === 11 ? match[2] : null
    return id ? `https://www.youtube.com/embed/${id}` : null
  }

  const embedUrl = getEmbedUrl(url)
  const isEmbeddable = Boolean(embedUrl)

  const startDate = new Date(startAt)
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* التنبيهات والأخطاء */}
      {pollingError && (
        <div className="mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-600 font-bold flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          فشل الاتصال بالخادم — جاري محاولة إعادة الاتصال تلقائياً...
        </div>
      )}
      {actionError && (
        <div className="mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-600 font-bold flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(undefined)}
            className="text-slate-400 hover:text-slate-500"
          >
            ✕
          </button>
        </div>
      )}

      {/* لوحة تحكم المعلم (Teacher Controls) */}
      {isManager && (
        <div className="mb-6 rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-black text-navy mb-3">
            لوحة التحكم بالبث المباشر (المعلم)
          </h3>
          <div className="flex flex-wrap gap-2">
            {status === "scheduled" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusTransition("waiting")}
                disabled={isPending}
                className="flex items-center gap-1.5 text-blue-600 border-blue-200 bg-blue-50/50 hover:bg-blue-50"
              >
                {isPending ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <Play className="h-4.5 w-4.5" />
                )}
                بدء وضع الانتظار (Waiting)
              </Button>
            )}

            {(status === "scheduled" || status === "waiting") && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  if (!url) {
                    void startLiveKitPublishing()
                  } else {
                    void handleStatusTransition("live")
                  }
                }}
                disabled={isPending || connectionState === "connecting"}
                className="flex items-center gap-1.5"
              >
                {isPending || connectionState === "connecting" ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <Radio className="h-4.5 w-4.5" />
                )}
                بدء البث المباشر (Live)
              </Button>
            )}

            {status === "live" && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (room) {
                    void endLiveSession()
                  } else {
                    void handleStatusTransition("ended")
                  }
                }}
                disabled={isPending}
                className="flex items-center gap-1.5"
              >
                {isPending ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <Square className="h-4.5 w-4.5" />
                )}
                إنهاء البث (End Session)
              </Button>
            )}

            {(status === "scheduled" || status === "waiting") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusTransition("cancelled")}
                disabled={isPending}
                className="flex items-center gap-1.5 text-rose-600 border-rose-200 bg-rose-50/50 hover:bg-rose-50"
              >
                {isPending ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <Ban className="h-4.5 w-4.5" />
                )}
                إلغاء الجلسة (Cancel)
              </Button>
            )}

            {status === "ended" && (
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
                تم إنهاء الجلسة بالكامل.
              </span>
            )}
            {status === "cancelled" && (
              <span className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg">
                تم إلغاء هذه الجلسة.
              </span>
            )}
          </div>
        </div>
      )}

      {/* LiveKit Publisher View (Teacher only) */}
      {isManager && !url && room && (
        <div className="mb-6 rounded-2xl border-2 border-slate-200 bg-black p-4 shadow-sm relative overflow-hidden">
          <div className="aspect-video w-full bg-slate-900 rounded-xl relative flex items-center justify-center overflow-hidden">
            {localVideoTrack && cameraEnabled ? (
              <video
                ref={videoRef}
                className="w-full h-full object-cover scale-x-[-1]"
                autoPlay
                playsInline
                muted
              />
            ) : (
              <div className="text-center text-slate-400">
                <Video className="h-12 w-12 mx-auto mb-2 text-slate-600" />
                <p className="text-sm font-bold">الكاميرا متوقفة</p>
              </div>
            )}

            {/* Connection Status Badge overlay */}
            <div className="absolute top-4 right-4 z-10">
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-black flex items-center gap-1.5 shadow-md ${
                  connectionState === "connected"
                    ? "bg-green-500 text-white"
                    : connectionState === "connecting"
                      ? "bg-blue-500 text-white animate-pulse"
                      : connectionState === "reconnecting"
                        ? "bg-amber-500 text-white animate-pulse"
                        : "bg-red-500 text-white"
                }`}
              >
                {connectionState === "connected" && "متصل"}
                {connectionState === "connecting" && "جاري الاتصال..."}
                {connectionState === "reconnecting" && "جاري إعادة الاتصال..."}
                {connectionState === "disconnected" && "منقطع"}
              </span>
            </div>

            {/* Audio Indicator Overlay */}
            {!micEnabled && (
              <div className="absolute bottom-4 left-4 bg-black/60 text-rose-500 px-3 py-1.5 rounded-lg text-xs font-bold shadow-md">
                الميكروفون مكتوم
              </div>
            )}
          </div>

          {/* Media Errors */}
          {mediaError && (
            <div className="mt-3 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-600 font-bold">
              {mediaError}
            </div>
          )}

          {/* Publisher Buttons */}
          <div className="mt-4 flex flex-wrap gap-2 justify-between items-center bg-slate-900 p-3 rounded-xl">
            <div className="flex gap-2">
              <Button
                variant={cameraEnabled ? "outline" : "danger"}
                size="sm"
                onClick={toggleCamera}
                disabled={connectionState === "connecting"}
                aria-label={cameraEnabled ? "إيقاف الكاميرا" : "تشغيل الكاميرا"}
              >
                {cameraEnabled ? "إيقاف الكاميرا" : "تشغيل الكاميرا"}
              </Button>
              <Button
                variant={micEnabled ? "outline" : "danger"}
                size="sm"
                onClick={toggleMicrophone}
                disabled={connectionState === "connecting"}
                aria-label={micEnabled ? "كتم الميكروفون" : "تفعيل الميكروفون"}
              >
                {micEnabled ? "كتم الميكروفون" : "تفعيل الميكروفون"}
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={leaveRoom}
                className="text-slate-300 border-slate-700 hover:bg-slate-800"
                aria-label="مغادرة الغرفة"
              >
                مغادرة الغرفة
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={endLiveSession}
                disabled={isPending}
                className="bg-rose-600 hover:bg-rose-700"
                aria-label="إنهاء البث"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "إنهاء البث"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* الرأس وتفاصيل الجلسة */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-navy">{title}</h1>
          {status === "live" && isPastTime && (
            <p className="text-xs text-rose-600 font-bold mt-1">
              تجاوزت الجلسة وقتها الزمني المحدد
            </p>
          )}
          {status === "live" && isLiveTime && !isPastTime && (
            <p className="text-xs text-green-600 font-bold mt-1">
              وقت الجلسة الفعلي جاري الآن
            </p>
          )}
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black ${
            status === "live"
              ? "bg-rose-50 text-rose-600 animate-pulse"
              : status === "waiting"
                ? "bg-blue-50 text-blue-600 animate-pulse"
                : status === "ended"
                  ? "bg-slate-100 text-slate-500"
                  : status === "cancelled"
                    ? "bg-rose-100 text-rose-600"
                    : "bg-amber-50 text-amber-700"
          }`}
        >
          {status === "live" ? (
            <>
              <Radio className="h-3.5 w-3.5" /> مباشر الآن
            </>
          ) : status === "waiting" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> المعلم يستعد...
            </>
          ) : status === "ended" ? (
            "انتهى البث"
          ) : status === "cancelled" ? (
            "تم الإلغاء"
          ) : (
            <>
              <CalendarClock className="h-3.5 w-3.5" /> لم يبدأ بعد
            </>
          )}
        </span>
      </div>

      {description && <p className="mb-6 leading-8 text-slate-600">{description}</p>}

      {/* لوحة الحجز والدفع للطلاب */}
      {!isFree && price > 0 && !isManager && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <span className="text-2xl font-black text-amber-600">{formatPrice(price)}</span>
          <span className="text-sm font-bold text-amber-800">
            {canWatch
              ? "تكلفة الحصة — تم الحجز بنجاح"
              : "تكلفة الحصة — يلزم حجزها لحضور البث"}
          </span>
        </div>
      )}

      {!isFree && price > 0 && !isManager && (
        <div className="mb-6">
          <BookingPanel
            sessionId={sessionId}
            title={title}
            price={price}
            wallet={userWallet}
            booked={hasBooking}
          />
        </div>
      )}

      {/* ============================= عرض الـ Shell حسب حالة البث ============================= */}

      {/* حالة 1: تم الإلغاء (Cancelled) */}
      {status === "cancelled" && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
          <XCircle className="mx-auto h-12 w-12 text-rose-500 mb-3" />
          <h3 className="text-lg font-black text-navy mb-1">تم إلغاء هذه الحصة</h3>
          <p className="text-sm text-rose-800">
            نعتذر، لقد قام المعلم بإلغاء جلسة البث المباشر هذه.
          </p>
        </div>
      )}

      {/* حالة 2: انتهى البث (Ended) */}
      {status === "ended" && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
          <Video className="mx-auto h-12 w-12 text-slate-400 mb-3" />
          <h3 className="text-lg font-black text-navy mb-1">انتهت الحصة المباشرة</h3>
          <p className="text-sm text-slate-500">
            شكراً لمتابعتكم، انتهى البث المباشر لهذه الحصة.
          </p>
        </div>
      )}

      {/* حالة 3: الانتظار والاستعداد (Waiting) */}
      {status === "waiting" && canWatch && (
        <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-8 text-center animate-pulse">
          <Loader2 className="mx-auto h-12 w-12 text-blue-500 mb-3 animate-spin" />
          <h3 className="text-lg font-black text-navy mb-1">المعلم يستعد للبث المباشر</h3>
          <p className="text-sm text-blue-800">
            قاعة الانتظار مفتوحة. يرجى البقاء في هذه الصفحة، سيبدأ البث فوراً...
          </p>
        </div>
      )}

      {/* حالة 4: لم يبدأ بعد (Scheduled) */}
      {status === "scheduled" && canWatch && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <LiveCountdown
            start={startDate.getTime()}
            end={endDate.getTime()}
            kind={!url ? "none" : isEmbeddable ? "embed" : "link"}
          />
        </div>
      )}

      {/* حالة 5: البث مباشر (Live) */}
      {status === "live" && canWatch && (
        <>
          {/* مشغل الفيديو المدمج (يوتيوب) */}
          {embedUrl && (
            <div className="mb-6 overflow-hidden rounded-2xl bg-black shadow-xl">
              <iframe
                src={embedUrl}
                className="aspect-video w-full"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                title={title}
              />
            </div>
          )}

          {/* روابط البث الخارجي (Zoom / Meet) */}
          {url && !isEmbeddable && (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <p className="mb-1 text-sm font-black text-navy">
                جلسة عبر{" "}
                {url.includes("zoom.us")
                  ? "Zoom"
                  : url.includes("meet.google")
                    ? "Google Meet"
                    : "رابط خارجي"}
              </p>
              <p className="mb-4 text-xs text-slate-500">
                يفتح البث في تطبيق أو نافذة خارجية.
              </p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-6 py-3 text-sm font-black text-white hover:opacity-90 transition-opacity"
              >
                <Radio className="h-4 w-4 animate-pulse" />
                انضم للبث المباشر الآن
              </a>
              <p className="mt-3 break-all text-[11px] text-slate-400" dir="ltr">
                {url}
              </p>
            </div>
          )}

          {/* بدون روابط مضافة بعد */}
          {!url && (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
              <Radio className="mx-auto h-12 w-12 text-rose-500 mb-3 animate-pulse" />
              <h3 className="text-lg font-black text-navy mb-1">البث المباشر بدأ</h3>
              <p className="text-sm text-slate-500">
                {isManager
                  ? "البث المباشر يعمل حالياً. يمكنك التحكم فيه باستخدام لوحة المعلم أعلاه."
                  : "يرجى الانتظار، لم يقم المعلم ببدء إرسال البث بعد."}
              </p>
            </div>
          )}
        </>
      )}

      {/* تفاصيل المعلم وتسجيل الحضور */}
      <div className="mb-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs text-slate-400">المدرس</p>
          <p className="font-black text-navy">{teacherName}</p>
          {courseName && (
            <p className="text-xs text-slate-500 mt-0.5">كورس: {courseName}</p>
          )}
        </div>
        {canWatch && !isManager && (
          <div>
            {attended ? (
              <span className="flex items-center gap-1.5 text-sm font-black text-mint-dark">
                <CheckCircle2 className="h-4.5 w-4.5" /> تم تسجيل حضورك
              </span>
            ) : status === "live" ? (
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-500">
                <Loader2 className="h-4.5 w-4.5 animate-spin" /> جارِ تسجيل الحضور
                تلقائياً...
              </span>
            ) : (
              <span className="text-xs font-bold text-slate-400">
                {status === "ended"
                  ? "لم تحضر هذه الجلسة"
                  : "سيسجل حضورك تلقائياً عند بدء البث المشاهدة"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
