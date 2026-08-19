"use client"

import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { gradeEssayAnswerAction } from "@/app/actions/teacher-grading"

type State = { ok: boolean; error?: string }
const initialState: State = { ok: false }

export function EssayGradingForm({ answerId, maxPoints }: { answerId: string; maxPoints: number }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(async (_prev: State, form: FormData) => {
    const res = await gradeEssayAnswerAction(_prev, form)
    if (res.ok) {
      router.refresh()
      return { ok: true }
    }
    return res
  }, initialState)

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="answerId" value={answerId} />
      <label className="flex-1 min-w-40">
        <span className="mb-1 block text-xs font-bold text-slate-500">الدرجة</span>
        <input
          type="number"
          name="points"
          min={0}
          max={maxPoints}
          step={0.5}
          required
          placeholder={`0 - ${maxPoints}`}
          className="h-11 w-full rounded-xl border-2 border-slate-200 px-4 font-bold text-navy outline-none focus:border-violet-400"
        />
      </label>
      <label className="flex-[2] min-w-52">
        <span className="mb-1 block text-xs font-bold text-slate-500">ملاحظة (اختياري)</span>
        <input
          type="text"
          name="feedback"
          placeholder="إجابة جيدة، راجع النقطة الثانية..."
          className="h-11 w-full rounded-xl border-2 border-slate-200 px-4 text-sm font-bold text-navy outline-none focus:border-violet-400"
        />
      </label>
      <Button type="submit" variant="navy" size="md" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        تصحيح
      </Button>
      {state.error && <p className="w-full text-xs font-bold text-rose-600">{state.error}</p>}
    </form>
  )
}
