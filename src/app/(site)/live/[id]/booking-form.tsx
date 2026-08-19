"use client"

import { Loader2, Ticket, XCircle } from "lucide-react"
import { bookLiveSessionAction, cancelLiveBookingAction } from "@/app/actions/student-live"
import { formatPrice } from "@/lib/utils"
import { useSubmit } from "@/lib/use-submit"

export function BookingPanel({
  sessionId,
  title,
  price,
  wallet,
  booked,
}: {
  sessionId: string
  title: string
  price: number
  wallet: number
  booked: boolean
}) {
  const book = useSubmit(bookLiveSessionAction)
  const cancel = useSubmit(cancelLiveBookingAction)

  if (booked) {
    return (
      <div className="rounded-2xl border border-mint-200 bg-mint-50 p-5">
        <p className="mb-3 flex items-center gap-2 text-sm font-black text-mint-dark">
          <Ticket className="h-4 w-4" /> أنت محجوز في هذه الحصة
        </p>
        <form action={cancel.formAction}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <button
            type="submit"
            disabled={cancel.pending}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-rose-600 shadow-sm hover:bg-rose-50 disabled:opacity-50"
          >
            {cancel.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            إلغاء الحجز واسترداد المبلغ
          </button>
        </form>
        {cancel.state.error && <p className="mt-2 text-xs font-bold text-rose-600">{cancel.state.error}</p>}
      </div>
    )
  }

  const enough = wallet >= price
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <p className="mb-1 text-sm font-black text-amber-800">
        هذه حصة مدفوعة — احجز الآن من محفظتك للدخول
      </p>
      <p className="mb-4 text-xs text-amber-700">
        محفظتك: <span className="font-black">{formatPrice(wallet)}</span>
      </p>
      <form action={book.formAction}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <button
          type="submit"
          disabled={book.pending || !enough}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
        >
          {book.pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Ticket className="h-4 w-4" />
          )}
          {enough ? `احجز الحصة — ${formatPrice(price)}` : "رصيد غير كافٍ"}
        </button>
      </form>
      {book.state.error && <p className="mt-2 text-xs font-bold text-rose-600">{book.state.error}</p>}
      {!enough && (
        <p className="mt-2 text-center text-[11px] font-bold text-rose-600">قم بشحن محفظتك من صفحة المحفظة ثم عد للحجز</p>
      )}
    </div>
  )
}
