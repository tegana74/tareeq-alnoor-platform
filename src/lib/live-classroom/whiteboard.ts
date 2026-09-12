// SMART-WB-1A — Smart Whiteboard (طبقة السياسة الخالصة)
//
// دوال وثوابت خالصة: بلا React، بلا Prisma، بلا LiveKit، بلا fetch — كي تشترك
// فيها الـ routes والواجهة وقناة البيانات دون تكرار منطق الصلاحيات أو الترتيب.
//
// المبادئ المعتمدة في بوابة التصميم (لا تُخالَف في المراحل التالية):
//
//   1) مصدر الحقيقة هو snapshot الخادم. DataChannel بثّ فوري بلا ذاكرة: من فقد
//      رسالة لا يعرف أنه فقدها، فالاستعادة دائماً من الخادم لا من إعادة إرسال.
//   2) المسار: REST → تحقق على الخادم → بثّ على القناة. لا يُصدَّق أي حدث وصل
//      من القناة مباشرة؛ القناة مخرَج لا مدخَل.
//   3) الطلاب قراءة فقط. الكتابة للمعلم المالك والأدمن حصراً، وتُفرض على
//      الخادم من الجلسة المصادَق عليها — لا من دور يرسله العميل.
//
// PDF مؤجَّل إلى المرحلة الثانية: لا عقد ولا نوع له هنا.

import { z } from "zod"
import type { LiveSessionStatus } from "./types"

// ─── الأدوار والصلاحيات ──────────────────────────────────────────────────────

/**
 * هل يملك هذا المستخدم الكتابة على سبورة هذه الجلسة؟
 *
 * نفس سلّم `canManageAdmission` حرفياً (أدمن، أو معلم الجلسة المالك) كي لا يتباعد
 * سلّمان للصلاحيات في الجلسة نفسها. الطالب لا يكتب أبداً — أياً كان ما يرسله عميله.
 */
export function canWriteWhiteboard(
  user: { role: string; teacherId: string | null } | null,
  session: { teacherId: string }
): boolean {
  if (!user) return false
  if (user.role === "ADMIN") return true
  if (user.role === "TEACHER") {
    return user.teacherId !== null && user.teacherId === session.teacherId
  }
  return false
}

/**
 * هل يُسمح بقراءة السبورة؟ القراءة تابعة لحق دخول الجلسة نفسه (اشتراك/حجز/موافقة
 * دخول) الذي يُفحص في `whiteboard-server.ts` قبل الوصول إلى هنا. هذه الدالة تمنع
 * القراءة في الحالات التي لا سبورة فيها أصلاً.
 */
export function canReadWhiteboard(status: LiveSessionStatus): boolean {
  return status !== "cancelled"
}

/** حالات الجلسة التي تسمح بالكتابة على السبورة — الجلسة الحيّة وما يجاورها. */
const WRITABLE_SESSION_STATUSES: readonly LiveSessionStatus[] = [
  "scheduled",
  "waiting",
  "live",
  "recording",
]

/**
 * هل تسمح حالة الجلسة بالكتابة؟ منفصلة عن الدور بقصد: معلم مالك لجلسة منتهية
 * لا يكتب. `ended/archived/cancelled` ⇒ السبورة سجل للقراءة فقط.
 */
export function isWhiteboardWritableStatus(status: LiveSessionStatus): boolean {
  return WRITABLE_SESSION_STATUSES.includes(status)
}

/** حالات السبورة المخزَّنة — نص لا enum، على عرف باقي جداول الجلسة. */
export const WHITEBOARD_STATUSES = ["active", "archived"] as const
export type WhiteboardStatus = (typeof WHITEBOARD_STATUSES)[number]

// ─── حدود الحجم ──────────────────────────────────────────────────────────────

/**
 * سقف حمولة الحدث المبثوث على DataChannel.
 *
 * LiveKit يحدّ رسالة البيانات الواحدة بنحو 15 KiB، فالسقف هنا 12 KiB لترك متّسع
 * للمُغلِّف (النوع/المراجعة/المعرّفات) ولترميز UTF-8. ما تجاوز السقف لا يُبثّ
 * كتعديل: يُحفظ على الخادم ويُبلَّغ العميل بـ `snapshot-required` فيسحب الحالة
 * كاملة عبر REST — أبطأ لكنه لا يفقد شيئاً.
 */
