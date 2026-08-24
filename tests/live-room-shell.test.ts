import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ============================= Mocks =============================

const prismaMock = vi.hoisted(() => ({
  liveSession: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  liveSessionAttendance: {
    upsert: vi.fn(),
  },
  subscription: {
    findFirst: vi.fn(),
  },
  sessionBooking: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }))
vi.mock("@/lib/subscriptions", () => ({ canAccessCourse: vi.fn() }))

import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { updateLiveSessionStatusAction } from "@/app/actions/teacher-live"
import { POST as attendPost } from "@/app/api/live/[id]/attend/route"
import { GET as statusGet } from "@/app/api/live/[id]/status/route"
import { canTransitionSessionStatus } from "@/lib/live-classroom/types"

function setUser(u: { id: string; role: string; teacherId?: string | null } | null) {
  vi.mocked(getCurrentUser).mockResolvedValue(
    u ? ({ firstName: "", lastName: "", walletBalance: 100, ...u } as never) : (null as never)
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  setUser({ id: "u1", role: "TEACHER", teacherId: "t1" })
  prismaMock.liveSession.findUnique.mockResolvedValue({
    id: "live-1",
    teacherId: "t1",
    courseId: "c1",
    status: "scheduled",
    startAt: new Date(Date.now() - 5 * 60 * 1000), // started 5 mins ago
    durationMinutes: 60,
    price: 0,
    isFree: true,
  } as never)
  vi.mocked(canAccessCourse).mockResolvedValue(true)
})

// ============================= Tests =============================

describe("Live Room Status Transitions (Types)", () => {
  it("allows correct transitions", () => {
    expect(canTransitionSessionStatus("scheduled", "waiting")).toBe(true)
    expect(canTransitionSessionStatus("scheduled", "live")).toBe(true)
    expect(canTransitionSessionStatus("scheduled", "cancelled")).toBe(true)
    expect(canTransitionSessionStatus("waiting", "live")).toBe(true)
    expect(canTransitionSessionStatus("live", "ended")).toBe(true)
  })

  it("denies invalid transitions", () => {
    expect(canTransitionSessionStatus("live", "waiting")).toBe(false)
    expect(canTransitionSessionStatus("ended", "live")).toBe(false)
    expect(canTransitionSessionStatus("cancelled", "scheduled")).toBe(false)
  })
})

describe("updateLiveSessionStatusAction (Server Action)", () => {
  const fd = (status: string) => {
    const f = new FormData()
    f.set("id", "live-1")
    f.set("status", status)
    return f
  }

  it("updates status successfully for teacher owner", async () => {
    const res = await updateLiveSessionStatusAction(null, fd("live"))
    expect(res).toEqual({ ok: true })
    expect(prismaMock.liveSession.update).toHaveBeenCalledTimes(1)
    expect(prismaMock.liveSession.update.mock.calls[0][0]).toMatchObject({
      where: { id: "live-1" },
      data: { status: "live" },
    })
  })

  it("updates status successfully for admin", async () => {
    setUser({ id: "admin-1", role: "ADMIN", teacherId: null })
    const res = await updateLiveSessionStatusAction(null, fd("live"))
    expect(res).toEqual({ ok: true })
  })

  it("denies status update for foreign teacher", async () => {
    setUser({ id: "teacher-2", role: "TEACHER", teacherId: "t2" })
    const res = await updateLiveSessionStatusAction(null, fd("live"))
    expect(res.ok).toBe(false)
    expect(res.error).toContain("غير مصرح")
    expect(prismaMock.liveSession.update).not.toHaveBeenCalled()
  })

  it("denies status update for student", async () => {
    setUser({ id: "student-1", role: "STUDENT", teacherId: null })
    const res = await updateLiveSessionStatusAction(null, fd("live"))
    expect(res.ok).toBe(false)
    expect(prismaMock.liveSession.update).not.toHaveBeenCalled()
  })

  it("denies invalid transition (e.g. ended -> live)", async () => {
    prismaMock.liveSession.findUnique.mockResolvedValueOnce({
      id: "live-1",
      teacherId: "t1",
      status: "ended",
    } as never)

    const res = await updateLiveSessionStatusAction(null, fd("live"))
    expect(res.ok).toBe(false)
    expect(res.error).toContain("انتقال حالة غير صالح")
    expect(prismaMock.liveSession.update).not.toHaveBeenCalled()
  })
})

