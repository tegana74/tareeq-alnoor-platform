"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, Lock, LogIn, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/field"
import { Logo } from "@/components/ui/logo"
import { directLoginAction } from "@/app/actions/auth"

export function LoginForm() {
  const router = useRouter()
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(undefined)
    setPending(true)
    const res = await directLoginAction(phone, password)
    setPending(false)
    if (res.ok) {
      router.push("/")
      router.refresh()
    } else {
      setError(res.error)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <Logo className="justify-center" />
        <h1 className="mt-6 text-2xl font-black text-navy">
          أهلاً بيك من جديد 👋
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          سجّل دخولك للمتابعة في رحلة التفوق
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
        <Field label="رقم الهاتف" required>
          <div className="relative">
            <Phone className="absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              name="phone"
              inputMode="tel"
              dir="ltr"
              placeholder="01xxxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="pr-11 text-left"
              required
            />
          </div>
        </Field>

        <Field label="كلمة المرور" required>
          <div className="relative">
            <Lock className="absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              name="password"
              type="password"
              dir="ltr"
              placeholder="••••••••"
              className="pr-11 text-left"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </Field>

        {error && (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <LogIn className="h-5 w-5" />
          )}
          تسجيل الدخول
        </Button>

        <p className="text-center text-sm text-slate-500">
          لسه ماعندكش حساب؟{" "}
          <Link href="/register" className="font-bold text-amber-600 hover:underline">
            أنشئ حساب جديد
          </Link>
        </p>
      </form>
    </div>
  )
}
