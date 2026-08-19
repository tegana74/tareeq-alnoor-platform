"use client"

import { useActionState } from "react"
import { Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, Input, Textarea } from "@/components/ui/field"
import { submitExemptionAction } from "@/app/actions/exemptions"

export function ExemptionForm() {
  const [state, formAction, pending] = useActionState(submitExemptionAction, null)

  return (
    <form action={formAction} className="space-y-4">
      <Field label="سبب الإعفاء" required>
        <Input name="reason" placeholder="مثال: تعارض موعد الامتحان مع موعد أخي/اختبار صحي" required />
      </Field>
      <Field label="تفاصيل إضافية (اختياري)">
        <Textarea name="details" placeholder="اشرح حالتك بأي تفاصيل تساعدنا" rows={3} />
      </Field>

      {state && !state.ok && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">{state.error}</p>
      )}
      {state?.ok && (
        <p className="rounded-xl bg-mint-50 px-4 py-3 text-sm font-bold text-mint-dark">
          تم إرسال طلب الإعفاء، سنخطرك بنتيجة المراجعة.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        إرسال الطلب
      </Button>
    </form>
  )
}
