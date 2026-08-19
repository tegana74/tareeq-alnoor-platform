"use client"

import { Loader2, CheckCircle2, Circle } from "lucide-react"
import { toggleFinishAction } from "@/app/actions/study-plan"
import { useSubmit } from "@/lib/use-submit"

export function FinishButton({ subjectId, finished }: { subjectId: string; finished: boolean }) {
  const { state, formAction, pending } = useSubmit(toggleFinishAction)
  return (
    <form action={formAction}>
      <input type="hidden" name="subjectId" value={subjectId} />
      <button
        type="submit"
        disabled={pending}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-black transition-colors disabled:opacity-50 ${
          finished ? "bg-mint-50 text-mint-dark hover:bg-mint-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
        }`}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : finished ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <Circle className="h-3.5 w-3.5" />
        )}
        {finished ? "تمت" : "إتمام"}
      </button>
      {state.error && <p className="mt-1 text-[11px] font-bold text-rose-600">{state.error}</p>}
    </form>
  )
}
