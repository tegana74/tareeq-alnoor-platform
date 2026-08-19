"use client"

import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, PlayCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createPracticeExamAction } from "@/app/actions/practice"

interface PracticeLauncherProps {
  chapterId: string
  chapterName: string
  questionCount: number
  loggedIn: boolean
}

type State = { ok: boolean; error?: string; attemptId?: string }
const initialState: State = { ok: false }

export function PracticeLauncher({
  chapterId,
  chapterName,
  questionCount,
  loggedIn,
}: PracticeLauncherProps) {
  const router = useRouter()

  const [state, formAction, pending] = useActionState(async (prev: State, form: FormData) => {
    form.set("chapterId", chapterId)
    const res = await createPracticeExamAction(prev, form)
    if (res.ok && res.attemptId) {
      router.push(`/practice/${res.attemptId}`)
      return { ok: true }
    }
    return res
  }, initialState)

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4">
      <div>
        <p className="font-bold text-navy">{chapterName}</p>
        <p className="text-xs text-slate-500">{questionCount} سؤال متاح</p>
      </div>
      <form action={formAction} className="flex items-center gap-2">
        <select
          name="count"
          defaultValue={Math.min(5, questionCount)}
          className="h-9 w-20 rounded-lg border-2 border-slate-200 px-2 text-xs font-bold text-slate-600 outline-none focus:border-amber-400"
        >
          {[3, 5, 10].filter((n) => n <= questionCount || n === 3).map((n) => (
            <option key={n} value={n}>
              {n} أسئلة
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={pending || !loggedIn}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          ابدأ
        </Button>
      </form>
      {state.error && <p className="w-full text-xs font-bold text-rose-600">{state.error}</p>}
    </div>
  )
}
