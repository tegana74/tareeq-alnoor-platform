"use client"

import { Pin, Trash2 } from "lucide-react"
import { deletePostAction, pinPostAction } from "@/app/actions/community"
import { useSubmit } from "@/lib/use-submit"

export function PostActions({ postId, isAuthor, isAdmin }: { postId: string; isAuthor: boolean; isAdmin: boolean }) {
  const del = useSubmit(deletePostAction)
  const pin = useSubmit(pinPostAction)
  if (!isAuthor && !isAdmin) return null
  return (
    <span className="mr-auto flex items-center gap-1">
      {isAdmin && (
        <form action={pin.formAction}>
          <input type="hidden" name="id" value={postId} />
          <button
            type="submit"
            disabled={pin.pending}
            title="تثبيت / إلغاء التثبيت"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
        </form>
      )}
      <form action={del.formAction}>
        <input type="hidden" name="id" value={postId} />
        <button
          type="submit"
          disabled={del.pending}
          title="حذف"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </form>
    </span>
  )
}
