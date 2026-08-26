// LIVE-9B — Server-side admission helpers.
//
// كل تحقق من الصلاحيات هنا يتم على السيرفر من الجلسة المصادَق عليها.
// لا يُقرأ من العميل: userId المطالب به، الدور، ولا ملكية الجلسة.

import { prisma } from "@/lib/prisma"
import { canAccessCourse } from "@/lib/subscriptions"
import { getCurrentUser, type CurrentUser } from "@/lib/auth"
import {
  canManageAdmission,
  toAdmissionState,
  type AdmissionDecision,
  type AdmissionState,
} from "./admission"

/** رفض موحّد الشكل حتى تتطابق رسائل الـ routes. */
export type AccessDenial = { ok: false; status: number; error: string }
export type AccessResult = { ok: true } | AccessDenial

type SessionAccessInput = {
  isFree: boolean
  courseId: string | null
  price: unknown
  bookings: { status: string }[]
}

/**
 * نفس سلّم صلاحيات token/attend/heartbeat الحالي — بلا أي تخفيف:
 * وصول الكورس (اشتراك/مجانية) ثم الحجز للحصص المدفوعة.
 * نظام الدخول طبقة إضافية فوق هذه القواعد، لا بديل عنها.
 */
export async function checkStudentSessionAccess(
  user: CurrentUser,
  session: SessionAccessInput
): Promise<AccessResult> {
  const hasCourseAccess =
    session.isFree ||
    !session.courseId ||
    (await canAccessCourse(user, session.courseId))

  if (!hasCourseAccess) {
    return { ok: false, status: 403, error: "غير مصرح لك بدخول هذه الجلسة" }
  }

  const isPaidSession = !session.isFree && Number(session.price) > 0
  const hasBooking = session.bookings[0]?.status === "booked"

  if (isPaidSession && !hasBooking) {
    return { ok: false, status: 403, error: "يجب حجز الحصة أولاً" }
  }

  return { ok: true }
}

/**
 * جدول live_session_admissions غير موجود بعد (migration لم تُنفَّذ).
 * Prisma P2021 = "table does not exist".
 */
export function isAdmissionTableMissing(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  return (error as { code?: unknown }).code === "P2021"
}

/** استجابة fail-closed: لا توكن ولا دخول عند تعذر قراءة حالة الدخول. */
export const ADMISSION_UNAVAILABLE = {
  status: 503,
  error: "نظام طلبات الدخول غير مهيأ بعد. تواصل مع الإدارة.",
} as const

/** حالة دخول طالب واحد في جلسة واحدة. يُرمى الخطأ للـ route ليقرر fail-closed. */
export async function readAdmissionState(
  sessionId: string,
  userId: string
): Promise<AdmissionState> {
  const record = await prisma.liveSessionAdmission.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    select: { status: true },
  })
  return toAdmissionState(record)
}

export type DecisionOutcome =
  | {
      ok: true
      body: {
        status: AdmissionState
        userId: string
        decidedAt: Date | null
      }
    }
  | AccessDenial

/**
 * منطق approve/reject المشترك.
 *
 * الهوية والدور والملكية تُستخرج كلها من الجلسة المصادَق عليها ومن قاعدة البيانات —
 * الشيء الوحيد المقروء من العميل هو معرّف الطالب المستهدَف، وهو مقيَّد بجلسة الـ URL
 * فلا يمكن للمعلم التأثير على طلب خارج جلسته.
 */
export async function decideAdmission(params: {
  sessionId: string
  targetUserId: unknown
  decision: AdmissionDecision
}): Promise<DecisionOutcome> {
  const user = await getCurrentUser()
  if (!user) {
    return { ok: false, status: 401, error: "يجب تسجيل الدخول" }
  }

  const session = await prisma.liveSession.findUnique({
    where: { id: params.sessionId },
    select: { id: true, teacherId: true },
  })
  if (!session) {
    return { ok: false, status: 404, error: "الجلسة غير موجودة" }
  }

  // الأدمن أو المعلم المالك حصراً — يُتحقق مقابل session.teacherId من قاعدة البيانات
  if (!canManageAdmission(user, session)) {
    return {
      ok: false,
      status: 403,
      error: "غير مصرح لك بإدارة طلبات الدخول لهذه الجلسة",
    }
  }

  if (typeof params.targetUserId !== "string" || params.targetUserId.length === 0) {
    return { ok: false, status: 400, error: "معرّف الطالب مطلوب" }
  }

  const where = {
    sessionId_userId: { sessionId: params.sessionId, userId: params.targetUserId },
  }
  const existing = await prisma.liveSessionAdmission.findUnique({ where })
  if (!existing) {
    return { ok: false, status: 404, error: "لا يوجد طلب دخول لهذا الطالب" }
  }

  const updated = await prisma.liveSessionAdmission.update({
    where,
    data: {
      status: params.decision,
      decidedAt: new Date(),
      decidedBy: user.id,
    },
  })

  return {
    ok: true,
    body: {
      status: toAdmissionState(updated),
      userId: params.targetUserId,
      decidedAt: updated.decidedAt,
    },
  }
}

/** قراءة جسم JSON بأمان — جسم غير صالح لا يجب أن يرمي 500. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json()
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}
