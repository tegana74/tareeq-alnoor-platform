import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react"
import { classNames } from "@/lib/utils"

const baseField =
  "w-full h-12 rounded-xl border-2 border-slate-200 bg-white px-4 text-sm text-ink placeholder:text-slate-400 outline-none transition-colors focus:border-amber-400 focus:ring-4 focus:ring-amber-100"

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={classNames(baseField, className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={classNames(baseField, "h-auto min-h-28 py-3", className)} {...props} />
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={classNames(baseField, "cursor-pointer", className)} {...props}>
      {children}
    </select>
  )
}

interface FieldProps {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}

export function Field({ label, required, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-bold text-navy">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
    </div>
  )
}
