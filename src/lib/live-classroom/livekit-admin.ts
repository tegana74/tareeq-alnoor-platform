// LIVE-9C — LiveKit server-side admin adapter.
//
// ⛔ SERVER ONLY — الملف الوحيد في المشروع الذي يلمس RoomServiceClient و
// LIVEKIT_API_SECRET. لا يجوز استيراده من أي ملف "use client" إطلاقاً.
//
// ثلاث طبقات حماية:
//   1. حارس زمن التشغيل أدناه (يرمي فور تحميل الوحدة في المتصفح).
//   2. اختبار في tests/live-room-participants.test.ts يفحص كل ملفات
//      "use client" ويفشل إن استوردت هذه الوحدة.
//   3. LIVEKIT_API_SECRET بلا بادئة NEXT_PUBLIC_، فـ Next.js لا يستبدلها
//      في حِزم العميل أصلاً — السر لا يمكن أن يُدرَج في bundle المتصفح.
//
// RoomServiceClient يُوقّع {roomAdmin: true, room} داخلياً لكل نداء
// (RoomServiceClient.js — authHeader في كل دالة مشارك). لا نُنشئ roomAdmin JWT
// بأنفسنا ولا نُرسله إلى أي متصفح، ولا يُضاف roomAdmin إلى أي توكن مشارك.

import {
  ParticipantInfo_State,
  RoomServiceClient,
  ServerError,
  TrackSource,
} from "livekit-server-sdk"
import type { ParticipantInfo, ParticipantPermission } from "livekit-server-sdk"
import { toJoinedAtMs, type RoomParticipantSnapshot } from "./participants"

if (typeof window !== "undefined") {
  throw new Error(
    "livekit-admin is server-only and must never be imported from client code"
  )
}

/** مهلة نداءات LiveKit (ثوانٍ) — أقصر من إيقاع استعلام اللوحة (12 ثانية). */
const REQUEST_TIMEOUT_SECONDS = 8

export type LiveKitAdminErrorCode = "ENV_MISSING" | "RPC_FAILED"

/** خطأ مُصنَّف: الـ route يترجمه إلى رسالة عربية ثابتة بلا أي تفاصيل داخلية. */
export class LiveKitAdminError extends Error {
  readonly code: LiveKitAdminErrorCode
  constructor(code: LiveKitAdminErrorCode, message: string) {
    super(message)
    this.name = "LiveKitAdminError"
    this.code = code
  }
}

export function isLiveKitAdminError(error: unknown): error is LiveKitAdminError {
  return error instanceof LiveKitAdminError
}

/**
 * عميل LiveKit للإدارة.
 *
 * الـ host هو NEXT_PUBLIC_LIVEKIT_URL نفسه: TwirpRpc يحوّل بادئة ws إلى http
 * داخلياً (TwirpRPC.js) فلا حاجة إلى متغيّر بيئة جديد ولا إلى تحويل يدوي.
 * لا نُخزّن العميل في متغيّر عام لتفادي تعليق مفاتيح قديمة في ذاكرة الدالة.
 */
function createRoomService(): RoomServiceClient {
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET

  if (!url || !apiKey || !apiSecret) {
    // لا تُطبع أي قيمة — أسماء المتغيّرات فقط
    throw new LiveKitAdminError(
      "ENV_MISSING",
      "missing LIVEKIT_API_KEY / LIVEKIT_API_SECRET / NEXT_PUBLIC_LIVEKIT_URL"
    )
  }

  return new RoomServiceClient(url, apiKey, apiSecret, {
    requestTimeout: REQUEST_TIMEOUT_SECONDS,
  })
}

/** LiveKit تُرجع not_found عندما لا تكون الغرفة/المشارك موجوداً. */
function isNotFound(error: unknown): boolean {
  if (error instanceof ServerError) {
    return error.code === "not_found" || error.status === 404
  }
  return false
}

const STUDENT_MIC_REVOKED_PERMISSION: Partial<ParticipantPermission> = {
  canSubscribe: true,
  canPublish: false,
  canPublishData: false,
  canPublishSources: [],
}

const STUDENT_MIC_GRANTED_PERMISSION: Partial<ParticipantPermission> = {
  canSubscribe: true,
  canPublish: true,
  canPublishData: false,
  canPublishSources: [TrackSource.MICROPHONE],
}

function hasMicrophonePublishPermission(
  permission: ParticipantPermission | undefined
): boolean {
  if (!permission?.canPublish) return false
  const sources = permission.canPublishSources ?? []
  return sources.includes(TrackSource.MICROPHONE)
}

