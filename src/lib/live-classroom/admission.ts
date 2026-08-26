// LIVE-9B — Student Admission & Waiting Room (pure policy layer)
//
// كل قواعد الدخول هنا: دوال خالصة بلا React وبلا Prisma، لتكون قابلة للاختبار
// ولتشترك فيها الـ routes والواجهة دون تكرار منطق الصلاحيات.
//
// مصدر الحقيقة لحالة الدخول هو جدول live_session_admissions (وليس حالة React).

import type { LiveSessionStatus } from "./types"

/** حالات طلب الدخول المخزنة. لا حالات إضافية بلا ضرورة. */
export const ADMISSION_STATUSES = ["pending", "approved", "rejected"] as const
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number]

/**
 * حالة الطالب كما تُعرض في الواجهة: "none" تعني لا يوجد سجل بعد (لم يطلب).
 * "none" ليست حالة مخزنة — إنها غياب السجل.
 */
export type AdmissionState = AdmissionStatus | "none"

/** القرارات المتاحة للمعلم — approve / reject فقط في هذه المرحلة. */
export type AdmissionDecision = "approved" | "rejected"

/**
 * ملاحظة تصميمية (LIVE-9C):
 * لم نُضف "left" لأن المغادرة حدث اتصال في LiveKit ولا تحمل أي معنى تصريحي —
 * الموافقة تبقى سارية فيعود الطالب فوراً دون طلب جديد.
 * "kicked" سيكون ضرورياً في LIVE-9C: بدونه يستطيع الطالب المطرود إعادة طلب توكن
 * فوراً لأن سجله يبقى approved. ولأن العمود نصي (String) فإن إضافة "kicked"
 * لاحقاً لا تتطلب migration جديدة — قيمة رابعة على نفس العمود.
 */

/**
 * هل هذه الجلسة تُدار بنظام طلبات الدخول؟
 * فقط جلسات LiveKit (بدون رابط خارجي). YouTube/Zoom/Meet تحتفظ بسلوكها الحالي.
 */
export function isAdmissionManagedSession(url: string | null | undefined): boolean {
  return !url
}

/** حالات الجلسة التي يُسمح فيها بإنشاء طلب دخول جديد. */
const REQUESTABLE_SESSION_STATUSES: readonly LiveSessionStatus[] = [
  "scheduled",
  "waiting",
  "live",
]

/**
 * هل يمكن إنشاء/تحديث طلب دخول لجلسة بهذه الحالة؟
 * ended / cancelled / recording / archived → لا.
 */
export function canRequestAdmission(status: LiveSessionStatus): boolean {
  return REQUESTABLE_SESSION_STATUSES.includes(status)
}

/**
 * هل يملك هذا المستخدم إدارة طلبات دخول هذه الجلسة؟
 * الأدمن، أو المعلم المالك للجلسة حصراً. لا يُقرأ أي دور أو ملكية من العميل.
 */
export function canManageAdmission(
  user: { role: string; teacherId: string | null } | null,
  session: { teacherId: string }
): boolean {
  if (!user) return false
  if (user.role === "ADMIN") return true
  if (user.role === "TEACHER") {
    return user.teacherId !== null && user.teacherId === session.teacherId
  }
  return false
}

/** حالة الدخول المشتقة من سجل قاعدة البيانات (أو غيابه). */
export function toAdmissionState(
  record: { status: string } | null | undefined
): AdmissionState {
  if (!record) return "none"
  return (ADMISSION_STATUSES as readonly string[]).includes(record.status)
    ? (record.status as AdmissionStatus)
    : "none"
}

/**
 * بوابة التوكن للطالب: هل يُسمح بإصدار Subscriber token؟
 *
 * - المعلم/الأدمن: لا تمر من هنا إطلاقاً (سلوكهم لم يتغير).
 * - جلسة برابط خارجي: نظام الدخول لا ينطبق → السلوك القديم كما هو.
 * - جلسة LiveKit: يجب أن تكون حالة الطالب approved.
 */
export function canIssueStudentToken(params: {
  sessionUrl: string | null | undefined
  admission: AdmissionState
}): boolean {
  if (!isAdmissionManagedSession(params.sessionUrl)) return true
  return params.admission === "approved"
}

/** هل يُسمح للطالب بإعادة الطلب بعد الرفض؟ سياسة LIVE-9B: نعم. */
export const ALLOW_REREQUEST_AFTER_REJECT = true

/**
 * ما ينتج عن ضغط الطالب على «طلب دخول» بحسب حالته الحالية:
 * - none      → إنشاء سجل pending
 * - pending   → لا شيء (idempotent — لا سجل جديد)
 * - approved  → لا شيء (موافق عليه بالفعل)
 * - rejected  → إعادة تعيين إلى pending (إن كانت السياسة تسمح)
 */
export function resolveRequestOutcome(
  current: AdmissionState
): "create" | "unchanged" | "reset-to-pending" {
  if (current === "none") return "create"
  if (current === "rejected") {
    return ALLOW_REREQUEST_AFTER_REJECT ? "reset-to-pending" : "unchanged"
  }
  return "unchanged"
}

/** هل تبقى الواجهة تستعلم عن حالة الدخول؟ فقط أثناء pending. */
export function shouldPollAdmission(state: AdmissionState): boolean {
  return state === "pending"
}

/** فترة الاستعلام أثناء الانتظار (مللي ثانية) — 4 ثوانٍ. */
export const ADMISSION_POLL_INTERVAL_MS = 4000

/** أقصى تباطؤ للوحة المعلم عند خلو الطلبات (مللي ثانية) — 20 ثانية. */
export const ADMISSION_POLL_MAX_INTERVAL_MS = 20000

/**
 * فترة الاستعلام التالية للوحة المعلم — تباطؤ تدريجي بلا توقف.
 *
 * - وجود طلب واحد على الأقل (emptyRounds = 0) → عودة فورية إلى 4 ثوانٍ.
 * - كل جولة خالية متتالية → تباطؤ خطي: 8 ← 12 ← 16 ← 20 ثانية.
 * - الحد الأعلى 20 ثانية: الاستعلام لا يتوقف أبداً، فأي طلب جديد يُكتشف
 *   خلال 20 ثانية كأسوأ حال ثم تعود اللوحة إلى الإيقاع السريع.
 */
export function nextAdmissionPollDelay(emptyRounds: number): number {
  if (emptyRounds <= 0) return ADMISSION_POLL_INTERVAL_MS
  return Math.min(
    ADMISSION_POLL_INTERVAL_MS * (emptyRounds + 1),
    ADMISSION_POLL_MAX_INTERVAL_MS
  )
}
