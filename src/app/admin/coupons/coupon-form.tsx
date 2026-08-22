"use client"

import { useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, Input, Select } from "@/components/ui/field"
import { createCouponAction } from "@/app/actions/admin-coupons"

type State = { ok: boolean; error?: string }

const initialState: State = { ok: false }

export function CouponForm() {
  const router = useRouter()
  const [type, setType] = useState("percentage")

  const [state, formAction, pending] = useActionState<State, FormData>(async (_prev, form) => {
    form.set("discountType", type)
    const res = await createCouponAction(_prev, form)
    if (res.ok) {
      router.refresh()
      return { ok: true }
    }
    return res
  }, initialState)

  return (
    <form action={formAction} className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 font-black text-navy">كوبون جديد</h2>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="الكود">
          <Input name="code" placeholder="مثال: NOR20" required />
        </Field>
        <Field label="النوع">
          <Select name="discountType" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="percentage">نسبة %</option>
            <option value="fixed">مبلغ ثابت</option>
          </Select>
        </Field>
        <Field label={type === "percentage" ? "النسبة %" : "القيمة (ج.م)"}>
          <Input name="discountValue" type="number" min="1" step="0.01" required />
        </Field>
        <Field label="أقصى استخدام">
          <Input name="maxUses" type="number" min="1" defaultValue="1" required />
        </Field>
      </div>
      {state.error && (
        <p className="mt-3 flex items-center gap-2 text-sm font-bold text-rose-600">
          <AlertCircle className="h-4 w-4" />
          {state.error}
        </p>
      )}
      <Button type="submit" size="sm" disabled={pending} className="mt-4">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        إنشاء الكوبون
      </Button>
    </form>
  )
}
