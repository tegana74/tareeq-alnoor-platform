"use client"

import { Loader2, Plus, Power, Save } from "lucide-react"
import { createStoreItemAction, toggleStoreItemAction } from "@/app/actions/store"
import { useSubmit } from "@/lib/use-submit"

const inputCls =
  "w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"

export function StoreItemForm() {
  const { open, setOpen, state, formAction, pending } = useSubmit(createStoreItemAction)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-black text-white hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> عرض جديد
      </button>
    )
  }

  return (
    <form action={formAction} className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="title" required placeholder="اسم العرض (مثال: تمديد 30 يوم)" className={inputCls} />
        <input name="pointsCost" type="number" min={1} required placeholder="تكلفة النقاط" className={inputCls} />
      </div>
      <input name="description" placeholder="وصف مختصر (اختياري)" className={inputCls} />
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="value" type="number" min={1} defaultValue={30} placeholder="عدد الأيام" className={inputCls} />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ
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
    </form>
  )
}

export function StoreItemToggle({ id }: { id: string }) {
  const { formAction, pending } = useSubmit(toggleStoreItemAction)
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        title="تفعيل / إيقاف"
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
      >
        <Power className="h-4 w-4" />
      </button>
    </form>
  )
}
