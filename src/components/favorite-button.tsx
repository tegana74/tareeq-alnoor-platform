"use client"

import { Heart, Loader2 } from "lucide-react"
import { toggleFavoriteAction } from "@/app/actions/favorites"
import { useSubmit } from "@/lib/use-submit"
import { classNames } from "@/lib/utils"

export function FavoriteButton({
  courseId,
  initial,
  className = "",
}: {
  courseId: string
  initial: boolean
  className?: string
}) {
  const { state, formAction, pending } = useSubmit(toggleFavoriteAction)

  return (
    <button
      type="button"
      disabled={pending}
      title={initial ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const f = new FormData()
        f.set("courseId", courseId)
        formAction(f)
      }}
      className={classNames(
        "flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow backdrop-blur transition-all hover:scale-110",
        initial ? "text-rose-500" : "text-slate-400 hover:text-rose-500",
        className
      )}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Heart className={classNames("h-4 w-4", initial && "fill-rose-500")} />
      )}
      {state.error && <span className="sr-only">{state.error}</span>}
    </button>
  )
}
