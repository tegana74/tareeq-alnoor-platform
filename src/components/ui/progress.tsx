import { classNames } from "@/lib/utils"

export interface ProgressProps {
  /** القيمة الحالية — تُقيَّد تلقائيًا بين 0 و max */
  value: number | null | undefined
  max?: number
  variant?: "primary" | "success" | "danger"
  size?: "sm" | "md"
  showLabel?: boolean
  label?: string
  className?: string
}

const variantClasses = {
  primary: "bg-primary-500",
  success: "bg-success",
  danger: "bg-danger",
} as const

export function clampProgress(value: number | null | undefined, max: number): number {
  const v = Number(value)
  if (!Number.isFinite(v)) return 0
  return Math.min(Math.max(v, 0), max)
}

export function Progress({
  value,
  max = 100,
  variant = "primary",
  size = "md",
  showLabel = false,
  label,
  className,
}: ProgressProps) {
  const safeValue = clampProgress(value, max)
  const percent = max > 0 ? (safeValue / max) * 100 : 0

  return (
    <div className={classNames("w-full", className)}>
      {showLabel && (
        <div className="mb-1.5 flex items-center justify-between">
          {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
          <span className="text-xs font-bold text-muted-foreground">{Math.round(percent)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(safeValue)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className={classNames(
          "w-full overflow-hidden rounded-full bg-border",
          size === "sm" ? "h-1.5" : "h-2.5"
        )}
      >
        <div
          className={classNames(
            "h-full rounded-full transition-[width] duration-300",
            variantClasses[variant]
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
