import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ============================= Mocks =============================

const prismaMock = vi.hoisted(() => ({
  liveSession: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  liveSessionAdmission: {
    // LIVE-9C — بوابة الدخول في attend/heartbeat تقرأ حالة الطالب
    findUnique: vi.fn(),
  },
  liveSessionAttendance: {
    upsert: vi.fn(),
  },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }))
vi.mock("@/lib/subscriptions", () => ({ canAccessCourse: vi.fn() }))

import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { POST as heartbeatPost } from "@/app/api/live/[id]/heartbeat/route"
import { POST as attendPost } from "@/app/api/live/[id]/attend/route"

function setUser(u: { id: string; role: string; teacherId?: string | null } | null) {
  vi.mocked(getCurrentUser).mockResolvedValue(
    u ? ({ firstName: "", lastName: "", walletBalance: 100, ...u } as never) : (null as never)
  )
}

function makeReq(id = "live-1") {
  return new NextRequest(`http://localhost/api/live/${id}/heartbeat`, { method: "POST" })
}

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
  prismaMock.liveSession.findUnique.mockResolvedValue({ ...defaults, ...overrides } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  setUser({ id: "s1", role: "STUDENT", teacherId: null })
  mockSession()
  // LIVE-9C — الطالب في هذه الاختبارات موافق عليه؛ البوابة تقرأ حالته من السجل
  prismaMock.liveSessionAdmission.findUnique.mockResolvedValue({
    status: "approved",
  } as never)
  vi.mocked(canAccessCourse).mockResolvedValue(true)
})

// ============================= Heartbeat Route =============================

describe("POST /api/live/[id]/heartbeat (LIVE-8D)", () => {
  it("3. heartbeat accepted for authorized student during live session", async () => {
    const res = await heartbeatPost(makeReq(), { params: Promise.resolve({ id: "live-1" }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    // Idempotent upsert — يؤكد الحضور دون تكرار
    expect(prismaMock.liveSessionAttendance.upsert).toHaveBeenCalledWith({
      where: { userId_sessionId: { userId: "s1", sessionId: "live-1" } },
      create: { userId: "s1", sessionId: "live-1" },
      update: {},
    })
  })

  it("4. heartbeat unauthorized (no course access) → 403 and no upsert", async () => {
    mockSession({ isFree: false, price: 50 })
    vi.mocked(canAccessCourse).mockResolvedValue(false)

    const res = await heartbeatPost(makeReq(), { params: Promise.resolve({ id: "live-1" }) })
    expect(res.status).toBe(403)
    expect(prismaMock.liveSessionAttendance.upsert).not.toHaveBeenCalled()
  })

  it("5. heartbeat outside live status → rejected", async () => {
    mockSession({ status: "waiting" })

    const res = await heartbeatPost(makeReq(), { params: Promise.resolve({ id: "live-1" }) })
    expect(res.status).toBe(400)
    expect(prismaMock.liveSessionAttendance.upsert).not.toHaveBeenCalled()
  })

  it("6. heartbeat outside time window → rejected", async () => {
    mockSession({ startAt: new Date(Date.now() - 90 * 60 * 1000) }) // ended 30 min ago

    const res = await heartbeatPost(makeReq(), { params: Promise.resolve({ id: "live-1" }) })
    expect(res.status).toBe(400)
    expect(prismaMock.liveSessionAttendance.upsert).not.toHaveBeenCalled()
  })

  it("7. heartbeat for paid unbooked student → 403", async () => {
    mockSession({ isFree: false, price: 50, bookings: [] })

    const res = await heartbeatPost(makeReq(), { params: Promise.resolve({ id: "live-1" }) })
    expect(res.status).toBe(403)
    expect(prismaMock.liveSessionAttendance.upsert).not.toHaveBeenCalled()
  })

  it("8. heartbeat after session ended → rejected", async () => {
    mockSession({ status: "ended" })

    const res = await heartbeatPost(makeReq(), { params: Promise.resolve({ id: "live-1" }) })
    expect(res.status).toBe(400)
    expect(prismaMock.liveSessionAttendance.upsert).not.toHaveBeenCalled()
  })

  it("9. heartbeat after session cancelled → rejected", async () => {
    mockSession({ status: "cancelled" })

    const res = await heartbeatPost(makeReq(), { params: Promise.resolve({ id: "live-1" }) })
    expect(res.status).toBe(400)
    expect(prismaMock.liveSessionAttendance.upsert).not.toHaveBeenCalled()
  })

  it("heartbeat for guest → 401", async () => {
    setUser(null)

    const res = await heartbeatPost(makeReq(), { params: Promise.resolve({ id: "live-1" }) })
    expect(res.status).toBe(401)
  })

  it("heartbeat never modifies LiveSession status (student has no authority)", async () => {
    await heartbeatPost(makeReq(), { params: Promise.resolve({ id: "live-1" }) })
    expect(prismaMock.liveSession.update).not.toHaveBeenCalled()
  })
})

// ============================= Attendance Idempotency =============================

describe("Attendance idempotency across attend + heartbeat (LIVE-8D)", () => {
  it("20. repeated attend calls keep a single record via upsert update:{}", async () => {
    // نداء أول
    await attendPost(
      new NextRequest("http://localhost/api/live/live-1/attend", { method: "POST" }),
      { params: Promise.resolve({ id: "live-1" }) }
    )
    // نداء ثانٍ (مثل reload أو first-track مكرر)
    await attendPost(
      new NextRequest("http://localhost/api/live/live-1/attend", { method: "POST" }),
      { params: Promise.resolve({ id: "live-1" }) }
    )

    // كلا الندائين يستخدمان upsert بنفس المفتاح — لا إنشاء مكرر ممكن
    const calls = prismaMock.liveSessionAttendance.upsert.mock.calls
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call[0].where).toEqual({ userId_sessionId: { userId: "s1", sessionId: "live-1" } })
      expect(call[0].update).toEqual({})
    }
  })

  it("1. first LiveKit connection path records attendance via existing endpoint", async () => {
    // AttendanceTrigger في student-live-viewer يستدعي /attend — نفس المسار المحروس
    const res = await attendPost(
      new NextRequest("http://localhost/api/live/live-1/attend", { method: "POST" }),
      { params: Promise.resolve({ id: "live-1" }) }
    )
    expect(res.status).toBe(200)
    expect(prismaMock.liveSessionAttendance.upsert).toHaveBeenCalledTimes(1)
  })
})
