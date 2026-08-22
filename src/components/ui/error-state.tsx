"use client"

import type { ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import { classNames } from "@/lib/utils"
import { Button } from "./button"

export interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
  action?: ReactNode
  className?: string
}

export function ErrorState({
  title = "حدث خطأ",
  description = "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
  onRetry,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={classNames(
        "flex flex-col items-center justify-center px-4 py-10 text-center",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-50 text-danger-strong"
      >
        <AlertTriangle className="h-7 w-7" />
      </span>
      <p className="mt-4 text-lg font-bold text-card-foreground">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {(onRetry || action) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <Button variant="primary" size="md" onClick={onRetry}>
              إعادة المحاولة
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  )
}
