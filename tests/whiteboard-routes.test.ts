import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ===================== SMART-WB-1B — مسارات السبورة (تكامل) =====================
// الطبقة المفحوصة هنا هي الـ routes وحدها: البوابة، وتصنيف الأخطاء بالرمز،
// والبثّ على القناة القائمة. المنطق الخالص مُغطّى في whiteboard-policy.test.ts،
// وطبقة الوصول في whiteboard-server.test.ts — لا يُعاد فحصهما.
//
// النمط: Prisma مُموّه + طبقة الخادم مُموّهة (مع الاحتفاظ بأصنافها الحقيقية كي
// يُفحص تصنيف الأخطاء لا محاكاته) + broadcastData مُموّهة فلا LiveKit حقيقي.

const prismaMock = vi.hoisted(() => ({
  liveSession: { findUnique: vi.fn() },
  liveSessionAdmission: { findUnique: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }))
vi.mock("@/lib/subscriptions", () => ({ canAccessCourse: vi.fn() }))

const serverMock = vi.hoisted(() => ({
  ensureBoard: vi.fn(),
  readWhiteboardState: vi.fn(),
  readBoardBySession: vi.fn(),
  readPages: vi.fn(),
  readPageRevision: vi.fn(),
  appendSnapshot: vi.fn(),
  createPage: vi.fn(),
  removePage: vi.fn(),
  setActivePage: vi.fn(),
}))
vi.mock("@/lib/live-classroom/whiteboard-server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/live-classroom/whiteboard-server")>()
  return { ...actual, ...serverMock }
})

const channelMock = vi.hoisted(() => ({ broadcastData: vi.fn() }))
vi.mock("@/lib/live-classroom/data-channel", () => channelMock)

import { getCurrentUser } from "@/lib/auth"
import { WhiteboardServerError } from "@/lib/live-classroom/whiteboard-server"
import {
  WHITEBOARD_MAX_PAGES,
  WHITEBOARD_SNAPSHOT_MAX_BYTES,
  type WhiteboardElement,
} from "@/lib/live-classroom/whiteboard"
import {
  GET as getBoard,
  POST as initBoard,
} from "@/app/api/live/[id]/whiteboard/route"
import {
  POST as postPage,
  DELETE as deletePage,
} from "@/app/api/live/[id]/whiteboard/pages/route"
import { POST as postActivePage } from "@/app/api/live/[id]/whiteboard/active-page/route"
import { POST as postSnapshot } from "@/app/api/live/[id]/whiteboard/snapshot/route"

// ============================= Helpers =============================

/** معرّف مستخدم فريد لكل حالة — حدّ المعدّل يُحصى لكل مستخدم. */
let userSeq = 0
function nextUserId() {
  userSeq += 1
  return `u${userSeq}`
}

type Role = "ADMIN" | "TEACHER" | "STUDENT"

function setUser(role: Role | null, overrides: Record<string, unknown> = {}) {
  if (!role) {
    vi.mocked(getCurrentUser).mockResolvedValue(null as never)
    return null
  }
  const user = {
    id: nextUserId(),
    role,
    teacherId: role === "TEACHER" ? "t1" : null,
    firstName: "أحمد",
    middleName: null,
    lastName: "محمد",
    walletBalance: 0,
    ...overrides,
  }
  vi.mocked(getCurrentUser).mockResolvedValue(user as never)
  return user
}

/** جلسة LiveKit مباشرة مجانية — تخضع لنظام الدخول (url = null). */
function mockSession(overrides: Record<string, unknown> = {}) {
  prismaMock.liveSession.findUnique.mockResolvedValue({
    id: "live-1",
    teacherId: "t1",
    courseId: null,
    status: "live",
    url: null,
    price: 0,
    isFree: true,
    bookings: [],
    ...overrides,
  } as never)
}

function mockAdmission(status: string | null) {
  prismaMock.liveSessionAdmission.findUnique.mockResolvedValue(
    (status ? { status } : null) as never
  )
}

