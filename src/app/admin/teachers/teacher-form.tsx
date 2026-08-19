"use client"

import { ArrowDown, ArrowUp, ImageOff, Loader2, Plus, Save, Star, Trash2 } from "lucide-react"
import {
  createTeacherAction,
  moveTeacherAction,
  toggleTeacherBlockAction,
  toggleTeacherFeaturedAction,
  updateTeacherImageAction,
} from "@/app/actions/admin-users"
import { useSubmit } from "@/lib/use-submit"

const inputCls =
  "w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"

export function TeacherForm({ unlinked }: { unlinked: { id: string; name: string; title: string | null }[] }) {
  const { open, setOpen, state, formAction, pending } = useSubmit(createTeacherAction)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-black text-white hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> إضافة معلم
      </button>
    )
  }

  return (
    <form action={formAction} className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="name" required placeholder="اسم المعلم (مثال: أ/ محمد أحمد)" className={inputCls} />
        <input name="title" required placeholder="التخصص (مثال: مدرس اللغة العربية)" className={inputCls} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="phone" dir="ltr" required placeholder="رقم الهاتف 01xxxxxxxxx" className={`${inputCls} text-left`} />
        <input name="password" type="password" required placeholder="كلمة المرور" className={inputCls} />
      </div>
      <input name="bio" placeholder="نبذة مختصرة (اختياري)" className={inputCls} />
      {unlinked.length > 0 && (
        <select name="teacherId" className={inputCls}>
          <option value="">إنشاء معلم جديد</option>
          {unlinked.map((t) => (
            <option key={t.id} value={t.id}>
              ربط بحساب {t.name} ({t.title ?? "بدون تخصص"})
            </option>
          ))}
        </select>
      )}
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

export function TeacherActions({
  id,
  hasUser,
  blocked,
  featured,
}: {
  id: string
  hasUser: boolean
  blocked: boolean
  featured: boolean
}) {
  const block = useSubmit(toggleTeacherBlockAction)
  const feat = useSubmit(toggleTeacherFeaturedAction)
  const up = useSubmit(moveTeacherAction)
  const down = useSubmit(moveTeacherAction)
  const removeImg = useSubmit(updateTeacherImageAction)
  const moveBtn =
    "flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-30"
  return (
    <span className="flex items-center gap-1">
      <span className="flex flex-col gap-1">
        <form action={up.formAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="dir" value="up" />
          <button type="submit" disabled={up.pending} title="تحريك لأعلى" className={moveBtn}>
            <ArrowUp className="h-4 w-4" />
          </button>
        </form>
        <form action={down.formAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="dir" value="down" />
          <button type="submit" disabled={down.pending} title="تحريك لأسفل" className={moveBtn}>
            <ArrowDown className="h-4 w-4" />
          </button>
        </form>
      </span>
      <form action={removeImg.formAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="image" value="" />
        <button
          type="submit"
          disabled={removeImg.pending}
          title="حذف الصورة"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-30"
        >
          <ImageOff className="h-4 w-4" />
        </button>
      </form>
      <form action={feat.formAction}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={feat.pending}
          title={featured ? "إزالة من النخبة" : "إضافة للنخبة"}
          className={`flex h-9 w-9 items-center justify-center rounded-xl disabled:opacity-50 ${
            featured ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          <Star className={`h-4 w-4 ${featured ? "fill-amber-500" : ""}`} />
        </button>
      </form>
      {hasUser && (
        <form action={block.formAction}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={block.pending}
            title={blocked ? "إعادة تفعيل" : "إزالة المعلم (حظر الحساب)"}
            className={`flex h-9 w-9 items-center justify-center rounded-xl disabled:opacity-50 ${
              blocked ? "bg-mint-50 text-mint-dark hover:bg-mint-100" : "bg-rose-50 text-rose-600 hover:bg-rose-100"
            }`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </form>
      )}
    </span>
  )
}
