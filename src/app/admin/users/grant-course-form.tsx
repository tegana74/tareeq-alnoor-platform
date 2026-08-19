"use client"

import { useState } from "react"
import { KeyRound, Loader2, X } from "lucide-react"
import { grantCourseAction } from "@/app/actions/admin-users"
import { useSubmit } from "@/lib/use-submit"

const inputCls =
  "w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"

export function GrantCourseButton({
  studentId,
  studentName,
  courses,
}: {
  studentId: string
  studentName: string
  courses: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const { state, formAction, pending } = useSubmit(grantCourseAction)

  if (courses.length === 0) return null

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-xl bg-royal-50 px-3 py-2 text-xs font-black text-royal hover:bg-royal-100"
      >
        <KeyRound className="h-3.5 w-3.5" /> فتح كورس
      </button>
      {open && (
        <form
          action={formAction}
          className="absolute top-full left-0 z-20 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-black text-navy">فتح كورس لـ {studentName}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <input type="hidden" name="studentId" value={studentId} />
          <select name="courseId" required className={`${inputCls} mb-3`}>
            <option value="">اختر الكورس...</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy px-4 py-2 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            فتح الكورس للطالب
          </button>
          {state.error && <p className="mt-2 text-xs font-bold text-rose-600">{state.error}</p>}
        </form>
      )}
    </span>
  )
}