function board(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1",
    sessionId: "live-1",
    status: "active",
    activePageId: "p1",
    createdById: "t-user",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function page(id: string, order: number) {
  return { id, order, title: null, createdAt: new Date(), updatedAt: new Date() }
}

function element(id: string, extra: Record<string, unknown> = {}): WhiteboardElement {
  return { id, type: "rectangle", ...extra } as WhiteboardElement
}

const ctx = { params: Promise.resolve({ id: "live-1" }) }

/** خيارات الطلب كما يقبلها `NextRequest` (لا نستعمل `RequestInit` العام: `signal` فيه يقبل null). */
type ReqInit = { method?: string; headers?: Record<string, string>; body?: string }

function req(path: string, init?: ReqInit) {
  return new NextRequest(`http://localhost/api/live/live-1/whiteboard${path}`, init)
}

function postReq(path: string, body?: unknown) {
  return req(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

/** الأحداث المبثوثة، مُفكَّكة من الحمولة الثنائية. */
function broadcasts() {
  return channelMock.broadcastData.mock.calls.map((call) => ({
    room: call[0] as string,
    event: JSON.parse(new TextDecoder().decode(call[1] as Uint8Array)),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  channelMock.broadcastData.mockResolvedValue(undefined)
  mockAdmission("approved")
  serverMock.readPages.mockResolvedValue([page("p1", 0), page("p2", 1)])
  serverMock.readBoardBySession.mockResolvedValue(board())
})

// ============================= البوابة =============================

describe("بوابة السبورة — الهوية من الجلسة والصلاحية من الخادم", () => {
  it("زائر بلا جلسة يُرفض قبل أي قراءة للسبورة", async () => {
    setUser(null)
    mockSession()

    const res = await getBoard(req(""), ctx)

    expect(res.status).toBe(401)
    expect(serverMock.readWhiteboardState).not.toHaveBeenCalled()
  })

  it("جلسة غير موجودة ⇒ 404 بلا تفاصيل", async () => {
    setUser("TEACHER")
    prismaMock.liveSession.findUnique.mockResolvedValue(null as never)

    const res = await getBoard(req(""), ctx)

    expect(res.status).toBe(404)
    expect(serverMock.readWhiteboardState).not.toHaveBeenCalled()
  })

  it("طالب مقبول يقرأ الحالة، و canWrite = false", async () => {
    setUser("STUDENT")
    mockSession()
    serverMock.readWhiteboardState.mockResolvedValue({
      board: board(),
      pages: [page("p1", 0)],
      activePageId: "p1",
      revision: 3,
      elements: [element("e1")],
    })

    const res = await getBoard(req(""), ctx)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.canWrite).toBe(false)
    expect(body.activePageId).toBe("p1")
    expect(body.revision).toBe(3)
  })

  it("طالب في الانتظار لا يقرأ سبورة الجلسة إطلاقاً", async () => {
    setUser("STUDENT")
    mockSession()
    mockAdmission("pending")

    const res = await getBoard(req(""), ctx)

    expect(res.status).toBe(403)
    expect(serverMock.readWhiteboardState).not.toHaveBeenCalled()
  })

  it("طالب مقبول لا يُهيّئ سبورة ولا يكتب عليها", async () => {
    setUser("STUDENT")
    mockSession()

    const init = await initBoard(postReq(""), ctx)
    const snapshot = await postSnapshot(
      postReq("/snapshot", { pageId: "p1", baseRevision: 0, elements: [] }),
      ctx
    )
    const created = await postPage(postReq("/pages", {}), ctx)
    const moved = await postActivePage(postReq("/active-page", { pageId: "p2" }), ctx)

    expect([init.status, snapshot.status, created.status, moved.status]).toEqual([
      403, 403, 403, 403,
    ])
    expect(serverMock.ensureBoard).not.toHaveBeenCalled()
    expect(serverMock.appendSnapshot).not.toHaveBeenCalled()
    expect(serverMock.createPage).not.toHaveBeenCalled()
    expect(serverMock.setActivePage).not.toHaveBeenCalled()
  })

  it("معلم آخر لا يكتب على سبورة جلسة لا يملكها", async () => {
    setUser("TEACHER", { teacherId: "t2" })
    mockSession()

    const res = await initBoard(postReq(""), ctx)

    expect(res.status).toBe(403)
    expect(serverMock.ensureBoard).not.toHaveBeenCalled()
  })

  it("جلسة ملغاة: لا قراءة ولا كتابة لأي دور", async () => {
    setUser("ADMIN")
    mockSession({ status: "cancelled" })

    const read = await getBoard(req(""), ctx)
    const write = await initBoard(postReq(""), ctx)

    expect([read.status, write.status]).toEqual([403, 403])
    expect(serverMock.readWhiteboardState).not.toHaveBeenCalled()
  })

  it("جلسة منتهية: المعلم المالك يقرأ ولا يكتب", async () => {
    setUser("TEACHER")
    mockSession({ status: "ended" })
    serverMock.readWhiteboardState.mockResolvedValue({
      board: board(),
      pages: [page("p1", 0)],
      activePageId: "p1",
      revision: 1,
      elements: [],
    })

    const read = await getBoard(req(""), ctx)
    const write = await postSnapshot(
      postReq("/snapshot", { pageId: "p1", baseRevision: 1, elements: [] }),
      ctx
    )

    expect(read.status).toBe(200)
    expect((await read.json()).canWrite).toBe(false)
    expect(write.status).toBe(403)
    expect(serverMock.appendSnapshot).not.toHaveBeenCalled()
  })

  it("جداول السبورة غير مهيأة (P2021) ⇒ 503 بلا تفاصيل داخلية", async () => {
    setUser("TEACHER")
    mockSession()
    serverMock.readWhiteboardState.mockRejectedValue(
      Object.assign(new Error("table does not exist"), { code: "P2021" })
    )

    const res = await getBoard(req(""), ctx)
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.error).not.toContain("table")
  })
})

// ============================= الحفظ والبثّ =============================

describe("حفظ الحالة — الخادم يحسب ويقرّر، والبثّ بعد الحفظ", () => {
  function acceptSnapshot(overrides: Record<string, unknown> = {}) {
    serverMock.appendSnapshot.mockResolvedValue({
      id: "s1",
      pageId: "p1",
      revision: 4,
      elements: [element("e1")],
      sizeBytes: 42,
      createdById: "server-computed",
      createdAt: new Date(),
      ...overrides,
    } as never)
  }

  it("المعلم المالك يحفظ: مراجعة تالية، حجم من الخادم، حدث WB_PATCH", async () => {
    const user = setUser("TEACHER")
    mockSession()
    serverMock.readPageRevision.mockResolvedValue(3)
    acceptSnapshot()

    const res = await postSnapshot(
      postReq("/snapshot", {
        pageId: "p1",
        baseRevision: 3,
        elements: [element("e1")],
        // هوية وحجم مُدسوسان في الجسم — يجب أن يُتجاهلا تماماً
        userId: "attacker",
        senderId: "attacker",
        sizeBytes: 999999,
      }),
      ctx
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, pageId: "p1", revision: 4, sizeBytes: 42 })
    // sizeBytes لا يُمرَّر إلى الطبقة السفلى — تحسبه هي
    expect(serverMock.appendSnapshot).toHaveBeenCalledWith({
      boardId: "b1",
      pageId: "p1",
      revision: 4,
      elements: [element("e1")],
      actorUserId: user!.id,
    })

    const sent = broadcasts()
    expect(sent).toHaveLength(1)
    expect(sent[0].room).toBe("live-1")
    expect(sent[0].event.type).toBe("WB_PATCH")
    // الهوية من الجلسة حصراً — لا من الجسم
    expect(sent[0].event.senderId).toBe(user!.id)
    expect(sent[0].event.senderId).not.toBe("attacker")
    expect(sent[0].event.payload.revision).toBe(4)
  })

  it("عميل متأخّر ⇒ 409 بلا كتابة (لا يطمس عملاً أحدث)", async () => {
    setUser("TEACHER")
    mockSession()
    serverMock.readPageRevision.mockResolvedValue(7)

    const res = await postSnapshot(
      postReq("/snapshot", { pageId: "p1", baseRevision: 3, elements: [] }),
      ctx
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.serverRevision).toBe(7)
    expect(serverMock.appendSnapshot).not.toHaveBeenCalled()
    expect(channelMock.broadcastData).not.toHaveBeenCalled()
  })

  it("تعارض المراجعة في قاعدة البيانات (P2002) ⇒ 409", async () => {
    setUser("TEACHER")
    mockSession()
    serverMock.readPageRevision.mockResolvedValue(3)
    serverMock.appendSnapshot.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["revision"] } })
    )

    const res = await postSnapshot(
      postReq("/snapshot", { pageId: "p1", baseRevision: 3, elements: [] }),
      ctx
    )

    expect(res.status).toBe(409)
    expect(channelMock.broadcastData).not.toHaveBeenCalled()
  })

  it("صفحة من سبورة أخرى ⇒ 404 بالرمز لا بنص الرسالة", async () => {
    setUser("TEACHER")
    mockSession()
    serverMock.readPageRevision.mockResolvedValue(0)
    serverMock.appendSnapshot.mockRejectedValue(
      new WhiteboardServerError("PAGE_NOT_IN_BOARD", "page does not belong to board b1")
    )

    const res = await postSnapshot(
      postReq("/snapshot", { pageId: "other", baseRevision: 0, elements: [] }),
      ctx
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe("الصفحة غير موجودة")
    expect(body.error).not.toContain("b1")
  })

  it("حمولة أكبر من سقف الـ snapshot ⇒ 413 بلا كتابة", async () => {
    setUser("TEACHER")
    mockSession()
    serverMock.readPageRevision.mockResolvedValue(0)
    // عنصر واحد ثقيل: يتجاوز 2 MiB بلا الاقتراب من حدّ عدد العناصر
    const heavy = [element("e1", { text: "ن".repeat(WHITEBOARD_SNAPSHOT_MAX_BYTES) })]

    const res = await postSnapshot(
      postReq("/snapshot", { pageId: "p1", baseRevision: 0, elements: heavy }),
      ctx
    )

    expect(res.status).toBe(413)
    expect(serverMock.appendSnapshot).not.toHaveBeenCalled()
  })

  it("حمولة أثقل من سقف القناة تُحفظ ويُبثّ طلب استعادة لا حالة كاملة", async () => {
    setUser("TEACHER")
    mockSession()
    serverMock.readPageRevision.mockResolvedValue(0)
    const wide = Array.from({ length: 400 }, (_, i) =>
      element(`e${i}`, { text: "ن".repeat(80) })
    )
    acceptSnapshot({ revision: 1, elements: wide })

    const res = await postSnapshot(
      postReq("/snapshot", { pageId: "p1", baseRevision: 0, elements: wide }),
      ctx
    )

    expect(res.status).toBe(200)
    const sent = broadcasts()
    expect(sent[0].event.type).toBe("WB_SNAPSHOT_REQUIRED")
    expect(sent[0].event.payload.elements).toBeUndefined()
  })

  it("فشل البثّ لا يُبطل حفظاً نجح", async () => {
    setUser("TEACHER")
    mockSession()
    serverMock.readPageRevision.mockResolvedValue(0)
    acceptSnapshot({ revision: 1 })
    channelMock.broadcastData.mockRejectedValue(new Error("livekit down"))

    const res = await postSnapshot(
      postReq("/snapshot", { pageId: "p1", baseRevision: 0, elements: [] }),
      ctx
    )

    expect(res.status).toBe(200)
    expect(serverMock.appendSnapshot).toHaveBeenCalledTimes(1)
  })
})

