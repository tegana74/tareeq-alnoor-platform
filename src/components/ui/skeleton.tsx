import { classNames } from "@/lib/utils"

export interface SkeletonProps {
  className?: string
  /** الشكل — full يُستخدم مع w-/h- الممررة عبر className */
  rounded?: "sm" | "md" | "lg" | "xl" | "full"
}

const roundedMap = {
  sm: "rounded",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
} as const

export function Skeleton({ className, rounded = "md" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={classNames("animate-pulse bg-border", roundedMap[rounded], className)}
    />
  )
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={classNames("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={classNames("h-4", i === lines - 1 ? "w-3/4" : "w-full")}
        />
      ))}
    </div>
  )
}

export function SkeletonAvatar({ size = "h-10 w-10", className }: { size?: string; className?: string }) {
  return <Skeleton rounded="full" className={classNames(size, className)} />
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={classNames(
        "rounded-2xl border border-border bg-card p-4 shadow-sm",
        className
      )}
    >
      <Skeleton rounded="xl" className="mb-4 h-32 w-full" />
      <Skeleton className="mb-2 h-5 w-3/4" />
      <Skeleton className="mb-3 h-4 w-1/2" />
      <Skeleton className="h-4 w-full" />
    </div>
  )
}
