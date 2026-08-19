"use client"

import { Loader2, Plus, Save } from "lucide-react"
import { createPostAction } from "@/app/actions/community"
import { useSubmit } from "@/lib/use-submit"

const inputCls =
  "w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"

export function NewPostForm({ categories }: { categories: { id: string; name: string }[] }) {
  const { open, setOpen, state, formAction, pending } = useSubmit(createPostAction)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-6 flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-black text-white hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> منشور جديد
      </button>
    )
  }

  return (
    <form action={formAction} className="mb-6 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <input name="title" required placeholder="عنوان المنشور" className={inputCls} />
      <textarea name="content" required placeholder="محتوى المنشور..." rows={4} className={inputCls} />
      <div className="flex flex-wrap items-center gap-2">
        <select name="categoryId" className={`${inputCls} sm:w-56`} defaultValue={categories[0]?.id}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} نشر
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
