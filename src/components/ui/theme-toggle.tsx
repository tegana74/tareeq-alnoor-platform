"use client"

import { useCallback, useSyncExternalStore } from "react"
import { Moon, Sun } from "lucide-react"

const listeners = new Set<() => void>()

function subscribe(callback: () => void) {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

function getSnapshot() {
  return document.documentElement.getAttribute("data-theme") === "dark"
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, getSnapshot, () => false)

  const toggle = useCallback(() => {
    const next = !dark
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light")
    try {
      localStorage.setItem("theme", next ? "dark" : "light")
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l())
  }, [dark])

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "الوضع النهاري" : "الوضع الليلي"}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-primary-600 ${className}`}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
