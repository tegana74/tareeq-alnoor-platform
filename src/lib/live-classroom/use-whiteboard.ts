"use client"

// SMART-WB-1B — hook حالة السبورة في المتصفح.
//
// عرف `use-heartbeat.ts`: hook واحد يملك التأثيرات الجانبية (fetch + مستمع
// القناة + المؤقتات)، والمنطق الخالص خارجه في `whiteboard-client.ts` كي يبقى
// قابلاً للاختبار وحده.
//
// ثلاث قواعد لا تُخالَف هنا:
//   1) الخادم هو مصدر صلاحية الكتابة. `canWrite` القادم من prop للعرض المبدئي
//      فقط؛ ما يُعتمد عليه فعلياً هو ما يردّه المسار — والكتابة تُرفض على الخادم
//      على أي حال، فلا شيء يعتمد على قرار العميل.
//   2) القناة مخرَج لا مدخَل: حدث القناة يُحدّث ما يُعرض أو يطلب استعادة، ولا
//      يُكتب منه شيء إلى قاعدة البيانات.
//   3) التثبيت debounce بعد سكون الرسم + حدّ أقصى بلا تثبيت، بالثوابت القائمة
//      بلا رفع لأي سقف.

import { useCallback, useEffect, useRef, useState } from "react"
import type { Room } from "livekit-client"
import {
  parseWhiteboardEvent,
  WHITEBOARD_RECOVERY_POLL_MS,
  WHITEBOARD_SNAPSHOT_DEBOUNCE_MS,
  WHITEBOARD_SNAPSHOT_MAX_INTERVAL_MS,
  type WhiteboardElement,
  type WhiteboardPageOrder,
} from "./whiteboard"
import {
  initialWhiteboardState,
  reduceWhiteboardEvent,
  type WhiteboardClientState,
} from "./whiteboard-client"

export type WhiteboardStatus = "loading" | "empty" | "ready" | "error"

export type UseWhiteboardResult = {
  status: WhiteboardStatus
  error: string | null
  board: WhiteboardClientState | null
  /** صلاحية الكتابة كما أعلنها الخادم — لا كما استنتجها العميل. */
  canWrite: boolean
  /** التعديل ما زال غير مثبَّت على الخادم. */
  dirty: boolean
  /** تهيئة سبورة الجلسة (المعلم/الأدمن فقط). */
  initBoard: () => Promise<void>
  /** إعادة تحميل الحالة من الخادم — مسار الاستعادة الوحيد. */
  reload: (pageId?: string) => Promise<void>
  /** تسجيل تعديل محلي؛ التثبيت يقع بعد سكون الرسم. */
  pushElements: (elements: WhiteboardElement[]) => void
  createPage: () => Promise<void>
  removePage: (pageId: string) => Promise<void>
  selectPage: (pageId: string) => Promise<void>
}

type StatePayload = {
  board?: { id: string; status: string } | null
  pages?: WhiteboardPageOrder[]
  activePageId?: string | null
  revision?: number
  elements?: WhiteboardElement[]
  canWrite?: boolean
  error?: string
}

