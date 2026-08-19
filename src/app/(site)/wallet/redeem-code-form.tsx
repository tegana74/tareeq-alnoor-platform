"use client"

import { Loader2, Ticket, Wallet } from "lucide-react"
import { redeemCodeAction } from "@/app/actions/payments"
import { useSubmit } from "@/lib/use-submit"

export function RedeemCodeForm() {
  const { open, setOpen, state, formAction, pending } = useSubmit(redeemCodeAction)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-black text-white hover:bg-white/25"
      >
        <Ticket className="h-4 w-4" /> أدخل كود شحن
      </button>
    )
  }

  return (
    <form action={formAction} className="rounded-2xl bg-white/15 p-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <input
          name="code"
          dir="ltr"
          required
          placeholder="أدخل الكود..."
          className="min-w-0 flex-1 rounded-lg border-2 border-transparent px-3 py-2 font-mono text-sm font-black text-navy outline-none focus:border-amber-300"
        />
        <button
          type="submit"
          disabled={pending}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-black text-navy hover:bg-amber-50 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} شحن
        </button>
      </div>
      {state.error && <p className="mt-2 text-xs font-black text-rose-200">{state.error}</p>}
      {state.ok && <p className="mt-2 text-xs font-black text-mint-200">تم شحن المحفظة بنجاح</p>}
    </form>
  )
}
