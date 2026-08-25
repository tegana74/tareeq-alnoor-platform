// LIVE-9A — أدوات التحكم بالوسائط لدى الناشر (خالية من React)
//
// جذر إصلاح الكاميرا OFF→ON في livekit-client v2:
// - setCameraEnabled(false) تُلغي نشر مسار الكاميرا فعليًا (unpublish + إيقاف الالتقاط)
//   وليست mute كما في الميكروفون — انظر setTrackEnabled في مصدر الـ SDK المثبَّت.
// - setCameraEnabled(true) بعد ذلك تلتقط مسارًا جديدًا كليًا (LocalVideoTrack جديد)
//   وتنشره بنفسها — أي إجراء publishTrack يدوي من طرفنا سيخلق نشرًا مكررًا.
// لذلك حالة الواجهة (المسار المعروض/الأزرار) يجب أن تُشتق من أحداث الغرفة
// (LocalTrackPublished / LocalTrackUnpublished) ولا تُضبط تفاؤليًا قبل اكتمال العملية.

import {
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type LocalVideoTrack,
  type RemoteTrack,
  type Room,
} from "livekit-client"

export type PublisherTrackKind = "camera" | "microphone" | "screen_share" | "other"

/** تصنيف مصدر نشر محلي/بعيد إلى ما تعنيه به واجهة الناشر/المشاهد */
export function classifyPublicationSource(source: unknown): PublisherTrackKind {
  switch (source) {
    case Track.Source.Camera:
      return "camera"
    case Track.Source.Microphone:
      return "microphone"
    case Track.Source.ScreenShare:
      return "screen_share"
    default:
      return "other"
  }
}

/** هل هذا المسار البعيد مشاركة شاشة؟ (يُستخدم لدى المشاهد لتوجيه العرض) */
export function isScreenShareRemoteTrack(track: RemoteTrack): boolean {
  return classifyPublicationSource((track as { source?: unknown }).source) === "screen_share"
}

export interface PublisherEventCallbacks {
  /** نشر مسار كاميرا محلي — أو null عند إلغاء نشره (زر OFF / فقدان الجهاز) */
  onCameraTrack: (track: LocalVideoTrack | null) => void
  /** دخول/خروج مشاركة الشاشة — يشمل «إيقاف المشاركة» من واجهة المتصفح نفسها */
  onScreenShareActive: (active: boolean) => void
}

/**
 * يربط أحداث النشر المحلي على الغرفة ويحوّلها إلى تحديثات حالة نقية.
 *
 * موثّق في livekit-client: عند ضغط المعلم «End» بواجهة المتصفح لإيقاف مشاركة
 * الشاشة ينطلق LocalTrackUnpublished أيضًا — حدث واحد يغطي الإيقاف بالطريقتين.
 */
export function bindPublisherTrackEvents(room: Room, cb: PublisherEventCallbacks): () => void {
  const onPublished = (publication: LocalTrackPublication) => {
    switch (classifyPublicationSource(publication.source)) {
      case "camera":
        cb.onCameraTrack(
          ((publication.videoTrack ?? publication.track) ?? null) as LocalVideoTrack | null
        )
        break
      case "screen_share":
        cb.onScreenShareActive(true)
        break
    }
  }

  const onUnpublished = (publication: LocalTrackPublication) => {
    switch (classifyPublicationSource(publication.source)) {
      case "camera":
        cb.onCameraTrack(null)
        break
      case "screen_share":
        cb.onScreenShareActive(false)
        break
    }
  }

  room.on(RoomEvent.LocalTrackPublished, onPublished)
  room.on(RoomEvent.LocalTrackUnpublished, onUnpublished)

  return () => {
    room.off(RoomEvent.LocalTrackPublished, onPublished)
    room.off(RoomEvent.LocalTrackUnpublished, onUnpublished)
  }
}

export interface ScreenShareFailure {
  /**
   * cancelled = المستخدم أغلق منتقي الشاشة أو رفض الإذن — غير قاتل
   * ولا يستحق شريط خطأ أحمر (سلوك مقصود في LIVE-9A)
   */
  kind: "cancelled" | "unsupported" | "failed"
  /** رسالة عربية جاهزة للعرض عند kind !== "cancelled" */
  message?: string
}

/** تحويل أخطاء مشاركة الشاشة إلى رسائل عربية ثابتة دون كشف تفاصيل تقنية */
export function describeScreenShareFailure(err: unknown): ScreenShareFailure {
  const name = err instanceof Error ? err.name : String(err ?? "")
  if (name === "DeviceUnsupportedError") {
    return { kind: "unsupported", message: "متصفحك لا يدعم مشاركة الشاشة." }
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    // إغلاق منتقي المشاركة يصل من المتصفحات غالبًا كـ NotAllowedError — إلغاء صامت
    return { kind: "cancelled" }
  }
  return { kind: "failed", message: "فشل بدء مشاركة الشاشة. حاول مرة أخرى." }
}
