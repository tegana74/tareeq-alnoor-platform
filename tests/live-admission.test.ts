import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ============================= LIVE-9B — Student Admission & Waiting Room =============================
// عقود الدخول: إرسال الطلب، قرار المعلم (قبول/رفض)، وبوابة التوكن.
// القاعدة المحمية هنا: فتح صفحة الجلسة لا يمنح توكنًا — الموافقة فقط تمنحه.
// النمط: Prisma مُموّه بالكامل + AccessToken وهمي (نفس عرف livekit-token.test.ts).

const prismaMock = vi.hoisted(() => ({
  liveSession: {
    findUnique: vi.fn(),
  },
  liveSessionAdmission: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  subscription: {
    findUnique: vi.fn(),
  },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }))
vi.mock("@/lib/subscriptions", () => ({ canAccessCourse: vi.fn() }))

// livekit-server-sdk مُموّه — لا حاجة لمفاتيح حقيقية، ونراقب الـ grants
const livekitServerMock = vi.hoisted(() => {
  const mockToJwt = vi.fn().mockResolvedValue("mock-jwt-token")
  const mockAddGrant = vi.fn()

  class FakeAccessToken {
    constructor(...args: unknown[]) {
      FakeAccessToken._calls.push(args)
    }
    addGrant = mockAddGrant
    toJwt = mockToJwt
    static _calls: unknown[][] = []
    static resetCalls() {
      FakeAccessToken._calls = []
    }
  }

  return { FakeAccessToken, mockAddGrant, mockToJwt }
})
vi.mock("livekit-server-sdk", () => ({
  AccessToken: livekitServerMock.FakeAccessToken,
}))

import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { GET as getToken } from "@/app/api/live/[id]/token/route"
import { GET as getAdmission } from "@/app/api/live/[id]/admission/route"
import { POST as postRequest } from "@/app/api/live/[id]/admission/request/route"
import { POST as postApprove } from "@/app/api/live/[id]/admission/approve/route"
import { POST as postReject } from "@/app/api/live/[id]/admission/reject/route"
import {
  nextAdmissionPollDelay,
  ADMISSION_POLL_INTERVAL_MS,
  ADMISSION_POLL_MAX_INTERVAL_MS,
} from "@/lib/live-classroom/admission"

// ============================= Helpers =============================

function setUser(
  u: { id: string; role: string; teacherId?: string | null } | null
) {
  vi.mocked(getCurrentUser).mockResolvedValue(
    u
      ? ({
          firstName: "أحمد",
          middleName: null,
          lastName: "محمد",
          walletBalance: 100,
          teacherId: null,
          ...u,
        } as never)
      : (null as never)
  )
}

/** جلسة LiveKit افتراضية: مباشرة، مجانية، بلا رابط خارجي → يخضع لنظام الدخول */
function mockSession(overrides: Record<string, unknown> = {}) {
  const defaults = {
    id: "live-1",
    teacherId: "t1",
    courseId: "c1",
    status: "live",
    url: null,
    startAt: new Date(Date.now() - 5 * 60 * 1000),
    durationMinutes: 60,
    price: 0,
    isFree: true,
    bookings: [],
  }
  prismaMock.liveSession.findUnique.mockResolvedValue({
    ...defaults,
    ...overrides,
  } as never)
}

/** سجل طلب دخول قائم — null يعني «لا طلب» */
function mockAdmission(record: Record<string, unknown> | null) {
  prismaMock.liveSessionAdmission.findUnique.mockResolvedValue(record as never)
}

function getReq(path: string, id: string) {
  return [
    new NextRequest(`http://localhost/api/live/${id}${path}`),
    { params: Promise.resolve({ id }) },
  ] as const
}

