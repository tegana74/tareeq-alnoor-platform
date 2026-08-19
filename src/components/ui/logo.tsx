import Link from "next/link"
import { LampDesk } from "lucide-react"
import { APP_NAME } from "@/lib/constants"
import { classNames } from "@/lib/utils"

interface LogoProps {
  className?: string
  iconClassName?: string
  textClassName?: string
}

export function Logo({ className, iconClassName, textClassName }: LogoProps) {
  return (
    <Link href="/" className={classNames("flex items-center gap-2 group", className)}>
      <span
        className={classNames(
          "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-lg shadow-amber-500/30 group-hover:shadow-amber-500/50 transition-shadow",
          iconClassName
        )}
      >
        <LampDesk className="h-6 w-6" strokeWidth={2.2} />
      </span>
      <span className={classNames("text-xl font-extrabold text-navy", textClassName)}>
        {APP_NAME}
        <span className="text-amber-500">.</span>
      </span>
    </Link>
  )
}
