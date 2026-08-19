"use client"

import { useState } from "react"
import { Loader2, Plus, Save, Trash2 } from "lucide-react"
import { saveLiveSessionAction, deleteLiveSessionAction } from "@/app/actions/teacher-live"
import { useSubmit } from "@/lib/use-submit"

const inputCls =
  "w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"

export interface LiveFormSession {
  id: string
  title: string
  description?: string
  courseId?: string
  startAt: Date
  durationMinutes: number
  url?: string
  isFree: boolean
  maxCapacity: number
  price: number
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function LiveForm({
  courses,
  session,
}: {
  courses: { id: string; name: string }[]
  session?: LiveFormSession
}) {
  const { open, setOpen, state, formAction, pending } = useSubmit(saveLiveSessionAction)
  const [courseId, setCourseId] = useState(session?.courseId ?? courses[0]?.id ?? "")
  const [isFree, setIsFree] = useState(session?.isFree ?? false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-black text-white hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> {session ? "تعديل" : "جلسة جديدة"}
      </button>
    )
  }

  return (
    <form action={formAction} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="id" value={session?.id ?? ""} />
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <input name="title" required placeholder="عنوان الجلسة" defaultValue={session?.title} className={inputCls} />
        <select name="courseId" value={courseId} onChange={(e) => setCourseId(e.target.value)} className={inputCls} required>
          <option value="">بدون كورس</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <input
          name="startAt"
          type="datetime-local"
          required
          defaultValue={session ? toLocalInput(session.startAt) : undefined}
          className={inputCls}
        />
        <input name="durationMinutes" type="number" min={5} max={720} defaultValue={session?.durationMinutes ?? 60} className={inputCls} />
      </div>
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <input
          name="price"
          type="number"
          min={0}
          step="0.01"
          disabled={isFree}
          defaultValue={session?.price ?? 0}
          placeholder="تكلفة الحصة بالجنيه"
          className={inputCls}
        />
        <label className="flex items-center gap-2 rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-slate-600">
          <input
            type="checkbox"
            name="isFree"
            checked={isFree}
            onChange={(e) => setIsFree(e.target.checked)}
            className="h-4 w-4 accent-amber-500"
          />
          حصة مجانية
        </label>
      </div>
      <input
        name="url"
        dir="ltr"
        placeholder="رابط البث: https://studio.youtube.com/video/...  أو youtube.com/live/..."
        defaultValue={session?.url}
        className={`${inputCls} mb-2 text-left`}
      />
      <textarea
        name="description"
        placeholder="وصف الجلسة (اختياري)"
        defaultValue={session?.description}
        className="mb-2 w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"
        rows={2}
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
          className="rounded-xl px-4 py-2 text-sm font-black text-slate-500 hover:bg-slate-100"
        >
          إلغاء
        </button>
      </div>
      {state.error && <p className="mt-2 text-xs font-bold text-rose-600">{state.error}</p>}
    </form>
  )
}

export function DeleteLive({ id }: { id: string }) {
  const { formAction, pending } = useSubmit(deleteLiveSessionAction)
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50"
        title="حذف"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </form>
  )
}
