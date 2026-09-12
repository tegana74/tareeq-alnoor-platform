import { describe, it, expect } from "vitest"

// ============================= SMART-WB-1A — Smart Whiteboard (طبقة السياسة) =============================
// اختبارات خالصة بلا Prisma وبلا شبكة: كل ما هنا قابل للتشغيل قبل تنفيذ أي migration.
// القواعد المحمية: الطالب لا يكتب، الترتيب متصل، والمراجعة تكشف التعارض بدل طمسه.

import {
  WHITEBOARD_DELTA_MAX_BYTES,
  WHITEBOARD_INITIAL_REVISION,
  WHITEBOARD_MAX_ELEMENTS_PER_PAGE,
  WHITEBOARD_MAX_PAGES,
  WHITEBOARD_SNAPSHOT_DEBOUNCE_MS,
  WHITEBOARD_SNAPSHOT_MAX_BYTES,
  WHITEBOARD_SNAPSHOT_MAX_INTERVAL_MS,
  WHITEBOARD_STATUSES,
  WHITEBOARD_WRITE_LIMIT,
  WhiteboardElementsSchema,
  WhiteboardReorderPagesSchema,
  WhiteboardSaveRequestSchema,
  applyPageReorder,
  byteSizeOf,
  canAddPage,
  canApplyEventLocally,
  canReadWhiteboard,
  canRemovePage,
  canWriteWhiteboard,
  fitsDataChannel,
  isAcceptedRevision,
  isWhiteboardWritableStatus,
  needsFullRecovery,
  nextPageOrder,
  normalizePageOrder,
  parseWhiteboardEvent,
  resolveActivePageAfterRemoval,
  resolveRevision,
  sortPages,
} from "@/lib/live-classroom/whiteboard"

const session = { teacherId: "teacher-1" }
const owner = { role: "TEACHER", teacherId: "teacher-1" }
const otherTeacher = { role: "TEACHER", teacherId: "teacher-2" }
const admin = { role: "ADMIN", teacherId: null }
const student = { role: "STUDENT", teacherId: null }

const element = (id: string) => ({ id, type: "freedraw", version: 1 })

describe("صلاحيات الكتابة — الطلاب قراءة فقط", () => {
  it("المعلم المالك والأدمن يكتبان", () => {
    expect(canWriteWhiteboard(owner, session)).toBe(true)
    expect(canWriteWhiteboard(admin, session)).toBe(true)
  })

  it("الطالب لا يكتب مهما كان", () => {
    expect(canWriteWhiteboard(student, session)).toBe(false)
  })

  it("معلم آخر لا يكتب على سبورة جلسة لا يملكها", () => {
    expect(canWriteWhiteboard(otherTeacher, session)).toBe(false)
  })

  it("زائر بلا جلسة لا يكتب", () => {
    expect(canWriteWhiteboard(null, session)).toBe(false)
  })

  it("معلم بلا teacherId لا يمرّ ولو تطابقت القيم كـ null", () => {
    expect(canWriteWhiteboard({ role: "TEACHER", teacherId: null }, session)).toBe(false)
  })

  it("دور غير معروف يُرفض افتراضياً (البوابة مغلقة)", () => {
    expect(canWriteWhiteboard({ role: "MODERATOR", teacherId: null }, session)).toBe(false)
    expect(canWriteWhiteboard({ role: "PARENT", teacherId: "teacher-1" }, session)).toBe(false)
  })
})

describe("حالة الجلسة تحكم الكتابة لا الدور وحده", () => {
  it("الجلسة الحيّة وما يجاورها قابلة للكتابة", () => {
    for (const status of ["scheduled", "waiting", "live", "recording"] as const) {
      expect(isWhiteboardWritableStatus(status)).toBe(true)
    }
  })

  it("الجلسة المنتهية/المؤرشفة/الملغاة لا تُكتب", () => {
    for (const status of ["ended", "archived", "cancelled"] as const) {
      expect(isWhiteboardWritableStatus(status)).toBe(false)
    }
  })

  it("القراءة تبقى متاحة بعد انتهاء الجلسة، وتُمنع للملغاة", () => {
    expect(canReadWhiteboard("ended")).toBe(true)
    expect(canReadWhiteboard("archived")).toBe(true)
    expect(canReadWhiteboard("cancelled")).toBe(false)
  })

  it("حالتا السبورة المخزَّنتان لا أكثر", () => {
    expect([...WHITEBOARD_STATUSES]).toEqual(["active", "archived"])
  })
})

