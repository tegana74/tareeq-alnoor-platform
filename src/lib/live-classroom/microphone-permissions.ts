import { z } from "zod"
import { isAdmissionManagedSession, type AdmissionState } from "./admission"

export const MicrophoneTargetSchema = z.object({
  userId: z.string().min(1),
})

export type MicRefusalReason =
  | "invalid-target"
  | "not-managed"
  | "manager"
  | "not-student"
  | "no-record"
  | "not-approved"
  | "kicked"

export type MicPermissionCheck = { ok: true } | { ok: false; reason: MicRefusalReason }

export function canModerateMicrophoneTarget(params: {
  sessionUrl: string | null | undefined
  targetUserId: unknown
  targetRole: string | null
  targetIsManager: boolean
  hasAdmissionRecord: boolean
  admission: AdmissionState
}): MicPermissionCheck {
  const {
    sessionUrl,
    targetUserId,
    targetRole,
    targetIsManager,
    hasAdmissionRecord,
    admission,
  } = params

  if (typeof targetUserId !== "string" || targetUserId.length === 0) {
    return { ok: false, reason: "invalid-target" }
  }
  if (!isAdmissionManagedSession(sessionUrl)) {
    return { ok: false, reason: "not-managed" }
  }
  if (targetIsManager) {
    return { ok: false, reason: "manager" }
  }
  if (targetRole !== "STUDENT") {
    return { ok: false, reason: "not-student" }
  }
  if (!hasAdmissionRecord) {
    return { ok: false, reason: "no-record" }
  }
  if (admission === "kicked") {
    return { ok: false, reason: "kicked" }
  }
  if (admission !== "approved") {
    return { ok: false, reason: "not-approved" }
  }
  return { ok: true }
}

export const MICROPHONE_REFUSAL_RESPONSES: Record<
  MicRefusalReason,
  { status: number; error: string }
> = {
  "invalid-target": { status: 400, error: "معرّف الطالب مطلوب" },
  "not-managed": {
    status: 400,
    error: "هذه الجلسة لا تستخدم نظام إدارة المشاركين",
  },
  manager: {
    status: 403,
    error: "لا يمكن منح صلاحية الميكروفون للمعلم أو المشرف",
  },
  "not-student": {
    status: 403,
    error: "يمكن منح الميكروفون للطلاب فقط",
  },
  "no-record": { status: 404, error: "لا يوجد طلب دخول لهذا الطالب" },
  "not-approved": {
    status: 403,
    error: "لا يمكن منح الميكروفون لطالب غير مقبول",
  },
  kicked: {
    status: 403,
    error: "تم إخراج هذا الطالب ولا يمكن منحه الميكروفون",
  },
}

export function describeMicNotApplied(reason: "not_connected" | "rpc_failed"): string {
  if (reason === "not_connected") {
    return "الطالب غير متصل حالياً؛ لا يتم حفظ منح الميكروفون للاتصال القادم"
  }
  return "تعذر تطبيق صلاحية الميكروفون حالياً. أعد المحاولة"
}

export const MIC_GRANT_REVOKE_LIMIT = { max: 10, windowMs: 10_000 } as const
export const MIC_MUTE_ALL_LIMIT = { max: 2, windowMs: 10_000 } as const

// ─── LIVE-9F — قراءة صلاحية نشر الميكروفون (تفسير واحد للسيرفر والعميل) ─────

/**
 * قيمة TrackSource.MICROPHONE في مخطط protobuf الخاص بـ LiveKit.
 *
 * livekit-client لا يُصدِّر هذا الـ enum (يُصدِّر Track.Source النصي فقط)،
 * و @livekit/protocol ليست تبعية مباشرة في package.json — فلا تُستورد هنا.
 * القيمة مثبَّتة في المخطط المولَّد: UNKNOWN=0, CAMERA=1, MICROPHONE=2,
 * SCREEN_SHARE=3, SCREEN_SHARE_AUDIO=4. الطرف الذي يملك الـ enum
 * (livekit-server-sdk على السيرفر) يُمرِّر قيمته صريحةً بدل الاعتماد عليها.
 */
export const MICROPHONE_TRACK_SOURCE = 2

