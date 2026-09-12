import { describe, it, expect, vi, beforeEach } from "vitest"

// ============================= SMART-WB-1A — تصليب طبقة الوصول =============================
// اختبارات انحدار لثلاثة عيوب أُصلحت قبل المرحلة 1B:
//   1) ensureBoard كان يقرأ ثم يُنشئ بلا حاجز ⇒ المتسابق الثاني يرمي P2002.
//   2) removePage كان يحذف بالمعرّف وحده ⇒ صفحة سبورة أخرى تُحذف ويُعاد ترقيم الخطأ.
//   3) appendSnapshot كان يُدرج بلا فحص انتماء ⇒ صفّ بزوج (boardId, pageId) متعارض.
//
// Prisma مُموّه بالكامل على عرف live-admission.test.ts — لا قاعدة بيانات ولا شبكة،
// فهذه الاختبارات تعمل قبل تنفيذ أي migration.

const prismaMock = vi.hoisted(() => ({
  whiteboardBoard: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  whiteboardPage: {
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  whiteboardSnapshot: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

import {
  appendSnapshot,
  ensureBoard,
  isWhiteboardServerError,
  removePage,
  WhiteboardServerError,
} from "@/lib/live-classroom/whiteboard-server"

// ============================= Helpers =============================

/** المعاملة تُنفَّذ فوراً على نفس المُموّه — يكفي لمراقبة الاستدعاءات وترتيبها. */
function runTransactionsInline() {
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)
  )
}

/** خطأ Prisma كما يصل فعلاً: رمز + الأعمدة التي اصطدم عليها القيد. */
function uniqueConflict(target: string[]) {
  return Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
    meta: { target },
  })
}

const board = {
  id: "board-1",
  sessionId: "session-1",
  status: "active",
  activePageId: "page-1",
  createdById: "teacher-1",
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

beforeEach(() => {
  vi.clearAllMocks()
  runTransactionsInline()
})

// ============================= 1) ensureBoard =============================

describe("ensureBoard — لا سبورة مكرّرة ولا انفجار عند التزامن", () => {
  it("السبورة الموجودة تُعاد بلا إنشاء", async () => {
    prismaMock.whiteboardBoard.findUnique.mockResolvedValue(board)

    const result = await ensureBoard({ sessionId: "session-1", actorUserId: "teacher-1" })

    expect(result).toEqual(board)
    expect(prismaMock.whiteboardBoard.create).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("السبورة الجديدة تُنشأ مع صفحتها الأولى وتُعيَّن معروضة", async () => {
    prismaMock.whiteboardBoard.findUnique.mockResolvedValue(null)
    prismaMock.whiteboardBoard.create.mockResolvedValue({ ...board, activePageId: null })
    prismaMock.whiteboardPage.create.mockResolvedValue({ id: "page-1" })
    prismaMock.whiteboardBoard.update.mockResolvedValue(board)

    const result = await ensureBoard({ sessionId: "session-1", actorUserId: "teacher-1" })

    expect(result).toEqual(board)
    // سبورة بلا صفحة حالة لا تُعرض — الصفحة الأولى في نفس المعاملة
    expect(prismaMock.whiteboardPage.create).toHaveBeenCalledWith({
      data: { boardId: "board-1", order: 0 },
      select: { id: true },
    })
    expect(prismaMock.whiteboardBoard.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { activePageId: "page-1" } })
    )
  })

  it("نداءان متزامنان ⇒ سبورة واحدة، والثاني يقرأ سبورة الفائز لا يرمي", async () => {
    // القراءة الأولى لكلٍ منهما ترى null (كلاهما سبق إنشاء الآخر)،
    // ثم القراءة بعد التعارض ترى سبورة الفائز.
    prismaMock.whiteboardBoard.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(board)

    let created = 0
    prismaMock.whiteboardBoard.create.mockImplementation(async () => {
      created += 1
      if (created > 1) throw uniqueConflict(["sessionId"])
      return { ...board, activePageId: null }
    })
    prismaMock.whiteboardPage.create.mockResolvedValue({ id: "page-1" })
    prismaMock.whiteboardBoard.update.mockResolvedValue(board)

    const [first, second] = await Promise.all([
      ensureBoard({ sessionId: "session-1", actorUserId: "teacher-1" }),
      ensureBoard({ sessionId: "session-1", actorUserId: "teacher-1" }),
    ])

    expect(first).toEqual(board)
    expect(second).toEqual(board)
    expect(first.id).toBe(second.id)
  })

  it("تعارض sessionId وحده يُعالَج — والقراءة بعده هي مصدر النتيجة", async () => {
    prismaMock.whiteboardBoard.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue(board)
    prismaMock.whiteboardBoard.create.mockRejectedValue(uniqueConflict(["sessionId"]))

    await expect(
      ensureBoard({ sessionId: "session-1", actorUserId: "teacher-1" })
    ).resolves.toEqual(board)
    expect(prismaMock.whiteboardBoard.findUnique).toHaveBeenCalledTimes(2)
  })

  it("تعارض على عمود آخر لا يُبتلع — خلل غير متوقَّع يجب أن يظهر", async () => {
    prismaMock.whiteboardBoard.findUnique.mockResolvedValue(null)
    prismaMock.whiteboardBoard.create.mockRejectedValue(uniqueConflict(["id"]))

    await expect(
      ensureBoard({ sessionId: "session-1", actorUserId: "teacher-1" })
    ).rejects.toMatchObject({ code: "P2002" })
  })

  it("P2002 بلا meta.target لا يُبتلع — لا نخمّن سبب التعارض", async () => {
    prismaMock.whiteboardBoard.findUnique.mockResolvedValue(null)
    prismaMock.whiteboardBoard.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    )

    await expect(
      ensureBoard({ sessionId: "session-1", actorUserId: "teacher-1" })
    ).rejects.toMatchObject({ code: "P2002" })
  })

  it("خطأ غير P2002 يُرفع كما هو", async () => {
    prismaMock.whiteboardBoard.findUnique.mockResolvedValue(null)
    prismaMock.whiteboardBoard.create.mockRejectedValue(
      Object.assign(new Error("connection lost"), { code: "P1001" })
    )

    await expect(
      ensureBoard({ sessionId: "session-1", actorUserId: "teacher-1" })
    ).rejects.toThrow("connection lost")
  })

  it("تعارض sessionId ثم قراءة فارغة ⇒ يُرفع الخطأ الأصلي لا نتيجة ملفَّقة", async () => {
    // حالة لا تحدث في التشغيل السليم؛ لو حدثت فالصمت أسوأ من الخطأ.
    prismaMock.whiteboardBoard.findUnique.mockResolvedValue(null)
    prismaMock.whiteboardBoard.create.mockRejectedValue(uniqueConflict(["sessionId"]))

    await expect(
      ensureBoard({ sessionId: "session-1", actorUserId: "teacher-1" })
    ).rejects.toMatchObject({ code: "P2002" })
  })
})