describe("حدود الحجم", () => {
  it("byteSizeOf يحسب بايتات UTF-8 لا أحرف JS", () => {
    expect(byteSizeOf("ab")).toBe(4) // "ab" مع علامتَي التنصيص
    // الحرف العربي بايتان في UTF-8 — لو حُسب بالأحرف لعاد 4 بدل 6
    expect(byteSizeOf("سب")).toBe(6)
    // الرمز خارج BMP أربع بايتات — الحساب على نقاط الترميز لا على وحدات UTF-16
    expect(byteSizeOf(["السلام عليكم", "🎨"])).toBe(34)
  })

  it("byteSizeOf لا يرمي على قيمة غير قابلة للتسلسل", () => {
    expect(byteSizeOf(() => undefined)).toBe(0)
    expect(byteSizeOf(undefined)).toBe(0)
  })

  it("سقف القناة أصغر من حدّ LiveKit (15 KiB) ليتّسع للمُغلِّف", () => {
    expect(WHITEBOARD_DELTA_MAX_BYTES).toBeLessThan(15 * 1024)
  })

  it("سقف snapshot أوسع من سقف القناة", () => {
    expect(WHITEBOARD_SNAPSHOT_MAX_BYTES).toBeGreaterThan(WHITEBOARD_DELTA_MAX_BYTES)
  })

  it("fitsDataChannel يفصل ما يُبثّ عمّا يحتاج REST", () => {
    expect(fitsDataChannel([element("a")])).toBe(true)
    const heavy = [{ id: "big", type: "text", text: "س".repeat(WHITEBOARD_DELTA_MAX_BYTES) }]
    expect(fitsDataChannel(heavy)).toBe(false)
  })
})

describe("عقود التحقق", () => {
  it("تُقبل عناصر Excalidraw بحقولها الإضافية كما هي", () => {
    const parsed = WhiteboardElementsSchema.safeParse([
      { id: "a", type: "freedraw", points: [[0, 0]], strokeColor: "#000", extra: 1 },
    ])
    expect(parsed.success).toBe(true)
  })

  it("يُرفض عنصر بلا معرّف أو بلا نوع", () => {
    expect(WhiteboardElementsSchema.safeParse([{ type: "freedraw" }]).success).toBe(false)
    expect(WhiteboardElementsSchema.safeParse([{ id: "a" }]).success).toBe(false)
  })

  it("تُرفض المعرّفات المكرّرة — تفسد الفهرسة والدمج", () => {
    const parsed = WhiteboardElementsSchema.safeParse([element("a"), element("a")])
    expect(parsed.success).toBe(false)
  })

  it("يُرفض تجاوز عدد العناصر المسموح", () => {
    const many = Array.from({ length: WHITEBOARD_MAX_ELEMENTS_PER_PAGE + 1 }, (_, i) =>
      element(`e${i}`)
    )
    expect(WhiteboardElementsSchema.safeParse(many).success).toBe(false)
  })

  it("يُرفض تجاوز سقف البايتات ولو كان عدد العناصر صغيراً", () => {
    const heavy = [
      { id: "a", type: "text", text: "س".repeat(WHITEBOARD_SNAPSHOT_MAX_BYTES) },
    ]
    expect(WhiteboardElementsSchema.safeParse(heavy).success).toBe(false)
  })

  it("طلب الحفظ يحتاج pageId ومراجعة أساس صحيحة", () => {
    const ok = WhiteboardSaveRequestSchema.safeParse({
      pageId: "page-1",
      baseRevision: 3,
      elements: [element("a")],
    })
    expect(ok.success).toBe(true)

    expect(
      WhiteboardSaveRequestSchema.safeParse({
        pageId: "page-1",
        baseRevision: -1,
        elements: [],
      }).success
    ).toBe(false)
    expect(
      WhiteboardSaveRequestSchema.safeParse({
        pageId: "page-1",
        baseRevision: 1.5,
        elements: [],
      }).success
    ).toBe(false)
  })

  it("طلب الحفظ لا يحمل هوية — الهوية من الجلسة المصادَق عليها", () => {
    const parsed = WhiteboardSaveRequestSchema.parse({
      pageId: "page-1",
      baseRevision: 0,
      elements: [],
      userId: "attacker",
      role: "ADMIN",
    })
    expect(parsed).not.toHaveProperty("userId")
    expect(parsed).not.toHaveProperty("role")
  })

  it("إعادة الترتيب لا تقبل قائمة فارغة ولا أطول من حدّ الصفحات", () => {
    expect(WhiteboardReorderPagesSchema.safeParse({ pageIds: [] }).success).toBe(false)
    const tooMany = Array.from({ length: WHITEBOARD_MAX_PAGES + 1 }, (_, i) => `p${i}`)
    expect(WhiteboardReorderPagesSchema.safeParse({ pageIds: tooMany }).success).toBe(false)
  })
})

