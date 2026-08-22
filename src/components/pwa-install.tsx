"use client"

import { useEffect, useState, useCallback } from "react"
import { Download, X, Smartphone, Share, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  return (
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  )
}

function isIOS(): boolean {
  if (typeof window === "undefined") return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
}

export function PwaInstallButton({ variant = "small" }: { variant?: "small" | "hero" }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIOSModal, setShowIOSModal] = useState(false)
  const [installed, setInstalled] = useState(() => isStandalone())

  useEffect(() => {
    if (installed) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [installed])

  const handleInstall = useCallback(async () => {
    if (isIOS()) {
      setShowIOSModal(true)
      return
    }

    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === "accepted") {
      setInstalled(true)
    }
    setDeferredPrompt(null)
  }, [deferredPrompt])

  if (installed) return null

  if (variant === "hero") {
    return (
      <>
        <Button
          onClick={handleInstall}
          size="lg"
          variant="outline"
          className="border-2 border-dashed border-amber-300 bg-amber-50/50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
        >
          <Download className="h-5 w-5" />
          حمّل التطبيق على موبايلك
        </Button>

        <IOSModal open={showIOSModal} onClose={() => setShowIOSModal(false)} />
      </>
    )
  }

  return (
    <>
      <button
        onClick={handleInstall}
        title="تثبيت التطبيق"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-amber-600 transition-colors hover:bg-amber-50 hover:text-amber-700"
      >
        <Download className="h-4 w-4" />
      </button>

      <IOSModal open={showIOSModal} onClose={() => setShowIOSModal(false)} />
    </>
  )
}

function IOSModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 left-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-6 flex justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/30">
            <Smartphone className="h-8 w-8" />
          </span>
        </div>

        <h3 className="mb-2 text-center text-xl font-black text-navy">
          تثبيت طريق النور
        </h3>
        <p className="mb-6 text-center text-sm text-slate-500">
          لتثبيت التطبيق على جهاز iPhone أو iPad:
        </p>

        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-black text-amber-700">
              ١
            </span>
            <div>
              <p className="text-sm font-bold text-navy">اضغط على زر المشاركة</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                زر <Share className="inline h-3 w-3" /> في أسفل الشاشة
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-black text-amber-700">
              ٢
            </span>
            <div>
              <p className="text-sm font-bold text-navy">اختر {"\u201C"}إضافة إلى الشاشة الرئيسية{"\u201D"}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                <Plus className="inline h-3 w-3" /> اسحب للأسفل واضغط
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-black text-amber-700">
              ٣
            </span>
            <div>
              <p className="text-sm font-bold text-navy">اضغط {"\u201C"}إضافة{"\u201D"}</p>
              <p className="mt-0.5 text-xs text-slate-500">سيظهر التطبيق على شاشتك</p>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-3 text-sm font-black text-white shadow-lg shadow-amber-500/30 transition-all hover:shadow-xl hover:shadow-amber-500/40"
        >
          فهمت، شكراً
        </button>
      </div>
    </div>
  )
}
