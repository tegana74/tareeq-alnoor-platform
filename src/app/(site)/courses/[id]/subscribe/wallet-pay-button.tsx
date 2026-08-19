"use client"

import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { payFromWalletAction, type SubmitPaymentResult } from "@/app/actions/payments"
import { formatPrice } from "@/lib/utils"

interface WalletPayButtonProps {
  courseId: string
  price: number
}

const initialState: SubmitPaymentResult = { ok: false }

export function WalletPayButton({ courseId, price }: WalletPayButtonProps) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(
    async (prev: SubmitPaymentResult, form: FormData) => {
      form.set("courseId", courseId)
      const res = await payFromWalletAction(prev, form)
      if (res.ok) {
        router.push(`/courses/${courseId}/sections`)
        router.refresh()
      }
      return res
    },
    initialState
  )

  return (
    <form action={formAction}>
      {state.error && <p className="mb-2 text-xs font-bold text-rose-600">{state.error}</p>}
      <Button type="submit" variant="mint" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        {pending ? "جارٍ الدفع..." : `ادفع ${formatPrice(price)} من المحفظة`}
      </Button>
    </form>
  )
}
