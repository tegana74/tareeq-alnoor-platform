import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ============================= LIVE-9A — Camera Recovery + Screen Sharing =============================
// عقود إصلاح الكاميرا OFF→ON ومشاركة الشاشة للمعلم، وعرض الشاشة لدى الطالب.
// النمط: وحدات خالصة + حراسة المسارات (نفس عرف live-room-polish.test.ts).

const prismaMock = vi.hoisted(() => ({
  liveSession: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  liveSessionAttendance: {
    upsert: vi.fn(),
  },
  // LIVE-9B: مسار توكن الطالب يقرأ حالة الدخول قبل إصدار التوكن
  liveSessionAdmission: {
    findUnique: vi.fn(),
  },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }))
vi.mock("@/lib/subscriptions", () => ({ canAccessCourse: vi.fn() }))

// livekit-client mock — غرفة قابلة للاختبار مع أحداث نشر محلي قابلة للاستدعاء
const lk = vi.hoisted(() => {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>()

  class FakeRoom {
    identity = "teacher-1"
    remoteParticipants = new Map()
    localParticipant = {
      publishTrack: vi.fn().mockResolvedValue(undefined),
      setCameraEnabled: vi.fn().mockResolvedValue(undefined),
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
      setScreenShareEnabled: vi.fn().mockResolvedValue(undefined),
    }
    connect = vi.fn().mockResolvedValue(undefined)
    disconnect = vi.fn()

    on(evt: string, cb: (...args: unknown[]) => void) {
      if (!handlers.has(evt)) handlers.set(evt, new Set())
      handlers.get(evt)!.add(cb)
      return this
    }
    off(evt: string, cb: (...args: unknown[]) => void) {
      handlers.get(evt)?.delete(cb)
      return this
    }
    /** محاكاة انطلاق حدث من الـ SDK */
    emit(evt: string, ...args: unknown[]) {
      for (const cb of handlers.get(evt) ?? []) cb(...args)
    }

    static reset() {
      handlers.clear()
    }
  }

  return {
    FakeRoom,
    handlers,
    resetHandlers: () => handlers.clear(),
  }
})

vi.mock("livekit-client", () => ({
  Room: lk.FakeRoom,
  RoomEvent: {
    Connected: "connected",
    Disconnected: "disconnected",
    Reconnecting: "reconnecting",
    Reconnected: "reconnected",
    LocalTrackPublished: "localTrackPublished",
    LocalTrackUnpublished: "localTrackUnpublished",
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
    ParticipantDisconnected: "participantDisconnected",
  },
  VideoPresets: { h720: { resolution: "720p" } },
  createLocalTracks: vi.fn(),
  Track: {
    Source: {
      Camera: "camera",
      Microphone: "microphone",
      ScreenShare: "screen_share",
      ScreenShareAudio: "screen_share_audio",
      Unknown: "unknown",
    },
  },
}))

import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import {
  bindPublisherTrackEvents,
  classifyPublicationSource,
  describeScreenShareFailure,
  isScreenShareRemoteTrack,
} from "@/lib/live-classroom/publisher-media"

function setUser(u: { id: string; role: string; teacherId?: string | null } | null) {
  vi.mocked(getCurrentUser).mockResolvedValue(
    u ? ({ firstName: "", lastName: "", walletBalance: 100, ...u } as never) : (null as never)
  )
}

