"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

type ActionResult = { ok: boolean; error?: string }

async function admin() {
  const u = await getCurrentUser()
  if (!u || u.role !== "ADMIN") return null
  return u
}

const locSchema = z.object({
  name: z.string().trim().min(2, "اكتب اسم المنفذ"),
  governorate: z.string().trim().min(2, "اكتب المحافظة"),
  address: z.string().trim().min(2, "اكتب العنوان"),
  phone: z.string().trim().optional(),
})

export async function createStoreLocatorAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const u = await admin()
  if (!u) return { ok: false, error: "غير مصرح" }

  const parsed = locSchema.safeParse({
    name: formData.get("name"),
    governorate: formData.get("governorate"),
    address: formData.get("address"),
    phone: String(formData.get("phone") ?? "").trim() || undefined,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  await prisma.storeLocator.create({
    data: {
      name: parsed.data.name,
      governorate: parsed.data.governorate,
      address: parsed.data.address,
      phone: parsed.data.phone || null,
    },
  })
  return { ok: true }
}

export async function toggleStoreLocatorAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const u = await admin()
  if (!u) return { ok: false, error: "غير مصرح" }

  const id = String(formData.get("id") ?? "")
  const loc = await prisma.storeLocator.findUnique({ where: { id } })
  if (!loc) return { ok: false, error: "المنفذ غير موجود" }
  await prisma.storeLocator.update({ where: { id }, data: { isActive: !loc.isActive } })
  return { ok: true }
}

export async function deleteStoreLocatorAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const u = await admin()
  if (!u) return { ok: false, error: "غير مصرح" }

  const id = String(formData.get("id") ?? "")
  const loc = await prisma.storeLocator.findUnique({ where: { id } })
  if (!loc) return { ok: false, error: "المنفذ غير موجود" }
  await prisma.storeLocator.delete({ where: { id } })
  return { ok: true }
}
