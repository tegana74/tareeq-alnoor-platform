"use client"

import { Bell, CheckCheck, Loader2 } from "lucide-react"
import { markNotificationsReadAction } from "@/app/actions/notifications"
import { useSubmit } from "@/lib/use-submit"

export function MarkAllRead() {
  const { formAction, pending } = useSubmit(markNotificationsReadAction)
  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 hover:border-amber-300 hover:text-amber-600 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
        تعليم الكل كمقروء
      </button>
    </form>
  )
}
