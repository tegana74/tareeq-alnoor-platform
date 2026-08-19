"use client"

import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/field"
import { saveSettingsAction } from "@/app/actions/admin-settings"

type State = { ok: boolean; error?: string }
const initialState: State = { ok: false }

export function SettingsForm({
  vodafone,
  instapay,
  teacherCommission,
  adminCommission,
  teacherImageShape,
  teacherImageSize,
}: {
  vodafone: string
  instapay: string
  teacherCommission: string
  adminCommission: string
  teacherImageShape: string
  teacherImageSize: string
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(async (prev: State, form: FormData) => {
    const res = await saveSettingsAction(prev, form)
    if (res.ok) router.refresh()
    return res
  }, initialState)

  const selectCls =
    "w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"

  return (
    <form action={formAction} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
      <Field label="رقم فودافون كاش" required>
        <Input name="vodafone" defaultValue={vodafone} dir="ltr" required />
      </Field>
      <Field label="رقم انستاباي" required>
        <Input name="instapay" defaultValue={instapay} dir="ltr" required />
      </Field>
      <Field label="نسبة المعلم من الاشتراكات (%)" hint="نسبة المستحقات المالية لكل معلم من إيرادات دوراته">
        <Input name="teacherCommission" type="number" min={0} max={100} defaultValue={teacherCommission} dir="ltr" />
      </Field>
      <Field label="نسبة الإدارة من الاشتراكات (%)" hint="نسبة إيرادات الإدارة من نفس الاشتراكات">
        <Input name="adminCommission" type="number" min={0} max={100} defaultValue={adminCommission} dir="ltr" />
      </Field>
      <Field label="شكل صورة المعلم" hint="الشكل الذي تظهر به صور المعلمين على المنصة">
        <select name="teacherImageShape" defaultValue={teacherImageShape} className={selectCls}>
          <option value="circle">دائرية</option>
          <option value="rounded">مربعة بأركان دائرية</option>
        </select>
      </Field>
      <Field label="حجم صورة المعلم" hint="الحجم الظاهر لصور المعلمين على المنصة">
        <select name="teacherImageSize" defaultValue={teacherImageSize} className={selectCls}>
          <option value="sm">صغير (64px)</option>
          <option value="md">متوسط (80px)</option>
          <option value="lg">كبير (112px)</option>
        </select>
      </Field>
      {state.error && (
        <p className="flex items-center gap-2 text-sm font-bold text-rose-600">
          <AlertCircle className="h-4 w-4" />
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="flex items-center gap-2 text-sm font-bold text-mint-dark">
          <CheckCircle2 className="h-4 w-4" />
          تم الحفظ
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        حفظ الإعدادات
      </Button>
    </form>
  )
}