function isActivelyPublishingMicrophone(participant: ParticipantInfo): boolean {
  return participant.tracks.some(
    (track) =>
      track.source === TrackSource.MICROPHONE &&
      track.muted === false
  )
}

/**
 * ParticipantInfo → لقطة محيَّدة.
 *
 * لا يُنقل الاسم ولا الـ metadata ولا الصلاحيات: الطبقة الخالصة لا ترى إلا
 * identity (= user.id) وحالة الاتصال ولحظة الانضمام. عرض المسارات (كاميرا/
 * ميكروفون/شاشة) مؤجَّل إلى LIVE-9E لأن الطالب مشاهد فقط في 9C فلا ينشر شيئاً.
 */
export function toRoomParticipantSnapshot(
  participant: ParticipantInfo
): RoomParticipantSnapshot {
  // joinedAtMs هو المصدر المفضّل؛ joinedAt بالثواني احتياط إن كان الأول صفراً
  const joinedAtMs =
    toJoinedAtMs(participant.joinedAtMs) ??
    (toJoinedAtMs(participant.joinedAt) !== null
      ? (toJoinedAtMs(participant.joinedAt) as number) * 1000
      : null)

  return {
    identity: participant.identity,
    connected: participant.state !== ParticipantInfo_State.DISCONNECTED,
    joinedAtMs,
    micGranted: hasMicrophonePublishPermission(participant.permission),
    micActive: isActivelyPublishingMicrophone(participant),
  }
}

/** قائمة المشاركين المتصلين فعلاً بالغرفة. غرفة غير موجودة = قائمة فارغة. */
export async function listRoomParticipants(
  roomName: string
): Promise<RoomParticipantSnapshot[]> {
  const service = createRoomService()
  try {
    const participants = await service.listParticipants(roomName)
    return participants.map(toRoomParticipantSnapshot)
  } catch (error) {
    // الغرفة لم تُنشأ بعد (لم يتصل أحد) — ليست حالة خطأ
    if (isNotFound(error)) return []
    throw new LiveKitAdminError("RPC_FAILED", "listParticipants failed")
  }
}

/**
 * إزالة مشارك من الغرفة.
 *
 * `revokeTokenTs` طبقة إضافية من LiveKit تُبطل التوكنات التي صدرت قبل هذه
 * اللحظة، فلا يُعاد استخدام التوكن القديم. الحاجز الأساسي يبقى حالة "kicked"
 * في قاعدة البيانات لأن LiveKit توثّق صراحةً أن المشارك المُزال يستطيع العودة.
 *
 * مشارك غير موجود = النتيجة المطلوبة متحققة أصلاً → removed: true (idempotent).
 * أي فشل آخر لا يُرمى: الحظر في قاعدة البيانات قد نجح بالفعل، فيُبلَّغ المعلم
 * بأن الإخراج الفوري لم يتم ليعيد المحاولة.
 */
export async function removeRoomParticipant(
  roomName: string,
  identity: string
): Promise<{ removed: boolean }> {
  let service: RoomServiceClient
  try {
    service = createRoomService()
  } catch {
    return { removed: false }
  }

  try {
    await service.removeParticipant(roomName, identity, {
      revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)),
    })
    return { removed: true }
  } catch (error) {
    if (isNotFound(error)) return { removed: true }
    console.error("[LIVEKIT_ADMIN] removeParticipant failed")
    return { removed: false }
  }
}

export type MicrophonePermissionUpdateResult = {
  applied: boolean
  reason?: "not_connected" | "rpc_failed"
}

export async function grantParticipantMicrophone(
  roomName: string,
  identity: string
): Promise<MicrophonePermissionUpdateResult> {
  return updateParticipantPermission(roomName, identity, STUDENT_MIC_GRANTED_PERMISSION)
}

export async function revokeParticipantMicrophone(
  roomName: string,
  identity: string
): Promise<MicrophonePermissionUpdateResult> {
  return updateParticipantPermission(roomName, identity, STUDENT_MIC_REVOKED_PERMISSION)
}

async function updateParticipantPermission(
  roomName: string,
  identity: string,
  permission: Partial<ParticipantPermission>
): Promise<MicrophonePermissionUpdateResult> {
  let service: RoomServiceClient
  try {
    service = createRoomService()
  } catch {
    return { applied: false, reason: "rpc_failed" }
  }

  try {
    await service.updateParticipant(roomName, identity, { permission })
    return { applied: true }
  } catch (error) {
    if (isNotFound(error)) return { applied: false, reason: "not_connected" }
    console.error("[LIVEKIT_ADMIN] updateParticipant failed")
    return { applied: false, reason: "rpc_failed" }
  }
}