function postReq(path: string, id: string, body?: unknown) {
  const req = new NextRequest(`http://localhost/api/live/${id}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return [req, { params: Promise.resolve({ id }) }] as const
}

/** آخر grant مُرسل إلى AccessToken.addGrant */
function lastGrant(): Record<string, unknown> {
  const calls = livekitServerMock.mockAddGrant.mock.calls
  return calls[calls.length - 1]?.[0] as Record<string, unknown>
}

function tableMissing() {
  return Object.assign(new Error("table does not exist"), { code: "P2021" })
}

// ============================= Setup =============================

beforeEach(() => {
  vi.clearAllMocks()

  process.env.LIVEKIT_API_KEY = "test-api-key"
  process.env.LIVEKIT_API_SECRET = "test-api-secret"
  process.env.NEXT_PUBLIC_LIVEKIT_URL = "wss://test.livekit.cloud"

  vi.mocked(canAccessCourse).mockResolvedValue(true)
  livekitServerMock.mockToJwt.mockResolvedValue("mock-jwt-token")
  livekitServerMock.FakeAccessToken.resetCalls()

  // الافتراضي: طالب مصرَّح له، جلسة LiveKit مباشرة، لا طلب دخول بعد
  setUser({ id: "s1", role: "STUDENT", teacherId: null })
  mockSession()
  mockAdmission(null)
  prismaMock.liveSessionAdmission.create.mockResolvedValue({
    sessionId: "live-1",
    userId: "s1",
    status: "pending",
    requestedAt: new Date(),
  } as never)
})

// ============================= Request Flow =============================

describe("POST /api/live/[id]/admission/request", () => {
  it("1. authorized student can request admission", async () => {
    const res = await postRequest(...postReq("/admission/request", "live-1"))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.status).toBe("pending")
    expect(json.created).toBe(true)
  })

  it("2. guest cannot request admission → 401", async () => {
    setUser(null)

    const res = await postRequest(...postReq("/admission/request", "live-1"))
    expect(res.status).toBe(401)
    expect(prismaMock.liveSessionAdmission.create).not.toHaveBeenCalled()
  })

  it("3. student without course access → 403", async () => {
    mockSession({ isFree: false, price: 50 })
    vi.mocked(canAccessCourse).mockResolvedValue(false)

    const res = await postRequest(...postReq("/admission/request", "live-1"))
    expect(res.status).toBe(403)
    expect(prismaMock.liveSessionAdmission.create).not.toHaveBeenCalled()
  })

  it("4. unbooked student on a paid session → 403", async () => {
    mockSession({ isFree: false, price: 50, bookings: [] })

    const res = await postRequest(...postReq("/admission/request", "live-1"))
    expect(res.status).toBe(403)
    expect(prismaMock.liveSessionAdmission.create).not.toHaveBeenCalled()
  })

  it("5. duplicate request is idempotent — no second row is created", async () => {
    const requestedAt = new Date()
    mockAdmission({ sessionId: "live-1", userId: "s1", status: "pending", requestedAt })

    const res = await postRequest(...postReq("/admission/request", "live-1"))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.created).toBe(false)
    expect(prismaMock.liveSessionAdmission.create).not.toHaveBeenCalled()
  })

  it("6. a new request is persisted as pending", async () => {
    await postRequest(...postReq("/admission/request", "live-1"))

    expect(prismaMock.liveSessionAdmission.create).toHaveBeenCalledWith({
      data: { sessionId: "live-1", userId: "s1", status: "pending" },
    })
  })

  it("18. ended session cannot create an admission request", async () => {
    mockSession({ status: "ended" })

    const res = await postRequest(...postReq("/admission/request", "live-1"))
    expect(res.status).toBe(400)
    expect(prismaMock.liveSessionAdmission.create).not.toHaveBeenCalled()
  })

  it("19. cancelled session cannot create an admission request", async () => {
    mockSession({ status: "cancelled" })

    const res = await postRequest(...postReq("/admission/request", "live-1"))
    expect(res.status).toBe(400)
    expect(prismaMock.liveSessionAdmission.create).not.toHaveBeenCalled()
  })
})

// ============================= Decision Flow =============================

describe("POST /api/live/[id]/admission/approve", () => {
  beforeEach(() => {
    mockAdmission({ sessionId: "live-1", userId: "s1", status: "pending" })
    prismaMock.liveSessionAdmission.update.mockResolvedValue({
      sessionId: "live-1",
      userId: "s1",
      status: "approved",
      decidedAt: new Date(),
    } as never)
  })

  it("7. teacher owner can approve a pending request", async () => {
    setUser({ id: "u-teacher", role: "TEACHER", teacherId: "t1" })

    const res = await postApprove(
      ...postReq("/admission/approve", "live-1", { userId: "s1" })
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ status: "approved" })
  })

  it("7b. approval records the deciding manager from the session, not the client", async () => {
    setUser({ id: "u-teacher", role: "TEACHER", teacherId: "t1" })

    await postApprove(
      ...postReq("/admission/approve", "live-1", { userId: "s1", decidedBy: "spoofed" })
    )

    expect(prismaMock.liveSessionAdmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "approved", decidedBy: "u-teacher" }),
      })
    )
  })

  it("8. non-owner teacher cannot approve → 403", async () => {
    setUser({ id: "u-other", role: "TEACHER", teacherId: "t2" })

    const res = await postApprove(
      ...postReq("/admission/approve", "live-1", { userId: "s1" })
    )
    expect(res.status).toBe(403)
    expect(prismaMock.liveSessionAdmission.update).not.toHaveBeenCalled()
  })

  it("9. admin can approve", async () => {
    setUser({ id: "u-admin", role: "ADMIN", teacherId: null })

    const res = await postApprove(
      ...postReq("/admission/approve", "live-1", { userId: "s1" })
    )
    expect(res.status).toBe(200)
  })
})

describe("POST /api/live/[id]/admission/reject", () => {
  beforeEach(() => {
    mockAdmission({ sessionId: "live-1", userId: "s1", status: "pending" })
    prismaMock.liveSessionAdmission.update.mockResolvedValue({
      sessionId: "live-1",
      userId: "s1",
      status: "rejected",
      decidedAt: new Date(),
    } as never)
  })

  it("10. teacher owner can reject a pending request", async () => {
    setUser({ id: "u-teacher", role: "TEACHER", teacherId: "t1" })

    const res = await postReject(
      ...postReq("/admission/reject", "live-1", { userId: "s1" })
    )
    expect(res.status).toBe(200)
    expect(prismaMock.liveSessionAdmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "rejected" }),
      })
    )
  })

  it("11. non-owner teacher cannot reject → 403", async () => {
    setUser({ id: "u-other", role: "TEACHER", teacherId: "t2" })

    const res = await postReject(
      ...postReq("/admission/reject", "live-1", { userId: "s1" })
    )
    expect(res.status).toBe(403)
    expect(prismaMock.liveSessionAdmission.update).not.toHaveBeenCalled()
  })
})

describe("Admission state is manager-only", () => {
  it("20. a student cannot change any admission state", async () => {
    mockAdmission({ sessionId: "live-1", userId: "s2", status: "pending" })
    setUser({ id: "s1", role: "STUDENT", teacherId: null })

    const approved = await postApprove(
      ...postReq("/admission/approve", "live-1", { userId: "s2" })
    )
    const rejected = await postReject(
      ...postReq("/admission/reject", "live-1", { userId: "s2" })
    )

    expect(approved.status).toBe(403)
    expect(rejected.status).toBe(403)
    expect(prismaMock.liveSessionAdmission.update).not.toHaveBeenCalled()
  })

  it("20b. a student cannot read other students' pending requests", async () => {
    mockAdmission({ status: "pending", requestedAt: new Date() })

    const res = await getAdmission(...getReq("/admission", "live-1"))
    const json = await res.json()

    expect(json.role).toBe("student")
    expect(json.pending).toBeUndefined()
    expect(prismaMock.liveSessionAdmission.findMany).not.toHaveBeenCalled()
  })
})

// ============================= Token Gate =============================

describe("GET /api/live/[id]/token — admission gate", () => {
  it("12. rejected student cannot receive a token", async () => {
    mockAdmission({ status: "rejected" })

    const res = await getToken(...getReq("/token", "live-1"))
    expect(res.status).toBe(403)
    expect(livekitServerMock.FakeAccessToken._calls).toHaveLength(0)
  })

  it("13. pending student cannot receive a token", async () => {
    mockAdmission({ status: "pending" })

    const res = await getToken(...getReq("/token", "live-1"))
    expect(res.status).toBe(403)
    expect(livekitServerMock.FakeAccessToken._calls).toHaveLength(0)
  })

  it("13b. student who never requested cannot receive a token", async () => {
    mockAdmission(null)

    const res = await getToken(...getReq("/token", "live-1"))
    expect(res.status).toBe(403)
    expect(livekitServerMock.FakeAccessToken._calls).toHaveLength(0)
  })

  it("14. approved student receives a subscriber token", async () => {
    mockAdmission({ status: "approved" })

    const res = await getToken(...getReq("/token", "live-1"))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.token).toBe("mock-jwt-token")
    expect(lastGrant().canSubscribe).toBe(true)
  })

  it("15. approved student canPublish is explicitly false", async () => {
    mockAdmission({ status: "approved" })

    await getToken(...getReq("/token", "live-1"))
    expect(lastGrant().canPublish).toBe(false)
  })

  it("16. approved student canPublishData is explicitly false", async () => {
    mockAdmission({ status: "approved" })

    await getToken(...getReq("/token", "live-1"))
    expect(lastGrant().canPublishData).toBe(false)
  })

  it("16b. approved student never receives roomAdmin", async () => {
    mockAdmission({ status: "approved" })

    await getToken(...getReq("/token", "live-1"))
    expect(lastGrant().roomAdmin).toBeUndefined()
  })

  it("17. external-url session is unaffected by the admission gate", async () => {
    mockSession({ url: "https://www.youtube.com/watch?v=abc12345678" })

    const res = await getToken(...getReq("/token", "live-1"))
    expect(res.status).toBe(200)
    // لا استعلام دخول على الإطلاق للجلسات الخارجية
    expect(prismaMock.liveSessionAdmission.findUnique).not.toHaveBeenCalled()
  })

  it("17b. teacher owner is unaffected by the admission gate", async () => {
    setUser({ id: "u-teacher", role: "TEACHER", teacherId: "t1" })

    const res = await getToken(...getReq("/token", "live-1"))
    expect(res.status).toBe(200)
    expect(lastGrant().canPublish).toBe(true)
    expect(prismaMock.liveSessionAdmission.findUnique).not.toHaveBeenCalled()
  })

  it("fails closed with 503 when the admission table is missing", async () => {
    prismaMock.liveSessionAdmission.findUnique.mockRejectedValue(tableMissing())

    const res = await getToken(...getReq("/token", "live-1"))
    expect(res.status).toBe(503)
    expect(livekitServerMock.FakeAccessToken._calls).toHaveLength(0)
  })
})

// ============================= Teacher panel poll cadence =============================
// تباطؤ الاستعلام عند خلو الطلبات — بلا نظام realtime وبلا توقف يخفي طلباً جديداً.

describe("nextAdmissionPollDelay — teacher panel backoff", () => {
  it("polls at the fast cadence while pending requests exist", () => {
    expect(nextAdmissionPollDelay(0)).toBe(ADMISSION_POLL_INTERVAL_MS)
  })

  it("backs off gradually across consecutive empty rounds", () => {
    const delays = [1, 2, 3].map(nextAdmissionPollDelay)
    expect(delays).toEqual([8000, 12000, 16000])
    // تصاعد رتيب: كل جولة خالية أبطأ من سابقتها
    expect(delays[0]).toBeGreaterThan(nextAdmissionPollDelay(0))
    expect(delays[1]).toBeGreaterThan(delays[0])
    expect(delays[2]).toBeGreaterThan(delays[1])
  })

  it("caps the backoff so polling never effectively stops", () => {
    for (const rounds of [4, 10, 100, 10_000]) {
      expect(nextAdmissionPollDelay(rounds)).toBe(ADMISSION_POLL_MAX_INTERVAL_MS)
    }
    // الحد الأعلى محدود: أي طلب جديد يُكتشف خلال 20 ثانية كأسوأ حال
    expect(ADMISSION_POLL_MAX_INTERVAL_MS).toBeLessThanOrEqual(20_000)
    expect(Number.isFinite(ADMISSION_POLL_MAX_INTERVAL_MS)).toBe(true)
  })

  it("returns immediately to the fast cadence once a request arrives", () => {
    // اللوحة تصفّر العدّاد عند أول صف ظاهر → الجولة التالية 4 ثوانٍ فوراً
    expect(nextAdmissionPollDelay(9)).toBe(ADMISSION_POLL_MAX_INTERVAL_MS)
    expect(nextAdmissionPollDelay(0)).toBe(ADMISSION_POLL_INTERVAL_MS)
  })
})
