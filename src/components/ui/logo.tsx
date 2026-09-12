import Link from "next/link"
import { LampDesk } from "lucide-react"
import { APP_NAME } from "@/lib/constants"
import { classNames } from "@/lib/utils"

interface LogoProps {
  className?: string
  iconClassName?: string
  textClassName?: string
  stacked?: boolean
}

export function Logo({ className, iconClassName, textClassName, stacked }: LogoProps) {
  return (
    <Link href="/" className={classNames("flex items-center gap-2 group", className)}>
      <span
        className={classNames(
          "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-400 to-orange-600 text-white shadow-lg shadow-primary-500/30 group-hover:shadow-primary-500/50 transition-shadow",
          iconClassName
        )}
      >
        <LampDesk className="h-6 w-6" strokeWidth={2.2} />
      </span>
      {stacked ? (
        <span className={classNames(textClassName)}>
          <span className="flex flex-col text-right justify-center text-xs font-bold leading-none sm:text-sm">
            <span className="text-foreground">منصة</span>
            <span className="text-primary">طريق النور</span>
            <span className="text-foreground">التعليمية</span>
          </span>
        </span>
      ) : (
        <span className={classNames("text-xl font-extrabold text-navy", textClassName)}>
          {APP_NAME}
          <span className="text-primary-500">.</span>
        </span>
      )}
    </Link>
  )
}