describe("GET /api/live/[id]/status (Polling Route)", () => {
  const req = new NextRequest("http://localhost/api/live/live-1/status")

  it("returns status and details for authorized student", async () => {
    setUser({ id: "student-1", role: "STUDENT", teacherId: null })
    prismaMock.liveSession.findUnique.mockResolvedValueOnce({
      id: "live-1",
      teacherId: "t1",
      courseId: "c1",
      status: "live",
      startAt: new Date(Date.now() - 5 * 60 * 1000),
      durationMinutes: 60,
      price: 0,
      isFree: true,
      attendances: [],
      bookings: [],
    } as never)

    const res = await statusGet(req, { params: Promise.resolve({ id: "live-1" }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({
      status: "live",
      isLive: true,
      canWatch: true,
      attended: false,
    })
  })

  it("denies status for unauthorized student", async () => {
    setUser({ id: "student-1", role: "STUDENT", teacherId: null })
    vi.mocked(canAccessCourse).mockResolvedValueOnce(false)
    prismaMock.liveSession.findUnique.mockResolvedValueOnce({
      id: "live-1",
      teacherId: "t1",
      courseId: "c1",
      status: "scheduled",
      startAt: new Date(),
      durationMinutes: 60,
      price: 0,
      isFree: false,
      attendances: [],
      bookings: [],
    } as never)

    const res = await statusGet(req, { params: Promise.resolve({ id: "live-1" }) })
    expect(res.status).toBe(403)
  })
})

describe("POST /api/live/[id]/attend (Attendance Route)", () => {
  const req = new NextRequest("http://localhost/api/live/live-1/attend", { method: "POST" })

  it("allows attendance registration during live status & live time", async () => {
    setUser({ id: "student-1", role: "STUDENT", teacherId: null })
    prismaMock.liveSession.findUnique.mockResolvedValueOnce({
      id: "live-1",
      teacherId: "t1",
      courseId: "c1",
      status: "live",
      startAt: new Date(Date.now() - 5 * 60 * 1000), // started 5 mins ago
      durationMinutes: 60,
      price: 0,
      isFree: true,
      bookings: [],
    } as never)

    const res = await attendPost(req, { params: Promise.resolve({ id: "live-1" }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(prismaMock.liveSessionAttendance.upsert).toHaveBeenCalledTimes(1)
  })

  it("denies attendance if session status is not 'live' (e.g. waiting)", async () => {
    setUser({ id: "student-1", role: "STUDENT", teacherId: null })
    prismaMock.liveSession.findUnique.mockResolvedValueOnce({
      id: "live-1",
      teacherId: "t1",
      courseId: "c1",
      status: "waiting", // not live!
      startAt: new Date(Date.now() - 5 * 60 * 1000),
      durationMinutes: 60,
      price: 0,
      isFree: true,
      bookings: [],
    } as never)

    const res = await attendPost(req, { params: Promise.resolve({ id: "live-1" }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: "البث ليس مباشراً الآن في النظام" })
    expect(prismaMock.liveSessionAttendance.upsert).not.toHaveBeenCalled()
  })

  it("denies attendance if past session time even if status is 'live'", async () => {
    setUser({ id: "student-1", role: "STUDENT", teacherId: null })
    prismaMock.liveSession.findUnique.mockResolvedValueOnce({
      id: "live-1",
      teacherId: "t1",
      courseId: "c1",
      status: "live",
      startAt: new Date(Date.now() - 70 * 60 * 1000), // started 70 mins ago (ended)
      durationMinutes: 60,
      price: 0,
      isFree: true,
      bookings: [],
    } as never)

    const res = await attendPost(req, { params: Promise.resolve({ id: "live-1" }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: "خارج وقت البث الزمني" })
    expect(prismaMock.liveSessionAttendance.upsert).not.toHaveBeenCalled()
  })

  it("denies attendance for unbooked paid session", async () => {
    setUser({ id: "student-1", role: "STUDENT", teacherId: null })
    prismaMock.liveSession.findUnique.mockResolvedValueOnce({
      id: "live-1",
      teacherId: "t1",
      courseId: "c1",
      status: "live",
      startAt: new Date(Date.now() - 5 * 60 * 1000),
      durationMinutes: 60,
      price: 50, // paid session!
      isFree: false,
      bookings: [], // no booking!
    } as never)

    const res = await attendPost(req, { params: Promise.resolve({ id: "live-1" }) })
    expect(res.status).toBe(403)
    expect(prismaMock.liveSessionAttendance.upsert).not.toHaveBeenCalled()
  })
})
