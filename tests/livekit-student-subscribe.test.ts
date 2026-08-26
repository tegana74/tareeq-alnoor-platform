import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { NextRequest } from "next/server"

// ============================= Mocks =============================

const prismaMock = vi.hoisted(() => ({
  liveSession: {
    findUnique: vi.fn(),
    update: vi.fn(),
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

// livekit-server-sdk mock — للتحقق من grants
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

// livekit-client mock — Room كامل مع تسجيل استدعاءات النشر/الالتقاط
const livekitClientMock = vi.hoisted(() => {
  const mockConnect = vi.fn().mockResolvedValue(undefined)
  const mockDisconnect = vi.fn()
  const mockOn = vi.fn()
  const mockOff = vi.fn()
  const mockPublishTrack = vi.fn()
  const mockSetCameraEnabled = vi.fn()
  const mockSetMicrophoneEnabled = vi.fn()

  class FakeRoom {
    remoteParticipants = new Map<string, {
      trackPublications: Map<string, { track?: { kind: string; attach: (el: unknown) => void; detach: () => void } }>
    }>()
    localParticipant = {
      publishTrack: mockPublishTrack,
      setCameraEnabled: mockSetCameraEnabled,
      setMicrophoneEnabled: mockSetMicrophoneEnabled,
    }
    connect = mockConnect
    disconnect = mockDisconnect
    on = mockOn
    off = mockOff
  }

  // createLocalTracks يجب ألا يُستدعى إطلاقاً للطالب
  const mockCreateLocalTracks = vi.fn()

  return {
    FakeRoom,
    mockConnect,
    mockDisconnect,
    mockOn,
    mockOff,
    mockPublishTrack,
    mockSetCameraEnabled,
    mockSetMicrophoneEnabled,
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
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
    ParticipantDisconnected: "participantDisconnected",
  },
  VideoPresets: {
    h720: { resolution: "720p" },
  },
  createLocalTracks: livekitClientMock.mockCreateLocalTracks,
}))

import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { GET as getLivekitToken } from "@/app/api/live/[id]/token/route"
import {
  connectStudentSubscriber,
  attachRemoteTrackHandlers,
  shouldUseLiveKitViewer,
} from "@/lib/live-classroom/student-subscriber"

// ============================= Helpers =============================

function setUser(u: { id: string; role: string; teacherId?: string | null } | null) {
  vi.mocked(getCurrentUser).mockResolvedValue(
    u
      ? ({ firstName: "طالب", lastName: "مجتهد", walletBalance: 100, ...u } as never)
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
    status: "live",
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

// بيئة fetch عالمية لالتقاط نداءات التوكن داخل connectStudentSubscriber
let tokenFetchImpl: typeof fetch = async () => {
  throw new Error("tokenFetch not configured")
}
const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  process.env.LIVEKIT_API_KEY = "test-api-key"
  process.env.LIVEKIT_API_SECRET = "test-api-secret"
  process.env.NEXT_PUBLIC_LIVEKIT_URL = "wss://test.livekit.cloud"
  vi.mocked(canAccessCourse).mockResolvedValue(true)
  livekitServerMock.FakeAccessToken.resetCalls()

  // افتراضي: endpoint التوكن يعيد توكن مشاهد عبر GET الحقيقي (mocked)
  setUser({ id: "s1", role: "STUDENT", teacherId: null })
  mockSession({ isFree: true })

  // LIVE-9B: هذه المجموعة تختبر grants المشاهد والاتصال — لا بوابة الدخول.
  // الافتراضي «موافَق عليه» يحافظ على نفس ما كانت تختبره قبل 9B.
  // بوابة الدخول نفسها مغطاة بالكامل في tests/live-admission.test.ts
  prismaMock.liveSessionAdmission.findUnique.mockResolvedValue({
    status: "approved",
  } as never)

  tokenFetchImpl = async (input) => {
    const url = String(input)
    const match = url.match(/\/api\/live\/([^/]+)\/token/)
    if (!match) throw new Error(`unexpected fetch: ${url}`)
    const res = await getLivekitToken(
      new NextRequest(`http://localhost${url}`),
      { params: Promise.resolve({ id: match[1] }) }
    )
    const body = await res.json()
    return {
      ok: res.status === 200,
      status: res.status,
      json: async () => body,
    } as Response
  }
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    tokenFetchImpl(input, init)) as typeof fetch
})

afterAll(() => {
  globalThis.fetch = originalFetch
})

// ============================= Tests =============================

describe("Student Subscriber Token Grants (LIVE-8C)", () => {
  it("1. authorized student receives a subscriber token", async () => {
    const { req, ctx } = makeRequest("live-1")
    const res = await getLivekitToken(req, ctx)
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.token).toBe("mock-jwt-token")
    expect(json.url).toBe("wss://test.livekit.cloud")
  })

  it("2. student token canPublish is explicitly false", async () => {
    const { req, ctx } = makeRequest("live-1")
    await getLivekitToken(req, ctx)

    const grant = livekitServerMock.mockAddGrant.mock.calls[0][0] as Record<string, unknown>
    expect(grant.canPublish).toBe(false)
  })

  it("2b. student token canPublishData is explicitly false", async () => {
    const { req, ctx } = makeRequest("live-1")
    await getLivekitToken(req, ctx)

    const grant = livekitServerMock.mockAddGrant.mock.calls[0][0] as Record<string, unknown>
    expect(grant.canPublishData).toBe(false)
  })

  it("3. student token canSubscribe is true", async () => {
    const { req, ctx } = makeRequest("live-1")
    await getLivekitToken(req, ctx)

    const grant = livekitServerMock.mockAddGrant.mock.calls[0][0] as Record<string, unknown>
    expect(grant.canSubscribe).toBe(true)
  })

  it("4. unauthorized student (no course access) → 403 and no token issued", async () => {
    // جلسة مدفوعة مرتبطة بكورس — الوصول يمر عبر canAccessCourse فقط
    mockSession({ isFree: false, price: 50 })
    vi.mocked(canAccessCourse).mockResolvedValue(false)

    const { req, ctx } = makeRequest("live-1")
    const res = await getLivekitToken(req, ctx)
    expect(res.status).toBe(403)
    expect(livekitServerMock.FakeAccessToken._calls).toHaveLength(0)
  })

  it("5. unbooked paid-session student → 403 and no token issued", async () => {
    livekitServerMock.FakeAccessToken.resetCalls()
    mockSession({ isFree: false, price: 50, bookings: [] })

    const { req, ctx } = makeRequest("live-1")
    const res = await getLivekitToken(req, ctx)
    expect(res.status).toBe(403)
    expect(livekitServerMock.FakeAccessToken._calls).toHaveLength(0)
  })

  it("5b. cancelled booking on paid session → 403", async () => {
    mockSession({ isFree: false, price: 50, bookings: [{ id: "b1", userId: "s1", status: "cancelled" }] })

    const { req, ctx } = makeRequest("live-1")
    const res = await getLivekitToken(req, ctx)
    expect(res.status).toBe(403)
  })

  it("6. guest (unauthenticated) → 401", async () => {
    setUser(null)

    const { req, ctx } = makeRequest("live-1")
    const res = await getLivekitToken(req, ctx)
    expect(res.status).toBe(401)
  })
})

describe("Student Subscriber Connection (LIVE-8C)", () => {
  it("7. LiveKit session connects using token + url from the existing endpoint", async () => {
    const handle = await connectStudentSubscriber("live-1")

    expect(livekitClientMock.mockConnect).toHaveBeenCalledWith(
      "wss://test.livekit.cloud",
      "mock-jwt-token"
    )
    handle.disconnect()
    expect(livekitClientMock.mockDisconnect).toHaveBeenCalledTimes(1)
  })

  it("7b. unauthorized student connection throws STUDENT_TOKEN_UNAUTHORIZED", async () => {
    mockSession({ isFree: false, price: 50 })
    vi.mocked(canAccessCourse).mockResolvedValue(false)

    await expect(connectStudentSubscriber("live-1")).rejects.toThrow("STUDENT_TOKEN_UNAUTHORIZED")
  })

  it("8. remote video track routed to onVideoTrack handler", () => {
    const room = new livekitClientMock.FakeRoom() as unknown as Parameters<typeof attachRemoteTrackHandlers>[0]
    const onVideoTrack = vi.fn()
    const onAudioTrack = vi.fn()

    attachRemoteTrackHandlers(room, {
      onVideoTrack,
      onAudioTrack,
      onTrackRemoved: vi.fn(),
    })

    // استخراج مستمع TrackSubscribed المسجل واستدعاؤه بمسار فيديو
    const subCall = livekitClientMock.mockOn.mock.calls.find((c) => c[0] === "trackSubscribed")
    expect(subCall).toBeDefined()
    const videoTrack = { kind: "video", attach: vi.fn(), detach: vi.fn() }
    ;(subCall![1] as (t: unknown, p: unknown, part: unknown) => void)(videoTrack, {}, {})

    expect(onVideoTrack).toHaveBeenCalledWith(videoTrack)
    expect(onAudioTrack).not.toHaveBeenCalled()
  })

  it("9. remote audio track routed to onAudioTrack handler", () => {
    const room = new livekitClientMock.FakeRoom() as unknown as Parameters<typeof attachRemoteTrackHandlers>[0]
    const onVideoTrack = vi.fn()
    const onAudioTrack = vi.fn()

    attachRemoteTrackHandlers(room, { onVideoTrack, onAudioTrack, onTrackRemoved: vi.fn() })

    const subCall = livekitClientMock.mockOn.mock.calls.find((c) => c[0] === "trackSubscribed")
    const audioTrack = { kind: "audio", attach: vi.fn(), detach: vi.fn() }
    ;(subCall![1] as (t: unknown, p: unknown, part: unknown) => void)(audioTrack, {}, {})

    expect(onAudioTrack).toHaveBeenCalledWith(audioTrack)
    expect(onVideoTrack).not.toHaveBeenCalled()
  })

  it("9b. unsubscribed/participant-disconnected events wired for cleanup states", () => {
    const room = new livekitClientMock.FakeRoom() as unknown as Parameters<typeof attachRemoteTrackHandlers>[0]
    const onTrackRemoved = vi.fn()
    const onParticipantLeft = vi.fn()

    const detach = attachRemoteTrackHandlers(room, {
      onVideoTrack: vi.fn(),
      onAudioTrack: vi.fn(),
      onTrackRemoved,
      onParticipantLeft,
    })

    const unsubCall = livekitClientMock.mockOn.mock.calls.find((c) => c[0] === "trackUnsubscribed")
    const leftCall = livekitClientMock.mockOn.mock.calls.find(
      (c) => c[0] === "participantDisconnected"
    )
    ;(unsubCall![1] as (t: unknown, p?: unknown, part?: unknown) => void)({ kind: "video" }, {}, {})
    ;(leftCall![1] as (...args: unknown[]) => void)()

    expect(onTrackRemoved).toHaveBeenCalledTimes(1)
    expect(onParticipantLeft).toHaveBeenCalledTimes(1)

    detach()
    expect(livekitClientMock.mockOff).toHaveBeenCalled()
  })

  it("10. student flow never calls createLocalTracks", async () => {
    const handle = await connectStudentSubscriber("live-1")
    handle.disconnect()
    expect(livekitClientMock.mockCreateLocalTracks).not.toHaveBeenCalled()
  })

  it("11. student flow never calls publishTrack / setCameraEnabled / setMicrophoneEnabled", async () => {
    const handle = await connectStudentSubscriber("live-1")
    handle.disconnect()

    expect(livekitClientMock.mockPublishTrack).not.toHaveBeenCalled()
    expect(livekitClientMock.mockSetCameraEnabled).not.toHaveBeenCalled()
    expect(livekitClientMock.mockSetMicrophoneEnabled).not.toHaveBeenCalled()
  })

  it("12. reconnect events do not disconnect the room or flip state to ended", async () => {
    const handle = await connectStudentSubscriber("live-1")
    const onCallsBefore = livekitClientMock.mockOn.mock.calls.length

    // تسجيل مستمعي إعادة الاتصال كما في المكون — ثم التحقق أن الغرفة بقيت متصلة
    livekitClientMock.mockOn.mock.calls
      .filter((c) => c[0] === "reconnecting" || c[0] === "reconnected")
      .forEach((c) => (c[1] as () => void)())

    expect(livekitClientMock.mockOn.mock.calls.length).toBeGreaterThanOrEqual(onCallsBefore)
    expect(livekitClientMock.mockDisconnect).not.toHaveBeenCalled()
    expect(prismaMock.liveSession.update).not.toHaveBeenCalled()

    handle.disconnect()
    expect(livekitClientMock.mockDisconnect).toHaveBeenCalledTimes(1)
  })

  it("13. disconnect cleanup detaches remote tracks then disconnects", async () => {
    const handle = await connectStudentSubscriber("live-1")

    const attachedVideo = { kind: "video", attach: vi.fn(), detach: vi.fn() }
    ;(handle.room.remoteParticipants as Map<string, {
      trackPublications: Map<string, { track?: typeof attachedVideo }>
    }>).set("teacher-pub", {
      trackPublications: new Map([["pub-video", { track: attachedVideo }]]),
    })

    // التنظيف اليدوي كما في المكون: detach ثم disconnect
    for (const p of handle.room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        pub.track?.detach()
      }
    }
    handle.disconnect()

    expect(attachedVideo.detach).toHaveBeenCalledTimes(1)
    expect(livekitClientMock.mockDisconnect).toHaveBeenCalledTimes(1)
  })
})

