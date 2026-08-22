import type { ReactNode } from "react"
import { classNames } from "@/lib/utils"

export type BadgeVariant = "default" | "primary" | "success" | "warning" | "danger" | "neutral" | "info"

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-primary-100 text-primary-700",
  primary: "bg-primary-100 text-primary-700",
  success: "bg-success-50 text-success-strong",
  warning: "bg-primary-50 text-primary-700",
  danger: "bg-danger-50 text-danger-strong",
  neutral: "bg-border text-foreground",
  info: "bg-royal-50 text-royal",
}

export interface BadgeProps {
  children: ReactNode
  className?: string
  variant?: BadgeVariant
  size?: "sm" | "md"
}

export function Badge({ children, className, variant = "default", size = "sm" }: BadgeProps) {
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full font-bold whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