/** الشكل المشترك بين ParticipantPermission (سيرفر) وpermissions (عميل). */
export interface MicrophonePublishPermission {
  canPublish?: boolean
  canPublishSources?: readonly number[] | null
}

/**
 * هل تسمح هذه الصلاحية بنشر الميكروفون؟
 *
 * canPublish هي البوابة الأولى: بلا نشر لا ميكروفون. أما canPublishSources
 * الفارغة فتعني **كل المصادر مسموحة** في دلالات LiveKit، وهذا هو التفسير
 * الموحَّد هنا — كان السيرفر يقرأها سابقاً كـ«غير ممنوح» (LIVE-9E) فيختلف عن
 * العميل، والفارق كان يُخفي طالباً يملك النشر فعلاً عن أهداف «كتم الجميع».
 *
 * التفسير الموحَّد هو الأكثر أماناً في الاتجاهين:
 *   - كشف: من يستطيع النشر يُعَدّ ممنوحاً فيدخل في «كتم الجميع» ويظهر للمعلم.
 *   - منح: مسار المنح لدينا يكتب [MICROPHONE] صريحاً دائماً، فلا يوسّع هذا
 *     التفسير أي صلاحية — الكاميرا والشاشة ونشر البيانات تبقى محجوبة.
 */
export function grantsMicrophonePublish(
  permission: MicrophonePublishPermission | null | undefined,
  /** قيمة MICROPHONE من enum الـ SDK عند توفّره؛ وإلا الثابت المثبَّت أعلاه */
  microphoneSource: number = MICROPHONE_TRACK_SOURCE
): boolean {
  if (!permission?.canPublish) return false
  const sources = permission.canPublishSources
  if (!sources || sources.length === 0) return true
  return sources.includes(microphoneSource)
}

// ─── LIVE-9E — الإجراء المطلوب ──────────────────────────────────────────────

export const MICROPHONE_ACTIONS = ["grant", "revoke"] as const
export type MicrophoneAction = (typeof MICROPHONE_ACTIONS)[number]

/** تضييق الإجراء الوارد من العميل. أي قيمة أخرى → null (لا افتراض ضمني). */
export function toMicrophoneAction(value: unknown): MicrophoneAction | null {
  return (MICROPHONE_ACTIONS as readonly unknown[]).includes(value)
    ? (value as MicrophoneAction)
    : null
}

export const MIC_INVALID_ACTION = {
  status: 400,
  error: "الإجراء المطلوب غير صحيح",
} as const

export const MIC_RATE_LIMITED = {
  status: 429,
  error: "طلبات كثيرة جداً على الميكروفون. انتظر لحظة ثم أعد المحاولة",
} as const

export const MIC_ROOM_UNREACHABLE = {
  status: 503,
  error: "تعذر الوصول إلى خدمة البث الآن. أعد المحاولة",
} as const

/**
 * أهداف «كتم الجميع»: الطلاب المتصلون الذين يملكون صلاحية ميكروفون فعالة.
 *
 * القائمة تُبنى من تقاطع سجل الدخول (طلاب هذه الجلسة حصراً) مع حضور LiveKit،
 * فلا يمكن أن تشمل المعلم أو الأدمن: هوية المعلم لا سجل دخول لها أصلاً.
 * الهويات غير المعروفة في الغرفة تُستثنى أيضاً — لا نتصرف بهوية لا نعرف صاحبها.
 */
export function selectMuteAllTargets(params: {
  rosterUserIds: readonly string[]
  room: readonly { identity: string; connected: boolean; micGranted: boolean }[]
}): string[] {
  const roster = new Set(params.rosterUserIds)
  const targets: string[] = []
  for (const snapshot of params.room) {
    if (!roster.has(snapshot.identity)) continue
    if (!snapshot.connected) continue
    if (!snapshot.micGranted) continue
    targets.push(snapshot.identity)
  }
  return targets
}

/** تحذير «كتم الجميع» عندما يفشل جزء من العملية — بلا تفاصيل SDK. */
export function describeMuteAllPartialFailure(failed: number): string {
  return `تعذر كتم ${failed} من الطلاب. أعد المحاولة`
}