// ============================= 2) removePage =============================

describe("removePage — الحذف مقيَّد بالسبورة", () => {
  const pages = [
    { id: "page-1", order: 0, title: null, createdAt: new Date(0), updatedAt: new Date(0) },
    { id: "page-2", order: 1, title: null, createdAt: new Date(0), updatedAt: new Date(0) },
  ]

  it("صفحة من هذه السبورة تُحذف ويُعاد ترقيم الباقي متصلاً", async () => {
    prismaMock.whiteboardPage.deleteMany.mockResolvedValue({ count: 1 })
    prismaMock.whiteboardPage.findMany.mockResolvedValue([{ ...pages[1] }])
    prismaMock.whiteboardPage.update.mockResolvedValue({})
    prismaMock.whiteboardBoard.update.mockResolvedValue(board)

    const result = await removePage({
      boardId: "board-1",
      pageId: "page-1",
      nextActivePageId: "page-2",
    })

    // القيد المزدوج: المعرّف والسبورة معاً
    expect(prismaMock.whiteboardPage.deleteMany).toHaveBeenCalledWith({
      where: { id: "page-1", boardId: "board-1" },
    })
    expect(result).toEqual([expect.objectContaining({ id: "page-2", order: 0 })])
    expect(prismaMock.whiteboardBoard.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { activePageId: "page-2" } })
    )
  })

  it("صفحة تنتمي إلى سبورة أخرى ⇒ لا حذف ولا إعادة ترقيم ولا نقل عرض", async () => {
    // القيد المزدوج يجعل الحذف لا يطابق شيئاً: count صفر.
    prismaMock.whiteboardPage.deleteMany.mockResolvedValue({ count: 0 })

    await expect(
      removePage({
        boardId: "board-1",
        pageId: "page-of-another-board",
        nextActivePageId: "page-2",
      })
    ).rejects.toBeInstanceOf(WhiteboardServerError)

    expect(prismaMock.whiteboardPage.deleteMany).toHaveBeenCalledWith({
      where: { id: "page-of-another-board", boardId: "board-1" },
    })
    // لا شيء بعد الحذف الفاشل: لا قراءة، لا ترقيم، لا تعديل على السبورة
    expect(prismaMock.whiteboardPage.findMany).not.toHaveBeenCalled()
    expect(prismaMock.whiteboardPage.update).not.toHaveBeenCalled()
    expect(prismaMock.whiteboardBoard.update).not.toHaveBeenCalled()
  })

  it("الخطأ مُصنَّف برمز يعرفه الـ route ولا يُطابق نصاً", async () => {
    prismaMock.whiteboardPage.deleteMany.mockResolvedValue({ count: 0 })

    const error = await removePage({
      boardId: "board-1",
      pageId: "ghost",
      nextActivePageId: null,
    }).catch((e: unknown) => e)

    expect(isWhiteboardServerError(error)).toBe(true)
    expect((error as WhiteboardServerError).code).toBe("PAGE_NOT_IN_BOARD")
  })

  it("لم يُستخدم delete بالمعرّف المجرّد أصلاً (العيب الأصلي)", async () => {
    prismaMock.whiteboardPage.deleteMany.mockResolvedValue({ count: 1 })
    prismaMock.whiteboardPage.findMany.mockResolvedValue([{ ...pages[1] }])
    prismaMock.whiteboardPage.update.mockResolvedValue({})
    prismaMock.whiteboardBoard.update.mockResolvedValue(board)

    await removePage({ boardId: "board-1", pageId: "page-1", nextActivePageId: "page-2" })

    expect(prismaMock.whiteboardPage.delete).not.toHaveBeenCalled()
  })

  it("كل العمل داخل معاملة واحدة", async () => {
    prismaMock.whiteboardPage.deleteMany.mockResolvedValue({ count: 1 })
    prismaMock.whiteboardPage.findMany.mockResolvedValue([{ ...pages[1] }])
    prismaMock.whiteboardPage.update.mockResolvedValue({})
    prismaMock.whiteboardBoard.update.mockResolvedValue(board)

    await removePage({ boardId: "board-1", pageId: "page-1", nextActivePageId: "page-2" })

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
  })
})

