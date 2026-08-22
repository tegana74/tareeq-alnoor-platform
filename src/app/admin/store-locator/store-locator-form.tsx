"use client"

import { Loader2, Plus, Save, Trash2, X } from "lucide-react"
import { createStoreLocatorAction, deleteStoreLocatorAction, toggleStoreLocatorAction } from "@/app/actions/admin-store-locator"
import { useSubmit } from "@/lib/use-submit"

const inputCls =
  "w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"

export function StoreLocatorForm() {
  const { open, setOpen, state, formAction, pending } = useSubmit(createStoreLocatorAction)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-black text-white hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> إضافة منفذ
      </button>
    )
  }

  return (
    <form action={formAction} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <input name="name" required placeholder="اسم المنفذ (مثال: مكتبة النور)" className={inputCls} />
        <input name="governorate" required placeholder="المحافظة" className={inputCls} />
      </div>
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <input name="address" required placeholder="العنوان" className={inputCls} />
        <input name="phone" dir="ltr" placeholder="الهاتف (اختياري)" className={`${inputCls} text-left`} />
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
          className="flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100"
        >
          <X className="h-4 w-4" /> إلغاء
        </button>
      </div>
      {state.error && <p className="mt-2 text-xs font-bold text-rose-600">{state.error}</p>}
    </form>
  )
}

export function StoreLocatorActions({ id, active }: { id: string; active: boolean }) {
  const toggle = useSubmit(toggleStoreLocatorAction)
  const del = useSubmit(deleteStoreLocatorAction)
  return (
    <div className="flex items-center gap-2">
      <form action={toggle.formAction}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={toggle.pending}
          className={`rounded-xl px-3 py-1.5 text-xs font-black disabled:opacity-50 ${
            active ? "bg-mint-50 text-mint-dark hover:bg-mint-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          {active ? "نشط" : "متوقف"}
        </button>
      </form>
      <form action={del.formAction}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={del.pending}
          title="حذف"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}
