"use client"

import { Trash2 } from "lucide-react"
import { deleteCommentAction } from "@/app/actions/community"
import { useSubmit } from "@/lib/use-submit"

export function CommentDelete({ id }: { id: string }) {
  const { formAction, pending } = useSubmit(deleteCommentAction)
  return (
    <form action={formAction} className="mr-auto">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        title="حذف"
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </form>
  )
}
