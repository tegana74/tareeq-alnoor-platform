import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ============================= Mocks =============================

const prismaMock = vi.hoisted(() => ({
  liveSession: {
    findUnique: vi.fn(),
  },
  // LIVE-9B: مسار توكن الطالب يقرأ حالة الدخول قبل إصدار التوكن
  liveSessionAdmission: {
    findUnique: vi.fn(),
  },
  subscription: {
    findUnique: vi.fn(),
  },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }))
vi.mock("@/lib/subscriptions", () => ({ canAccessCourse: vi.fn() }))

// Mock livekit-server-sdk — avoid needing real keys
const livekitMock = vi.hoisted(() => {
  const mockToJwt = vi.fn().mockResolvedValue("mock-jwt-token")
  const mockAddGrant = vi.fn()

  // Must use a real class so `new AccessToken(...)` works
  class FakeAccessToken {
    constructor(...args: unknown[]) {
      FakeAccessToken._calls.push(args)
    }
    addGrant = mockAddGrant
    toJwt = mockToJwt
    static _calls: unknown[][] = []
    static resetCalls() { FakeAccessToken._calls = [] }
  }

  return { FakeAccessToken, mockAddGrant, mockToJwt }
})
vi.mock("livekit-server-sdk", () => ({
  AccessToken: livekitMock.FakeAccessToken,
}))

import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { GET } from "@/app/api/live/[id]/token/route"

// ============================= Helpers =============================

function setUser(u: { id: string; role: string; teacherId?: string | null; firstName?: string; lastName?: string; middleName?: string | null } | null) {
  vi.mocked(getCurrentUser).mockResolvedValue(
    u
      ? ({
          firstName: u.firstName ?? "أحمد",
          middleName: u.middleName ?? null,
          lastName: u.lastName ?? "محمد",
          walletBalance: 100,
          ...u,
        } as never)
      : (null as never)
  )
}

function makeRequest(id: string) {
  const req = new NextRequest(`http://localhost/api/live/${id}/token`)
  const ctx = { params: Promise.resolve({ id }) }
  return { req, ctx }
}

