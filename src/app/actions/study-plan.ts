"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

type ActionResult = { ok: boolean; error?: string }

async function currentUser() {
  return getCurrentUser()
}

export async function createWeekAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const u = await currentUser()
  if (!u || u.role !== "ADMIN") return { ok: false, error: "غير مصرح" }

  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  if (title.length < 2) return { ok: false, error: "اكتب عنوان الأسبوع" }

  const last = await prisma.studyPlanWeek.findFirst({ orderBy: { order: "desc" } })
  await prisma.studyPlanWeek.create({
    data: { title, description: description || null, order: (last?.order ?? 0) + 1, isActive: true },
  })
  return { ok: true }
}

export async function deleteWeekAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const u = await currentUser()
  if (!u || u.role !== "ADMIN") return { ok: false, error: "غير مصرح" }

  const id = String(formData.get("id") ?? "")
  await prisma.studyPlanWeek.delete({ where: { id } })
  return { ok: true }
}

export async function toggleWeekAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const u = await currentUser()
  if (!u || u.role !== "ADMIN") return { ok: false, error: "غير مصرح" }

  const id = String(formData.get("id") ?? "")
  const week = await prisma.studyPlanWeek.findUnique({ where: { id } })
  if (!week) return { ok: false, error: "الأسبوع غير موجود" }
  await prisma.studyPlanWeek.update({ where: { id }, data: { isActive: !week.isActive } })
  return { ok: true }
}

export async function createSubjectAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const u = await currentUser()
  if (!u || u.role !== "ADMIN") return { ok: false, error: "غير مصرح" }

  const weekId = String(formData.get("weekId") ?? "")
  const subject = String(formData.get("subject") ?? "").trim()
  const tasksRaw = String(formData.get("tasks") ?? "").trim()
  if (subject.length < 2) return { ok: false, error: "اكتب اسم المادة" }

  const week = await prisma.studyPlanWeek.findUnique({ where: { id: weekId } })
  if (!week) return { ok: false, error: "الأسبوع غير موجود" }

  const tasks = tasksRaw.split(/\r?\n/).map((t) => t.trim()).filter(Boolean)
  const last = await prisma.studyPlanSubject.findFirst({ where: { weekId }, orderBy: { order: "desc" } })
  await prisma.studyPlanSubject.create({
    data: { weekId, subject, tasks, order: (last?.order ?? 0) + 1 },
  })
  return { ok: true }
}

export async function deleteSubjectAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const u = await currentUser()
  if (!u || u.role !== "ADMIN") return { ok: false, error: "غير مصرح" }

  const id = String(formData.get("id") ?? "")
  await prisma.studyPlanSubject.delete({ where: { id } })
  return { ok: true }
}

export async function toggleFinishAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const u = await currentUser()
  if (!u) return { ok: false, error: "يجب تسجيل الدخول أولاً" }
  if (u.role !== "STUDENT") return { ok: false, error: "المتابعة متاحة للطلاب فقط" }

  const subjectId = String(formData.get("subjectId") ?? "")
  const subject = await prisma.studyPlanSubject.findUnique({
    where: { id: subjectId },
    include: { week: true },
  })
  if (!subject) return { ok: false, error: "المادة غير موجودة" }
  if (!subject.week.isActive) return { ok: false, error: "هذه الخطة غير متاحة حالياً" }

  const existing = await prisma.studyPlanSubjectFinish.findUnique({
    where: { userId_subjectId: { userId: u.id, subjectId } },
  })
  if (existing) {
    await prisma.studyPlanSubjectFinish.delete({ where: { id: existing.id } })
    return { ok: true }
  }
  await prisma.studyPlanSubjectFinish.create({ data: { userId: u.id, subjectId } })
  return { ok: true }
}
