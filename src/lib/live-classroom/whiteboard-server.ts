// SMART-WB-1A — Smart Whiteboard (وصول Prisma المُنمَّط فقط)
//
// هذا الملف لا يحتوي منطق سياسة ولا صلاحيات ولا رموز HTTP: كلها في
// `whiteboard.ts`. مسؤوليته الوحيدة قراءة/كتابة الجداول الثلاثة بأنواع صريحة،
// كي تبقى الـ routes (طور لاحق) طبقة رقيقة تجمع: تحقق ← وصول ← بثّ.
//
// لا يُقرأ من العميل هنا أي هوية أو دور: كل دالة تستقبل معرّف الفاعل بعد أن
// أثبته المتصل من الجلسة المصادَق عليها.

import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"
import {
  WHITEBOARD_INITIAL_REVISION,
  byteSizeOf,
  normalizePageOrder,
  sortPages,
  type WhiteboardElement,
  type WhiteboardPageOrder,
  type WhiteboardStatus,
} from "./whiteboard"

/**
 * جداول whiteboard_* غير موجودة بعد (لم تُنفَّذ الـ migration).
 * Prisma P2021 = "table does not exist" — نفس عرف `isAdmissionTableMissing`.
 */
export function isWhiteboardTableMissing(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  return (error as { code?: unknown }).code === "P2021"
}

/**
 * تعارض على قيد فريد — يعني هنا: صفّان على نفس (pageId, revision).
 * Prisma P2002 = unique constraint failed.
 */
export function isWhiteboardRevisionConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  return (error as { code?: unknown }).code === "P2002"
}

/**
 * هل هذا تعارض P2002 على العمود المذكور بالتحديد؟
 *
 * `meta.target` تحمل أسماء الأعمدة التي اصطدم عليها القيد. الفحص على العمود لا
 * على رمز الخطأ وحده مقصود: التقاط أي P2002 يعني طمس تعارض غير متوقَّع (قيد آخر
 * أُضيف لاحقاً) وإخفاء الخلل بدل كشفه.
 */
function isUniqueConflictOn(error: unknown, field: string): boolean {
  if (!isWhiteboardRevisionConflict(error)) return false
  const target = (error as { meta?: { target?: unknown } }).meta?.target
  if (typeof target === "string") return target.includes(field)
  if (Array.isArray(target)) return target.includes(field)
  // بعض محرّكات Prisma لا تُرفق target؛ لا نبتلع الخطأ حينها.
  return false
}

/**
 * خطأ طبقة الوصول — سبب معروف ومحدّد، لا استثناء عام.
 *
 * على عرف `LiveKitAdminError`: رمز مُصنَّف كي تُترجمه الـ routes (طور لاحق) إلى
 * رمز HTTP دون أن تفحص نصوص رسائل.
 */
export class WhiteboardServerError extends Error {
  constructor(
    readonly code: "PAGE_NOT_IN_BOARD",
    message: string
  ) {
    super(message)
    this.name = "WhiteboardServerError"
  }
}

export function isWhiteboardServerError(error: unknown): error is WhiteboardServerError {
  return error instanceof WhiteboardServerError
}

export type WhiteboardBoardRecord = {
  id: string
  sessionId: string
  status: string
  activePageId: string | null
  createdById: string
  createdAt: Date
  updatedAt: Date
}

export type WhiteboardPageRecord = WhiteboardPageOrder & {
  title: string | null
  createdAt: Date
  updatedAt: Date
}

export type WhiteboardSnapshotRecord = {
  id: string
  pageId: string
  revision: number
  elements: WhiteboardElement[]
  sizeBytes: number
  createdById: string
  createdAt: Date
}