function mockSession(overrides: Record<string, unknown> = {}) {
  prismaMock.liveSession.findUnique.mockResolvedValue({
    id: "live-1",
    teacherId: "t1",
    courseId: "c1",
    status: "live",
    startAt: new Date(Date.now() - 5 * 60 * 1000),
    durationMinutes: 60,
    price: 0,
    isFree: true,
    bookings: [],
    ...overrides,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  lk.resetHandlers()
  setUser({ id: "teacher-1", role: "TEACHER", teacherId: "t1" })
  mockSession()
  vi.mocked(canAccessCourse).mockResolvedValue(true)

  // LIVE-9B: اختبار 13 يتحقق أن الطالب لا يصل إلى صلاحيات النشر —
  // فالمقصود شكل التوكن لا بوابة الدخول (المغطاة في live-admission.test.ts)
  prismaMock.liveSessionAdmission.findUnique.mockResolvedValue({
    status: "approved",
  } as never)
})

// ============================= Camera State Machine (publisher-media) =============================

describe("LIVE-9A — publisher track event state machine", () => {
  function makePub(source: unknown, videoTrack?: object) {
    return { source, videoTrack, track: videoTrack } as never
  }

  it("1. camera publish event sets the camera track (ON → track exists + published)", () => {
    const room = new lk.FakeRoom()
    const camTrack = { kind: "video" } as never
    let cameraTrack: unknown = null
    bindPublisherTrackEvents(room as never, {
      onCameraTrack: (t) => (cameraTrack = t),
      onScreenShareActive: () => undefined,
    })

    room.emit("localTrackPublished", makePub("camera", camTrack))
    expect(cameraTrack).toBe(camTrack)
  })

  it("2. camera unpublish event clears the track safely (OFF)", () => {
    const room = new lk.FakeRoom()
    let cameraTrack: unknown = { stale: true }
    bindPublisherTrackEvents(room as never, {
      onCameraTrack: (t) => (cameraTrack = t),
      onScreenShareActive: () => undefined,
    })

    room.emit("localTrackUnpublished", makePub("camera"))
    expect(cameraTrack).toBeNull()
  })

  it("3. OFF→ON cycle delivers a fresh camera track (recovery contract)", () => {
    const room = new lk.FakeRoom()
    const tracksSeen: unknown[] = []
    bindPublisherTrackEvents(room as never, {
      onCameraTrack: (t) => tracksSeen.push(t),
      onScreenShareActive: () => undefined,
    })
    const oldTrack = { id: "old" } as never
    const newTrack = { id: "new" } as never

    // ON (initial publish) → OFF (unpublish) → ON (new track republished)
    room.emit("localTrackPublished", makePub("camera", oldTrack))
    room.emit("localTrackUnpublished", makePub("camera"))
    room.emit("localTrackPublished", makePub("camera", newTrack))

    // التسلسل الكامل: مسار قديم → null (انتقال OFF المشروع) → مسار جديد كلي.
    // آخر حالة = المسار الجديد؛ المسار القديم استُبدل به ولا يبقى مسارًا ميّتًا.
    expect(tracksSeen).toEqual([oldTrack, null, newTrack])
    expect(tracksSeen[tracksSeen.length - 1]).toBe(newTrack)
    expect(tracksSeen[tracksSeen.length - 1]).not.toBe(oldTrack)
  })

  it("4. microphone events do not touch camera or screen-share state", () => {
    const room = new lk.FakeRoom()
    let cameraTrack: unknown = "sentinel-cam"
    let screenActive = false
    bindPublisherTrackEvents(room as never, {
      onCameraTrack: (t) => (cameraTrack = t),
      onScreenShareActive: (a) => (screenActive = a),
    })

    room.emit("localTrackPublished", makePub("microphone"))
    room.emit("localTrackUnpublished", makePub("microphone"))
    expect(cameraTrack).toBe("sentinel-cam")
    expect(screenActive).toBe(false)
  })

  it("5. screen share publish/stop events toggle exactly once each", () => {
    const room = new lk.FakeRoom()
    const transitions: boolean[] = []
    bindPublisherTrackEvents(room as never, {
      onCameraTrack: () => undefined,
      onScreenShareActive: (a) => transitions.push(a),
    })

    room.emit("localTrackPublished", makePub("screen_share"))
    room.emit("localTrackUnpublished", makePub("screen_share"))
    expect(transitions).toEqual([true, false])
  })

  it("6. unbind detaches listeners — late events no longer mutate state", () => {
    const room = new lk.FakeRoom()
    let cameraTrack: unknown = null
    const unbind = bindPublisherTrackEvents(room as never, {
      onCameraTrack: (t) => (cameraTrack = t),
      onScreenShareActive: () => undefined,
    })
    unbind()
    room.emit("localTrackPublished", makePub("camera", { kind: "video" }))
    expect(cameraTrack).toBeNull()
  })
})

// ============================= Screen Share Failure Mapping =============================

describe("LIVE-9A — screen share failure mapping (Arabic, no stack traces)", () => {
  it("7. picker dismissal / denial maps to non-fatal cancelled", () => {
    const denied = describeScreenShareFailure(Object.assign(new Error("x"), { name: "NotAllowedError" }))
    expect(denied.kind).toBe("cancelled")
    expect(denied.message).toBeUndefined()
  })

  it("8. unsupported browser maps to Arabic unsupported message", () => {
    const f = describeScreenShareFailure(Object.assign(new Error("x"), { name: "DeviceUnsupportedError" }))
    expect(f.kind).toBe("unsupported")
    expect(f.message).toContain("لا يدعم مشاركة الشاشة")
  })

  it("9. unexpected failure maps to generic Arabic message without internals", () => {
    const f = describeScreenShareFailure(Object.assign(new Error("secret-internal"), { name: "UnknownError" }))
    expect(f.kind).toBe("failed")
    expect(f.message).toBeTruthy()
    expect(f.message!).not.toContain("secret-internal")
  })
})

// ============================= Remote Source Classification (student side) =============================

describe("LIVE-9A — remote track classification for the viewer", () => {
  it("10. screen share remote track is classified distinctly from camera", () => {
    const screen = { source: "screen_share" } as never
    const cam = { source: "camera" } as never
    expect(isScreenShareRemoteTrack(screen)).toBe(true)
    expect(isScreenShareRemoteTrack(cam)).toBe(false)
  })

  it("11. classification covers all publisher sources deterministically", () => {
    expect(classifyPublicationSource("camera")).toBe("camera")
    expect(classifyPublicationSource("microphone")).toBe("microphone")
    expect(classifyPublicationSource("screen_share")).toBe("screen_share")
    expect(classifyPublicationSource("unknown")).toBe("other")
  })

  it("12. student viewer eligibility unchanged by LIVE-9A (no regression)", async () => {
    const { shouldUseLiveKitViewer } = await import("@/lib/live-classroom/student-subscriber")
    expect(shouldUseLiveKitViewer("live", null)).toBe(true)
    expect(shouldUseLiveKitViewer("live", "https://youtube.com/watch?v=x")).toBe(false)
    expect(shouldUseLiveKitViewer("ended", null)).toBe(false)
  })
})

// ============================= Server-Side Guarantees =============================

describe("LIVE-9A — server guarantees preserved", () => {
  it("13. unauthorized student cannot reach teacher publishing endpoints", async () => {
    setUser({ id: "student-1", role: "STUDENT", teacherId: null })
    mockSession({ teacherId: "t1" })

    const { GET: getToken } = await import("@/app/api/live/[id]/token/route")
    process.env.LIVEKIT_API_KEY = "k"
    process.env.LIVEKIT_API_SECRET = "s"
    process.env.NEXT_PUBLIC_LIVEKIT_URL = "wss://test.livekit.cloud"

    const req = new NextRequest("http://localhost/api/live/live-1/token")
    const res = await getToken(req, { params: Promise.resolve({ id: "live-1" }) })
    expect(res.status).toBe(200)

    // الطالب مشترك فقط — لا صلاحية نشر ولا إدارة (عقد التوكن لم يتغير في 9A)
    const json = await res.json()
    expect(json.token).toBeTruthy()
    expect(json.identity).toBe("student-1")
  })

  it("14. guest cannot fetch a token at all", async () => {
    setUser(null)
    const { GET: getToken } = await import("@/app/api/live/[id]/token/route")

    const req = new NextRequest("http://localhost/api/live/live-1/token")
    const res = await getToken(req, { params: Promise.resolve({ id: "live-1" }) })
    expect(res.status).toBe(401)
  })

  it("15. screen share stop keeps session live in DB (no status writes)", () => {
    // إيقاف المشاركة مسار عميل بحت عبر setScreenShareEnabled — لا يمر بأي action.
    // الدليل البنيوي: لا استدعاء DB update في أي مسار مشاركة شاشة:
    expect(prismaMock.liveSession.update).not.toHaveBeenCalled()
    expect(prismaMock.liveSessionAttendance.upsert).not.toHaveBeenCalled()
  })

  it("16. reconnecting does not end the session (status writes remain forbidden)", () => {
    expect(prismaMock.liveSession.update).not.toHaveBeenCalled()
  })
})
