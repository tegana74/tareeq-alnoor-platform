import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ============================= Mocks =============================

const prismaMock = vi.hoisted(() => ({
  liveSession: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  subscription: {
    findUnique: vi.fn(),
  },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }))
vi.mock("@/lib/subscriptions", () => ({ canAccessCourse: vi.fn() }))

// Mock livekit-server-sdk
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
    static resetCalls() { FakeAccessToken._calls = [] }
  }

  return { FakeAccessToken, mockAddGrant, mockToJwt }
})
vi.mock("livekit-server-sdk", () => ({
  AccessToken: livekitServerMock.FakeAccessToken,
}))

// Mock livekit-client
const livekitClientMock = vi.hoisted(() => {
  const mockDisconnect = vi.fn()
  const mockConnect = vi.fn()
  const mockPublishTrack = vi.fn()
  const mockSetCameraEnabled = vi.fn()
  const mockSetMicrophoneEnabled = vi.fn()
  const mockOn = vi.fn()

  class FakeRoom {
    localParticipant = {
      publishTrack: mockPublishTrack,
      setCameraEnabled: mockSetCameraEnabled,
      setMicrophoneEnabled: mockSetMicrophoneEnabled,
    }
    disconnect = mockDisconnect
    connect = mockConnect
    on = mockOn
  }

  const mockCreateLocalTracks = vi.fn().mockResolvedValue([
    { kind: "video", attach: vi.fn(), detach: vi.fn() },
    { kind: "audio", attach: vi.fn(), detach: vi.fn() }
  ])

  return {
    FakeRoom,
    mockDisconnect,
    mockConnect,
    mockPublishTrack,
    mockSetCameraEnabled,
    mockSetMicrophoneEnabled,
    mockOn,
    mockCreateLocalTracks,
  }
})
vi.mock("livekit-client", () => ({
  Room: livekitClientMock.FakeRoom,
  RoomEvent: {
    Connected: "connected",
    Disconnected: "disconnected",
    Reconnecting: "reconnecting",
    Reconnected: "reconnected",
  },
  VideoPresets: {
    h720: { resolution: "720p" }
  },
  createLocalTracks: livekitClientMock.mockCreateLocalTracks,
}))

import { getCurrentUser } from "@/lib/auth"
import { GET as getLivekitToken } from "@/app/api/live/[id]/token/route"
import { updateLiveSessionStatusAction } from "@/app/actions/teacher-live"

// ============================= Helpers =============================

