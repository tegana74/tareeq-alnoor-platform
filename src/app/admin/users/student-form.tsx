"use client"

import { useState } from "react"
import { Loader2, Plus, Save, Ban, CheckCircle, Trash2 } from "lucide-react"
import { createStudentAction, toggleStudentBlockAction, deleteStudentAction } from "@/app/actions/admin-users"
import { useSubmit } from "@/lib/use-submit"
import { PasswordInput } from "@/components/ui/password-input"

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
        <PasswordInput name="password" required placeholder="كلمة المرور" />
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
          className="rounded-xl px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100"
        >
          إلغاء
        </button>
      </div>
      {state.error && <p className="text-xs font-bold text-rose-600">{state.error}</p>}
    </form>
  )
}

export function StudentActions({ id, blocked, name }: { id: string; blocked: boolean; name: string }) {
  const block = useSubmit(toggleStudentBlockAction)
  const del = useSubmit(deleteStudentAction)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <span className="flex items-center gap-1.5">
      <form action={block.formAction}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={block.pending}
          title={blocked ? "إعادة تفعيل الحساب" : "حظر الحساب"}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
            blocked ? "bg-mint-50 text-mint-dark hover:bg-mint-100" : "bg-rose-50 text-rose-600 hover:bg-rose-100"
          }`}
        >
          {blocked ? <CheckCircle className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
          {blocked ? "إعادة تفعيل" : "حظر"}
        </button>
      </form>

      {confirmDelete ? (
        <span className="flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2 py-1">
          <span className="text-[10px] font-bold text-rose-600">حذف {name}؟</span>
          <form action={del.formAction}>
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              disabled={del.pending}
              className="rounded-lg bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-rose-700"
            >
              {del.pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "تأكيد"}
            </button>
          </form>
          <button
            onClick={() => setConfirmDelete(false)}
            className="rounded-lg bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-300"
          >
            إلغاء
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirmDelete(true)}
          title="حذف نهائي من المنصة"
          className="flex items-center gap-1 rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-100"
        >
          <Trash2 className="h-4 w-4" />
          حذف
        </button>
      )}
    </span>
  )
}
