// SMART-WB-1B — بناء أحداث السبورة وبثّها على قناة LiveKit القائمة.
//
// لا نقل ثانٍ: البثّ يمرّ على `broadcastData` نفسها التي تستخدمها الدردشة ورفع
// اليد، واسم الغرفة هو `sessionId` كما في كل مسارات الجلسة. الفرق الجوهري عن
// الدردشة أن هذه الأحداث تُبنى على الخادم بعد التحقق والحفظ، فوصول الحدث يعني
// أن الحالة ثُبِّتت فعلاً في قاعدة البيانات.
//
// `senderId` يُكتب من الجلسة المصادَق عليها حصراً — لا يُقرأ من جسم الطلب أبداً،
// كي لا يستطيع عميل أن ينسب تعديلاً إلى غيره.
//
// البثّ لا يجب أن يُسقط عملاً محفوظاً: الحفظ يسبق البثّ، وفشل البثّ يُسجَّل ولا
// يُرمى — العميل يستعيد الحالة من REST على أي حال (قاعدة «القناة مخرَج لا مدخَل»).

import { broadcastData } from "./data-channel"
import {
  fitsDataChannel,
  type WhiteboardElement,
  type WhiteboardEvent,
  type WhiteboardPageOrder,
} from "./whiteboard"

/** الحقول المشتركة التي يعرفها الخادم عن كل حدث. */
export type WhiteboardEventContext = {
  sessionId: string
  boardId: string
  /** الفاعل كما أثبتته الجلسة المصادَق عليها. */
  senderId: string
}

/** مُغلِّف مطابق لعرف `messages.ts` كي يمرّ على نفس أنبوب القناة. */
function envelope(context: WhiteboardEventContext) {
  return {
    version: 1 as const,
    id: crypto.randomUUID(),
    sessionId: context.sessionId,
    boardId: context.boardId,
    senderId: context.senderId,
    timestamp: Date.now(),
  }
}

/**
 * حدث تعديل صفحة — أو طلب استعادة إن كانت الحمولة أكبر من سقف القناة.
 *
 * القرار هنا لا في الـ route: LiveKit يحدّ الرسالة الواحدة بنحو 15 KiB، فحمولة
 * ثقيلة تُرفض على مستوى القناة ويبقى الطالب على مشهد قديم بلا أن يعرف. البديل
 * حدث صغير يقول «اسحب الحالة من REST» — أبطأ ولا يفقد شيئاً.
 */
export function buildPatchEvent(
  context: WhiteboardEventContext,
  payload: { pageId: string; revision: number; elements: WhiteboardElement[] }
): WhiteboardEvent {
  if (fitsDataChannel(payload.elements)) {
    return { ...envelope(context), type: "WB_PATCH", payload }
  }
  return {
    ...envelope(context),
    type: "WB_SNAPSHOT_REQUIRED",
    payload: { pageId: payload.pageId, revision: payload.revision },
  }
}

/** تغيّرت قائمة الصفحات (إضافة/حذف/إعادة ترتيب) — تُبثّ المعرّفات والترتيب فقط. */
export function buildPagesChangedEvent(
  context: WhiteboardEventContext,
  pages: readonly WhiteboardPageOrder[]
): WhiteboardEvent {
  return {
    ...envelope(context),
    type: "WB_PAGES_CHANGED",
    payload: { pages: pages.map((page) => ({ id: page.id, order: page.order })) },
  }
}

/** المعلم نقل العرض إلى صفحة أخرى. */
export function buildActivePageEvent(
  context: WhiteboardEventContext,
  pageId: string
): WhiteboardEvent {
  return { ...envelope(context), type: "WB_ACTIVE_PAGE", payload: { pageId } }
}

/** أُغلقت السبورة (أُرشفت) — لا كتابة بعدها. */
export function buildClosedEvent(context: WhiteboardEventContext): WhiteboardEvent {
  return { ...envelope(context), type: "WB_CLOSED", payload: {} }
}

/**
 * بثّ حدث سبورة على غرفة الجلسة.
 *
 * تُعيد `false` عند فشل البثّ ولا ترمي: الحالة محفوظة قبل الوصول إلى هنا، فرفع
 * الخطأ يعني ردّ 500 على كتابة نجحت فعلاً — ثم يُعيد العميل إرسالها فتصطدم
 * بالمراجعة. LiveKit غير مهيَّأ أو غير متاح لا يجب أن يُعطّل السبورة.
 */
export async function broadcastWhiteboardEvent(
  event: WhiteboardEvent
): Promise<boolean> {
  try {
    const data = new TextEncoder().encode(JSON.stringify(event))
    await broadcastData(event.sessionId, data)
    return true
  } catch (error) {
    console.error("[WHITEBOARD_BROADCAST_FAILED]", event.type, error)
    return false
  }
}
