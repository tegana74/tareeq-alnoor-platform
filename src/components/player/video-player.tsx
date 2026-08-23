"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { getVideoEmbedUrl, isEmbeddableProvider } from "@/lib/video"
import { AlertCircle } from "lucide-react"
import { resolveFileUrl } from "@/lib/resolve-file-url"
import { Button } from "@/components/ui/button"

interface VideoPlayerProps {
  videoId: string
  provider: string
  url: string
  title: string
  downloadAllowed?: boolean
  userName?: string
}

const THROTTLE_MS = 15_000
const JUMP_THRESHOLD = 10

export function VideoPlayer({ videoId, provider, url, title, downloadAllowed, userName }: VideoPlayerProps) {
  const resolvedUrl = resolveFileUrl(url)
  const [progress, setProgress] = useState(0)
  const [saving, setSaving] = useState(false)

  const lastSavedPctRef = useRef(0)
  const lastSaveTimeRef = useRef(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const providerTyped = provider as Parameters<typeof getVideoEmbedUrl>[0]

  const saveProgress = useCallback(async (pct: number, completed = false) => {
    if (!completed) {
      const now = Date.now()
      const timeSinceLastSave = now - lastSaveTimeRef.current
      const jumpSinceLastSave = Math.abs(pct - lastSavedPctRef.current)
      if (timeSinceLastSave < THROTTLE_MS && jumpSinceLastSave < JUMP_THRESHOLD) return
    }

    lastSavedPctRef.current = pct
    lastSaveTimeRef.current = Date.now()
    setSaving(true)
    try {
      await fetch("/api/videos/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, progress: pct, completed }),
      })
    } catch {
      // تجاهل أخطاء الحفظ — لا تعطل تجربة الطالب
    } finally {
      setSaving(false)
    }
  }, [videoId])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    function handleTimeUpdate() {
      if (!video || !video.duration) return
      const pct = Math.round((video.currentTime / video.duration) * 100)
      setProgress(pct)
      saveProgress(pct, false)
    }

    function handlePause() {
      if (!video || !video.duration) return
      const pct = Math.round((video.currentTime / video.duration) * 100)
      saveProgress(pct, false)
    }

    function handleEnded() {
      saveProgress(100, true)
    }

    function handleBeforeUnload() {
      if (!video || !video.duration) return
      const pct = Math.round((video.currentTime / video.duration) * 100)
      navigator.sendBeacon(
        "/api/videos/progress",
        new Blob(
          [JSON.stringify({ videoId, progress: pct, completed: pct >= 90 })],
          { type: "application/json" }
        )
      )
    }

    video.addEventListener("timeupdate", handleTimeUpdate)
    video.addEventListener("pause", handlePause)
    video.addEventListener("ended", handleEnded)
    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate)
      video.removeEventListener("pause", handlePause)
      video.removeEventListener("ended", handleEnded)
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [videoId, saveProgress])

  const embedUrl = isEmbeddableProvider(providerTyped) ? getVideoEmbedUrl(providerTyped, resolvedUrl) : null

  if (isEmbeddableProvider(providerTyped)) {
    if (!embedUrl) {
      return (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-danger-200 bg-danger-50 p-8 text-center">
          <AlertCircle className="h-8 w-8 text-danger-strong" aria-hidden="true" />
          <p className="text-sm font-bold text-navy">رابط الفيديو غير صالح للعرض المدمج</p>
          <p className="text-xs text-muted-foreground">يرجى مراجعة المعلم لتحديث رابط الدرس</p>
        </div>
      )
    }
    return (
      <div>
        <div className="overflow-hidden rounded-2xl bg-black shadow-xl">
          <iframe
            src={embedUrl}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={title}
          />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {progress > 0 && <span>تقدمك في المشاهدة: {progress}%</span>}
          </p>
          <div className="flex items-center gap-2">
            {saving && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" /> جارِ الحفظ
              </span>
            )}
            <Button
              variant="mint"
              size="sm"
              onClick={() => saveProgress(100, true)}
            >
              <CheckCircle2 className="h-4 w-4" />
              تمت المشاهدة
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const isUploaded = provider === "UPLOAD"
  return (
    <div onContextMenu={(e) => isUploaded && e.preventDefault()}>
      <div className="relative overflow-hidden rounded-2xl bg-black shadow-xl">
        <video
          ref={videoRef}
          controls
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          className="aspect-video w-full"
        >
          <source src={resolvedUrl} />
        </video>
        {isUploaded && userName && (
          <span className="pointer-events-none absolute bottom-2 left-2 select-none rounded bg-black/30 px-2 py-0.5 text-xs text-white/40">
            {userName}
          </span>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">تقدمك: {progress}%</p>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" /> جارِ الحفظ
            </span>
          )}
          {downloadAllowed && (
            <a href={`${resolvedUrl}?dl=1`} className="rounded-lg bg-mint px-3 py-1.5 text-xs font-black text-mint-dark hover:opacity-80">
              تنزيل الفيديو
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