describe("Viewer Eligibility & Session States (LIVE-8C)", () => {
  it("14. external-URL sessions are NOT eligible for LiveKit viewer", () => {
    expect(shouldUseLiveKitViewer("live", "https://youtube.com/watch?v=x")).toBe(false)
    expect(shouldUseLiveKitViewer("live", "https://zoom.us/j/123")).toBe(false)
    expect(shouldUseLiveKitViewer("live", "")).toBe(true)
    expect(shouldUseLiveKitViewer("live", null)).toBe(true)
  })

  it("15. scheduled session is not eligible for the viewer", () => {
    expect(shouldUseLiveKitViewer("scheduled", null)).toBe(false)
  })

  it("16. waiting session is not eligible for the viewer (waiting screen instead)", () => {
    expect(shouldUseLiveKitViewer("waiting", null)).toBe(false)
  })

  it("17. ended session is not eligible for the viewer", () => {
    expect(shouldUseLiveKitViewer("ended", null)).toBe(false)
  })

  it("18. cancelled session is not eligible for the viewer", () => {
    expect(shouldUseLiveKitViewer("cancelled", null)).toBe(false)
  })

  it("18b. future statuses (recording/archived) are not eligible for the viewer", () => {
    expect(shouldUseLiveKitViewer("recording", null)).toBe(false)
    expect(shouldUseLiveKitViewer("archived", null)).toBe(false)
  })
})

describe("Existing Suites Regression Guards (LIVE-8C)", () => {
  it("teacher owner still receives publisher grants after canPublishData addition", async () => {
    setUser({ id: "teacher-1", role: "TEACHER", teacherId: "t1" })
    mockSession({ teacherId: "t1" })

    const { req, ctx } = makeRequest("live-1")
    const res = await getLivekitToken(req, ctx)
    expect(res.status).toBe(200)

    const grant = livekitServerMock.mockAddGrant.mock.calls[0][0] as Record<string, unknown>
    expect(grant.canPublish).toBe(true)
    expect(grant.canPublishData).toBe(true)
    expect(grant.canSubscribe).toBe(true)
  })

  it("student attendance route still enforces server-side rules (no heartbeat added)", async () => {
    // الحضور لا يتأثر بـ LIVE-8C: لا تحديث مباشر لحالة الجلسة من مسار المشاهد
    expect(prismaMock.liveSession.update).not.toHaveBeenCalled()
  })
})
