"use client"

import { useActionState, useState } from "react"
import { CheckCircle2, Loader2, Plus, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  createBankQuestionAction,
  deleteBankQuestionAction,
} from "@/app/actions/question-bank"

type State = { ok: boolean; error?: string }
const initialState: State = { ok: false }

function useSubmit(action: (prev: State, form: FormData) => Promise<State>) {
  const [state, formAction, pending] = useActionState(action, initialState)
  return { state, formAction, pending }
}

function ErrorBox({ error }: { error?: string }) {
  if (!error) return null
  return <p className="text-xs font-bold text-rose-600">{error}</p>
}

const inputCls = "h-10 w-full rounded-lg border-2 border-slate-200 px-3 text-sm font-bold text-navy outline-none focus:border-amber-400"

export function QuestionForm({ chapterId }: { chapterId: string }) {
  const { state, formAction, pending } = useSubmit(createBankQuestionAction)
  const [open, setOpen] = useState(false)

  return (
    <div>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(!open)}>
        <Plus className="h-4 w-4" /> سؤال
      </Button>
      {open && (
        <form action={formAction} className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <input type="hidden" name="chapterId" value={chapterId} />
          <textarea name="text" required placeholder="نص السؤال" rows={2} className={`${inputCls} h-auto py-2`} />
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <select name="type" className={inputCls}>
              <option value="MCQ">اختيار من متعدد</option>
              <option value="ESSAY">سؤال مقالي</option>
            </select>
            <select name="difficulty" className={inputCls}>
              <option value="easy">سهل</option>
              <option value="medium">متوسط</option>
              <option value="hard">صعب</option>
            </select>
            <input name="points" type="number" min="1" max="50" defaultValue="1" placeholder="الدرجات" className={inputCls} />
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input name="option0" placeholder="الخيار أ" className={inputCls} />
            <input name="option1" placeholder="الخيار ب" className={inputCls} />
            <input name="option2" placeholder="الخيار ج" className={inputCls} />
            <input name="option3" placeholder="الخيار د" className={inputCls} />
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input name="correctAnswer" placeholder="الإجابة الصحيحة (رقم الخيار)" className={inputCls} />
            <input name="explanation" placeholder="شرح الإجابة (اختياري)" className={inputCls} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button type="submit" size="sm" variant="navy" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
          </div>
          <ErrorBox error={state.error} />
        </form>
      )}
    </div>
  )
}

export function QuestionActions({ questionId }: { questionId: string }) {
  const { formAction, pending } = useSubmit(deleteBankQuestionAction)
  return (
    <form action={formAction} onSubmit={() => confirm("حذف السؤال؟")}>
      <input type="hidden" name="questionId" value={questionId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} className="text-rose-500 hover:bg-rose-50">
        <Trash2 className="h-4 w-4" />
      </Button>
    </form>
  )
}
