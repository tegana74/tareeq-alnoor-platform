"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export type StructureResult = { ok: boolean; error?: string }

async function isAdmin() {
  const user = await getCurrentUser()
  return !!(user && user.role === "ADMIN")
}

const nameSchema = z.string().min(2, "الاسم قصير جداً").max(60, "الاسم طويل جداً")
const intSchema = z.coerce.number().int().min(0).max(1000)
const colorSchema = z.string().regex(/^#([0-9a-fA-F]{6})$/, "اللون بصيغة #RRGGBB").optional()

// ============================= السنوات =============================

export async function createYearAction(_prev: unknown, formData: FormData): Promise<StructureResult> {
  if (!(await isAdmin())) return { ok: false, error: "غير مصرح" }

  const name = nameSchema.safeParse(String(formData.get("name") ?? "").trim())
  if (!name.success) return { ok: false, error: name.error.issues[0].message }
  const order = intSchema.safeParse(formData.get("order") ?? 0)
  if (!order.success) return { ok: false, error: "الترتيب رقم صحيح" }

  await prisma.year.create({ data: { name: name.data, order: order.data } })
  revalidatePath("/admin/structure")
  revalidatePath("/register")
  return { ok: true }
}

export async function updateYearAction(_prev: unknown, formData: FormData): Promise<StructureResult> {
  if (!(await isAdmin())) return { ok: false, error: "غير مصرح" }

  const id = String(formData.get("id") ?? "")
  const name = nameSchema.safeParse(String(formData.get("name") ?? "").trim())
  if (!name.success) return { ok: false, error: name.error.issues[0].message }
  const order = intSchema.safeParse(formData.get("order") ?? 0)
  if (!order.success) return { ok: false, error: "الترتيب رقم صحيح" }

  await prisma.year.update({ where: { id }, data: { name: name.data, order: order.data } })
  revalidatePath("/admin/structure")
  return { ok: true }
}

export async function toggleYearAction(formData: FormData): Promise<StructureResult> {
  if (!(await isAdmin())) return { ok: false, error: "غير مصرح" }

  const id = String(formData.get("id") ?? "")
  const current = await prisma.year.findUnique({ where: { id }, select: { isActive: true } })
  if (!current) return { ok: false, error: "غير موجود" }
  await prisma.year.update({ where: { id }, data: { isActive: !current.isActive } })
  revalidatePath("/admin/structure")
  return { ok: true }
}

export async function deleteYearAction(formData: FormData): Promise<StructureResult> {
  if (!(await isAdmin())) return { ok: false, error: "غير مصرح" }

  const id = String(formData.get("id") ?? "")
  const count = await prisma.course.count({ where: { yearId: id } })
  const users = await prisma.user.count({ where: { yearId: id } })
  if (count > 0 || users > 0) {
    return { ok: false, error: "لا يمكن حذف مرحلة عليها كورسات أو طلاب، فعّلها/عطّلها بدلاً من ذلك" }
  }
  await prisma.year.delete({ where: { id } })
  revalidatePath("/admin/structure")
  return { ok: true }
}

// ============================= الشعوب =============================

export async function createDepartmentAction(_prev: unknown, formData: FormData): Promise<StructureResult> {
  if (!(await isAdmin())) return { ok: false, error: "غير مصرح" }

  const name = nameSchema.safeParse(String(formData.get("name") ?? "").trim())
  if (!name.success) return { ok: false, error: name.error.issues[0].message }
  const yearId = String(formData.get("yearId") ?? "")
  if (!yearId) return { ok: false, error: "اختر المرحلة" }
  const order = intSchema.safeParse(formData.get("order") ?? 0)
  if (!order.success) return { ok: false, error: "الترتيب رقم صحيح" }

  await prisma.department.create({ data: { name: name.data, yearId, order: order.data } })
  revalidatePath("/admin/structure")
  return { ok: true }
}

export async function toggleDepartmentAction(formData: FormData): Promise<StructureResult> {
  if (!(await isAdmin())) return { ok: false, error: "غير مصرح" }

  const id = String(formData.get("id") ?? "")
  const current = await prisma.department.findUnique({ where: { id }, select: { isActive: true } })
  if (!current) return { ok: false, error: "غير موجود" }
  await prisma.department.update({ where: { id }, data: { isActive: !current.isActive } })
  revalidatePath("/admin/structure")
  return { ok: true }
}

export async function deleteDepartmentAction(formData: FormData): Promise<StructureResult> {
  if (!(await isAdmin())) return { ok: false, error: "غير مصرح" }

  const id = String(formData.get("id") ?? "")
  const count = await prisma.course.count({ where: { departmentId: id } })
  if (count > 0) {
    return { ok: false, error: "لا يمكن حذف شعبة عليها كورسات، فعّلها/عطّلها بدلاً من ذلك" }
  }
  await prisma.department.delete({ where: { id } })
  revalidatePath("/admin/structure")
  return { ok: true }
}

// ============================= المواد =============================

export async function createSubjectAction(_prev: unknown, formData: FormData): Promise<StructureResult> {
  if (!(await isAdmin())) return { ok: false, error: "غير مصرح" }

  const name = nameSchema.safeParse(String(formData.get("name") ?? "").trim())
  if (!name.success) return { ok: false, error: name.error.issues[0].message }
  const yearId = String(formData.get("yearId") ?? "") || null
  const icon = String(formData.get("icon") ?? "").trim() || null
  const color = colorSchema.safeParse(String(formData.get("color") ?? "").trim())
  const order = intSchema.safeParse(formData.get("order") ?? 0)
  if (!order.success) return { ok: false, error: "الترتيب رقم صحيح" }

  await prisma.subject.create({
    data: { name: name.data, yearId, icon, color: color.success && color.data ? color.data : null, order: order.data },
  })
  revalidatePath("/admin/structure")
  revalidatePath("/")
  return { ok: true }
}

export async function toggleSubjectAction(formData: FormData): Promise<StructureResult> {
  if (!(await isAdmin())) return { ok: false, error: "غير مصرح" }

  const id = String(formData.get("id") ?? "")
  const current = await prisma.subject.findUnique({ where: { id }, select: { isActive: true } })
  if (!current) return { ok: false, error: "غير موجود" }
  await prisma.subject.update({ where: { id }, data: { isActive: !current.isActive } })
  revalidatePath("/admin/structure")
  revalidatePath("/")
  return { ok: true }
}

export async function deleteSubjectAction(formData: FormData): Promise<StructureResult> {
  if (!(await isAdmin())) return { ok: false, error: "غير مصرح" }

  const id = String(formData.get("id") ?? "")
  const count = await prisma.course.count({ where: { subjectId: id } })
  if (count > 0) {
    return { ok: false, error: "لا يمكن حذف مادة عليها كورسات، فعّلها/عطّلها بدلاً من ذلك" }
  }
  await prisma.subject.delete({ where: { id } })
  revalidatePath("/admin/structure")
  revalidatePath("/")
  return { ok: true }
}

