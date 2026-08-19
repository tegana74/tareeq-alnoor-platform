"use client"

import { useRef, useState } from "react"
import { Loader2, Pencil, Save, Trash2, X } from "lucide-react"
import { updateCourseAction, deleteCourseAction } from "@/app/actions/teacher-structure"
import { useSubmit } from "@/lib/use-submit"

const inputCls =
  "w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"

export interface CourseActionData {
  id: string
  name: string
  description?: string | null
  price: number
  yearId?: string | null
  subjectId: string
}

export function CourseActions({
  course,
  years,
  subjects,
}: {
  course: CourseActionData
  years: { id: string; name: string }[]
  subjects: { id: string; name: string }[]
}) {
  const [editing, setEditing] = useState(false)
  const edit = useSubmit(updateCourseAction)
  const del = useSubmit(deleteCourseAction)
  const delForm = useRef<HTMLFormElement>(null)

  function handleDelete() {
    if (window.confirm("سيتم حذف الكورس نهائياً مع كل محتواه واشتراكاته. متابعة؟")) {
      delForm.current?.requestSubmit()
    }
  }

  if (editing) {
    return (
      <form action={edit.formAction} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <input type="hidden" name="id" value={course.id} />
        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          <input name="name" required defaultValue={course.name} placeholder="اسم الكورس" className={inputCls} />
          <input
            name="price"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={course.price}
            placeholder="السعر بالجنيه"
            className={inputCls}
          />
        </div>
        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          <select name="yearId" defaultValue={course.yearId ?? ""} className={inputCls}>
            <option value="">بدون مرحلة (لكل الصفوف)</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
          <select name="subjectId" required defaultValue={course.subjectId} className={inputCls}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          name="description"
          defaultValue={course.description ?? ""}
          placeholder="وصف الكورس (اختياري)"
          rows={2}
          className={`${inputCls} mb-3`}
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={edit.pending}
            className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
          >
            {edit.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-black text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" /> إلغاء
          </button>
        </div>
        {edit.state.error && <p className="mt-2 text-xs font-bold text-rose-600">{edit.state.error}</p>}
      </form>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="تعديل الاسم والسعر"
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 hover:bg-amber-100"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <form ref={delForm} action={del.formAction}>
        <input type="hidden" name="id" value={course.id} />
        <button
          type="button"
          onClick={handleDelete}
          disabled={del.pending}
          title="حذف الكورس"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50"
        >
          {del.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </form>
    </div>
  )
}
