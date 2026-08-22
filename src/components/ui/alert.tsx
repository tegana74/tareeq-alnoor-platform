import type { HTMLAttributes, ReactNode } from "react"
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react"
import { classNames } from "@/lib/utils"

type AlertVariant = "info" | "success" | "warning" | "danger"

const variantConfig: Record<
  AlertVariant,
  { container: string; icon: typeof Info; iconClass: string; titleClass: string }
> = {
  info: {
    container: "border-royal-200 bg-royal-50",
    icon: Info,
    iconClass: "text-royal",
    titleClass: "text-card-foreground",
  },
  success: {
    container: "border-success-200 bg-success-50",
    icon: CheckCircle2,
    iconClass: "text-success-strong",
    titleClass: "text-success-strong",
  },
  warning: {
    container: "border-primary-200 bg-primary-50",
    icon: AlertTriangle,
    iconClass: "text-primary-600",
    titleClass: "text-primary-700",
  },
  danger: {
    container: "border-danger-200 bg-danger-50",
    icon: AlertCircle,
    iconClass: "text-danger-strong",
    titleClass: "text-danger-strong",
  },
}

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: AlertVariant
  title?: string
  icon?: ReactNode
  children?: ReactNode
}

export function Alert({ variant = "info", title, icon, children, className, ...props }: AlertProps) {
  const config = variantConfig[variant]
  const Icon = config.icon

  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      aria-live={variant === "danger" ? "assertive" : "polite"}
      className={classNames(
        "flex items-start gap-3 rounded-xl border p-4 text-sm",
        config.container,
        className
      )}
      {...props}
    >
      <span className="shrink-0" aria-hidden="true">
        {icon ?? <Icon className={classNames("mt-0.5 h-5 w-5", config.iconClass)} />}
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className={classNames("mb-1 font-bold", config.titleClass)}>{title}</p>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  )
}
