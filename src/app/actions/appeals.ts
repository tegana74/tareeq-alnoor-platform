"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

const submitSchema = z.object({
  attemptId: z.string().min(1),
  reason: z.string().min(10, "اشرح سبب التظلم بوضوح (10 أحرف على الأقل)"),
})

const resolveSchema = z.object({
  appealId: z.string().min(1),
  status: z.enum(["approved", "rejected"]),
  response: z.string().min(3, "اكتب ردك على التظلم"),
  extraPoints: z.coerce.number().int().min(0).max(100),
})

export type AppealResult = { ok: boolean; error?: string }

async function getAdminId() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } })
  return admin?.id ?? null
}

async function canReviewAppeal(userId: string, appealId: string): Promise<"TEACHER" | "ADMIN" | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!user) return null
  if (user.role === "ADMIN") return "ADMIN"
  if (user.role === "TEACHER") {
    const teacher = await prisma.teacher.findFirst({ where: { user: { id: userId } } })
    if (!teacher) return null
    const own = await prisma.appeal.findFirst({
      where: {
        id: appealId,
        attempt: { exam: { section: { course: { teacherId: teacher.id } } } },
      },
    })
    if (own) return "TEACHER"
  }
  return null
}

export async function submitAppealAction(_prev: unknown, formData: FormData): Promise<AppealResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "STUDENT") return { ok: false, error: "غير مصرح" }

  const parsed = submitSchema.safeParse({
    attemptId: String(formData.get("attemptId") ?? ""),
    reason: String(formData.get("reason") ?? "").trim(),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const attempt = await prisma.examAttempt.findFirst({
    where: { id: parsed.data.attemptId, userId: user.id },
  })
  if (!attempt) return { ok: false, error: "المحاولة غير موجودة" }
  if (attempt.status !== "graded" && attempt.status !== "submitted") {
    return { ok: false, error: "لا يمكن التظلم إلا بعد اكتمال التصحيح" }
  }

  const existing = await prisma.appeal.findFirst({
    where: { attemptId: attempt.id, userId: user.id, status: "pending" },
  })
  if (existing) return { ok: false, error: "لديك تظلم قيد المراجعة على هذا الاختبار" }

  const appeal = await prisma.appeal.create({
    data: { attemptId: attempt.id, userId: user.id, reason: parsed.data.reason },
  })

  const adminId = await getAdminId()
  if (adminId) {
    await prisma.notification.create({
      data: {
        userId: adminId,
        title: "تظلم جديد",
        body: "أرسل طالب تظلماً على نتيجة اختبار، راجعه من لوحة الإدارة",
        link: `/admin/appeals`,
      },
    })
  }
  return { ok: true }
}

export async function resolveAppealAction(_prev: unknown, formData: FormData): Promise<AppealResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "غير مصرح" }

  const parsed = resolveSchema.safeParse({
    appealId: String(formData.get("appealId") ?? ""),
    status: String(formData.get("status") ?? ""),
    response: String(formData.get("response") ?? "").trim(),
    extraPoints: formData.get("extraPoints") ?? 0,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const role = await canReviewAppeal(user.id, parsed.data.appealId)
  if (!role) return { ok: false, error: "لا تملك صلاحية مراجعة هذا التظلم" }

  const appeal = await prisma.appeal.findUnique({
    where: { id: parsed.data.appealId },
    include: { attempt: { include: { exam: { include: { section: true } } } } },
  })
  if (!appeal) return { ok: false, error: "التظلم غير موجود" }
  if (appeal.status !== "pending") return { ok: false, error: "تمت مراجعة هذا التظلم بالفعل" }

  const extra = parsed.data.status === "approved" ? parsed.data.extraPoints : 0

  await prisma.$transaction(async (tx) => {
    await tx.appeal.update({
      where: { id: appeal.id },
      data: {
        status: parsed.data.status,
        response: parsed.data.response,
        extraPoints: extra,
        resolvedBy: user.id,
        resolvedAt: new Date(),
      },
    })

    if (extra > 0) {
      const attempt = await tx.examAttempt.findUnique({ where: { id: appeal.attemptId } })
      if (attempt) {
        const totalScore = Number(attempt.totalScore)
        const newScore = Math.min(Number(attempt.score) + extra, totalScore)
        await tx.examAttempt.update({
          where: { id: attempt.id },
          data: {
            score: newScore,
            isPassed: totalScore > 0 ? newScore >= totalScore * 0.5 : attempt.isPassed,
          },
        })
      }
    }

    await tx.notification.create({
      data: {
        userId: appeal.userId,
        title: parsed.data.status === "approved" ? "تم قبول تظلمك" : "تم رد تظلمك",
        body:
          parsed.data.status === "approved"
            ? `وافقنا على تظلمك على اختبار «${appeal.attempt.exam.title}»${extra > 0 ? ` وأضفنا ${extra} نقطة لدرجتك` : ""}`
            : `رفض تظلمك على اختبار «${appeal.attempt.exam.title}»`,
        link: `/courses/${appeal.attempt.exam.section.courseId}/sections/${appeal.attempt.exam.sectionId}/exam/${appeal.attempt.examId}/result/${appeal.attemptId}`,
      },
    })
  })

  return { ok: true }
}
