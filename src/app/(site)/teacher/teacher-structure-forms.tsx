"use client"

import { Loader2, Plus, Save } from "lucide-react"
import { createYearAction, createCourseAction } from "@/app/actions/teacher-structure"
import { useSubmit } from "@/lib/use-submit"

const inputCls =
  "w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"

function FormActions({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  return (
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
        onClick={onCancel}
        className="rounded-xl px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100"
      >
        إلغاء
      </button>
    </div>
  )
}

export function StageForm() {
  const { open, setOpen, state, formAction, pending } = useSubmit(createYearAction)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-black text-white hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> إضافة مرحلة تعليمية
      </button>
    )
  }

  return (
    <form action={formAction} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <input name="name" required placeholder="مثال: الصف الرابع الابتدائي" className={inputCls} />
      <p className="mt-2 text-xs text-slate-500">تُضاف المرحلة الجديدة وتظهر للطلاب عند التسجيل واختيار الكورسات</p>
      <div className="mt-3">
        <FormActions pending={pending} onCancel={() => setOpen(false)} />
      </div>
      {state.error && <p className="mt-2 text-xs font-bold text-rose-600">{state.error}</p>}
    </form>
  )
}

export function CourseForm({
  years,
  subjects,
  teachers,
  isAdmin,
}: {
  years: { id: string; name: string }[]
  subjects: { id: string; name: string }[]
  teachers: { id: string; name: string }[]
  isAdmin: boolean
}) {
  const { open, setOpen, state, formAction, pending } = useSubmit(createCourseAction)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-black text-white hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> إضافة كورس جديد
      </button>
    )
  }

  return (
    <form action={formAction} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <input name="name" required placeholder="اسم الكورس" className={inputCls} />
        <input
          name="price"
          type="number"
          min={0}
          step="0.01"
          required
          placeholder="سعر الكورس بالجنيه"
          className={inputCls}
        />
      </div>
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <select name="yearId" defaultValue="" className={inputCls}>
          <option value="">بدون مرحلة (لكل الصفوف)</option>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </select>
        <select name="subjectId" required defaultValue="" className={inputCls}>
          <option value="" disabled>
            اختر المادة
          </option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {isAdmin && (
        <select name="teacherId" required defaultValue="" className={`${inputCls} mb-2`}>
          <option value="" disabled>
            اختر المعلم
          </option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      <textarea name="description" placeholder="وصف الكورس (اختياري)" rows={2} className={`${inputCls} mb-3`} />
      <FormActions pending={pending} onCancel={() => setOpen(false)} />
      {state.error && <p className="mt-2 text-xs font-bold text-rose-600">{state.error}</p>}
    </form>
  )
}