const BOARD_SELECT = {
  id: true,
  sessionId: true,
  status: true,
  activePageId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const

const PAGE_SELECT = {
  id: true,
  order: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} as const

// ─── قراءات ──────────────────────────────────────────────────────────────────

/** سبورة هذه الجلسة، أو null إن لم تُنشأ بعد. */
export async function readBoardBySession(
  sessionId: string
): Promise<WhiteboardBoardRecord | null> {
  return prisma.whiteboardBoard.findUnique({
    where: { sessionId },
    select: BOARD_SELECT,
  })
}

/** صفحات السبورة بالترتيب المعروض (لا بترتيب صفوف قاعدة البيانات). */
export async function readPages(boardId: string): Promise<WhiteboardPageRecord[]> {
  const rows = await prisma.whiteboardPage.findMany({
    where: { boardId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: PAGE_SELECT,
  })
  return sortPages(rows)
}

/**
 * أحدث snapshot لصفحة — وهو الحالة الحاضرة للصفحة (المصدر الوحيد للحقيقة).
 *
 * السجل تراكمي (append-only) فالأحدث هو الأعلى مراجعة؛ الترتيب على `revision`
 * لا على `createdAt` لأن الوقت قد يتساوى بين كتابتين متلاحقتين.
 */
export async function readLatestSnapshot(
  pageId: string
): Promise<WhiteboardSnapshotRecord | null> {
  const row = await prisma.whiteboardSnapshot.findFirst({
    where: { pageId },
    orderBy: { revision: "desc" },
    select: {
      id: true,
      pageId: true,
      revision: true,
      elements: true,
      sizeBytes: true,
      createdById: true,
      createdAt: true,
    },
  })
  if (!row) return null
  return { ...row, elements: toElements(row.elements) }
}

/**
 * المراجعة الحالية للصفحة — 0 يعني «لا snapshot بعد» (صفحة فارغة جديدة).
 * قراءة مستقلة عن `readLatestSnapshot` كي لا يُنقل عمود `elements` كاملاً
 * حين لا يُطلب إلا الرقم.
 */
export async function readPageRevision(pageId: string): Promise<number> {
  const row = await prisma.whiteboardSnapshot.findFirst({
    where: { pageId },
    orderBy: { revision: "desc" },
    select: { revision: true },
  })
  return row?.revision ?? WHITEBOARD_INITIAL_REVISION
}

/** عمود Json يُقرأ كمصفوفة عناصر؛ أي شكل آخر يُعامَل كصفحة فارغة. */
function toElements(value: unknown): WhiteboardElement[] {
  return Array.isArray(value) ? (value as WhiteboardElement[]) : []
}

/** الحالة الكاملة التي يستعيدها أي عميل عند الدخول أو بعد انقطاع. */
export type WhiteboardState = {
  board: WhiteboardBoardRecord
  pages: WhiteboardPageRecord[]
  activePageId: string | null
  revision: number
  elements: WhiteboardElement[]
}

/**
 * استعادة كاملة من الخادم — المسار الذي يعتمد عليه كل reconnect.
 *
 * `pageId` اختياري: بدونه تُعاد الصفحة المعروضة (`activePageId`) فيرى الطالب ما
 * يعرضه المعلم الآن. تُعاد null إن لم تكن للجلسة سبورة بعد.
 */
export async function readWhiteboardState(
  sessionId: string,
  pageId?: string
): Promise<WhiteboardState | null> {
  const board = await readBoardBySession(sessionId)
  if (!board) return null

  const pages = await readPages(board.id)
  // الصفحة المطلوبة يجب أن تكون من صفحات هذه السبورة — لا يُقبل معرّف غريب.
  const requested = pageId ? pages.find((page) => page.id === pageId) : undefined
  const active =
    requested ??
    pages.find((page) => page.id === board.activePageId) ??
    pages[0] ??
    null

  if (!active) {
    return { board, pages, activePageId: null, revision: WHITEBOARD_INITIAL_REVISION, elements: [] }
  }

  const snapshot = await readLatestSnapshot(active.id)
  return {
    board,
    pages,
    activePageId: active.id,
    revision: snapshot?.revision ?? WHITEBOARD_INITIAL_REVISION,
    elements: snapshot?.elements ?? [],
  }
}

// ─── كتابات ──────────────────────────────────────────────────────────────────

/**
 * سبورة الجلسة، تُنشأ مع صفحتها الأولى إن لم تكن موجودة.
 *
 * idempotent تحت التزامن: نداءان متزامنان من المعلم (تبوين/جهازان) يمرّان معاً
 * على القراءة الأولى فيريان null، ثم يتسابقان على الإنشاء. القيد الفريد على
 * `sessionId` يُسقط الثاني بـ P2002، فيُعاد قراءة السبورة التي أنشأها الأول
 * وتُعاد كما لو وجدها من البداية. أي خطأ آخر — أو تعارض على عمود غير `sessionId` —
 * يُرفع كما هو: لا تُبتلع أخطاء غير متوقَّعة هنا.
 *
 * الصفحة الأولى تُنشأ في نفس المعاملة كي لا توجد سبورة بلا صفحة تُعرض.
 */
export async function ensureBoard(params: {
  sessionId: string
  actorUserId: string
}): Promise<WhiteboardBoardRecord> {
  const existing = await readBoardBySession(params.sessionId)
  if (existing) return existing

  try {
    return await prisma.$transaction(async (tx) => {
      const board = await tx.whiteboardBoard.create({
        data: { sessionId: params.sessionId, createdById: params.actorUserId },
        select: BOARD_SELECT,
      })
      const page = await tx.whiteboardPage.create({
        data: { boardId: board.id, order: 0 },
        select: { id: true },
      })
      return tx.whiteboardBoard.update({
        where: { id: board.id },
        data: { activePageId: page.id },
        select: BOARD_SELECT,
      })
    })
  } catch (error) {
    if (!isUniqueConflictOn(error, "sessionId")) throw error
    // فاز المتسابق الآخر: سبورته هي السبورة الشرعية لهذه الجلسة.
    const winner = await readBoardBySession(params.sessionId)
    if (!winner) throw error
    return winner
  }
}

/**
 * تثبيت حالة صفحة كمراجعة جديدة.
 *
 * `revision` تُمرَّر من الخارج بعد حكم `resolveRevision` — لا تُحسب هنا: حسابها
 * داخل هذه الدالة يعني قراءة ثم كتابة بلا حاجز، فتفوز آخر كتابة دائماً. القيد
 * الفريد (pageId, revision) يرفض المتسابق الثاني بـ P2002، ويكشفه
 * `isWhiteboardRevisionConflict` للـ route ليردّ 409.
 *
 * السجل تراكمي: لا صفّ يُحدَّث ولا يُحذف، فالتاريخ يبقى صالحاً للاستعادة.
 *
 * `pageId` يُتحقَّق من انتمائه إلى `boardId` داخل نفس المعاملة قبل الإدراج:
 * المفتاحان الأجنبيان يصحّان كلٌّ على حدة، فزوج (boardId من سبورة، pageId من
 * سبورة أخرى) يمرّ على قاعدة البيانات ويُنتج صفّاً يفسد قراءات تاريخ السبورة.
 */
export async function appendSnapshot(params: {
  boardId: string
  pageId: string
  revision: number
  elements: WhiteboardElement[]
  actorUserId: string
}): Promise<WhiteboardSnapshotRecord> {
  const row = await prisma.$transaction(async (tx) => {
    const owned = await tx.whiteboardPage.count({
      where: { id: params.pageId, boardId: params.boardId },
    })
    if (owned === 0) {
      throw new WhiteboardServerError(
        "PAGE_NOT_IN_BOARD",
        "page does not belong to this whiteboard"
      )
    }
    return tx.whiteboardSnapshot.create({
      data: {
        boardId: params.boardId,
        pageId: params.pageId,
        revision: params.revision,
        // العناصر حمولة معتمة عن قصد (لا نُعيد تعريف مخطط Excalidraw)، فتُمرَّر
        // كـ Json كما هي بعد أن تحقّق منها `WhiteboardElementsSchema` قبل الوصول هنا.
        elements: params.elements as unknown as Prisma.InputJsonValue,
        sizeBytes: byteSizeOf(params.elements),
        createdById: params.actorUserId,
      },
      select: {
        id: true,
        pageId: true,
        revision: true,
        elements: true,
        sizeBytes: true,
        createdById: true,
        createdAt: true,
      },
    })
  })
  return { ...row, elements: toElements(row.elements) }
}

/** صفحة جديدة في نهاية الترتيب. الترقيم متصل فرقم الجديدة = عدد الحالي. */
export async function createPage(params: {
  boardId: string
  title?: string
}): Promise<WhiteboardPageRecord> {
  return prisma.$transaction(async (tx) => {
    const count = await tx.whiteboardPage.count({ where: { boardId: params.boardId } })
    return tx.whiteboardPage.create({
      data: { boardId: params.boardId, order: count, title: params.title ?? null },
      select: PAGE_SELECT,
    })
  })
}

/**
 * حذف صفحة + إعادة ترقيم الباقي متصلاً، مع نقل العرض إن كانت المحذوفة معروضة.
 *
 * كل ذلك في معاملة واحدة: لو انقطع في المنتصف لبقيت السبورة تشير بـ
 * `activePageId` إلى صفحة محذوفة، أو بترقيم مثقوب.
 *
 * الحذف مقيَّد بـ `boardId` مع `id` معاً — لا بالمعرّف وحده. بدون القيد يستطيع
 * طلب يحمل معرّف صفحة من سبورة أخرى أن يحذفها (ومعها تاريخها بالتتالي) ثم يُعيد
 * ترقيم السبورة الخطأ. صفر صفوف محذوفة ⇒ الصفحة ليست من هذه السبورة (أو لم تكن
 * موجودة) فتُلغى المعاملة قبل أي إعادة ترقيم.
 */
export async function removePage(params: {
  boardId: string
  pageId: string
  nextActivePageId: string | null
}): Promise<WhiteboardPageRecord[]> {
  return prisma.$transaction(async (tx) => {
    const deleted = await tx.whiteboardPage.deleteMany({
      where: { id: params.pageId, boardId: params.boardId },
    })
    if (deleted.count === 0) {
      throw new WhiteboardServerError(
        "PAGE_NOT_IN_BOARD",
        "page does not belong to this whiteboard"
      )
    }
    const remaining = await tx.whiteboardPage.findMany({
      where: { boardId: params.boardId },
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: PAGE_SELECT,
    })
    const normalized = normalizePageOrder(remaining)
    for (const page of normalized) {
      await tx.whiteboardPage.update({
        where: { id: page.id },
        data: { order: page.order },
      })
    }
    await tx.whiteboardBoard.update({
      where: { id: params.boardId },
      data: { activePageId: params.nextActivePageId },
    })
    return normalized
  })
}

/**
 * كتابة ترتيب محسوب مسبقاً (`applyPageReorder`) داخل معاملة واحدة.
 *
 * `boardId` في شرط كل تحديث ليس زائداً: بدونه يستطيع طلب يحمل معرّف صفحة من
 * سبورة أخرى أن يُعيد ترتيبها. مع الشرط، التحديث لا يطابق شيئاً فلا يحدث أثر.
 */
export async function writePageOrder(params: {
  boardId: string
  pages: readonly WhiteboardPageOrder[]
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const page of params.pages) {
      await tx.whiteboardPage.updateMany({
        where: { id: page.id, boardId: params.boardId },
        data: { order: page.order },
      })
    }
  })
}

/**
 * تغيير الصفحة المعروضة. الفحص على `boardId` بقصد: يمنع تعيين صفحة من سبورة
 * أخرى كصفحة معروضة هنا.
 */
export async function setActivePage(params: {
  boardId: string
  pageId: string
}): Promise<boolean> {
  const owned = await prisma.whiteboardPage.count({
    where: { id: params.pageId, boardId: params.boardId },
  })
  if (owned === 0) return false
  await prisma.whiteboardBoard.update({
    where: { id: params.boardId },
    data: { activePageId: params.pageId },
  })
  return true
}

/**
 * أرشفة السبورة — لا حذف. المحتوى سجل للجلسة المنتهية: الطلاب يقرأونه،
 * والكتابة تُمنع بـ `isWhiteboardWritableStatus` وحالة السبورة معاً.
 */
export async function setBoardStatus(params: {
  boardId: string
  status: WhiteboardStatus
}): Promise<WhiteboardBoardRecord> {
  return prisma.whiteboardBoard.update({
    where: { id: params.boardId },
    data: { status: params.status },
    select: BOARD_SELECT,
  })
}

