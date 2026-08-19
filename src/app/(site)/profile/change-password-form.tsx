"use client"

import { useActionState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { PasswordInput } from "@/components/ui/password-input"
import { changePasswordAction } from "@/app/actions/auth"

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, null)

  return (
    <form action={formAction} className="space-y-4">
      <Field label="كلمة المرور الحالية" required>
        <PasswordInput
          name="currentPassword"
          dir="ltr"
          placeholder="••••••••"
          required
        />
      </Field>

      <Field label="كلمة المرور الجديدة" required>
        <PasswordInput
          name="newPassword"
          dir="ltr"
          placeholder="6 أحرف على الأقل"
          required
        />
      </Field>

      <Field label="تأكيد كلمة المرور الجديدة" required>
        <PasswordInput
          name="confirmPassword"
          dir="ltr"
          placeholder="أعد إدخال كلمة المرور"
          required
        />
      </Field>

      {state && state.ok && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-600">
          تم تغيير كلمة المرور بنجاح!
        </p>
      )}

      {state && !state.ok && state.error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <ShieldCheck className="h-5 w-5" />
        )}
        تغيير كلمة المرور
      </Button>
    </form>
  )
}
