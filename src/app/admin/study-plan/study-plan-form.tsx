"use client"

import { Loader2, Plus, Save, Trash2, X } from "lucide-react"
import {
  createWeekAction,
  createSubjectAction,
  deleteWeekAction,
  deleteSubjectAction,
  toggleWeekAction,
} from "@/app/actions/study-plan"
import { useSubmit } from "@/lib/use-submit"

const inputCls =
  "w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"

export function WeekForm() {
  const { open, setOpen, state, formAction, pending } = useSubmit(createWeekAction)
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-black text-white hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> إضافة أسبوع
      </button>
    )
  }
  return (
    <form action={formAction} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <input name="title" required placeholder="عنوان الأسبوع (مثال: الأسبوع الأول — الأحياء)" className={`${inputCls} mb-2`} />
      <input name="description" placeholder="وصف مختصر (اختياري)" className={`${inputCls} mb-3`} />
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
          className="flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-black text-slate-500 hover:bg-slate-100"
        >
          <X className="h-4 w-4" /> إلغاء
        </button>
      </div>
      {state.error && <p className="mt-2 text-xs font-bold text-rose-600">{state.error}</p>}
    </form>
  )
}

export function SubjectForm({ weekId }: { weekId: string }) {
  const { open, setOpen, state, formAction, pending } = useSubmit(createSubjectAction)
  return (
    <div>
      {open ? (
        <form action={formAction} className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <input type="hidden" name="weekId" value={weekId} />
          <input name="subject" required placeholder="اسم المادة (مثال: أحياء — الفصل الأول)" className={`${inputCls} mb-2`} />
          <textarea
            name="tasks"
            rows={3}
            placeholder="المهام المطلوبة — كل مهمة في سطر منفصل"
            className={`${inputCls} mb-3 resize-none`}
          />
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
              className="flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-black text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" /> إلغاء
            </button>
          </div>
          {state.error && <p className="mt-2 text-xs font-bold text-rose-600">{state.error}</p>}
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-200"
        >
          <Plus className="h-3.5 w-3.5" /> إضافة مادة
        </button>
      )}
    </div>
  )
}

export function WeekActions({ id, active }: { id: string; active: boolean }) {
  const toggle = useSubmit(toggleWeekAction)
  const del = useSubmit(deleteWeekAction)
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
          title="حذف الأسبوع"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}

export function SubjectActions({ id }: { id: string }) {
  const del = useSubmit(deleteSubjectAction)
  return (
    <form action={del.formAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={del.pending}
        title="حذف المادة"
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </form>
  )
}
