"use client"

import { Loader2, SendHorizonal } from "lucide-react"
import { createCommentAction } from "@/app/actions/community"
import { useSubmit } from "@/lib/use-submit"

export function CommentForm({ postId }: { postId: string }) {
  const { open, setOpen, state, formAction, pending } = useSubmit(createCommentAction)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-black text-white hover:opacity-90"
      >
        <SendHorizonal className="h-4 w-4" /> أضف تعليقاً
      </button>
    )
  }

  return (
    <form action={formAction} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="postId" value={postId} />
      <textarea
        name="content"
        required
        rows={3}
        placeholder="اكتب تعليقك..."
        className="w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />} إرسال
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl px-4 py-2 text-sm font-black text-slate-500 hover:bg-slate-100"
        >
          إلغاء
        </button>
      </div>
      {state.error && <p className="mt-2 text-xs font-bold text-rose-600">{state.error}</p>}
    </form>
  )
}
