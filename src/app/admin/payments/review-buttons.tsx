"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { approveInvoiceAction, rejectInvoiceAction } from "@/app/actions/admin"
import { Button } from "@/components/ui/button"

export function ReviewButtons({ invoiceId }: { invoiceId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")

  async function approve() {
    setBusy("approve")
    setError("")
    const res = await approveInvoiceAction(invoiceId)
    if (!res.ok) setError(res.error ?? "حدث خطأ")
    router.refresh()
    setBusy(null)
  }

  async function reject() {
    setBusy("reject")
    setError("")
    const res = await rejectInvoiceAction(invoiceId, reason)
    if (!res.ok) setError(res.error ?? "حدث خطأ")
    router.refresh()
    setBusy(null)
    setRejecting(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <p className="w-full text-xs font-bold text-rose-600">{error}</p>}
      {!rejecting ? (
        <>
          <Button variant="mint" size="sm" onClick={approve} disabled={busy !== null}>
            {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            تأكيد الدفع
          </Button>
          <Button variant="danger" size="sm" onClick={() => setRejecting(true)} disabled={busy !== null}>
            <XCircle className="h-4 w-4" />
            رفض
          </Button>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="سبب الرفض (إلزامي)"
            className="h-9 w-48 rounded-lg border-2 border-slate-200 px-3 text-sm outline-none focus:border-rose-400"
          />
          <Button variant="danger" size="sm" onClick={reject} disabled={!reason || busy !== null}>
            {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            تأكيد الرفض
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRejecting(false)} disabled={busy !== null}>
            إلغاء
          </Button>
        </div>
      )}
    </div>
  )
}
