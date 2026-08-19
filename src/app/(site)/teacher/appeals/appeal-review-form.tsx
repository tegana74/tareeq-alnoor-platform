"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react"
import { resolveAppealAction } from "@/app/actions/appeals"
import { useSubmit } from "@/lib/use-submit"
import { Button } from "@/components/ui/button"

export function AppealReviewForm({
  appealId,
  currentScore,
  totalScore,
  essayAnswers,
}: {
  appealId: string
  currentScore: number
  totalScore: number
  essayAnswers: { question: string; answer: string; earned: number; max: number; feedback: string | null }[]
}) {
  const [status, setStatus] = useState<"approved" | "rejected">("approved")
  const { state, formAction, pending } = useSubmit(resolveAppealAction)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="appealId" value={appealId} />
      <input type="hidden" name="status" value={status} />

      {essayAnswers.length > 0 && (
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="mb-2 text-xs font-black text-slate-500">إجابات الطالب المقالية:</p>
          <div className="space-y-3">
            {essayAnswers.map((ea, i) => (
              <div key={i} className="rounded-lg bg-white p-3 text-sm">
                <p className="font-bold text-navy">
                  {ea.question}
                  <span className="mr-2 text-xs text-slate-400">
                    {ea.earned}/{ea.max} درجة
                  </span>
                </p>
                <p className="mt-1 text-slate-600">{ea.answer || <span className="text-slate-400">لم يُجب</span>}</p>
                {ea.feedback && <p className="mt-1 text-xs text-amber-700">ملاحظة: {ea.feedback}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-black text-slate-500">القرار:</span>
        <button
          type="button"
          onClick={() => setStatus("approved")}
          className={`rounded-full px-4 py-1.5 text-xs font-black ${
            status === "approved" ? "bg-mint text-white" : "bg-mint-50 text-mint-dark"
          }`}
        >
          قبول التظلم
        </button>
        <button
          type="button"
          onClick={() => setStatus("rejected")}
          className={`rounded-full px-4 py-1.5 text-xs font-black ${
            status === "rejected" ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-600"
          }`}
        >
          رفض التظلم
        </button>
      </div>

      {status === "approved" && (
        <label className="block">
          <span className="mb-1 block text-xs font-black text-slate-500">
            نقاط إضافية للطالب (الدرجة الحالية {currentScore}/{totalScore})
          </span>
          <input
            name="extraPoints"
            type="number"
            min={0}
            max={100}
            defaultValue={0}
            dir="ltr"
            className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-mint"
          />
        </label>
      )}

      <label className="block">
        <span className="mb-1 block text-xs font-black text-slate-500">الرد على الطالب</span>
        <textarea
          name="response"
          required
          rows={3}
          className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"
          placeholder="اكتب الرد الذي سيظهر للطالب..."
        />
      </label>

      {state.error && (
        <p className="flex items-center gap-2 text-sm font-bold text-rose-600">
          <AlertCircle className="h-4 w-4" />
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="flex items-center gap-2 text-sm font-bold text-mint-dark">
          <CheckCircle2 className="h-4 w-4" />
          تم حفظ المراجعة
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : status === "approved" ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <XCircle className="h-4 w-4" />
        )}
        {status === "approved" ? "قبول التظلم" : "رفض التظلم"}
      </Button>
    </form>
  )
}
