"use client"

import { useActionState, useState } from "react"
import { useRouter } from "next/navigation"

type State = { ok: boolean; error?: string }

export function useSubmit(action: (prev: State, form: FormData) => Promise<State>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(async (prev: State, form: FormData) => {
    const res = await action(prev, form)
    if (res.ok) {
      router.refresh()
      return { ok: true }
    }
    return res
  }, { ok: false })
  return { open, setOpen, state, formAction, pending }
}
