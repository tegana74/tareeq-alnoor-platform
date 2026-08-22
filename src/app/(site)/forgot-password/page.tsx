"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, MessageSquareText, Phone, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/field"
import { PasswordInput } from "@/components/ui/password-input"
import { Logo } from "@/components/ui/logo"
import { sendResetOtpAction, resetPasswordAction } from "@/app/actions/auth"

const OTP_LENGTH = 6

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<"phone" | "otp" | "newPassword">("phone")
  const [phone, setPhone] = useState("")
  const [otp, setOtp] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState(false)

  const [state, formAction, pending] = useActionState(sendResetOtpAction, null)
  const prevStateRef = useRef(state)

  useEffect(() => {
    if (state?.ok && !prevStateRef.current?.ok && step === "phone") {
      setStep("otp")
    }
    prevStateRef.current = state
  }, [state, step])

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    if (otp.length !== OTP_LENGTH) return
    setStep("newPassword")
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(undefined)
    if (newPassword.length < 6) {
      setError("كلمة المرور يجب ألا تقل عن 6 أحرف")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("كلمة المرور غير متطابقة")
      return
    }
    const res = await resetPasswordAction(phone, otp, newPassword)
    if (res.ok) {
      setSuccess(true)
      setTimeout(() => router.push("/login"), 2000)
    } else {
      setError(res.error)
    }
  }

  if (success) {
    return (
      <div className="w-full max-w-md text-center">
        <Logo className="justify-center" />
        <div className="mt-8 rounded-3xl border border-mint bg-mint/10 p-8">
          <ShieldCheck className="mx-auto h-16 w-16 text-mint-dark" />
          <h2 className="mt-4 text-xl font-black text-navy">تم تغيير كلمة المرور بنجاح!</h2>
          <p className="mt-2 text-sm text-slate-500">جاري التحويل لصفحة الدخول...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <Logo className="justify-center" />
        <h1 className="mt-6 text-2xl font-black text-navy">
          {step === "phone" && "استرجاع كلمة المرور"}
          {step === "otp" && "أدخل كود التحقق"}
          {step === "newPassword" && "كلمة مرور جديدة"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {step === "phone" && "أدخل رقم هاتفك وسنرسل لك كود التحقق"}
          {step === "otp" && "أدخل الكود المرسل إلى هاتفك"}
          {step === "newPassword" && "اختر كلمة مرور جديدة لحسابك"}
        </p>
      </div>

      {step === "phone" && (
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
                className="ps-11 text-left"
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
            <Link href="/login" className="font-bold text-amber-600 hover:underline">
              العودة لتسجيل الدخول
            </Link>
          </p>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
          {state && "devCode" in state && state.devCode && (
            <div className="rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3 text-center text-sm">
              <span className="font-bold text-amber-700">[وضع التطوير]</span>{" "}
              <span className="font-mono text-lg font-black tracking-widest" dir="ltr">
                {"devCode" in state ? state.devCode : ""}
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
            تأكيد الكود
          </Button>

          <p className="text-center text-sm text-slate-500">
            <button
              type="button"
              className="font-bold text-amber-600 hover:underline"
              onClick={() => { setStep("phone"); setOtp("") }}
            >
              العودة وإدخال رقم آخر
            </button>
          </p>
        </form>
      )}

      {step === "newPassword" && (
        <form onSubmit={handleResetPassword} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
          <Field label="كلمة المرور الجديدة" required>
            <PasswordInput
              dir="ltr"
              placeholder="6 أحرف على الأقل"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </Field>

          <Field label="تأكيد كلمة المرور" required>
            <PasswordInput
              dir="ltr"
              placeholder="أعد إدخال كلمة المرور"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </Field>

          {error && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full">
            <ShieldCheck className="h-5 w-5" />
            تغيير كلمة المرور
          </Button>
        </form>
      )}
    </div>
  )
}