export const WHITEBOARD_DELTA_MAX_BYTES = 12 * 1024

/**
 * سقف snapshot المحفوظ على الخادم (2 MiB لعناصر Excalidraw المُسلسلة).
 *
 * سبورة درس نموذجية أصغر من ذلك بكثير؛ السقف حاجز ضد حمولة مُصطنعة تُثقل صفاً
 * في قاعدة البيانات، لا حدّ استخدام مشروع. الصور/PDF ليست داخل هذا السقف لأنها
 * مؤجَّلة إلى المرحلة الثانية وستمرّ على Storage الحالي لا على هذا العمود.
 */
export const WHITEBOARD_SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024

/** أقصى عدد عناصر في صفحة واحدة — حاجز ثانٍ مستقل عن البايتات. */
export const WHITEBOARD_MAX_ELEMENTS_PER_PAGE = 5000

/** أقصى عدد صفحات في سبورة واحدة. */
export const WHITEBOARD_MAX_PAGES = 50

/**
 * حجم القيمة بالبايت بعد التسلسل (UTF-8 لا أحرف JS).
 *
 * `JSON.stringify` قد يُعيد undefined لقيمة غير قابلة للتسلسل (دالة مثلاً)،
 * فتُعامَل كحجم صفر ثم يردّها عقد zod — لا ترمي هذه الدالة أبداً.
 */
export function byteSizeOf(value: unknown): number {
  const json = JSON.stringify(value)
  if (typeof json !== "string") return 0
  let bytes = 0
  for (const char of json) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code < 0x10000) bytes += 3
    else bytes += 4
  }
  return bytes
}

/** هل تصلح هذه الحمولة للبثّ على القناة، أم تحتاج مساراً كاملاً عبر REST؟ */
export function fitsDataChannel(value: unknown): boolean {
  return byteSizeOf(value) <= WHITEBOARD_DELTA_MAX_BYTES
}

// ─── الإيقاع (throttle) ──────────────────────────────────────────────────────

/**
 * فاصل البثّ الأدنى بين تعديلين على القناة (مللي ثانية).
 *
 * الرسم يُنتج أحداثاً بمعدل الإطارات؛ 120ms تعطي نحو 8 تحديثات في الثانية —
 * سلاسة كافية للمتابعة، وأقل بكثير من إغراق القناة بعشرات الرسائل في الثانية.
 */
export const WHITEBOARD_BROADCAST_THROTTLE_MS = 120

/**
 * تأخير تثبيت snapshot على الخادم بعد سكون الرسم (مللي ثانية).
 *
 * debounce لا throttle: الكتابة تحدث بعد توقّف اليد، فلا يُكتب صفّ لكل ضربة قلم.
 */
export const WHITEBOARD_SNAPSHOT_DEBOUNCE_MS = 1500

/**
 * أقصى مدة بلا تثبيت أثناء رسم متواصل (مللي ثانية).
 *
 * debounce وحده يمكن أن يتأجّل بلا نهاية إذا لم يتوقف المعلم عن الرسم؛ هذا الحد
 * يضمن أن أسوأ ما يفقده طالب يدخل الآن هو آخر عشر ثوانٍ من الرسم.
 */
export const WHITEBOARD_SNAPSHOT_MAX_INTERVAL_MS = 10_000

/** فترة استعلام الاستعادة عند انقطاع القناة (مللي ثانية). */
export const WHITEBOARD_RECOVERY_POLL_MS = 4000

/**
 * حدّ معدّل كتابات السبورة للمستخدم الواحد — يُستهلك بـ `checkRateLimit` القائم.
 *
 * السقف مشتق من الإيقاع: ‎120ms‎ بين البثّات ⇒ نحو 8 كتابات في الثانية،
 * فـ 30 في ثلاث ثوانٍ تترك هامشاً للانفجارات القصيرة وتوقف حلقة معطوبة.
 */
