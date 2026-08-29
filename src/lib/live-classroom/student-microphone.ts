"use client"

// LIVE-9E — ميكروفون الطالب (خالٍ من React)
//
// الطالب يبدأ دائماً بلا صلاحية نشر: التوكن يصدر بـ canPublish: false من
// token/route.ts، والمنح يحدث لاحقاً عبر updateParticipant على السيرفر.
// لذلك مصدر الحقيقة الوحيد لدى العميل هو room.localParticipant.permissions —
// وليس أي رسالة DataChannel ولا حالة محلية. الرسائل قابلة للانتحال؛ الصلاحية لا.
//
// النتيجة العملية لهذا التصميم:
//   - إعادة الاتصال تعود تلقائياً إلى المنع، لأن الغرفة تُعاد بناؤها من التوكن.
//   - عميل معدَّل لا يستطيع النشر: خادم الوسائط يرفض المسار بلا صلاحية.

import { RoomEvent, type LocalParticipant, type Room } from "livekit-client"
import {
  grantsMicrophonePublish,
  MICROPHONE_TRACK_SOURCE,
  type MicrophonePublishPermission,
} from "./microphone-permissions"

// LIVE-9F — قراءة الصلاحية صارت في الطبقة الخالصة المشتركة
// (microphone-permissions.ts) بتفسير واحد للسيرفر والعميل: canPublishSources
// الفارغة = كل المصادر مسموحة. يُعاد التصدير هنا حفاظاً على واجهة الوحدة.
export { MICROPHONE_TRACK_SOURCE }

/** الشكل الذي نحتاجه من ParticipantPermission — بلا اعتماد على نوع خارجي. */
export type LocalMicPermission = MicrophonePublishPermission

/**
 * هل يملك المشارك المحلي صلاحية نشر الميكروفون الآن؟
 *
 * دلالات LiveKit: canPublish هي البوابة الأولى، وcanPublishSources الفارغة
 * تعني «كل المصادر مسموحة». الحماية الحقيقية على خادم الوسائط لا هنا.
 */
export function hasLocalMicrophonePermission(
  permissions: LocalMicPermission | undefined | null
): boolean {
  return grantsMicrophonePublish(permissions)
}

/** الصلاحية الحالية كما تراها الغرفة — تُستخدم عند الاتصال وبعد إعادة الاتصال. */
export function readRoomMicrophonePermission(room: Room | null | undefined): boolean {
  if (!room) return false
  return hasLocalMicrophonePermission(
    room.localParticipant?.permissions as LocalMicPermission | undefined
  )
}

/**
 * يراقب تغيّر صلاحيات المشارك المحلي وحده.
 *
 * ParticipantPermissionsChanged يصدر عن المشاركين البعيدين أيضاً، فنُرشِّح
 * على الهوية المحلية: صلاحيات طالب آخر لا تعني شيئاً لواجهتنا.
 */
export function bindMicrophonePermission(
  room: Room,
  onChange: (granted: boolean) => void
): () => void {
  const handler = (
    _prev: unknown,
    participant: { identity?: string; permissions?: LocalMicPermission }
  ) => {
    const local = room.localParticipant as LocalParticipant | undefined
    if (!local || participant?.identity !== local.identity) return
    onChange(hasLocalMicrophonePermission(participant.permissions))
  }

  room.on(RoomEvent.ParticipantPermissionsChanged, handler as never)
  return () => {
    room.off(RoomEvent.ParticipantPermissionsChanged, handler as never)
  }
}

export type MicrophoneToggleResult = { ok: true } | { ok: false; message: string }

/**
 * تشغيل ميكروفون الطالب. تُستدعى فقط بعد منح صريح من المعلم.
 *
 * الفحص المسبق للصلاحية ليس هو الحماية — الحماية على خادم الوسائط — لكنه
 * يمنع طلب إذن المتصفح للميكروفون بلا داعٍ عندما نعلم أن النشر سيُرفض.
 */
export async function enableStudentMicrophone(
  room: Room
): Promise<MicrophoneToggleResult> {
  if (!readRoomMicrophonePermission(room)) {
    return { ok: false, message: "لم يمنحك المعلم صلاحية التحدث بعد." }
  }
  try {
    await room.localParticipant.setMicrophoneEnabled(true)
    return { ok: true }
  } catch (err) {
    return { ok: false, message: describeMicrophoneFailure(err) }
  }
}

/**
 * إيقاف ميكروفون الطالب وإلغاء نشره.
 *
 * تُستدعى أيضاً عند سحب الصلاحية وعند إعادة الاتصال، ولا ترمي إطلاقاً:
 * التنظيف يجب أن ينجح حتى لو كانت الغرفة في حالة انتقالية.
 */
export async function disableStudentMicrophone(room: Room): Promise<void> {
  try {
    await room.localParticipant.setMicrophoneEnabled(false)
  } catch {
    // الصلاحية قد تكون سُحبت بالفعل فأُلغي النشر من الخادم — لا شيء لنفعله
  }
}

/** رسائل عربية ثابتة لأخطاء الميكروفون، بلا كشف تفاصيل تقنية. */
export function describeMicrophoneFailure(err: unknown): string {
  const name = err instanceof Error ? err.name : String(err ?? "")
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "المتصفح منع الوصول إلى الميكروفون. اسمح به من إعدادات الموقع."
  }
  if (name === "NotFoundError" || name === "DevicesExhaustedError") {
    return "لا يوجد ميكروفون متاح على هذا الجهاز."
  }
  if (name === "NotReadableError") {
    return "الميكروفون مستخدم بواسطة تطبيق آخر."
  }
  return "تعذر تشغيل الميكروفون. حاول مرة أخرى."
}
