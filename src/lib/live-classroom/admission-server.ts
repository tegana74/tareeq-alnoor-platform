// LIVE-9B — Server-side admission helpers.
//
// كل تحقق من الصلاحيات هنا يتم على السيرفر من الجلسة المصادَق عليها.
// لا يُقرأ من العميل: userId المطالب به، الدور، ولا ملكية الجلسة.

import { prisma } from "@/lib/prisma"
import { canAccessCourse } from "@/lib/subscriptions"
import { getCurrentUser, type CurrentUser } from "@/lib/auth"
import {
  canIssueStudentToken,
  canManageAdmission,
  isAdmissionManagedSession,
  toAdmissionState,
  type AdmissionDecision,
  type AdmissionState,
} from "./admission"
import { ROSTER_STATUSES, type AdmissionRosterRow } from "./participants"

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

/**
 * LIVE-9C — بوابة الدخول لمسارَي attend و heartbeat.
 *
 * قبل 9C كان مسار التوكن هو الحاجز الوحيد، فكان الطالب المطرود (أو غير الموافق
 * عليه) قادراً على تسجيل حضوره بنداء HTTP مباشر بلا أي اتصال بالغرفة. البوابة
 * هنا تُغلق ذلك بنفس قاعدة التوكن حرفياً — بلا تخفيف وبلا تشديد.
 *
 * لا يُمسّ أي سلوك قائم:
 *   - المعلم المالك/الأدمن يمرّ كما هو (لا سجل دخول له إطلاقاً).
 *   - الجلسات الخارجية (YouTube/Zoom/Meet) لا تدخل هذه البوابة أصلاً.
 *   - الحضور المسجَّل سابقاً لا يُحذف ولا يُعدَّل: الطرد يمنع نبضة جديدة فقط.
 *
 * fail-closed: تعذّر قراءة الحالة ⇒ لا تسجيل حضور. الأخطاء لا تُرمى إلى الخارج
 * لأن هذين المسارين بلا try/catch، ولا تُعاد أي تفاصيل داخلية إلى العميل.
 */
export async function checkAttendanceAdmission(
  user: CurrentUser,
  session: { id: string; teacherId: string; url: string | null }
): Promise<AccessResult> {
  if (!isAdmissionManagedSession(session.url)) return { ok: true }
  if (canManageAdmission(user, session)) return { ok: true }

  let admission: AdmissionState
  try {
    admission = await readAdmissionState(session.id, user.id)
  } catch (error) {
    if (isAdmissionTableMissing(error)) {
      console.error("[LIVE_ATTENDANCE] live_session_admissions table missing")
      return { ok: false, ...ADMISSION_UNAVAILABLE }
    }
    console.error("[LIVE_ATTENDANCE] admission read failed")
    return {
      ok: false,
      status: 503,
      error: "تعذّر التحقق من حالة دخولك. أعد المحاولة.",
    }
  }

  if (!canIssueStudentToken({ sessionUrl: session.url, admission })) {
    return { ok: false, status: 403, error: "غير مصرح لك بحضور هذه الجلسة" }
  }

  return { ok: true }
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

// ─── LIVE-9C — قراءات لوحة المشاركين ────────────────────────────────────────

/** اسم المستخدم للعرض — من جدول User حصراً، لا من LiveKit. */
function formatUserName(user: {
  firstName: string
  middleName: string | null
  lastName: string
}): string {
  return `${user.firstName} ${user.middleName ?? ""} ${user.lastName}`
    .replace(/\s+/g, " ")
    .trim()
}

const ROSTER_USER_SELECT = {
  firstName: true,
  middleName: true,
  lastName: true,
  year: { select: { name: true } },
  department: { select: { name: true } },
} as const

/**
 * صفوف الدخول التي تظهر في لوحة المشاركين (approved + kicked).
 *
 * قراءة واحدة تخدم القائمة كلها؛ الحضور الفعلي يأتي من LiveKit ولا يُخزَّن.
 * pending تملكها لوحة طلبات الدخول (LIVE-9B) فلا تُقرأ هنا.
 */
export async function readRosterAdmissions(
  sessionId: string
): Promise<AdmissionRosterRow[]> {
  const rows = await prisma.liveSessionAdmission.findMany({
    where: { sessionId, status: { in: [...ROSTER_STATUSES] } },
    orderBy: { requestedAt: "asc" },
    select: {
      userId: true,
      status: true,
      decidedAt: true,
      user: { select: ROSTER_USER_SELECT },
    },
  })

  return rows.map((row) => ({
    userId: row.userId,
    status: row.status,
    name: formatUserName(row.user),
    yearName: row.user.year?.name ?? null,
    departmentName: row.user.department?.name ?? null,
    decidedAt: row.decidedAt,
  }))
}

export type KickTarget = {
  /** هل يوجد سجل دخول للمستهدَف في هذه الجلسة تحديداً؟ */
  exists: boolean
  status: AdmissionState
  /** الدور والملكية من جدول User — null إن لم يوجد المستخدم إطلاقاً. */
  user: { role: string; teacherId: string | null } | null
}

/**
 * السجل المستهدَف بالطرد + دور صاحبه.
 *
 * الدور و teacherId يُقرآن من قاعدة البيانات لا من العميل، ليُمنع طرد معلم
 * الجلسة أو الأدمن. سجل الدخول مقيَّد بـ sessionId فلا يمكن استهداف جلسة أخرى.
 *
 * المستخدم يُقرأ من جدول User مستقلاً عن سجل الدخول: المعلم/الأدمن لا سجل دخول
 * له إطلاقاً (مسار request يرفضه)، فلو استنتجنا الدور من السجل وحده لعاد الرد
 * «لا يوجد طلب دخول» بدل «لا يمكن إخراج معلم الجلسة».
 */
export async function readKickTarget(
  sessionId: string,
  targetUserId: string
): Promise<KickTarget> {
  const [row, targetUser] = await Promise.all([
    prisma.liveSessionAdmission.findUnique({
      where: { sessionId_userId: { sessionId, userId: targetUserId } },
      select: { status: true },
    }),
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { role: true, teacherId: true },
    }),
  ])

  return {
    exists: row !== null,
    status: toAdmissionState(row),
    user: targetUser,
  }
}

export type KickOutcome = {
  status: AdmissionState
  userId: string
  decidedAt: Date | null
}

/**
 * تثبيت حالة "kicked" في قاعدة البيانات.
 *
 * تُستدعى قبل إزالة المشارك من LiveKit عن قصد: الحظر هو الحاجز الدائم (يمنع
 * أي توكن جديد)، والإزالة أثر فوري. لو انعكس الترتيب لأمكن للطالب أن يُعيد
 * الاتصال في الفجوة بين الإزالة والكتابة.
 */
export async function markKicked(params: {
  sessionId: string
  targetUserId: string
  actorUserId: string
}): Promise<KickOutcome> {
  const updated = await prisma.liveSessionAdmission.update({
    where: {
      sessionId_userId: {
        sessionId: params.sessionId,
        userId: params.targetUserId,
      },
    },
    data: {
      status: "kicked",
      decidedAt: new Date(),
      decidedBy: params.actorUserId,
    },
  })

  return {
    status: toAdmissionState(updated),
    userId: params.targetUserId,
    decidedAt: updated.decidedAt,
  }
}