export const WHITEBOARD_WRITE_LIMIT = { max: 30, windowMs: 3000 } as const

export const WHITEBOARD_RATE_LIMITED = {
  status: 429,
  error: "تعديلات كثيرة جداً على السبورة. انتظر لحظة ثم أعد المحاولة",
} as const

export const WHITEBOARD_TOO_LARGE = {
  status: 413,
  error: "حجم السبورة تجاوز الحد المسموح. احذف بعض العناصر أو أضف صفحة جديدة",
} as const

export const WHITEBOARD_FORBIDDEN = {
  status: 403,
  error: "غير مصرح لك بالكتابة على سبورة هذه الجلسة",
} as const

export const WHITEBOARD_CONFLICT = {
  status: 409,
  error: "تم تعديل السبورة من مكان آخر. جارٍ إعادة المزامنة",
} as const

// ─── عقود التحقق (zod) ───────────────────────────────────────────────────────

/**
 * عنصر Excalidraw كما يُخزَّن: مُتحقَّق منه سطحياً لا مُعاد تشكيله.
 *
 * لا نُعيد تعريف مخطط Excalidraw كاملاً بقصد — سيتغيّر مع كل ترقية للمكتبة
 * وسنكسر سبورات محفوظة. المطلوب هنا شرطان فقط: أن يكون العنصر كائناً بمعرّف
 * ونوع نصيّين (لأننا نفهرس عليهما)، وأن يبقى الباقي كما هو (`passthrough`).
 * الحدّ الحقيقي على المحتوى هو البايتات وعدد العناصر، لا شكل كل حقل.
 */
export const WhiteboardElementSchema = z
  .object({
    id: z.string().min(1).max(255),
    type: z.string().min(1).max(64),
    isDeleted: z.boolean().optional(),
    version: z.number().int().nonnegative().optional(),
  })
  .passthrough()

export type WhiteboardElement = z.infer<typeof WhiteboardElementSchema>

/** مصفوفة عناصر صفحة واحدة، محدودة العدد. المعرّفات المكرَّرة تُرفض. */
export const WhiteboardElementsSchema = z
  .array(WhiteboardElementSchema)
  .max(WHITEBOARD_MAX_ELEMENTS_PER_PAGE)
  .superRefine((elements, ctx) => {
    const seen = new Set<string>()
    for (const element of elements) {
      if (seen.has(element.id)) {
        ctx.addIssue({
          code: "custom",
          message: `معرّف عنصر مكرر: ${element.id}`,
        })
        return
      }
      seen.add(element.id)
    }
    if (byteSizeOf(elements) > WHITEBOARD_SNAPSHOT_MAX_BYTES) {
      ctx.addIssue({ code: "custom", message: "حجم العناصر تجاوز الحد المسموح" })
    }
  })

const IdSchema = z.string().min(1).max(64)
const RevisionSchema = z.number().int().nonnegative()

/**
 * جسم طلب حفظ الحالة (REST) — المسار الوحيد الذي يكتب.
 *
 * `baseRevision` هي المراجعة التي بنى عليها العميل تعديله؛ الخادم يقارنها بما
 * لديه فيكتشف التعارض قبل الكتابة (انظر `resolveRevision`). لا يُقرأ من الجسم
 * أي معرّف مستخدم أو دور — الهوية من الجلسة المصادَق عليها حصراً.
 */
export const WhiteboardSaveRequestSchema = z.object({
  pageId: IdSchema,
  baseRevision: RevisionSchema,
  elements: WhiteboardElementsSchema,
})

export type WhiteboardSaveRequest = z.infer<typeof WhiteboardSaveRequestSchema>

/** جسم طلب إنشاء صفحة. `title` اختياري ويُقصّ طوله. */
export const WhiteboardCreatePageSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
})

/** جسم طلب إعادة الترتيب: معرّفات الصفحات بالترتيب النهائي المطلوب. */
export const WhiteboardReorderPagesSchema = z.object({
  pageIds: z.array(IdSchema).min(1).max(WHITEBOARD_MAX_PAGES),
})