export function useWhiteboard(options: {
  sessionId: string
  /** هوية المستخدم الحالي — لتمييز صدى كتابتنا عن كتابة غيرنا. */
  userId: string
  /** الغرفة الحالية؛ null يعني «لا قناة الآن» فتُستخدم الاستعادة بالاستعلام. */
  room: Room | null
  /** هل تُفتح السبورة أصلاً؟ لا تحميل ولا مستمع قبل ذلك. */
  enabled: boolean
}): UseWhiteboardResult {
  const { sessionId, userId, room, enabled } = options

  const [board, setBoard] = useState<WhiteboardClientState | null>(null)
  const [status, setStatus] = useState<WhiteboardStatus>("loading")
  const [error, setError] = useState<string | null>(null)
  const [canWrite, setCanWrite] = useState(false)
  const [dirty, setDirty] = useState(false)

  // الحالة تُقرأ داخل مستمع القناة والمؤقتات، وكلاهما يعيش أطول من دورة render.
  const boardRef = useRef<WhiteboardClientState | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaveRef = useRef<number>(0)
  const pendingRef = useRef<WhiteboardElement[] | null>(null)
  const savingRef = useRef(false)
  const mountedRef = useRef(true)

  const commit = useCallback((next: WhiteboardClientState | null) => {
    boardRef.current = next
    setBoard(next)
  }, [])

  /** ترجمة ردّ المسار إلى حالة معروضة. `board: null` حالة فارغة لا خطأ. */
  const applyPayload = useCallback(
    (payload: StatePayload) => {
      if (!mountedRef.current) return
      setCanWrite(Boolean(payload.canWrite))
      if (!payload.board) {
        commit(null)
        setStatus("empty")
        setError(null)
        return
      }
      commit(
        initialWhiteboardState({
          boardId: payload.board.id,
          pages: payload.pages ?? [],
          activePageId: payload.activePageId ?? null,
          revision: payload.revision,
          elements: payload.elements,
          closed: payload.board.status !== "active",
        })
      )
      setStatus("ready")
      setError(null)
      setDirty(false)
    },
    [commit]
  )

  const reload = useCallback(
    async (pageId?: string) => {
      const target = pageId ?? boardRef.current?.activePageId ?? undefined
      const query = target ? `?pageId=${encodeURIComponent(target)}` : ""
      try {
        const response = await fetch(`/api/live/${sessionId}/whiteboard${query}`)
        const payload: StatePayload = await response.json().catch(() => ({}))
        if (!response.ok) {
          if (!mountedRef.current) return
          setError(payload.error ?? "تعذّر تحميل السبورة")
          setStatus("error")
          return
        }
        applyPayload(payload)
      } catch {
        if (!mountedRef.current) return
        setError("تعذّر الاتصال بالخادم")
        setStatus("error")
      }
    },
    [sessionId, applyPayload]
  )

  const initBoard = useCallback(async () => {
    try {
      const response = await fetch(`/api/live/${sessionId}/whiteboard`, {
        method: "POST",
      })
      const payload: StatePayload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (!mountedRef.current) return
        setError(payload.error ?? "تعذّر تهيئة السبورة")
        setStatus("error")
        return
      }
      applyPayload(payload)
    } catch {
      if (!mountedRef.current) return
      setError("تعذّر الاتصال بالخادم")
      setStatus("error")
    }
  }, [sessionId, applyPayload])

  /**
   * تثبيت الحالة الحاضرة على الخادم.
   *
   * 409 ليست خطأ يُعرض: معناه أن كتابة أحدث سبقتنا (تبوين ثانٍ للمعلم مثلاً)،
   * والعلاج إعادة تحميل من الخادم لا إعادة إرسال — إعادة الإرسال تطمس عملاً.
   */
  const flush = useCallback(async () => {
    const current = boardRef.current
    const elements = pendingRef.current
    if (!current || !current.activePageId || !elements || savingRef.current) return
    savingRef.current = true
    pendingRef.current = null
    lastSaveRef.current = Date.now()

    try {
      const response = await fetch(`/api/live/${sessionId}/whiteboard/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: current.activePageId,
          baseRevision: current.revision,
          elements,
        }),
      })
      const payload = await response.json().catch(() => ({}))

      if (response.status === 409) {
        await reload()
        return
      }
      if (!response.ok) {
        if (mountedRef.current) setError(payload.error ?? "تعذّر حفظ السبورة")
        return
      }
      if (!mountedRef.current) return
      const latest = boardRef.current
      if (latest && latest.activePageId === payload.pageId) {
        commit({ ...latest, revision: payload.revision, elements })
      }
      setError(null)
      setDirty(pendingRef.current !== null)
    } catch {
      if (mountedRef.current) setError("تعذّر حفظ السبورة")
    } finally {
      savingRef.current = false
    }
  }, [sessionId, reload, commit])

  /**
   * تسجيل تعديل محلي.
   *
   * debounce بعد سكون الرسم كي لا يُكتب صفّ لكل ضربة قلم، مع حدّ أقصى بلا تثبيت
   * كي لا يتأجّل الحفظ بلا نهاية أثناء رسم متواصل — فأسوأ ما يفقده طالب يدخل
   * الآن هو آخر فترة قصيرة من الرسم.
   */
  const pushElements = useCallback(
    (elements: WhiteboardElement[]) => {
      if (!canWrite) return
      pendingRef.current = elements
      setDirty(true)

      if (Date.now() - lastSaveRef.current >= WHITEBOARD_SNAPSHOT_MAX_INTERVAL_MS) {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = null
        void flush()
        return
      }

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        void flush()
      }, WHITEBOARD_SNAPSHOT_DEBOUNCE_MS)
    },
    [canWrite, flush]
  )

  /** عملية صفحات واحدة الشكل: نتيجتها دائماً إعادة قراءة من الخادم. */
  const runPageOperation = useCallback(
    async (input: { url: string; method: "POST" | "DELETE"; body?: unknown; pageId?: string }) => {
      try {
        const response = await fetch(input.url, {
          method: input.method,
          ...(input.body
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input.body),
              }
            : {}),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          if (mountedRef.current) setError(payload.error ?? "تعذّرت العملية")
          // الحالة قد تكون تغيّرت على الخادم (صفحة حُذفت من جهاز آخر) — نُزامن.
          await reload()
          return
        }
        await reload(input.pageId)
      } catch {
        if (mountedRef.current) setError("تعذّر الاتصال بالخادم")
      }
    },
    [reload]
  )

  const createPage = useCallback(async () => {
    await runPageOperation({
      url: `/api/live/${sessionId}/whiteboard/pages`,
      method: "POST",
      body: {},
    })
  }, [runPageOperation, sessionId])

  const removePage = useCallback(
    async (pageId: string) => {
      await runPageOperation({
        url: `/api/live/${sessionId}/whiteboard/pages?pageId=${encodeURIComponent(pageId)}`,
        method: "DELETE",
      })
    },
    [runPageOperation, sessionId]
  )

  const selectPage = useCallback(
    async (pageId: string) => {
      await runPageOperation({
        url: `/api/live/${sessionId}/whiteboard/active-page`,
        method: "POST",
        body: { pageId },
        pageId,
      })
    },
    [runPageOperation, sessionId]
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // التحميل الأول عند فتح السبورة.
  useEffect(() => {
    if (!enabled) return
    void reload()
  }, [enabled, reload])

  // مستمع القناة — نفس عرف live-chat.tsx: TextDecoder ثم تصفية بالنوع.
  useEffect(() => {
    if (!enabled || !room) return

    const handleData = (payload: Uint8Array) => {
      let raw: unknown
      try {
        raw = JSON.parse(new TextDecoder().decode(payload))
      } catch {
        return
      }
      // أحداث الدردشة/رفع اليد تمرّ على نفس القناة؛ التصفية بالمخطط لا بالنوع
      // النصّي وحده، فالحدث المشوَّه يُرفض بصمت ولا يُفسد المشهد.
      const event = parseWhiteboardEvent(raw)
      if (!event) return

      const current = boardRef.current
      if (!current) return

      const outcome = reduceWhiteboardEvent(current, event, userId)
      if (outcome.action === "apply") {
        commit(outcome.state)
        return
      }
      if (outcome.action === "recover") {
        void reload(outcome.pageId ?? undefined)
      }
    }

    room.on("dataReceived", handleData)
    return () => {
      room.off("dataReceived", handleData)
    }
  }, [enabled, room, userId, commit, reload])

  /**
   * استعادة بالاستعلام حين لا توجد قناة.
   *
   * للقارئ فقط: الكاتب حالته المحلية هي الأحدث، فاستعلام دوري يستبدل رسمه
   * الجاري بحالة الخادم الأقدم. القارئ بلا قناة لا يعلم أن شيئاً تغيّر إطلاقاً.
   */
  useEffect(() => {
    if (!enabled || room || canWrite) return
    const timer = setInterval(() => void reload(), WHITEBOARD_RECOVERY_POLL_MS)
    return () => clearInterval(timer)
  }, [enabled, room, canWrite, reload])

  return {
    status,
    error,
    board,
    canWrite,
    dirty,
    initBoard,
    reload,
    pushElements,
    createPage,
    removePage,
    selectPage,
  }
}
