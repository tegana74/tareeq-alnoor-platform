"use client"

import { Bookmark, Loader2 } from "lucide-react"
import { toggleBookmarkAction } from "@/app/actions/bookmarks"
import { useSubmit } from "@/lib/use-submit"
import { classNames } from "@/lib/utils"

export function BookmarkButton({
  videoId,
  bookId,
  initial,
  className = "",
}: {
  videoId?: string
  bookId?: string
  initial: boolean
  className?: string
}) {
  const { state, formAction, pending } = useSubmit(toggleBookmarkAction)

  return (
    <button
      type="button"
      disabled={pending}
      title={initial ? "إزالة من الإشارات المرجعية" : "أضف للإشارات المرجعية"}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const f = new FormData()
        if (videoId) f.set("videoId", videoId)
        if (bookId) f.set("bookId", bookId)
        formAction(f)
      }}
      className={classNames(
        "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black transition-colors",
        initial ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
        className
      )}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Bookmark className={classNames("h-3.5 w-3.5", initial && "fill-amber-500 text-amber-500")} />
      )}
      {initial ? "محفوظة" : "احفظ"}
      {state.error && <span className="sr-only">{state.error}</span>}
    </button>
  )
}
