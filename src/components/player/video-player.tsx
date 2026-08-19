"use client"

import { useEffect, useRef, useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { getVideoEmbedUrl, isEmbeddableProvider } from "@/lib/video"
import { Button } from "@/components/ui/button"

interface VideoPlayerProps {
  videoId: string
  provider: string
  url: string
  title: string
  downloadAllowed?: boolean
  userName?: string
}

export function VideoPlayer({ videoId, provider, url, title, downloadAllowed, userName }: VideoPlayerProps) {
  const [progress, setProgress] = useState(0)
  const [saving, setSaving] = useState(false)
  const savedRef = useRef(false)
  const providerTyped = provider as Parameters<typeof getVideoEmbedUrl>[0]

  async function saveProgress(pct: number, completed = false) {
    if (savedRef.current && !completed) return
    savedRef.current = true
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
  }

  useEffect(() => {
    return () => {
      if (savedRef.current) return
      // حفظ تلقائي عند مغادرة الصفحة
      void saveProgress(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isEmbeddableProvider(providerTyped)) {
    return (
      <div>
        <div className="overflow-hidden rounded-2xl bg-black shadow-xl">
          <iframe
            src={getVideoEmbedUrl(providerTyped, url)}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={title}
            onLoad={() => {
              // تتبع يدوي: زر إتمام مشاهدة
            }}
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

  // رفع مباشر (محمي — بلا تنزيل أو تصوير داخل المتصفح قدر الإمكان)
  const isUploaded = provider === "UPLOAD"
  return (
    <div onContextMenu={(e) => isUploaded && e.preventDefault()}>
      <div className="relative overflow-hidden rounded-2xl bg-black shadow-xl">
        <video
          controls
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          className="aspect-video w-full"
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            if (v.duration) {
              const pct = Math.round((v.currentTime / v.duration) * 100)
              setProgress(pct)
            }
          }}
          onEnded={() => saveProgress(100, true)}
        >
          <source src={url} />
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
            <a href={`${url}?dl=1`} className="rounded-lg bg-mint px-3 py-1.5 text-xs font-black text-mint-dark hover:opacity-80">
              تنزيل الفيديو
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