// ============================= الصفحات والتهيئة =============================

describe("الصفحات — الحدود على الخادم، والعرض لا يزحزح إلا عند الحاجة", () => {
  it("التهيئة تمرّ على ensureBoard بهوية الجلسة وتعيد الحالة", async () => {
    const user = setUser("TEACHER")
    mockSession()
    serverMock.readWhiteboardState.mockResolvedValue({
      board: board(),
      pages: [page("p1", 0)],
      activePageId: "p1",
      revision: 0,
      elements: [],
    })

    const res = await initBoard(postReq(""), ctx)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.canWrite).toBe(true)
    expect(serverMock.ensureBoard).toHaveBeenCalledWith({
      sessionId: "live-1",
      actorUserId: user!.id,
    })
  })

  it("عند سقف الصفحات ⇒ 409 بلا إنشاء", async () => {
    setUser("TEACHER")
    mockSession()
    serverMock.readPages.mockResolvedValue(
      Array.from({ length: WHITEBOARD_MAX_PAGES }, (_, i) => page(`p${i}`, i))
    )

    const res = await postPage(postReq("/pages", {}), ctx)

    expect(res.status).toBe(409)
    expect(serverMock.createPage).not.toHaveBeenCalled()
  })

  it("إنشاء صفحة يبثّ قائمة الصفحات المحدَّثة من الخادم", async () => {
    const user = setUser("TEACHER")
    mockSession()
    serverMock.createPage.mockResolvedValue(page("p3", 2) as never)
    serverMock.readPages
      .mockResolvedValueOnce([page("p1", 0), page("p2", 1)])
      .mockResolvedValueOnce([page("p1", 0), page("p2", 1), page("p3", 2)])

    const res = await postPage(postReq("/pages", {}), ctx)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.pages).toHaveLength(3)
    const sent = broadcasts()
    expect(sent).toHaveLength(1)
    expect(sent[0].event.type).toBe("WB_PAGES_CHANGED")
    expect(sent[0].event.senderId).toBe(user!.id)
  })

  it("حذف بلا معرّف صفحة ⇒ 400 بلا حذف", async () => {
    setUser("TEACHER")
    mockSession()

    const res = await deletePage(req("/pages", { method: "DELETE" }), ctx)

    expect(res.status).toBe(400)
    expect(serverMock.removePage).not.toHaveBeenCalled()
  })

  it("الصفحة الوحيدة لا تُحذف ⇒ 409 بلا حذف", async () => {
    setUser("TEACHER")
    mockSession()
    serverMock.readPages.mockResolvedValue([page("p1", 0)])

    const res = await deletePage(req("/pages?pageId=p1", { method: "DELETE" }), ctx)

    expect(res.status).toBe(409)
    expect(serverMock.removePage).not.toHaveBeenCalled()
  })

  it("حذف الصفحة المعروضة ينقل العرض ويبثّ الصفحة الجديدة", async () => {
    setUser("TEACHER")
    mockSession()
    serverMock.readBoardBySession.mockResolvedValue(board({ activePageId: "p1" }))
    serverMock.removePage.mockResolvedValue([page("p2", 0)] as never)

    const res = await deletePage(req("/pages?pageId=p1", { method: "DELETE" }), ctx)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.activePageId).toBe("p2")
    expect(serverMock.removePage).toHaveBeenCalledWith({
      boardId: "b1",
      pageId: "p1",
      nextActivePageId: "p2",
    })
    const types = broadcasts().map((b) => b.event.type)
    expect(types).toEqual(["WB_PAGES_CHANGED", "WB_ACTIVE_PAGE"])
  })

  it("حذف صفحة غير معروضة لا يزحزح ما يراه الطلاب", async () => {
    setUser("TEACHER")
    mockSession()
    serverMock.readBoardBySession.mockResolvedValue(board({ activePageId: "p1" }))
    serverMock.removePage.mockResolvedValue([page("p1", 0)] as never)

    const res = await deletePage(req("/pages?pageId=p2", { method: "DELETE" }), ctx)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.activePageId).toBe("p1")
    const types = broadcasts().map((b) => b.event.type)
    expect(types).toEqual(["WB_PAGES_CHANGED"])
  })

  it("حذف صفحة من سبورة أخرى ⇒ 404 بالرمز (PAGE_NOT_IN_BOARD)", async () => {
    setUser("TEACHER")
    mockSession()
    serverMock.removePage.mockRejectedValue(
      new WhiteboardServerError("PAGE_NOT_IN_BOARD", "page p9 is not in board b1")
    )

    const res = await deletePage(req("/pages?pageId=p9", { method: "DELETE" }), ctx)
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe("الصفحة غير موجودة")
    expect(body.error).not.toContain("b1")
    expect(channelMock.broadcastData).not.toHaveBeenCalled()
  })

  it("نقل العرض إلى صفحة لا تنتمي للسبورة ⇒ 404 بلا بثّ", async () => {
    setUser("TEACHER")
    mockSession()
    serverMock.setActivePage.mockResolvedValue(false as never)

    const res = await postActivePage(postReq("/active-page", { pageId: "other" }), ctx)

    expect(res.status).toBe(404)
    expect(channelMock.broadcastData).not.toHaveBeenCalled()
  })

  it("نقل العرض الناجح يبثّ WB_ACTIVE_PAGE على غرفة الجلسة", async () => {
    const user = setUser("TEACHER")
    mockSession()
    serverMock.setActivePage.mockResolvedValue(true as never)

    const res = await postActivePage(postReq("/active-page", { pageId: "p2" }), ctx)

    expect(res.status).toBe(200)
    const sent = broadcasts()
    expect(sent).toHaveLength(1)
    expect(sent[0].room).toBe("live-1")
    expect(sent[0].event.type).toBe("WB_ACTIVE_PAGE")
    expect(sent[0].event.payload.pageId).toBe("p2")
    expect(sent[0].event.senderId).toBe(user!.id)
  })

  it("سبورة مؤرشفة ⇒ 409 على الصفحات بلا لمس الطبقة السفلى", async () => {
    setUser("TEACHER")
    mockSession()
    serverMock.readBoardBySession.mockResolvedValue(board({ status: "archived" }))

    const res = await postPage(postReq("/pages", {}), ctx)

    expect(res.status).toBe(409)
    expect(serverMock.createPage).not.toHaveBeenCalled()
  })
})
