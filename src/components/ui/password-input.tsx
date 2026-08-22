"use client"

import { useState } from "react"
import { Eye, EyeOff, Lock } from "lucide-react"
import { Input } from "./field"

export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Lock className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={`ps-9 pe-9 text-left ${props.className ?? ""}`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400 hover:text-slate-600"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}