describe("أحداث القناة تُعامَل كمُدخَل غير موثوق", () => {
  const base = {
    version: 1 as const,
    id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    sessionId: "session-1",
    boardId: "board-1",
    senderId: "user-1",
    timestamp: 1_700_000_000_000,
  }

  it("يُقبل حدث تعديل صحيح", () => {
    const event = parseWhiteboardEvent({
      ...base,
      type: "WB_PATCH",
      payload: { pageId: "page-1", revision: 4, elements: [element("a")] },
    })
    expect(event?.type).toBe("WB_PATCH")
  })

  it("يُرفض بصمت حدث بنوع مجهول أو إصدار مختلف", () => {
    expect(parseWhiteboardEvent({ ...base, type: "WB_EVIL", payload: {} })).toBeNull()
    expect(
      parseWhiteboardEvent({ ...base, version: 2, type: "WB_CLOSED", payload: {} })
    ).toBeNull()
  })

  it("يُرفض حدث تعديل بحمولة مشوَّهة", () => {
    expect(
      parseWhiteboardEvent({
        ...base,
        type: "WB_PATCH",
        payload: { pageId: "page-1", revision: -3, elements: [] },
      })
    ).toBeNull()
    expect(parseWhiteboardEvent({ ...base, type: "WB_PATCH" })).toBeNull()
  })

  it("يُرفض ما ليس كائناً أصلاً", () => {
    expect(parseWhiteboardEvent(null)).toBeNull()
    expect(parseWhiteboardEvent("WB_PATCH")).toBeNull()
    expect(parseWhiteboardEvent(42)).toBeNull()
  })
})

describe("ترتيب الصفحات", () => {
  it("الترتيب بـ order ثم بالمعرّف عند التساوي — لا يعتمد على ترتيب الصفوف", () => {
    const pages = [
      { id: "b", order: 1 },
      { id: "a", order: 1 },
      { id: "c", order: 0 },
    ]
    expect(sortPages(pages).map((page) => page.id)).toEqual(["c", "a", "b"])
  })

  it("normalizePageOrder يُصلح الفراغات والتكرار إلى ترقيم متصل من 0", () => {
    const pages = [
      { id: "a", order: 7 },
      { id: "b", order: 7 },
      { id: "c", order: 0 },
    ]
    expect(normalizePageOrder(pages)).toEqual([
      { id: "c", order: 0 },
      { id: "a", order: 1 },
      { id: "b", order: 2 },
    ])
  })

  it("رقم الصفحة التالية = عدد الصفحات (الترقيم متصل من 0)", () => {
    expect(nextPageOrder([])).toBe(0)
    expect(nextPageOrder([{ id: "a", order: 0 }])).toBe(1)
  })

  it("لا تُتجاوز حدود عدد الصفحات", () => {
    const full = Array.from({ length: WHITEBOARD_MAX_PAGES }, (_, i) => ({
      id: `p${i}`,
      order: i,
    }))
    expect(canAddPage(full.slice(0, -1))).toBe(true)
    expect(canAddPage(full)).toBe(false)
  })

  it("الصفحة الأخيرة لا تُحذف — سبورة بلا صفحة لا معنى لها", () => {
    expect(canRemovePage([{ id: "a", order: 0 }])).toBe(false)
    expect(canRemovePage([{ id: "a", order: 0 }, { id: "b", order: 1 }])).toBe(true)
  })
})

