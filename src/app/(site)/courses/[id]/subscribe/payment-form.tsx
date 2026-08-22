"use client"

import { useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Copy, ImagePlus, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert } from "@/components/ui/alert"
import { Field, Input, Textarea } from "@/components/ui/field"
import { submitPaymentAction, type SubmitPaymentResult } from "@/app/actions/payments"
import { classNames, formatPrice } from "@/lib/utils"
import { uploadFile as clientUpload } from "@/lib/upload-client"

interface PaymentFormProps {
  courseId: string
  courseName: string
  price: number
  vodafone: string
  instapay: string
  walletBalance: number
}

const initialState: SubmitPaymentResult = { ok: false }

export function PaymentForm({ courseId, courseName, price, vodafone, instapay }: PaymentFormProps) {
  const router = useRouter()
  const [method, setMethod] = useState<"VODAFONE_CASH" | "INSTAPAY">("VODAFONE_CASH")
  const [uploading, setUploading] = useState(false)
  const [imageUrl, setImageUrl] = useState("")
  const [copied, setCopied] = useState(false)
  const [success, setSuccess] = useState(false)

  const [state, formAction, pending] = useActionState(async (prev: SubmitPaymentResult, form: FormData) => {
    form.set("method", method)
    form.set("courseId", courseId)
    form.set("imageUrl", imageUrl)
    const res = await submitPaymentAction(prev, form)
    if (res.ok) setSuccess(true)
    return res
  }, initialState)

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const result = await clientUpload(file, "file")
      setImageUrl(result.url)
    } catch {
      alert("حدث خطأ في رفع الصورة")
    } finally {
      setUploading(false)
    }
  }

  async function copyNumber() {
    const num = method === "VODAFONE_CASH" ? vodafone : instapay
    try {
      await navigator.clipboard.writeText(num)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard غير متاح */
    }
  }

  if (success) {
    return (
      <div className="rounded-3xl border-2 border-mint bg-mint-50 p-8 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-mint" />
        <h2 className="text-xl font-black text-navy">تم استلام طلبك بنجاح!</h2>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          سيقوم فريق {courseName} بمراجعة إثبات الدفع وتفعيل اشتراكك فوراً.
          <br />
          ستظهر حالة فاتورتك في صفحة «فواتيري».
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button href="/wallet" variant="outline">
            فواتيري
          </Button>
          <Button onClick={() => router.push("/courses")}>تصفح الكورسات</Button>
        </div>
      </div>
    )
  }

  const number = method === "VODAFONE_CASH" ? vodafone : instapay

  return (
    <form
      action={formAction}
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="border-b border-slate-100 p-6">
        <h2 className="mb-4 font-black text-navy">طريقة الدفع</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { value: "VODAFONE_CASH", label: "فودافون كاش", icon: "📱", desc: vodafone },
              { value: "INSTAPAY", label: "انستاباي", icon: "💳", desc: instapay },
            ] as const
          ).map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMethod(m.value)}
              className={classNames(
                "flex items-center gap-3 rounded-2xl border-2 p-4 text-right transition-colors",
                method === m.value
                  ? "border-amber-400 bg-amber-50"
                  : "border-slate-200 hover:border-amber-200"
              )}
            >
              <span className="text-2xl">{m.icon}</span>
              <div className="flex-1">
                <p className="font-black text-navy">{m.label}</p>
                <p className="text-xs font-mono text-slate-500">{m.desc}</p>
              </div>
              {method === m.value && <CheckCircle2 className="h-5 w-5 text-amber-500" />}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-navy">
                حوّل المبلغ إلى رقم {method === "VODAFONE_CASH" ? "فودافون كاش" : "انستاباي"}
              </p>
              <p className="mt-1 font-mono text-2xl font-black tracking-wider text-amber-600">
                {number}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                المطلوب: {formatPrice(price)} على اسم «طريق النور»
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={copyNumber}>
              {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "تم النسخ" : "نسخ الرقم"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-6 sm:grid-cols-2">
        <input type="hidden" name="method" value={method} />
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="imageUrl" value={imageUrl} />

        <Field label="المبلغ" required>
          <Input name="amount" type="number" defaultValue={price} step="0.01" required />
        </Field>

        <Field label="اسم مرسل التحويل" required>
          <Input name="senderName" placeholder="الاسم الظاهر على الإيصال" required />
        </Field>

        <Field label="رقم المرجع / الإيصال" required>
          <Input name="reference" placeholder="رقم العملية أو الإيصال" required />
        </Field>

        <Field label="تاريخ التحويل">
          <Input name="date" type="date" />
        </Field>

        <div className="sm:col-span-2">
          <Field label="صورة إيصال التحويل" required hint="صورة الإيصال أو سكرين شوت العملية (حتى 5 ميجا)">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 transition-colors hover:border-amber-400 hover:bg-amber-50/40">
              {uploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              ) : imageUrl ? (
                <CheckCircle2 className="h-8 w-8 text-mint" />
              ) : (
                <ImagePlus className="h-8 w-8 text-slate-400" />
              )}
              <span className="text-sm font-bold text-slate-600">
                {imageUrl ? "تم رفع الإيصال بنجاح" : "اضغط لاختيار صورة الإيصال"}
              </span>
              {imageUrl && (
                <span className="text-xs font-bold text-mint-dark">✓ {imageUrl.split("/").pop()}</span>
              )}
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={uploadFile} />
            </label>
          </Field>
        </div>

        <Field label="كود الخصم (اختياري)">
          <Input name="couponCode" placeholder="أدخل كود الكوبون إن وجد" />
        </Field>

        <Field label="ملاحظات (اختياري)">
          <Input name="notes" placeholder="أي ملاحظات للأدمن" />
        </Field>

        {state.error && (
          <div className="sm:col-span-2">
            <Alert variant="danger">{state.error}</Alert>
          </div>
        )}

        <div className="sm:col-span-2">
          <Button type="submit" size="lg" className="w-full" disabled={pending || uploading} loading={pending}>
            <Send className="h-4 w-4" />
            {pending ? "جارٍ إرسال الطلب..." : "تأكيد طلب الاشتراك"}
          </Button>
          <p className="mt-2 text-center text-xs text-slate-400">
            سيتم تفعيل اشتراكك بعد مراجعة إثبات الدفع من فريق المتابعة.
          </p>
        </div>
      </div>
    </form>
  )
}
