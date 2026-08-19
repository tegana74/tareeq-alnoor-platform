"use client"

import { Loader2, Plus, Save, Trash2 } from "lucide-react"
import { createStudentAction, toggleStudentBlockAction } from "@/app/actions/admin-users"
import { useSubmit } from "@/lib/use-submit"

const inputCls =
  "w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"

export function StudentForm({ years }: { years: { id: string; name: string }[] }) {
  const { open, setOpen, state, formAction, pending } = useSubmit(createStudentAction)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-black text-white hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> إضافة طالب
      </button>
    )
  }

  return (
    <form action={formAction} className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="firstName" required placeholder="الاسم الأول" className={inputCls} />
        <input name="lastName" required placeholder="اسم العائلة" className={inputCls} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input name="phone" dir="ltr" required placeholder="رقم الهاتف 01xxxxxxxxx" className={`${inputCls} text-left`} />
        <input name="password" type="password" required placeholder="كلمة المرور" className={inputCls} />
        <select name="yearId" className={inputCls} defaultValue="">
          <option value="">بدون سنة</option>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </select>
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
          className="rounded-xl px-4 py-2 text-sm font-black text-slate-500 hover:bg-slate-100"
        >
          إلغاء
        </button>
      </div>
      {state.error && <p className="text-xs font-bold text-rose-600">{state.error}</p>}
    </form>
  )
}

export function StudentActions({ id, blocked }: { id: string; blocked: boolean }) {
  const { formAction, pending } = useSubmit(toggleStudentBlockAction)
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        title={blocked ? "إعادة تفعيل" : "إزالة الطالب (حظر الحساب)"}
        className={`flex h-9 w-9 items-center justify-center rounded-xl disabled:opacity-50 ${
          blocked ? "bg-mint-50 text-mint-dark hover:bg-mint-100" : "bg-rose-50 text-rose-600 hover:bg-rose-100"
        }`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </form>
  )
}
