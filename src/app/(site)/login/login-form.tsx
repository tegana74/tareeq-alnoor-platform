"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, Lock, MessageSquareText, Phone, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/field"
import { Logo } from "@/components/ui/logo"
import { sendOtpAction, verifyOtpAction } from "@/app/actions/auth"

const OTP_LENGTH = 6

export function LoginForm() {
  const router = useRouter()
  const [step, setStep] = useState<"credentials" | "otp">("credentials")
  const [phone, setPhone] = useState("")
  const [otp, setOtp] = useState("")
  const [countdown, setCountdown] = useState(0)
  const [devCode, setDevCode] = useState<string>()
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [state, formAction, pending] = useActionState(sendOtpAction, null)

  useEffect(() => {
    // مزامنة ناتج إجراء إرسال الكود مع حالة الواجهة — انتقال لمرة واحدة
    /* eslint-disable react-hooks/set-state-in-effect */
    if (state?.ok && step === "credentials") {
      setStep("otp")
      setDevCode(state.devCode)
      setCountdown(state.expiresIn)
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [state, step])

  useEffect(() => {
    if (countdown <= 0) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => setCountdown((c) => c - 1), 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [countdown > 0])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (otp.length !== OTP_LENGTH) return
    const res = await verifyOtpAction(phone, otp)
    if (res.ok) {
      router.push("/")
      router.refresh()
    } else {
      alert(res.error)
    }
  }

  const minutes = Math.floor(countdown / 60)
  const seconds = countdown % 60

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <Logo className="justify-center" />
        <h1 className="mt-6 text-2xl font-black text-navy">
          {step === "credentials" ? "أهلاً بيك من جديد 👋" : "أكّد رقم هاتفك"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {step === "credentials"
            ? "سجّل دخولك للمتابعة في رحلة التفوق"
            : "أدخل الكود المرسل عبر رسالة نصية إلى هاتفك"}
        </p>
      </div>

      {step === "credentials" ? (
        <form action={formAction} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
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
                required
              />
            </div>
          </Field>

          {state && !state.ok && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
              {state.error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <MessageSquareText className="h-5 w-5" />
            )}
            إرسال كود التحقق
          </Button>

          <p className="text-center text-sm text-slate-500">
            لسه ماعندكش حساب؟{" "}
            <Link href="/register" className="font-bold text-amber-600 hover:underline">
              أنشئ حساب جديد
            </Link>
          </p>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
          {devCode && (
            <div className="rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3 text-center text-sm">
              <span className="font-bold text-amber-700">[وضع التطوير]</span>{" "}
              <span className="font-mono text-lg font-black tracking-widest" dir="ltr">
                {devCode}
              </span>
            </div>
          )}

          <div className="relative flex justify-center gap-2">
            {Array.from({ length: OTP_LENGTH }).map((_, i) => (
              <span
                key={i}
                className={`flex h-12 w-10 items-center justify-center rounded-xl border-2 text-xl font-black ${
                  otp[i] ? "border-amber-400 bg-amber-50 text-navy" : "border-slate-200 bg-slate-50"
                }`}
              >
                {otp[i] ?? ""}
              </span>
            ))}
            <Input
              name="otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
              inputMode="numeric"
              dir="ltr"
              className="absolute inset-0 w-full cursor-pointer opacity-0"
              autoFocus
            />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={otp.length !== OTP_LENGTH}>
            <ShieldCheck className="h-5 w-5" />
            تأكيد الدخول
          </Button>

          <p className="text-center text-sm text-slate-500">
            {countdown > 0 ? (
              <>إعادة الإرسال بعد {minutes}:{String(seconds).padStart(2, "0")}</>
            ) : (
              <button
                type="button"
                className="font-bold text-amber-600 hover:underline"
                onClick={() => setStep("credentials")}
              >
                إعادة إرسال الكود
              </button>
            )}
          </p>
        </form>
      )}
    </div>
  )
}
