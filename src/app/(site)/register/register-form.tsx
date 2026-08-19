"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { GraduationCap, Loader2, UserPlus, UsersRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, Input, Select } from "@/components/ui/field"
import { PasswordInput } from "@/components/ui/password-input"
import { Logo } from "@/components/ui/logo"
import { registerAction } from "@/app/actions/auth"

interface RegisterFormProps {
  years: { id: string; name: string }[]
}

export function RegisterForm({ years }: RegisterFormProps) {
  const router = useRouter()
  const [role, setRole] = useState<"STUDENT" | "PARENT">("STUDENT")
  const [state, formAction, pending] = useActionState(registerAction, null)

  useEffect(() => {
    if (state?.ok) {
      router.push("/login?registered=1")
    }
  }, [state, router])

  const roleOptions: { value: "STUDENT" | "PARENT"; label: string; icon: typeof GraduationCap; hint: string }[] = [
    { value: "STUDENT", label: "طالب", icon: GraduationCap, hint: "متابعة المذاكرة والامتحانات" },
    { value: "PARENT", label: "ولي أمر", icon: UsersRound, hint: "متابعة تقدم أبنائك" },
  ]

  return (
    <div className="w-full max-w-lg">
      <div className="mb-8 text-center">
        <Logo className="justify-center" />
        <h1 className="mt-6 text-2xl font-black text-navy">ابدأ رحلة التفوق 🚀</h1>
        <p className="mt-2 text-sm text-slate-500">أنشئ حسابك مجاناً وابدأ المذاكرة فوراً</p>
      </div>

      <form action={formAction} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
        <Field label="نوع الحساب" required>
          <div className="grid grid-cols-2 gap-3">
            {roleOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value)}
                className={`rounded-2xl border-2 p-3 text-center transition-colors ${
                  role === opt.value ? "border-amber-400 bg-amber-50" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <opt.icon className={`mx-auto mb-1 h-5 w-5 ${role === opt.value ? "text-amber-600" : "text-slate-400"}`} />
                <p className="text-sm font-black text-navy">{opt.label}</p>
                <p className="text-[11px] text-slate-400">{opt.hint}</p>
              </button>
            ))}
          </div>
          <input type="hidden" name="role" value={role} />
        </Field>

        <Field label="الاسم" required>
          <Input name="name" placeholder="اكتب اسمك الكامل" required />
        </Field>

        <Field label="رقم الهاتف" required hint="تستخدمه لتسجيل الدخول">
          <Input name="phone" inputMode="tel" dir="ltr" placeholder="01xxxxxxxxx" className="text-left" required />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="كلمة المرور" required>
            <PasswordInput name="password" dir="ltr" placeholder="••••••••" required />
          </Field>
          <Field label="إعادة كلمة المرور" required>
            <PasswordInput name="confirmPassword" dir="ltr" placeholder="••••••••" required />
          </Field>
        </div>

        {role === "STUDENT" && (
          <Field label="المرحلة الدراسية" required>
            <Select name="yearId" required defaultValue="">
              <option value="">اختر المرحلة الدراسية</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {state && !state.ok && (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p className="rounded-xl bg-mint-50 px-4 py-3 text-sm font-bold text-mint-dark">
            تم إنشاء حسابك بنجاح! سجّل دخولك الآن.
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
          إنشاء الحساب
        </Button>

        <p className="text-center text-sm text-slate-500">
          عندك حساب بالفعل؟{" "}
          <Link href="/login" className="font-bold text-amber-600 hover:underline">
            سجّل دخولك
          </Link>
        </p>
      </form>
    </div>
  )
}