function mockSession(overrides: Record<string, unknown> = {}) {
  const defaults = {
    id: "live-1",
    teacherId: "t1",
    courseId: "c1",
    status: "scheduled",
    startAt: new Date(Date.now() + 30 * 60 * 1000),
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

// ============================= Setup =============================

beforeEach(() => {
  vi.clearAllMocks()

  // Default: env vars present
  process.env.LIVEKIT_API_KEY = "test-api-key"
  process.env.LIVEKIT_API_SECRET = "test-api-secret"
  process.env.NEXT_PUBLIC_LIVEKIT_URL = "wss://test.livekit.cloud"

  // Default: course access granted
  vi.mocked(canAccessCourse).mockResolvedValue(true)

  // LIVE-9B: هذه المجموعة تختبر صلاحيات الكورس والحجز والـ grants — لا بوابة الدخول.
  // الافتراضي «موافَق عليه» يحافظ على نفس ما كانت تختبره قبل 9B.
  // بوابة الدخول نفسها مغطاة بالكامل في tests/live-admission.test.ts
  prismaMock.liveSessionAdmission.findUnique.mockResolvedValue({
    status: "approved",
  } as never)

  // Reset JWT mock
  livekitMock.mockToJwt.mockResolvedValue("mock-jwt-token")
  livekitMock.FakeAccessToken.resetCalls()
})

// ============================= Tests =============================

describe("GET /api/live/[id]/token", () => {
  // ─── 1. Teacher owner → publisher token ────────────────────────
  it("grants publisher token to teacher owner", async () => {
    setUser({ id: "u1", role: "TEACHER", teacherId: "t1" })
    mockSession({ teacherId: "t1" })

    const { req, ctx } = makeRequest("live-1")
    const res = await GET(req, ctx)
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.token).toBe("mock-jwt-token")
    expect(json.room).toBe("live-1")
    expect(json.identity).toBe("u1")

    // Verify grant includes publish
    expect(livekitMock.mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        roomJoin: true,
        room: "live-1",
        canPublish: true,
        canSubscribe: true,
      })
    )
  })

  // ─── 2. Admin → publisher token ────────────────────────────────
  it("grants publisher token to admin", async () => {
    setUser({ id: "admin-1", role: "ADMIN", teacherId: null })
    mockSession({ teacherId: "t1" })

    const { req, ctx } = makeRequest("live-1")
    const res = await GET(req, ctx)
    expect(res.status).toBe(200)

    expect(livekitMock.mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        canPublish: true,
        canSubscribe: true,
      })
    )
  })

  // ─── 3. Student with valid course access → subscriber token ────
  it("grants subscriber token to student with valid course access", async () => {
    setUser({ id: "s1", role: "STUDENT", teacherId: null })
    mockSession({ isFree: true })

    const { req, ctx } = makeRequest("live-1")
    const res = await GET(req, ctx)
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.token).toBe("mock-jwt-token")

    expect(livekitMock.mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        canPublish: false,
        canSubscribe: true,
      })
    )
  })

  // ─── 4. Booked paid-session student → subscriber token ─────────
  it("grants subscriber token to student with valid booking for paid session", async () => {
    setUser({ id: "s1", role: "STUDENT", teacherId: null })
    mockSession({
      isFree: false,
      price: 50,
      bookings: [{ id: "b1", userId: "s1", status: "booked" }],
    })

    const { req, ctx } = makeRequest("live-1")
    const res = await GET(req, ctx)
    expect(res.status).toBe(200)

    expect(livekitMock.mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        canPublish: false,
        canSubscribe: true,
      })
    )
  })

  // ─── 5. Unbooked paid-session student → 403 ────────────────────
  it("denies unbooked student for paid session with 403", async () => {
    setUser({ id: "s1", role: "STUDENT", teacherId: null })
    mockSession({
      isFree: false,
      price: 50,
      bookings: [],
    })

    const { req, ctx } = makeRequest("live-1")
    const res = await GET(req, ctx)
    expect(res.status).toBe(403)
    expect(livekitMock.FakeAccessToken._calls).toHaveLength(0)
  })

  // ─── 6. Non-subscriber (no course access) → 403 ───────────────
  it("denies student without course access with 403", async () => {
    setUser({ id: "s1", role: "STUDENT", teacherId: null })
    mockSession({ isFree: false, courseId: "c1" })
    vi.mocked(canAccessCourse).mockResolvedValue(false)

    const { req, ctx } = makeRequest("live-1")
    const res = await GET(req, ctx)
    expect(res.status).toBe(403)
    expect(livekitMock.FakeAccessToken._calls).toHaveLength(0)
  })

  // ─── 7. Guest (unauthenticated) → 401 ─────────────────────────
  it("returns 401 for unauthenticated guest", async () => {
    setUser(null)

    const { req, ctx } = makeRequest("live-1")
    const res = await GET(req, ctx)
    expect(res.status).toBe(401)
    expect(livekitMock.FakeAccessToken._calls).toHaveLength(0)
  })

  // ─── 8. Wrong teacher → 403 ────────────────────────────────────
  it("denies non-owner teacher with 403", async () => {
    setUser({ id: "u2", role: "TEACHER", teacherId: "t2" })
    mockSession({ teacherId: "t1" })

    const { req, ctx } = makeRequest("live-1")
    const res = await GET(req, ctx)
    expect(res.status).toBe(403)
    expect(livekitMock.FakeAccessToken._calls).toHaveLength(0)
  })

  // ─── 9. Session not found → 404 ────────────────────────────────
  it("returns 404 when session does not exist", async () => {
    setUser({ id: "u1", role: "TEACHER", teacherId: "t1" })
    prismaMock.liveSession.findUnique.mockResolvedValue(null)

    const { req, ctx } = makeRequest("nonexistent")
    const res = await GET(req, ctx)
    expect(res.status).toBe(404)
    expect(livekitMock.FakeAccessToken._calls).toHaveLength(0)
  })

  // ─── 10. Correct room name (session.id) ────────────────────────
  it("uses session.id as room name", async () => {
    setUser({ id: "u1", role: "TEACHER", teacherId: "t1" })
    mockSession({ id: "session-xyz", teacherId: "t1" })

    const { req, ctx } = makeRequest("session-xyz")
    const res = await GET(req, ctx)
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.room).toBe("session-xyz")

    expect(livekitMock.mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({ room: "session-xyz" })
    )
  })

  // ─── 11. Teacher has publish grant ─────────────────────────────
  it("teacher token includes canPublish: true", async () => {
    setUser({ id: "u1", role: "TEACHER", teacherId: "t1" })
    mockSession({ teacherId: "t1" })

    const { req, ctx } = makeRequest("live-1")
    await GET(req, ctx)

    const grantArg = livekitMock.mockAddGrant.mock.calls[0][0]
    expect(grantArg.canPublish).toBe(true)
  })

  // ─── 12. Student has no publish grant ──────────────────────────
  it("student token has canPublish: false", async () => {
    setUser({ id: "s1", role: "STUDENT", teacherId: null })
    mockSession({ isFree: true })

    const { req, ctx } = makeRequest("live-1")
    await GET(req, ctx)

    const grantArg = livekitMock.mockAddGrant.mock.calls[0][0]
    expect(grantArg.canPublish).toBe(false)
  })

  // ─── 13. Secret is never serialized ────────────────────────────
  it("never exposes LIVEKIT_API_SECRET in response", async () => {
    setUser({ id: "u1", role: "TEACHER", teacherId: "t1" })
    mockSession({ teacherId: "t1" })

    const { req, ctx } = makeRequest("live-1")
    const res = await GET(req, ctx)
    const text = JSON.stringify(await res.json())

    expect(text).not.toContain("test-api-secret")
    expect(text).not.toContain("LIVEKIT_API_SECRET")
    expect(text).not.toContain("apiSecret")
  })

  // ─── 14. Token expiration is bounded ───────────────────────────
  it("sets token TTL to session duration + 15 min safety margin", async () => {
    setUser({ id: "u1", role: "TEACHER", teacherId: "t1" })
    mockSession({ teacherId: "t1", durationMinutes: 90 })

    const { req, ctx } = makeRequest("live-1")
    await GET(req, ctx)

    // AccessToken constructor should receive ttl = (90 + 15) * 60 = 6300
    const constructorArgs = livekitMock.FakeAccessToken._calls[0]
    expect(constructorArgs[2]).toMatchObject({
      ttl: 6300,
    })
  })

  // ─── Additional: participant identity uses user.id ─────────────
  it("uses user.id as participant identity, not email", async () => {
    setUser({ id: "user-123", role: "TEACHER", teacherId: "t1" })
    mockSession({ teacherId: "t1" })

    const { req, ctx } = makeRequest("live-1")
    const res = await GET(req, ctx)
    const json = await res.json()

    expect(json.identity).toBe("user-123")
    expect((livekitMock.FakeAccessToken._calls[0][2] as Record<string, unknown>).identity).toBe("user-123")
  })

  // ─── Additional: participant name from user fields ─────────────
  it("builds participant name from firstName + middleName + lastName", async () => {
    setUser({
      id: "u1",
      role: "TEACHER",
      teacherId: "t1",
      firstName: "أحمد",
      middleName: "علي",
      lastName: "محمد",
    })
    mockSession({ teacherId: "t1" })

    const { req, ctx } = makeRequest("live-1")
    const res = await GET(req, ctx)
    const json = await res.json()

    expect(json.name).toBe("أحمد علي محمد")
  })

  // ─── Additional: missing env vars → 500 ────────────────────────
  it("returns 500 when LiveKit env vars are missing", async () => {
    delete process.env.LIVEKIT_API_KEY
    setUser({ id: "u1", role: "TEACHER", teacherId: "t1" })
    mockSession({ teacherId: "t1" })

    const { req, ctx } = makeRequest("live-1")
    const res = await GET(req, ctx)
    expect(res.status).toBe(500)
    expect(livekitMock.FakeAccessToken._calls).toHaveLength(0)
  })

  // ─── Additional: free session without courseId → student access ─
  it("grants access to student for free session without courseId", async () => {
    setUser({ id: "s1", role: "STUDENT", teacherId: null })
    mockSession({ isFree: true, courseId: null })

    const { req, ctx } = makeRequest("live-1")
    const res = await GET(req, ctx)
    expect(res.status).toBe(200)
  })

  // ─── Additional: cancelled booking on paid session → 403 ───────
  it("denies student with cancelled booking on paid session", async () => {
    setUser({ id: "s1", role: "STUDENT", teacherId: null })
    mockSession({
      isFree: false,
      price: 50,
      bookings: [{ id: "b1", userId: "s1", status: "cancelled" }],
    })

    const { req, ctx } = makeRequest("live-1")
    const res = await GET(req, ctx)
    expect(res.status).toBe(403)
  })

  // ─── Additional: LiveKit URL is returned in response ───────────
  it("returns LiveKit URL in response for client connection", async () => {
    setUser({ id: "u1", role: "TEACHER", teacherId: "t1" })
    mockSession({ teacherId: "t1" })

    const { req, ctx } = makeRequest("live-1")
    const res = await GET(req, ctx)
    const json = await res.json()

    expect(json.url).toBe("wss://test.livekit.cloud")
  })
})