/** جسم طلب تغيير الصفحة المعروضة. */
export const WhiteboardSetActivePageSchema = z.object({
  pageId: IdSchema,
})

// ─── أنواع الأحداث المبثوثة على DataChannel ─────────────────────────────────
//
// مُغلِّف مطابق لعرف `messages.ts` (type/version/id/sessionId/senderId/timestamp)
// كي يمرّ على نفس أنبوب القناة بلا مسار ثانٍ. الفرق الجوهري: هذه الأحداث تُبثّ
// من الخادم بعد التحقق والحفظ، فوصولها يعني أن الحالة ثُبِّتت فعلاً.

export const WhiteboardEventType = z.enum([
  /** تعديل صغير على صفحة: عناصر محدَّثة + المراجعة الجديدة. */
  "WB_PATCH",
  /** الحمولة أكبر من سقف القناة: على المستقبِل سحب الحالة من REST. */
  "WB_SNAPSHOT_REQUIRED",
  /** تغيّرت قائمة الصفحات (إضافة/حذف/إعادة ترتيب). */
  "WB_PAGES_CHANGED",
  /** المعلم نقل العرض إلى صفحة أخرى. */
  "WB_ACTIVE_PAGE",
  /** أُغلقت السبورة (أُرشفت) — لا كتابة بعدها. */
  "WB_CLOSED",
])
export type WhiteboardEventName = z.infer<typeof WhiteboardEventType>

export const WhiteboardBaseEventSchema = z.object({
  type: WhiteboardEventType,
  version: z.literal(1),
  id: z.string().uuid(),
  sessionId: z.string(),
  boardId: IdSchema,
  /** المرسِل الفعلي كما أثبته الخادم — لا كما ادّعاه العميل. */
  senderId: z.string(),
  timestamp: z.number(),
})

export const WhiteboardPatchEventSchema = WhiteboardBaseEventSchema.extend({
  type: z.literal("WB_PATCH"),
  payload: z.object({
    pageId: IdSchema,
    revision: RevisionSchema,
    elements: WhiteboardElementsSchema,
  }),
})

export const WhiteboardSnapshotRequiredEventSchema = WhiteboardBaseEventSchema.extend({
  type: z.literal("WB_SNAPSHOT_REQUIRED"),
  payload: z.object({ pageId: IdSchema, revision: RevisionSchema }),
})

export const WhiteboardPagesChangedEventSchema = WhiteboardBaseEventSchema.extend({
  type: z.literal("WB_PAGES_CHANGED"),
  payload: z.object({
    pages: z
      .array(z.object({ id: IdSchema, order: z.number().int().nonnegative() }))
      .max(WHITEBOARD_MAX_PAGES),
  }),
})

export const WhiteboardActivePageEventSchema = WhiteboardBaseEventSchema.extend({
  type: z.literal("WB_ACTIVE_PAGE"),
  payload: z.object({ pageId: IdSchema }),
})

export const WhiteboardClosedEventSchema = WhiteboardBaseEventSchema.extend({
  type: z.literal("WB_CLOSED"),
  payload: z.object({}),
})

export const WhiteboardEventSchema = z.discriminatedUnion("type", [
  WhiteboardPatchEventSchema,
  WhiteboardSnapshotRequiredEventSchema,
  WhiteboardPagesChangedEventSchema,
  WhiteboardActivePageEventSchema,
  WhiteboardClosedEventSchema,
])

export type WhiteboardEvent = z.infer<typeof WhiteboardEventSchema>

/**
 * أحداث تصل من القناة تُعامَل كمُدخَل غير موثوق دائماً.
 *
 * القناة تُستقبل في العميل، والعميل لا يقرر شيئاً أمنياً؛ لكن حدثاً مشوَّهاً لا
 * يجب أن يُفسد المشهد المعروض، فيُرفض بصمت ويُترك للاستعادة من REST.
 */
