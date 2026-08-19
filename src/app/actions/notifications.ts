"use server"

import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

type ActionResult = { ok: boolean; error?: string }

export async function markNotificationsReadAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "غير مصرح" }

  const id = String(formData.get("id") ?? "")
  await prisma.notification.updateMany({
    where: id ? { id, userId: user.id } : { userId: user.id, isRead: false },
    data: { isRead: true },
  })
  return { ok: true }
}
