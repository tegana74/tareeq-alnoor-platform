import Link from "next/link"
import type { ReactNode } from "react"
import { classNames } from "@/lib/utils"

type ButtonVariant = "primary" | "outline" | "ghost" | "navy" | "danger" | "mint"
type ButtonSize = "sm" | "md" | "lg"

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-l from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/30 hover:shadow-lg hover:shadow-amber-500/40 hover:brightness-105",
  outline:
    "border-2 border-amber-500 text-amber-600 hover:bg-amber-50 bg-white",
  ghost: "text-navy hover:bg-slate-100 bg-transparent",
  navy: "bg-navy text-white hover:bg-navy-light shadow-md",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  mint: "bg-mint text-white hover:bg-mint-dark shadow-md",
}

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm rounded-lg",
  md: "h-11 px-6 text-sm rounded-xl",
  lg: "h-13 px-8 text-base rounded-xl",
}

interface ButtonProps {
  href?: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children: ReactNode
  type?: "button" | "submit"
  disabled?: boolean
  onClick?: () => void
}

export function Button({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  type = "button",
  disabled,
  onClick,
}: ButtonProps) {
  const classes = classNames(
    "inline-flex items-center justify-center gap-2 font-bold transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
    variants[variant],
    sizes[size],
    className
  )

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }

  return (
    <button type={type} className={classes} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}
