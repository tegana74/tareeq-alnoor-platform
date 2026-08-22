"use client"

import { Loader2, ShoppingBag } from "lucide-react"
import { redeemStoreItemAction } from "@/app/actions/store"
import { useSubmit } from "@/lib/use-submit"

const selectCls =
  "w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"

export function RedeemForm({
  itemId,
  courses,
}: {
  itemId: string
  courses: { id: string; name: string }[]
}) {
  const { open, setOpen, state, formAction, pending } = useSubmit(redeemStoreItemAction)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-black text-white hover:opacity-90"
      >
        <ShoppingBag className="h-4 w-4" /> استبدال
      </button>
    )
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="itemId" value={itemId} />
      <select name="courseId" className={selectCls} required>
        <option value="">اختر الكورس</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />} تأكيد الاستبدال
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100"
        >
          إلغاء
        </button>
      </div>
      {state.error && <p className="text-xs font-bold text-rose-600">{state.error}</p>}
    </form>
  )
}