// ============================= 3) appendSnapshot =============================

describe("appendSnapshot — الصفحة يجب أن تكون من هذه السبورة", () => {
  const snapshotRow = {
    id: "snap-1",
    pageId: "page-1",
    revision: 4,
    elements: [{ id: "a", type: "freedraw" }],
    sizeBytes: 32,
    createdById: "teacher-1",
    createdAt: new Date(0),
  }

  it("زوج متّسق ⇒ يُدرج صفّ بمراجعة وحجم محسوبين", async () => {
    prismaMock.whiteboardPage.count.mockResolvedValue(1)
    prismaMock.whiteboardSnapshot.create.mockResolvedValue(snapshotRow)

    const result = await appendSnapshot({
      boardId: "board-1",
      pageId: "page-1",
      revision: 4,
      elements: [{ id: "a", type: "freedraw" }],
      actorUserId: "teacher-1",
    })

    expect(prismaMock.whiteboardPage.count).toHaveBeenCalledWith({
      where: { id: "page-1", boardId: "board-1" },
    })
    expect(result.revision).toBe(4)
    const data = prismaMock.whiteboardSnapshot.create.mock.calls[0]![0].data
    expect(data.sizeBytes).toBeGreaterThan(0)
    expect(data.createdById).toBe("teacher-1")
  })

  it("boardId و pageId من سبورتين مختلفتين ⇒ يُرفض الإدراج", async () => {
    // المفتاحان الأجنبيان يصحّان منفردين، فلا تمنع قاعدة البيانات هذا الزوج.
    prismaMock.whiteboardPage.count.mockResolvedValue(0)

    await expect(
      appendSnapshot({
        boardId: "board-1",
        pageId: "page-of-another-board",
        revision: 1,
        elements: [],
        actorUserId: "teacher-1",
      })
    ).rejects.toBeInstanceOf(WhiteboardServerError)

    expect(prismaMock.whiteboardSnapshot.create).not.toHaveBeenCalled()
  })

  it("خطأ الرفض مُصنَّف بنفس رمز removePage", async () => {
    prismaMock.whiteboardPage.count.mockResolvedValue(0)

    const error = await appendSnapshot({
      boardId: "board-1",
      pageId: "ghost",
      revision: 1,
      elements: [],
      actorUserId: "teacher-1",
    }).catch((e: unknown) => e)

    expect(isWhiteboardServerError(error)).toBe(true)
    expect((error as WhiteboardServerError).code).toBe("PAGE_NOT_IN_BOARD")
  })

  it("الفحص والإدراج في معاملة واحدة — لا نافذة بينهما", async () => {
    prismaMock.whiteboardPage.count.mockResolvedValue(1)
    prismaMock.whiteboardSnapshot.create.mockResolvedValue(snapshotRow)

    await appendSnapshot({
      boardId: "board-1",
      pageId: "page-1",
      revision: 4,
      elements: [],
      actorUserId: "teacher-1",
    })

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
  })

  it("تعارض المراجعة (P2002) ما زال يمرّ إلى المتصل ليردّ 409", async () => {
    prismaMock.whiteboardPage.count.mockResolvedValue(1)
    prismaMock.whiteboardSnapshot.create.mockRejectedValue(
      uniqueConflict(["pageId", "revision"])
    )

    await expect(
      appendSnapshot({
        boardId: "board-1",
        pageId: "page-1",
        revision: 4,
        elements: [],
        actorUserId: "teacher-1",
      })
    ).rejects.toMatchObject({ code: "P2002" })
  })
})