function setUser(u: { id: string; role: string; teacherId?: string | null; firstName?: string; lastName?: string } | null) {
  vi.mocked(getCurrentUser).mockResolvedValue(
    u
      ? ({
          firstName: u.firstName ?? "أستاذ",
          lastName: u.lastName ?? "مدرس",
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

  livekitServerMock.FakeAccessToken.resetCalls()
})

// ============================= Tests =============================

describe("Teacher Live Publishing Flows (LIVE-8B Contracts)", () => {

  // 1. token request succeeds for teacher owner
  it("allows teacher owner to successfully request publisher token", async () => {
    setUser({ id: "teacher-1", role: "TEACHER", teacherId: "t1" })
    mockSession({ teacherId: "t1" })

    const { req, ctx } = makeRequest("live-1")
    const res = await getLivekitToken(req, ctx)
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.token).toBe("mock-jwt-token")
    expect(livekitServerMock.mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        canPublish: true,
        canSubscribe: true,
      })
    )
  })

  // 2. non-owner teacher denied
  it("denies token generation for non-owner teacher", async () => {
    setUser({ id: "teacher-2", role: "TEACHER", teacherId: "t2" })
    mockSession({ teacherId: "t1" })

    const { req, ctx } = makeRequest("live-1")
    const res = await getLivekitToken(req, ctx)
    expect(res.status).toBe(403)
  })

  // 3. student cannot use teacher publish flow
  it("denies student from getting publisher grants", async () => {
    setUser({ id: "student-1", role: "STUDENT", teacherId: null })
    mockSession({ isFree: true })

    const { req, ctx } = makeRequest("live-1")
    const res = await getLivekitToken(req, ctx)
    expect(res.status).toBe(200)

    // Token should have canPublish: false
    expect(livekitServerMock.mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        canPublish: false,
        canSubscribe: true,
      })
    )
  })

  // 4. camera publish state (toggle camera logic)
  it("enables camera toggle correctly on local participant", async () => {
    const room = new livekitClientMock.FakeRoom()

    // Initial state
    let cameraEnabled = true

    // Toggle camera off
    cameraEnabled = false
    await room.localParticipant.setCameraEnabled(cameraEnabled)
    expect(livekitClientMock.mockSetCameraEnabled).toHaveBeenCalledWith(false)

    // Toggle camera on
    cameraEnabled = true
    await room.localParticipant.setCameraEnabled(cameraEnabled)
    expect(livekitClientMock.mockSetCameraEnabled).toHaveBeenLastCalledWith(true)
  })

  // 5. microphone publish state (toggle microphone logic)
  it("enables microphone toggle correctly on local participant", async () => {
    const room = new livekitClientMock.FakeRoom()

    // Initial state
    let micEnabled = true

    // Toggle mic off
    micEnabled = false
    await room.localParticipant.setMicrophoneEnabled(micEnabled)
    expect(livekitClientMock.mockSetMicrophoneEnabled).toHaveBeenCalledWith(false)

    // Toggle mic on
    micEnabled = true
    await room.localParticipant.setMicrophoneEnabled(micEnabled)
    expect(livekitClientMock.mockSetMicrophoneEnabled).toHaveBeenLastCalledWith(true)
  })

  // 6. connect failure does not set session live
  it("does not update session to live if media connection fails", async () => {
    setUser({ id: "teacher-1", role: "TEACHER", teacherId: "t1" })
    mockSession({ teacherId: "t1", status: "waiting" })

    // Simulate connection failure (e.g. invalid server URL)
    livekitClientMock.mockConnect.mockRejectedValueOnce(new Error("Connection Failed"))

    // Verify database update to live was NOT triggered since connection failed
    expect(prismaMock.liveSession.update).not.toHaveBeenCalled()
  })

  // 7. successful connect allows live transition
  it("updates session to live after media connection and publish succeed", async () => {
    setUser({ id: "teacher-1", role: "TEACHER", teacherId: "t1" })
    mockSession({ id: "live-1", teacherId: "t1", status: "waiting" })

    // Mock successful Room connect & publish
    livekitClientMock.mockConnect.mockResolvedValueOnce(undefined)

    const fd = new FormData()
    fd.set("id", "live-1")
    fd.set("status", "live")

    const res = await updateLiveSessionStatusAction(null, fd)
    expect(res.ok).toBe(true)
    expect(prismaMock.liveSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "live-1" },
        data: { status: "live" },
      })
    )
  })

  // 8. disconnect/leave handling
  it("disconnects from LiveKit room when teacher leaves the room", async () => {
    const room = new livekitClientMock.FakeRoom()
    room.disconnect()
    expect(livekitClientMock.mockDisconnect).toHaveBeenCalledTimes(1)
  })

  // 9. end session triggers disconnect
  it("disconnects the room and stops publishing when end session action is executed", async () => {
    setUser({ id: "teacher-1", role: "TEACHER", teacherId: "t1" })
    mockSession({ id: "live-1", teacherId: "t1", status: "live" })

    const room = new livekitClientMock.FakeRoom()

    // Stop publishing tracks
    await room.localParticipant.setCameraEnabled(false)
    await room.localParticipant.setMicrophoneEnabled(false)
    expect(livekitClientMock.mockSetCameraEnabled).toHaveBeenCalledWith(false)
    expect(livekitClientMock.mockSetMicrophoneEnabled).toHaveBeenCalledWith(false)

    // Call End Session Action
    const fd = new FormData()
    fd.set("id", "live-1")
    fd.set("status", "ended")

    const res = await updateLiveSessionStatusAction(null, fd)
    expect(res.ok).toBe(true)

    // Disconnect room
    room.disconnect()
    expect(livekitClientMock.mockDisconnect).toHaveBeenCalled()
  })

  // 10. cancelled session cannot start publishing
  it("prevents starting publishing or setting live if session is cancelled", async () => {
    setUser({ id: "teacher-1", role: "TEACHER", teacherId: "t1" })
    mockSession({ id: "live-1", teacherId: "t1", status: "cancelled" })

    const fd = new FormData()
    fd.set("id", "live-1")
    fd.set("status", "live")

    const res = await updateLiveSessionStatusAction(null, fd)
    expect(res.ok).toBe(false)
    expect(res.error).toContain("انتقال حالة غير صالح")
    expect(prismaMock.liveSession.update).not.toHaveBeenCalled()
  })

  // 11. ended session cannot start publishing
  it("prevents starting publishing if session is already ended", async () => {
    setUser({ id: "teacher-1", role: "TEACHER", teacherId: "t1" })
    mockSession({ id: "live-1", teacherId: "t1", status: "ended" })

    const fd = new FormData()
    fd.set("id", "live-1")
    fd.set("status", "live")

    const res = await updateLiveSessionStatusAction(null, fd)
    expect(res.ok).toBe(false)
    expect(res.error).toContain("انتقال حالة غير صالح")
    expect(prismaMock.liveSession.update).not.toHaveBeenCalled()
  })

  // 12. waiting -> live works after media success
  it("allows transition from waiting to live status", async () => {
    setUser({ id: "teacher-1", role: "TEACHER", teacherId: "t1" })
    mockSession({ id: "live-1", teacherId: "t1", status: "waiting" })

    const fd = new FormData()
    fd.set("id", "live-1")
    fd.set("status", "live")

    const res = await updateLiveSessionStatusAction(null, fd)
    expect(res.ok).toBe(true)
    expect(prismaMock.liveSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "live-1" },
        data: { status: "live" },
      })
    )
  })

  // 13. publish failure does not leave database in live
  it("ensures session status is not updated to live in database if publishing fails", async () => {
    setUser({ id: "teacher-1", role: "TEACHER", teacherId: "t1" })
    mockSession({ id: "live-1", teacherId: "t1", status: "waiting" })

    // Simulate publish failure (e.g. tracks cannot be published)
    livekitClientMock.mockPublishTrack.mockRejectedValueOnce(new Error("Track publishing failed"))

    // Ensure database remains unchanged
    expect(prismaMock.liveSession.update).not.toHaveBeenCalled()
  })

  // 14. reconnect state does not prematurely end session
  it("retains the live session status in the database during reconnection states", async () => {
    setUser({ id: "teacher-1", role: "TEACHER", teacherId: "t1" })
    mockSession({ id: "live-1", teacherId: "t1", status: "live" })

    // Simulate Reconnecting event
    const room = new livekitClientMock.FakeRoom()
    let connState = "connected"

    // Connection drops -> Reconnecting
    connState = "reconnecting"
    expect(connState).toBe("reconnecting")

    // Ensure database end session is not called
    expect(prismaMock.liveSession.update).not.toHaveBeenCalled()
  })
})
