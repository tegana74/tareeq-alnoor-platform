import type { ReactNode } from "react"
import { Inbox } from "lucide-react"
import { classNames } from "@/lib/utils"

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={classNames(
        "flex flex-col items-center justify-center px-4 py-10 text-center",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/20 text-muted-foreground"
      >
        {icon ?? <Inbox className="h-7 w-7" />}
      </span>
      <p className="mt-4 font-bold text-card-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
