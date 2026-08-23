"use client"

import { CheckCircle2, BookOpen, Loader2 } from "lucide-react"
import { markBookCompletedAction } from "@/app/actions/books"
import { useSubmit } from "@/lib/use-submit"
import { classNames } from "@/lib/utils"

/**
 * زر «تمت القراءة» — يسجّل إكمال الكتاب مرة واحدة (idempotent).
 * بعد النجاح يتحول إلى حالة تأكيد مع feedback نصي + أيقوني (لا لون فقط).
 */
export function BookReadButton({
  bookId,
  initialDone,
  className = "",
}: {
  bookId: string
  initialDone: boolean
  className?: string
}) {
  const { state, formAction, pending } = useSubmit(markBookCompletedAction)
  const done = initialDone || state.ok === true

  return (
    <div className={classNames("inline-flex flex-col items-start gap-1", className)}>
      <button
        type="button"
        disabled={pending || done}
        aria-live="polite"
        title={done ? "أكملت قراءة هذا الكتاب" : "ضع علامة أنك أنهيت قراءة الكتاب"}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          const f = new FormData()
          f.set("bookId", bookId)
          formAction(f)
        }}
        className={classNames(
          "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400",
          done
            ? "bg-success-50 text-success-strong"
            : "bg-primary-50 text-primary-700 hover:bg-primary-100 disabled:opacity-60"
        )}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : done ? (
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        ) : (
          <BookOpen className="h-4 w-4" aria-hidden="true" />
        )}
        {done ? "تمت القراءة ✓" : pending ? "جارٍ الحفظ..." : "تمت القراءة"}
      </button>
      {state.error && (
        <p role="alert" className="text-xs font-semibold text-danger-strong">
          {state.error}
        </p>
      )}
    </div>
  )
}
