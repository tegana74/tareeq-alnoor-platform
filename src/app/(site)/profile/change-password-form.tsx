"use client"

import { useActionState } from "react"
import { Loader2, Lock, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/field"
import { changePasswordAction } from "@/app/actions/auth"

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, null)

  return (
    <form action={formAction} className="space-y-4">
      <Field label="كلمة المرور الحالية" required>
        <div className="relative">
          <Lock className="absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            name="currentPassword"
            type="password"
            dir="ltr"
            placeholder="••••••••"
            className="pr-11 text-left"
            required
          />
        </div>
      </Field>

      <Field label="كلمة المرور الجديدة" required>
        <div className="relative">
          <Lock className="absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            name="newPassword"
            type="password"
            dir="ltr"
            placeholder="6 أحرف على الأقل"
            className="pr-11 text-left"
            required
          />
        </div>
      </Field>

      <Field label="تأكيد كلمة المرور الجديدة" required>
        <div className="relative">
          <Lock className="absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            name="confirmPassword"
            type="password"
            dir="ltr"
            placeholder="أعد إدخال كلمة المرور"
            className="pr-11 text-left"
            required
          />
        </div>
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
