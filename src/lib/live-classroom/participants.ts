// LIVE-9C — Participant Management + Kick (pure policy layer)
//
// دوال خالصة بلا React وبلا Prisma وبلا LiveKit، على نفس نمط admission.ts.
// كل قرار صلاحية يُتخذ هنا ويُستدعى من الـ routes، فلا يتكرر منطق الأمان.
//
// مصدران للحقيقة، بلا تكرار (لا نكتب حضور LiveKit في قاعدة البيانات):
//   - «هل هو متصل الآن؟»  → LiveKit (listParticipants)
//   - «هل يُسمح له بالدخول؟» → live_session_admissions
//   - «ما اسمه؟»            → جدول User عبر identity = user.id
//
// participantName القادم من LiveKit لا يُستخدم للهوية ولا للعرض: النوع
// RoomParticipantSnapshot لا يحتوي حقل اسم إطلاقاً، فالتسريب غير ممكن بنيوياً.

import { isAdmissionManagedSession, type AdmissionStatus } from "./admission"

// ─── حالة الحضور في الغرفة ──────────────────────────────────────────────────

/** "unknown" = تعذّر الوصول إلى LiveKit، فلا ندّعي حضوراً ولا غياباً. */
export type ParticipantPresence = "connected" | "offline" | "unknown"

/**
 * لقطة مشارك من غرفة LiveKit — الشكل المحيَّد الذي تراه الطبقة الخالصة.
 *
 * `identity` هي user.id حصراً (تُصدرها بوابة التوكن في LIVE-8A).
 * لا حقل اسم هنا بقصد: الاسم يأتي من جدول User فقط.
 */
export interface RoomParticipantSnapshot {
  identity: string
  connected: boolean
  /** bigint من ParticipantInfo — يُحيَّد قبل أي تسلسل JSON */
  joinedAtMs: bigint | number | null
  /** صلاحية ميكروفون فعالة حالياً في LiveKit */
  micGranted: boolean
  /** مسار ميكروفون منشور وغير مكتوم حالياً */
  micActive: boolean
}

/** صف طلب دخول كما يُقرأ من قاعدة البيانات، مضافاً إليه اسم المستخدم. */
export interface AdmissionRosterRow {
  userId: string
  status: string
  name: string
  yearName: string | null
  departmentName: string | null
  decidedAt: Date | string | null
}

/** صف واحد في قائمة المشاركين كما تُرسل إلى واجهة المعلم. */
export interface RosterParticipant {
  userId: string
  /** من جدول User حصراً. فارغ عند هوية بلا سجل — لا نُلفّق بيانات. */
  name: string
  yearName: string | null
  departmentName: string | null
  /** الحالة المخزنة (approved | kicked). null لهوية بلا سجل دخول. */
  admission: AdmissionStatus | null
  presence: ParticipantPresence
  /** مللي ثانية Unix، آمن للـ JSON. null إن لم يتصل بعد أو تعذّر الوصول. */
  joinedAtMs: number | null
  /** هوية موجودة في الغرفة بلا سجل دخول مطابق — تُعرض ولا تُخترع لها بيانات. */
  unknown: boolean
  /** null عند تعذر الوصول إلى LiveKit */
  micGranted: boolean | null
  /** null عند تعذر الوصول إلى LiveKit */
  micActive: boolean | null
}

/**
 * ParticipantInfo.joinedAt / joinedAtMs من نوع bigint، و NextResponse.json
 * يرمي على BigInt. التحييد هنا حتى يكون مغطى باختبار في الطبقة الخالصة.
 */
export function toJoinedAtMs(
  value: bigint | number | null | undefined
): number | null {
  if (value === null || value === undefined) return null
  const asNumber = typeof value === "bigint" ? Number(value) : value
  if (!Number.isFinite(asNumber) || asNumber <= 0) return null
  return asNumber
}

// ─── تركيب القائمة ──────────────────────────────────────────────────────────

/**
 * الحالات التي تظهر في لوحة المشاركين.
 *
 * pending تملكها لوحة «طلبات الدخول» (LIVE-9B) فلا تُكرَّر هنا، و rejected لم
 * يدخل الغرفة أصلاً. kicked تُعرض ليتمكن المعلم من التراجع عن قراره.
 */
export const ROSTER_STATUSES: readonly AdmissionStatus[] = ["approved", "kicked"]

