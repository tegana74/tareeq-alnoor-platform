// LIVE-8C — Student LiveKit Subscription
// المشاهد فقط: لا إنشاء مسارات محلية، لا نشر، لا أذونات كاميرا/ميكروفون.
// يعيد استخدام token endpoint الحالي (LIVE-8A) دون نظام توكن ثانٍ.

import {
  Room,
  RoomEvent,
  type RemoteTrack,
} from "livekit-client"
import type { LiveSessionStatus } from "./types"

/** هل هذه الجلسة تُشاهَد عبر LiveKit؟ (بديل الروابط الخارجية فقط) */
export function shouldUseLiveKitViewer(status: LiveSessionStatus, url: string | null | undefined): boolean {
  return status === "live" && !url
}

export interface StudentSubscriberHandle {
  room: Room
  disconnect: () => void
}

/**
 * اتصال الطالب كـ Subscriber صرف:
 * - يجلب التوكن من GET /api/live/[id]/token (نفس endpoint المعلم — الأدوار تُحدد server-side)
 * - لا يستدعي createLocalTracks ولا publishTrack ولا أي تفعيل كاميرا/ميكروفون
 * - يبقي الغرفة متصلة عند Reconnecting/Reconnected (لا يُنهي الجلسة)
 */
export async function connectStudentSubscriber(sessionId: string): Promise<StudentSubscriberHandle> {
  const tokenRes = await fetch(`/api/live/${sessionId}/token`)
  if (!tokenRes.ok) {
    if (tokenRes.status === 401 || tokenRes.status === 403) {
      throw new Error("STUDENT_TOKEN_UNAUTHORIZED")
    }
    throw new Error("STUDENT_TOKEN_ERROR")
  }

  const data = await tokenRes.json()
  const { token, url: livekitUrl } = data as { token?: string; url?: string }
  if (!token || !livekitUrl) throw new Error("STUDENT_TOKEN_ERROR")

  const room = new Room({
    adaptiveStream: true,
    // مشاهد فقط — إعدادات النشر غير مستخدمة ولا تُفعّل أي مسار محلي
  })

  await room.connect(livekitUrl, token)

  return {
    room,
    disconnect: () => {
      try {
        room.disconnect()
      } catch {
        // التنظيف يجب ألا يرمي
      }
    },
  }
}

export interface RemoteTrackHandlers {
  onVideoTrack: (track: RemoteTrack) => void
  onAudioTrack: (track: RemoteTrack) => void
  onTrackRemoved: (track: RemoteTrack) => void
  onParticipantLeft?: () => void
}

/**
 * ربط أحداث المسارات البعيدة على الغرفة — يفصل منطق العرض عن دورة حياة الاتصال.
 * لا تفترض هوية معينة للناشر: أي participant يرسل video/audio سيُعرض.
 */
export function attachRemoteTrackHandlers(room: Room, handlers: RemoteTrackHandlers): () => void {
  const onSubscribed = (track: RemoteTrack) => {
    if (track.kind === "video") handlers.onVideoTrack(track)
    if (track.kind === "audio") handlers.onAudioTrack(track)
  }

  const onUnsubscribed = (track: RemoteTrack) => handlers.onTrackRemoved(track)

  const onParticipantDisconnected = () => handlers.onParticipantLeft?.()

  room.on(RoomEvent.TrackSubscribed, onSubscribed)
  room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed)
  room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)

  return () => {
    room.off(RoomEvent.TrackSubscribed, onSubscribed)
    room.off(RoomEvent.TrackUnsubscribed, onUnsubscribed)
    room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
  }
}