describe("إعادة الترتيب", () => {
  const pages = [
    { id: "a", order: 0 },
    { id: "b", order: 1 },
    { id: "c", order: 2 },
  ]

  it("ترتيب كامل صحيح ⇒ ترقيم متصل جديد", () => {
    const result = applyPageReorder(pages, ["c", "a", "b"])
    expect(result).toEqual({
      ok: true,
      pages: [
        { id: "c", order: 0 },
        { id: "a", order: 1 },
        { id: "b", order: 2 },
      ],
    })
  })

  it("قائمة ناقصة تُرفض — نتيجتها صفحة تختفي من العرض", () => {
    expect(applyPageReorder(pages, ["a", "b"])).toEqual({ ok: false, reason: "incomplete" })
  })

  it("معرّف غريب (من سبورة أخرى) يُرفض", () => {
    expect(applyPageReorder(pages, ["a", "b", "zzz"])).toEqual({
      ok: false,
      reason: "unknown-page",
    })
  })

  it("معرّف مكرر يُرفض", () => {
    expect(applyPageReorder(pages, ["a", "a", "b"])).toEqual({
      ok: false,
      reason: "duplicate",
    })
  })

  it("الصفحة المعروضة بعد الحذف: التالية، أو السابقة إن حُذفت الأخيرة", () => {
    expect(resolveActivePageAfterRemoval(pages, "b")).toBe("c")
    expect(resolveActivePageAfterRemoval(pages, "c")).toBe("b")
    expect(resolveActivePageAfterRemoval([{ id: "a", order: 0 }], "a")).toBeNull()
  })
})

describe("المراجعة والتعارض", () => {
  it("المراجعة المتوقَّعة تُقبل وتتزايد بواحد", () => {
    const verdict = resolveRevision({ baseRevision: 4, serverRevision: 4 })
    expect(verdict).toEqual({ kind: "accept", nextRevision: 5 })
    expect(isAcceptedRevision(verdict)).toBe(true)
  })

  it("عميل متأخّر ⇒ stale لا كتابة — لا يطمس عملاً أحدث", () => {
    const verdict = resolveRevision({ baseRevision: 2, serverRevision: 5 })
    expect(verdict).toEqual({ kind: "stale", serverRevision: 5 })
    expect(isAcceptedRevision(verdict)).toBe(false)
  })

  it("عميل يدّعي مراجعة أحدث من الخادم ⇒ ahead، مفصولة عن stale", () => {
    const verdict = resolveRevision({ baseRevision: 9, serverRevision: 5 })
    expect(verdict).toEqual({ kind: "ahead", serverRevision: 5 })
    expect(isAcceptedRevision(verdict)).toBe(false)
  })

  it("الصفحة الجديدة تبدأ من مراجعة 0 وأول كتابة تصبح 1", () => {
    expect(WHITEBOARD_INITIAL_REVISION).toBe(0)
    expect(
      resolveRevision({
        baseRevision: WHITEBOARD_INITIAL_REVISION,
        serverRevision: WHITEBOARD_INITIAL_REVISION,
      })
    ).toEqual({ kind: "accept", nextRevision: 1 })
  })
})

describe("الاستعادة من الخادم عند فقد رسالة", () => {
  it("المراجعة التالية بالضبط تُطبَّق محلياً", () => {
    expect(canApplyEventLocally({ localRevision: 3, eventRevision: 4 })).toBe(true)
    expect(needsFullRecovery({ localRevision: 3, eventRevision: 4 })).toBe(false)
  })

  it("قفزة فوق مراجعة ⇒ استعادة كاملة (وإلا بقي ثقب صامت في الرسم)", () => {
    expect(needsFullRecovery({ localRevision: 3, eventRevision: 5 })).toBe(true)
    expect(canApplyEventLocally({ localRevision: 3, eventRevision: 5 })).toBe(false)
  })

  it("حدث متأخّر أقدم من الحالة المعروضة ⇒ استعادة، لا رجوع بالسبورة للخلف", () => {
    expect(needsFullRecovery({ localRevision: 6, eventRevision: 4 })).toBe(true)
    expect(needsFullRecovery({ localRevision: 6, eventRevision: 6 })).toBe(true)
  })
})

describe("ثوابت الإيقاع متسقة مع بعضها", () => {
  it("الحد الأقصى بلا تثبيت أطول من مهلة السكون", () => {
    expect(WHITEBOARD_SNAPSHOT_MAX_INTERVAL_MS).toBeGreaterThan(
      WHITEBOARD_SNAPSHOT_DEBOUNCE_MS
    )
  })

  it("حدّ معدّل الكتابة يتّسع لإيقاع البثّ المسموح", () => {
    // ‎120ms‎ بين البثّات ⇒ نحو 8 في الثانية؛ النافذة يجب أن تتّسع لها
    const maxBroadcastsInWindow = WHITEBOARD_WRITE_LIMIT.windowMs / 120
    expect(WHITEBOARD_WRITE_LIMIT.max).toBeGreaterThanOrEqual(maxBroadcastsInWindow)
  })
})



