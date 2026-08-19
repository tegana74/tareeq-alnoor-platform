"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { Loader2, Send, Smartphone, Unlink, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/field"
import { sendLinkOtpAction, linkChildAction } from "@/app/actions/parent"

export function AddChildForm() {
  const [round, setRound] = useState(0)
  return <AddChildFlow key={round} onDone={() => setRound((r) => r + 1)} />
}

function AddChildFlow({ onDone }: { onDone: () => void }) {
  const [phone, setPhone] = useState("")
  const [countdown, setCountdown] = useState(0)
  const deadlineRef = useRef(0)
  const formRef = useRef<HTMLFormElement>(null)

  const [otpState, otpAction, otpPending] = useActionState(sendLinkOtpAction, null)
  const [linkState, linkAction, linkPending] = useActionState(linkChildAction, null)

  const sent = otpState?.ok === true
  const devCode = otpState?.ok ? otpState.devCode : undefined

  useEffect(() => {
    if (otpState?.ok) {
      deadlineRef.current = Date.now() + (otpState.expiresIn ?? 300) * 1000
      const tick = () => setCountdown(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)))
      tick()
      const t = setInterval(tick, 1000)
      return () => clearInterval(t)
    }
    if (linkState?.ok) {
      const t = setInterval(() => {}, 1000)
      return () => clearInterval(t)
    }
  }, [otpState, linkState])

  return (
    <div className="max-w-md">
      {!sent && !linkState?.ok ? (
        <form action={otpAction} className="space-y-4">
          <Field label="رقم هاتف الابن" required>
            <Input
              name="phone"
              inputMode="tel"
              dir="ltr"
              className="text-left"
              placeholder="01xxxxxxxxx"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>

          {otpState && !otpState.ok && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">{otpState.error}</p>
          )}

          <Button type="submit" disabled={otpPending}>
            {otpPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            إرسال كود التحقق
          </Button>
        </form>
      ) : linkState?.ok ? (
        <div className="space-y-4">
          <p className="rounded-xl bg-mint-50 px-4 py-3 text-sm font-bold text-mint-dark">تم ربط الابن بنجاح</p>
          <Button type="button" onClick={onDone}>
            <UserPlus className="h-4 w-4" />
            إضافة ابن آخر
          </Button>
        </div>
      ) : (
        <form action={linkAction} className="space-y-4" ref={formRef}>
          <input type="hidden" name="phone" value={phone} />
          <Field label="كود التحقق" required hint={`أُرسل إلى ${phone}`}>
            <Input name="code" inputMode="numeric" dir="ltr" className="text-left" placeholder="123456" required maxLength={6} />
          </Field>

          {devCode && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700" dir="ltr">
              كود التجربة: {devCode}
            </p>
          )}
          {linkState && !linkState.ok && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">{linkState.error}</p>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={linkPending}>
              {linkPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
              ربط الحساب
            </Button>
            <button
              type="button"
              onClick={() => {
                setPhone("")
                formRef.current?.reset()
              }}
              className="flex items-center gap-1 text-sm font-bold text-slate-400 hover:text-slate-600"
            >
              <Smartphone className="h-4 w-4" />
              تغيير الرقم
            </button>
          </div>

          {countdown > 0 && (
            <p className="text-xs text-slate-400">ينتهي صلاحية الكود خلال {countdown} ثانية</p>
          )}
        </form>
      )}
    </div>
  )
}
