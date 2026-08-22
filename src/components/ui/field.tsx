"use client"

import {
  cloneElement,
  isValidElement,
  useId,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react"
import { classNames } from "@/lib/utils"

const baseField =
  "w-full h-12 rounded-xl border-2 border-border bg-card px-4 text-sm text-ink placeholder:text-muted-foreground outline-none transition-colors focus:border-primary-400 focus:ring-4 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-muted/20 disabled:opacity-60 aria-[invalid=true]:border-danger-strong aria-[invalid=true]:ring-danger-50"

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={classNames(baseField, className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={classNames(baseField, "h-auto min-h-28 py-3", className)} {...props} />
  )
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={classNames(baseField, "cursor-pointer", className)} {...props} />
  )
}

interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  label: string
  htmlFor?: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}

/**
 * تربط الـ label/hint/error بالـ input الأول تلقائيًا عبر aria-describedby و aria-invalid،
 * ما لم يمرّر المستخدم htmlFor/ids صريحة.
 */
export function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
  className,
  ...props
}: FieldProps) {
  const autoId = useId()
  const child = isValidElement(children) ? (children as ReactElement<Record<string, unknown>>) : null

  const rawChildId = child?.props?.id
  const controlId: string =
    htmlFor ?? (typeof rawChildId === "string" && rawChildId !== "" ? rawChildId : undefined) ?? `field-${autoId}`
  const hintId = `${controlId}-hint`
  const errorId = `${controlId}-error`
  const describedBy =
    [hint && !error ? hintId : undefined, error ? errorId : undefined]
      .filter(Boolean)
      .join(" ") || undefined

  let wiredChild: React.ReactNode = children
  if (child) {
    wiredChild = cloneElement(child, {
      id: controlId,
      "aria-describedby": describedBy,
      ...(error ? { "aria-invalid": true } : {}),
    })
  }

  return (
    <div className={classNames("space-y-1.5", className)} {...props}>
      <label htmlFor={controlId} className="block text-sm font-bold text-navy">
        {label}
        {required && (
          <span className="text-rose-500" aria-hidden="true">
            {" "}*
          </span>
        )}
        {required && <span className="sr-only">مطلوب</span>}
      </label>
      {wiredChild}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-semibold text-rose-600">
          {error}
        </p>
      )}
    </div>
  )
}
