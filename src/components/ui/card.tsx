import type { HTMLAttributes } from "react"
import { classNames } from "@/lib/utils"

type CardVariant = "default" | "bordered" | "elevated" | "interactive"

const variantClasses: Record<CardVariant, string> = {
  default: "",
  bordered: "border-2",
  elevated: "shadow-md",
  interactive:
    "transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
}

export function Card({ className, variant = "default", ...props }: CardProps) {
  return (
    <div
      className={classNames(
        "rounded-2xl border border-border bg-card text-card-foreground shadow-sm",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames("space-y-1.5 p-6", className)} {...props} />
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={classNames("text-lg font-bold text-card-foreground", className)} {...props} />
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={classNames("text-sm text-muted-foreground", className)} {...props} />
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames("p-6 pt-0", className)} {...props} />
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={classNames("flex items-center border-t border-border p-6 pt-4", className)}
      {...props}
    />
  )
}