export function belongsInRoster(status: string): boolean {
  return (ROSTER_STATUSES as readonly string[]).includes(status)
}

/**
 * دمج حقيقة الصلاحية (قاعدة البيانات) مع حقيقة الاتصال (LiveKit).
 *
 * `room = null` يعني تعذّر الوصول إلى LiveKit: تبقى القائمة ظاهرة بحالة
 * presence = "unknown" بدل صفحة فارغة — المعلم يحتاج القائمة ليطرد أحدهم،
 * ومسار الطرد لا يعتمد على listParticipants أصلاً.
 */
export function mergeRoster(params: {
  admissions: AdmissionRosterRow[]
  room: RoomParticipantSnapshot[] | null
}): RosterParticipant[] {
  const { admissions, room } = params
  const roomReachable = room !== null
  const byIdentity = new Map<string, RoomParticipantSnapshot>()
  for (const p of room ?? []) {
    // آخر لقطة لنفس الهوية تفوز (لا تكرار متوقع، لكن لا نعتمد على ذلك)
    byIdentity.set(p.identity, p)
  }

  const rows: RosterParticipant[] = []
  const seen = new Set<string>()

  for (const row of admissions) {
    if (!belongsInRoster(row.status)) continue
    seen.add(row.userId)
    const snapshot = byIdentity.get(row.userId)
    rows.push({
      userId: row.userId,
      name: row.name,
      yearName: row.yearName,
      departmentName: row.departmentName,
      admission: row.status as AdmissionStatus,
      presence: !roomReachable
        ? "unknown"
        : snapshot?.connected
          ? "connected"
          : "offline",
      joinedAtMs: snapshot?.connected ? toJoinedAtMs(snapshot.joinedAtMs) : null,
      unknown: false,
      micGranted: !roomReachable
        ? null
        : snapshot?.connected
          ? snapshot.micGranted
          : false,
      micActive: !roomReachable
        ? null
        : snapshot?.connected
          ? snapshot.micActive
          : false,
    })
  }

  // هوية متصلة بلا سجل دخول مطابق: تُعرض كما هي بلا اسم مُلفَّق.
  for (const [identity, snapshot] of byIdentity) {
    if (seen.has(identity) || !snapshot.connected) continue
    rows.push({
      userId: identity,
      name: "",
      yearName: null,
      departmentName: null,
      admission: null,
      presence: "connected",
      joinedAtMs: toJoinedAtMs(snapshot.joinedAtMs),
      unknown: true,
      micGranted: snapshot.micGranted,
      micActive: snapshot.micActive,
    })
  }

  return sortRoster(rows)
}

/** المتصلون أولاً، ثم الأقدم انضماماً، ثم أبجدياً — ترتيب ثابت بلا Date.now. */
function sortRoster(rows: RosterParticipant[]): RosterParticipant[] {
  const rank: Record<ParticipantPresence, number> = {
    connected: 0,
    unknown: 1,
    offline: 2,
  }
  return [...rows].sort((a, b) => {
    if (rank[a.presence] !== rank[b.presence]) {
      return rank[a.presence] - rank[b.presence]
    }
    const aJoined = a.joinedAtMs ?? Number.MAX_SAFE_INTEGER
    const bJoined = b.joinedAtMs ?? Number.MAX_SAFE_INTEGER
    if (aJoined !== bJoined) return aJoined - bJoined
    return a.name.localeCompare(b.name, "ar")
  })
}

/** عدّاد مختصر للوحة — مشتق من الصفوف، لا حالة مستقلة. */
export function countConnected(rows: RosterParticipant[]): number {
  return rows.filter((r) => r.presence === "connected").length
}

// ─── صلاحية الطرد ───────────────────────────────────────────────────────────

export type KickRefusal =
  | "invalid-target"
  | "not-managed"
  | "self"
  | "manager"
  | "no-record"

export type KickPermission = { ok: true } | { ok: false; reason: KickRefusal }

/**
 * هل يُسمح بطرد هذا المستهدَف؟ يُستدعى مرة واحدة من الـ route بعد قراءة السجل.
 *
 * الترتيب مقصود: التحقق من «نفسه» و«مدير» يسبق «لا يوجد سجل» حتى يحصل المعلم
 * على رسالة صحيحة عند محاولة طرد نفسه (المدير لا سجل دخول له إطلاقاً).
 *
 * ملاحظة أمنية: كل هذه المُدخلات مُشتقّة على السيرفر —
 * actorUserId من الجلسة المصادَق عليها، sessionUrl و teacherId من قاعدة
 * البيانات، وrole/teacherId المستهدَف من جدول User. الشيء الوحيد القادم من
 * العميل هو targetUserId، وهو مقيَّد بجلسة الـ URL عبر سجل الدخول.
 */