export function parseWhiteboardEvent(raw: unknown): WhiteboardEvent | null {
  const parsed = WhiteboardEventSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

// ─── قواعد ترتيب الصفحات ────────────────────────────────────────────────────
//
// الترتيب متصل يبدأ من 0 (0,1,2,…) ولا فراغات ولا تكرار. العمود غير فريد في
// قاعدة البيانات بقصد (انظر schema.prisma): قيد فريد يجعل إعادة الترتيب تصطدم
// بنفسها في منتصف المعاملة. التفرّد يُفرض هنا ثم يُكتب داخل معاملة واحدة.

export type WhiteboardPageOrder = { id: string; order: number }

/**
 * ترتيب الصفحات كما يجب أن يُعرض: بـ `order` ثم بالمعرّف عند التساوي.
 *
 * فاصل التساوي بالمعرّف ليس تجميلاً: بدونه يصبح ترتيب صفحتين بنفس الرقم — وهو
 * ممكن لأن العمود غير فريد — تابعاً لترتيب صفوف قاعدة البيانات، فيرى المعلم
 * ترتيباً ويرى الطالب آخر.
 */
export function sortPages<T extends WhiteboardPageOrder>(pages: readonly T[]): T[] {
  return [...pages].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

/** ترقيم متصل من 0 بحسب الترتيب المعروض — يُصلح الفراغات والتكرار معاً. */
export function normalizePageOrder<T extends WhiteboardPageOrder>(
  pages: readonly T[]
): T[] {
  return sortPages(pages).map((page, index) => ({ ...page, order: index }))
}

/** رقم الصفحة التالية = عدد الصفحات الحالي (لأن الترقيم متصل من 0). */
export function nextPageOrder(pages: readonly WhiteboardPageOrder[]): number {
  return pages.length
}

/** هل يُسمح بإضافة صفحة أخرى؟ */
export function canAddPage(pages: readonly WhiteboardPageOrder[]): boolean {
  return pages.length < WHITEBOARD_MAX_PAGES
}

/**
 * هل يُسمح بحذف هذه الصفحة؟ لا تُحذف الصفحة الأخيرة.
 *
 * سبورة بلا صفحة واحدة على الأقل حالة لا معنى لها: `activePageId` يصبح null
 * والواجهة تفقد ما تعرضه. الإفراغ يكون بمسح عناصر الصفحة لا بحذفها.
 */
export function canRemovePage(pages: readonly WhiteboardPageOrder[]): boolean {
  return pages.length > 1
}

export type ReorderResult =
  | { ok: true; pages: WhiteboardPageOrder[] }
  | { ok: false; reason: "unknown-page" | "incomplete" | "duplicate" }

/**
 * إعادة الترتيب من قائمة معرّفات مطلوبة.
 *
 * تُرفض القائمة إن نقصت صفحة أو زادت معرّفاً غريباً أو كرّرت معرّفاً — لا تُقبل
 * إعادة ترتيب جزئية: نتيجتها فراغ في الترقيم أو صفحة تختفي من العرض. المعرّفات
 * كلها تُقارَن بصفحات هذه السبورة فقط، فلا يمكن لطلب أن يمسّ سبورة أخرى.
 */
export function applyPageReorder(
  current: readonly WhiteboardPageOrder[],
  desiredIds: readonly string[]
): ReorderResult {
  if (new Set(desiredIds).size !== desiredIds.length) {
    return { ok: false, reason: "duplicate" }
  }
  if (desiredIds.length !== current.length) {
    return { ok: false, reason: "incomplete" }
  }
  const byId = new Map(current.map((page) => [page.id, page]))
  const reordered: WhiteboardPageOrder[] = []
  for (const [index, id] of desiredIds.entries()) {
    const page = byId.get(id)
    if (!page) return { ok: false, reason: "unknown-page" }
    reordered.push({ ...page, order: index })
  }
  return { ok: true, pages: reordered }
}

/**
 * الصفحة التي تُعرض بعد حذف الصفحة الحالية: التالية، أو السابقة إن حُذفت الأخيرة.
 * تُعيد null إن لم تبق صفحة (حالة يمنعها `canRemovePage` أصلاً).
 */
export function resolveActivePageAfterRemoval(
  pages: readonly WhiteboardPageOrder[],
  removedId: string
): string | null {
  const ordered = sortPages(pages)
  const index = ordered.findIndex((page) => page.id === removedId)
  if (index === -1) return ordered[0]?.id ?? null
  const remaining = ordered.filter((page) => page.id !== removedId)
  if (remaining.length === 0) return null
  return remaining[Math.min(index, remaining.length - 1)]!.id
}

// ─── قواعد المراجعة والتعارض ────────────────────────────────────────────────
//
// لا CRDT ولا دمج تلقائي في هذا الطور، ولا حاجة إليهما: الكاتب واحد (المعلم
// المالك أو الأدمن) وليس عدداً من الطلاب. ما تحمي منه هذه القواعد ليس تحريراً
// متزامناً بين نِدّين، بل كاتباً واحداً في تبوين/جهازين، وإعادة إرسال متأخرة
// بعد انقطاع — الحالتان تطمسان عملاً حقيقياً إن مرّتا بلا فحص.
//
// المراجعة عدّاد لكل صفحة يتزايد بواحد. القيد الفريد (pageId, revision) في قاعدة
// البيانات هو الحاجز الأخير: إن تسابق طلبان على نفس المراجعة فشل أحدهما بـ P2002
// بدل أن يطمس الآخر.

export type RevisionVerdict =
  /** المراجعة المتوقَّعة — تُكتب، والجديدة = base + 1. */
  | { kind: "accept"; nextRevision: number }
  /** العميل متأخّر: هناك كتابة أحدث لم يرها. عليه الاستعادة من الخادم. */
  | { kind: "stale"; serverRevision: number }
  /** العميل يدّعي مراجعة أحدث من الخادم — حالة مستحيلة مشروعةً ⇒ تُرفض. */
  | { kind: "ahead"; serverRevision: number }

/**
 * الحكم على كتابة بناءً على المراجعة التي بنى العميل عليها.
 *
 * `ahead` مفصولة عن `stale` بقصد: الأولى دليل على خلل (عميل قديم يخترع أرقاماً،
 * أو استعادة قاعدة بيانات) وتُسجَّل، والثانية حالة تشغيل عادية تُصلحها إعادة
 * مزامنة صامتة. لو دُمجتا لضاع الفرق بين ما يحتاج انتباهاً وما لا يحتاج.
 */
export function resolveRevision(params: {
  baseRevision: number
  serverRevision: number
}): RevisionVerdict {
  const { baseRevision, serverRevision } = params
  if (baseRevision === serverRevision) {
    return { kind: "accept", nextRevision: serverRevision + 1 }
  }
  if (baseRevision < serverRevision) return { kind: "stale", serverRevision }
  return { kind: "ahead", serverRevision }
}

/** هل هذه الكتابة مقبولة؟ اختصار للـ routes حين لا تهمّها التفاصيل. */
export function isAcceptedRevision(verdict: RevisionVerdict): boolean {
  return verdict.kind === "accept"
}

/**
 * هل يجب على المستقبِل أن يستعيد الحالة كاملة من الخادم بدل تطبيق الحدث؟
 *
 * نعم إذا كان الحدث يقفز فوق مراجعة (فقدَ رسالة على القناة) أو كان أقدم من الحالة
 * المعروضة (وصل متأخراً). تطبيق الأول يترك ثقباً في الرسم، والثاني يرجع بالسبورة
 * إلى الخلف — والاثنان صامتان: الطالب لا يعرف أنه يرى مشهداً ناقصاً.
 */
export function needsFullRecovery(params: {
  localRevision: number
  eventRevision: number
}): boolean {
  return params.eventRevision !== params.localRevision + 1
}

/**
 * هل يُطبَّق هذا الحدث على الحالة المحلية كما هو؟
 * فقط إن كان المراجعة التالية بالضبط — أي شيء آخر ⇒ استعادة كاملة.
 */
export function canApplyEventLocally(params: {
  localRevision: number
  eventRevision: number
}): boolean {
  return !needsFullRecovery(params)
}

/** المراجعة الأولى لصفحة جديدة: 0 يعني «لا snapshot بعد». */
export const WHITEBOARD_INITIAL_REVISION = 0




