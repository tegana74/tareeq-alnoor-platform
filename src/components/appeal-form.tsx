"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle2, Loader2, MessageSquareWarning } from "lucide-react"
import { submitAppealAction } from "@/app/actions/appeals"
import { useSubmit } from "@/lib/use-submit"
import { Button } from "@/components/ui/button"

export function AppealForm({ attemptId, examTitle }: { attemptId: string; examTitle: string }) {
  const [open, setOpen] = useState(false)
  const { state, formAction, pending } = useSubmit(submitAppealAction)

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 font-black text-rose-700">
            <MessageSquareWarning className="h-4 w-4" />
            غير راضٍ عن نتيجة «{examTitle}»؟
          </p>
          <p className="mt-0.5 text-xs text-rose-600/70">قدّم تظلماً وسيراجع المدرس إجابتك خلال وقت قصير</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "إلغاء" : "تقديم تظلم"}
        </Button>
      </div>

      {open && (
        <form action={formAction} className="mt-4 space-y-3 border-t border-rose-200 pt-4">
          <input type="hidden" name="attemptId" value={attemptId} />
          <div>
            <label className="mb-1 block text-xs font-black text-rose-700">سبب التظلم</label>
            <textarea
              name="reason"
              required
              minLength={10}
              rows={4}
              placeholder="اشرح سبب اعتراضك على التصحيح..."
              className="w-full rounded-xl border-2 border-rose-200 bg-white px-3 py-2 text-sm font-bold text-navy outline-none focus:border-rose-400"
            />
          </div>
          {state.error && (
            <p className="flex items-center gap-2 text-sm font-bold text-rose-600">
              <AlertCircle className="h-4 w-4" />
              {state.error}
            </p>
          )}
          {state.ok && (
            <p className="flex items-center gap-2 text-sm font-bold text-mint-dark">
              <CheckCircle2 className="h-4 w-4" />
              تم إرسال التظلم للمراجعة
            </p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareWarning className="h-4 w-4" />}
            إرسال التظلم
          </Button>
        </form>
      )}
    </div>
  )
}
