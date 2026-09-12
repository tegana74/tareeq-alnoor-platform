// SMART-WB-1B — تفسير أحداث القناة في العميل (منطق خالص، بلا React وبلا شبكة).
//
// سبب فصل هذا الملف عن الـ hook: قرار «أُطبّق الحدث أم أستعيد الحالة كاملة» هو
// أدقّ ما في التكامل — يقرّر ما إذا كان الطالب يرى مشهداً ناقصاً بصمت. منطق
// قابل للاختبار وحده أفضل من منطق داخل useEffect.
//
// كل ما هنا يبني على حكم Phase 1A (`needsFullRecovery` / `canApplyEventLocally`)
// ولا يعيد تعريفه. لا شيء أمني يُقرَّر هنا: العميل لا يمنح صلاحيات، والقناة
// مخرَج لا مدخَل — الحدث المشوَّه يُرفض قبل الوصول إلى هنا بـ `parseWhiteboardEvent`.

import {
  canApplyEventLocally,
  sortPages,
  WHITEBOARD_INITIAL_REVISION,
  type WhiteboardElement,
  type WhiteboardEvent,
  type WhiteboardPageOrder,
} from "./whiteboard"

/** الحالة المعروضة في العميل — صورة الصفحة الواحدة التي يراها المستخدم الآن. */
export type WhiteboardClientState = {
  boardId: string
  pages: WhiteboardPageOrder[]
  activePageId: string | null
  revision: number
  elements: WhiteboardElement[]
  /** أُرشفت السبورة ⇒ لا كتابة بعدها، والواجهة تعرضها للقراءة. */
  closed: boolean
}

/**
 * نتيجة الحدث:
 *   apply   — الحالة الجديدة تُعرض مباشرة.
 *   recover — لا يمكن الاستنتاج محلياً: تُسحب الحالة من REST (`ignore` أسوأ:
 *             يترك ثقباً صامتاً في الرسم).
 *   ignore  — الحدث لا يخصّ ما نعرضه (سبورة أخرى، صفحة أخرى، أو صدى كتابتنا).
 */
export type WhiteboardEventOutcome =
  | { action: "apply"; state: WhiteboardClientState }
  | { action: "recover"; pageId: string | null; reason: RecoveryReason }
  | { action: "ignore"; reason: IgnoreReason }

export type RecoveryReason =
  /** قفزة فوق مراجعة أو حدث متأخّر — فقدنا رسالة على القناة. */
  | "revision-gap"
  /** الحمولة أكبر من سقف القناة فلم تُبثّ العناصر. */
  | "oversized-payload"
  /** الصفحة المعروضة تغيّرت أو اختفت من القائمة. */
  | "active-page-changed"

export type IgnoreReason = "other-board" | "other-page" | "own-echo" | "same-page"

export function initialWhiteboardState(params: {
  boardId: string
  pages: readonly WhiteboardPageOrder[]
  activePageId: string | null
  revision?: number
  elements?: readonly WhiteboardElement[]
  closed?: boolean
}): WhiteboardClientState {
  return {
    boardId: params.boardId,
    pages: sortPages(params.pages),
    activePageId: params.activePageId,
    revision: params.revision ?? WHITEBOARD_INITIAL_REVISION,
    elements: [...(params.elements ?? [])],
    closed: params.closed ?? false,
  }
}

/**
 * تفسير حدث واحد وصل من القناة.
 *
 * `selfId` يمنع صدى الكاتب: من كتب عبر REST تقدّمت مراجعته من ردّ الخادم، فلو
 * طبّق حدثه العائد لظهر كأنه قفزة (local == event) وأطلق استعادة لا داعي لها —
 * حلقة استعادة عند كل ضربة قلم.
 */
export function reduceWhiteboardEvent(
  state: WhiteboardClientState,
  event: WhiteboardEvent,
  selfId: string
): WhiteboardEventOutcome {
  // حدث من سبورة أخرى لا يمسّ ما نعرضه — الغرفة واحدة لكن الجلسة قد تُعاد تهيئتها.
  if (event.boardId !== state.boardId) {
    return { action: "ignore", reason: "other-board" }
  }

  // الإغلاق يُطبَّق دائماً حتى لو كان صدى: لا كتابة بعد الأرشفة.
  if (event.type === "WB_CLOSED") {
    return { action: "apply", state: { ...state, closed: true } }
  }

  if (event.senderId === selfId) {
    return { action: "ignore", reason: "own-echo" }
  }

  switch (event.type) {
    case "WB_PATCH": {
      if (event.payload.pageId !== state.activePageId) {
        return { action: "ignore", reason: "other-page" }
      }
      if (
        !canApplyEventLocally({
          localRevision: state.revision,
          eventRevision: event.payload.revision,
        })
      ) {
        return { action: "recover", pageId: state.activePageId, reason: "revision-gap" }
      }
      return {
        action: "apply",
        state: {
          ...state,
          revision: event.payload.revision,
          elements: [...event.payload.elements],
        },
      }
    }

    case "WB_SNAPSHOT_REQUIRED": {
      if (event.payload.pageId !== state.activePageId) {
        return { action: "ignore", reason: "other-page" }
      }
      return {
        action: "recover",
        pageId: event.payload.pageId,
        reason: "oversized-payload",
      }
    }

    case "WB_PAGES_CHANGED": {
      const pages = sortPages(event.payload.pages)
      // حُذفت الصفحة التي نعرضها ⇒ لا نعرف عناصر بديلتها: استعادة من الخادم.
      const stillThere = pages.some((page) => page.id === state.activePageId)
      if (!stillThere) {
        return { action: "recover", pageId: null, reason: "active-page-changed" }
      }
      return { action: "apply", state: { ...state, pages } }
    }

    case "WB_ACTIVE_PAGE": {
      if (event.payload.pageId === state.activePageId) {
        return { action: "ignore", reason: "same-page" }
      }
      // صفحة جديدة معروضة: عناصرها ليست معنا، ولا تُبثّ مع الحدث.
      return {
        action: "recover",
        pageId: event.payload.pageId,
        reason: "active-page-changed",
      }
    }
  }
}