export function canKickParticipant(params: {
  actorUserId: string
  targetUserId: unknown
  sessionUrl: string | null | undefined
  /** هل المستهدَف نفسه معلم مالك للجلسة أو أدمن؟ */
  targetIsManager: boolean
  /** هل يوجد سجل دخول للمستهدَف في هذه الجلسة تحديداً؟ */
  hasAdmissionRecord: boolean
}): KickPermission {
  const { targetUserId } = params

  if (typeof targetUserId !== "string" || targetUserId.length === 0) {
    return { ok: false, reason: "invalid-target" }
  }
  // الجلسات الخارجية (YouTube/Zoom/Meet) لا غرفة LiveKit لها ولا نظام مشاركين
  if (!isAdmissionManagedSession(params.sessionUrl)) {
    return { ok: false, reason: "not-managed" }
  }
  if (targetUserId === params.actorUserId) {
    return { ok: false, reason: "self" }
  }
  if (params.targetIsManager) {
    return { ok: false, reason: "manager" }
  }
  if (!params.hasAdmissionRecord) {
    return { ok: false, reason: "no-record" }
  }
  return { ok: true }
}

/** رفض الطرد → (رمز HTTP + رسالة عربية ثابتة). لا تفاصيل داخلية ولا stack. */
export const KICK_REFUSAL_RESPONSES: Record<
  KickRefusal,
  { status: number; error: string }
> = {
  "invalid-target": { status: 400, error: "معرّف الطالب مطلوب" },
  "not-managed": {
    status: 400,
    error: "هذه الجلسة لا تستخدم نظام إدارة المشاركين",
  },
  self: { status: 403, error: "لا يمكنك إخراج نفسك من الجلسة" },
  manager: { status: 403, error: "لا يمكن إخراج معلم الجلسة أو المشرف" },
  "no-record": { status: 404, error: "لا يوجد طلب دخول لهذا الطالب" },
}

/**
 * فشل الإزالة من LiveKit بعد نجاح الحظر في قاعدة البيانات.
 *
 * الحظر هو النصف الموثوق (يمنع أي توكن جديد)، فلا نُرجع خطأ يوحي بفشل
 * العملية كلها — نُبلّغ المعلم أن الإخراج الفوري لم يتم ليعيد المحاولة.
 * لا تُمرَّر أي تفاصيل من الـ SDK إلى العميل.
 */
export function describeRemoveFailure(): string {
  return "تم منع الطالب من الدخول، لكن تعذّر إخراجه فوراً من الغرفة — أعد المحاولة."
}

// ─── إيقاع تحديث اللوحة ─────────────────────────────────────────────────────

/**
 * استعلام أمان كل 12 ثانية — لا استعلام كل ثانية.
 *
 * التحديث الأساسي مدفوع بأحداث LiveKit التي يملكها المعلم أصلاً
 * (ParticipantConnected / ParticipantDisconnected)، وهذا الاستعلام يغطي
 * ما يفوته الحدث أثناء إعادة الاتصال. لم نُدخل أي WebSocket أو بنية realtime
 * جديدة: نستخدم أحداث الغرفة القائمة من LIVE-8B/8D.
 *
 * أبطأ من استعلام طلبات الدخول (4 ثوانٍ) عن قصد: هذا المسار وحده يُصدر نداءً
 * خارجياً إلى LiveKit، فإبقاؤه منفصلاً يحدّ من معدل النداءات.
 */
export const PARTICIPANT_POLL_INTERVAL_MS = 12000

/** تجميع أحداث الاتصال المتلاحقة في نداء واحد. */
export const PARTICIPANT_REFRESH_DEBOUNCE_MS = 800

/** اللوحة تعمل فقط أثناء جلسة LiveKit نشطة. */
export function shouldTrackParticipants(params: {
  sessionUrl: string | null | undefined
  status: string
}): boolean {
  if (!isAdmissionManagedSession(params.sessionUrl)) return false
  return params.status === "waiting" || params.status === "live"
}
