"use client"

import { useState } from "react"
import { Loader2, Plus, Save, Ticket } from "lucide-react"
import { generateCodesAction } from "@/app/actions/admin-recharge"
import { useSubmit } from "@/lib/use-submit"

const inputCls =
  "w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"

export function GenerateCodesForm() {
  const { open, setOpen, state, formAction, pending } = useSubmit(generateCodesAction)
  const [count, setCount] = useState(5)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-black text-white hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> توليد أكواد
      </button>
    )
  }

  return (
    <form action={formAction} className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <input name="value" type="number" min={1} required placeholder="قيمة الكود (ج.م)" className={inputCls} />
        <input
          name="count"
          type="number"
          min={1}
          max={100}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className={inputCls}
        />
        <input name="center" placeholder="اسم المنفذ (اختياري)" className={inputCls} />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />} توليد {count || 1} كود
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100"
        >
          إلغاء
        </button>
      </div>
      {state.error && <p className="text-xs font-bold text-rose-600">{state.error}</p>}
      {state.ok && (
        <p className="flex items-center gap-1 text-xs font-bold text-mint-dark">
          <Save className="h-3.5 w-3.5" /> تم توليد الأكواد بنجاح
        </p>
      )}
    </form>
  )
}
