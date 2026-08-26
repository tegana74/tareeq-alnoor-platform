import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

// ===================== LIVE-9C — Participant Management + Kick =====================
// العقود المحمية هنا:
//   1. الطرد server-authorized حصراً: المعلم المالك/الأدمن فقط.
//   2. الطالب لا يطرد نفسه ولا غيره — لا يصل أصلاً إلى ما بعد حراسة الملكية.
//   3. المطرود لا يعود بإعادة تحميل الصفحة ولا بتوكن قديم ولا بطلب دخول جديد.
//   4. الكتابة في قاعدة البيانات تسبق الإزالة من LiveKit (وليس العكس).
//   5. participantName من LiveKit لا يُستخدم كهوية ولا كاسم معروض.
//   6. LIVEKIT_API_SECRET / RoomServiceClient لا يصلان إلى أي ملف "use client".
//
// النمط: Prisma مُموّه بالكامل + livekit-server-sdk وهمي (نفس عرف
// tests/live-admission.test.ts). لا مفاتيح حقيقية ولا نداءات شبكة.

const prismaMock = vi.hoisted(() => ({
  liveSession: {
    findUnique: vi.fn(),
  },
  liveSessionAdmission: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  liveSessionAttendance: {
    upsert: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }))
vi.mock("@/lib/subscriptions", () => ({ canAccessCourse: vi.fn() }))

/**
 * SDK وهمي: يغطي AccessToken (بوابة التوكن) و RoomServiceClient (الإدارة).
 * ServerError صنف حقيقي حتى يعمل instanceof داخل المهايئ.
 */
const sdkMock = vi.hoisted(() => {
  /** ترتيب العمليات الحقيقي — يثبت أن الحظر يسبق الإزالة */
  const callOrder: string[] = []

  const listParticipants = vi.fn()
  const removeParticipant = vi.fn()

  class FakeAccessToken {
    addGrant = vi.fn()
    toJwt = vi.fn().mockResolvedValue("mock-jwt-token")
  }

  class ServerError extends Error {
    status: number
    code?: string
    constructor(message: string, status = 500, code?: string) {
      super(message)
      this.name = "ServerError"
      this.status = status
      this.code = code
    }
  }

  class FakeRoomServiceClient {
    static _constructorArgs: unknown[][] = []
    constructor(...args: unknown[]) {
      FakeRoomServiceClient._constructorArgs.push(args)
    }
    listParticipants = listParticipants
    removeParticipant = removeParticipant
  }

  const ParticipantInfo_State = {
    JOINING: 0,
    JOINED: 1,
    ACTIVE: 2,
    DISCONNECTED: 3,
  }

  return {
    callOrder,
    listParticipants,
    removeParticipant,
    FakeAccessToken,
    FakeRoomServiceClient,
    ServerError,
    ParticipantInfo_State,
  }
})

vi.mock("livekit-server-sdk", () => ({
  AccessToken: sdkMock.FakeAccessToken,
  RoomServiceClient: sdkMock.FakeRoomServiceClient,
  ServerError: sdkMock.ServerError,
  ParticipantInfo_State: sdkMock.ParticipantInfo_State,
}))

import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import {
  ADMISSION_STATUSES,
  canIssueStudentToken,
  isKickedState,
  resolveRequestOutcome,
  shouldPollAdmission,
  toAdmissionState,
} from "@/lib/live-classroom/admission"
import {
  belongsInRoster,
  canKickParticipant,
  countConnected,
  describeRemoveFailure,
  KICK_REFUSAL_RESPONSES,
  mergeRoster,
  PARTICIPANT_POLL_INTERVAL_MS,
  shouldTrackParticipants,
  toJoinedAtMs,
  type AdmissionRosterRow,
  type RoomParticipantSnapshot,
} from "@/lib/live-classroom/participants"
import { toRoomParticipantSnapshot } from "@/lib/live-classroom/livekit-admin"
import { GET as getParticipants } from "@/app/api/live/[id]/participants/route"
import { POST as postKick } from "@/app/api/live/[id]/participants/kick/route"
import { POST as postAttend } from "@/app/api/live/[id]/attend/route"
import { POST as postHeartbeat } from "@/app/api/live/[id]/heartbeat/route"
import { GET as getToken } from "@/app/api/live/[id]/token/route"

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

/** جلسة LiveKit افتراضية: مباشرة، مجانية، بلا رابط خارجي */
function mockSession(overrides: Record<string, unknown> = {}) {
  prismaMock.liveSession.findUnique.mockResolvedValue({
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
    ...overrides,
  } as never)
}

function rosterRow(overrides: Partial<AdmissionRosterRow> = {}): AdmissionRosterRow {
  return {
    userId: "s1",
    status: "approved",
    name: "سارة علي",
    yearName: "الثالث الثانوي",
    departmentName: null,
    decidedAt: new Date("2026-08-26T10:00:00Z"),
    ...overrides,
  }
}

function snapshot(
  overrides: Partial<RoomParticipantSnapshot> = {}
): RoomParticipantSnapshot {
  return { identity: "s1", connected: true, joinedAtMs: 1_700_000_000_000, ...overrides }
}

/** صفوف قاعدة البيانات كما يقرأها readRosterAdmissions (اسم مركّب من جدول User) */
function dbRosterRows(
  rows: {
    userId: string
    status: string
    firstName?: string
    middleName?: string | null
    lastName?: string
  }[]
) {
  prismaMock.liveSessionAdmission.findMany.mockResolvedValue(
    rows.map((r) => ({
      userId: r.userId,
      status: r.status,
      decidedAt: new Date("2026-08-26T10:00:00Z"),
      user: {
        firstName: r.firstName ?? "سارة",
        middleName: r.middleName ?? null,
        lastName: r.lastName ?? "علي",
        year: { name: "الثالث الثانوي" },
        department: null,
      },
    })) as never
  )
}

function getReq(path: string, id = "live-1") {
  return [
    new NextRequest(`http://localhost/api/live/${id}${path}`),
    { params: Promise.resolve({ id }) },
  ] as const
}

function postReq(path: string, body?: unknown, id = "live-1") {
  const req = new NextRequest(`http://localhost/api/live/${id}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return [req, { params: Promise.resolve({ id }) }] as const
}

function tableMissing() {
  return Object.assign(new Error("table does not exist"), { code: "P2021" })
}

beforeEach(() => {
  vi.clearAllMocks()
  sdkMock.callOrder.length = 0
  sdkMock.FakeRoomServiceClient._constructorArgs = []

  // مفاتيح وهمية — لا أسرار حقيقية في الاختبارات ولا في السجلات
  process.env.LIVEKIT_API_KEY = "test-api-key"
  process.env.LIVEKIT_API_SECRET = "test-api-secret"
  process.env.NEXT_PUBLIC_LIVEKIT_URL = "wss://test.livekit.local"

  vi.mocked(canAccessCourse).mockResolvedValue(true as never)
  sdkMock.listParticipants.mockResolvedValue([])
  sdkMock.removeParticipant.mockImplementation(async () => {
    sdkMock.callOrder.push("livekit:remove")
  })
  prismaMock.liveSessionAdmission.update.mockImplementation(async () => {
    sdkMock.callOrder.push("db:kicked")
    return { status: "kicked", decidedAt: new Date("2026-08-26T11:00:00Z") } as never
  })
  prismaMock.liveSessionAttendance.upsert.mockResolvedValue({} as never)
  prismaMock.user.findUnique.mockResolvedValue({
    role: "STUDENT",
    teacherId: null,
  } as never)
})

// ============================= 1. حالة kicked في طبقة السياسة =============================

describe("LIVE-9C — حالة kicked", () => {
  it("kicked حالة مخزنة معروفة ولا تُترجم إلى none", () => {
    expect(ADMISSION_STATUSES).toContain("kicked")
    expect(toAdmissionState({ status: "kicked" })).toBe("kicked")
    expect(isKickedState("kicked")).toBe(true)
    expect(isKickedState("rejected")).toBe(false)
  })

  it("المطرود لا يحصل على توكن (البوابة تسمح لـ approved فقط)", () => {
    expect(canIssueStudentToken({ sessionUrl: null, admission: "kicked" })).toBe(false)
    expect(canIssueStudentToken({ sessionUrl: null, admission: "approved" })).toBe(true)
    // جلسة خارجية: نظام الدخول لا ينطبق — السلوك القديم كما هو
    expect(
      canIssueStudentToken({ sessionUrl: "https://youtu.be/x", admission: "kicked" })
    ).toBe(true)
  })

  it("طلب دخول جديد من المطرود لا يغيّر شيئاً (حالة نهائية)", () => {
    expect(resolveRequestOutcome("kicked")).toBe("unchanged")
    // للمقارنة: المرفوض يُعاد إلى pending بحسب سياسة LIVE-9B
    expect(resolveRequestOutcome("rejected")).toBe("reset-to-pending")
  })

  it("واجهة المطرود لا تستعلم — حالة ساكنة", () => {
    expect(shouldPollAdmission("kicked")).toBe(false)
    expect(shouldPollAdmission("pending")).toBe(true)
  })
})

// ============================= 2. تركيب القائمة (دوال خالصة) =============================

describe("LIVE-9C — mergeRoster", () => {
  it("توحيد joinedAt: bigint، صفر، سالب، غير رقمي", () => {
    expect(toJoinedAtMs(BigInt(1_700_000_000_000))).toBe(1_700_000_000_000)
    expect(toJoinedAtMs(0)).toBeNull()
    expect(toJoinedAtMs(-5)).toBeNull()
    expect(toJoinedAtMs(Number.NaN)).toBeNull()
    expect(toJoinedAtMs(null)).toBeNull()
    expect(toJoinedAtMs(undefined)).toBeNull()
  })

  it("القائمة تعرض approved و kicked فقط", () => {
    expect(belongsInRoster("approved")).toBe(true)
    expect(belongsInRoster("kicked")).toBe(true)
    expect(belongsInRoster("pending")).toBe(false)
    expect(belongsInRoster("rejected")).toBe(false)

    const rows = mergeRoster({
      admissions: [
        rosterRow({ userId: "s1", status: "approved" }),
        rosterRow({ userId: "s2", status: "pending" }),
        rosterRow({ userId: "s3", status: "rejected" }),
        rosterRow({ userId: "s4", status: "kicked" }),
      ],
      room: [],
    })
    expect(rows.map((r) => r.userId)).toEqual(["s1", "s4"])
  })

  it("المتصل يحصل على presence=connected و joinedAtMs رقمي", () => {
    const rows = mergeRoster({
      admissions: [rosterRow({ userId: "s1" })],
      room: [snapshot({ identity: "s1", joinedAtMs: BigInt(1_700_000_000_000) })],
    })
    expect(rows[0].presence).toBe("connected")
    expect(rows[0].joinedAtMs).toBe(1_700_000_000_000)
    expect(typeof rows[0].joinedAtMs).toBe("number")
  })

  it("الموافق عليه غير الموجود في الغرفة = offline بلا وقت انضمام", () => {
    const rows = mergeRoster({ admissions: [rosterRow({ userId: "s1" })], room: [] })
    expect(rows[0].presence).toBe("offline")
    expect(rows[0].joinedAtMs).toBeNull()
  })

  it("تعذّر الوصول إلى LiveKit (room=null) → presence=unknown مع بقاء القائمة", () => {
    const rows = mergeRoster({
      admissions: [rosterRow({ userId: "s1" }), rosterRow({ userId: "s2" })],
      room: null,
    })
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.presence === "unknown")).toBe(true)
    expect(rows.every((r) => r.joinedAtMs === null)).toBe(true)
  })

  it("الاسم يأتي من قاعدة البيانات حصراً — لا اسم من LiveKit", () => {
    const rows = mergeRoster({
      admissions: [rosterRow({ userId: "s1", name: "سارة علي" })],
      room: [snapshot({ identity: "s1" })],
    })
    expect(rows[0].name).toBe("سارة علي")
    // اللقطة القادمة من LiveKit لا تحتوي حقل اسم إطلاقاً — ضمان بنيوي
    expect(Object.keys(snapshot())).not.toContain("name")
  })

  it("هوية متصلة بلا سجل دخول تُعرض unknown بلا اسم مُلفَّق", () => {
    const rows = mergeRoster({
      admissions: [],
      room: [snapshot({ identity: "ghost-1" })],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: "ghost-1",
      name: "",
      admission: null,
      unknown: true,
      presence: "connected",
    })
  })

  it("الترتيب: المتصلون أولاً ثم الأقدم انضماماً", () => {
    const rows = mergeRoster({
      admissions: [
        rosterRow({ userId: "offline-1", name: "أ" }),
        rosterRow({ userId: "late", name: "ب" }),
        rosterRow({ userId: "early", name: "ج" }),
      ],
      room: [
        snapshot({ identity: "late", joinedAtMs: 2000 }),
        snapshot({ identity: "early", joinedAtMs: 1000 }),
      ],
    })
    expect(rows.map((r) => r.userId)).toEqual(["early", "late", "offline-1"])
    expect(countConnected(rows)).toBe(2)
  })

  it("اللوحة تعمل في waiting/live فقط، وفي جلسات LiveKit فقط", () => {
    expect(shouldTrackParticipants({ sessionUrl: null, status: "waiting" })).toBe(true)
    expect(shouldTrackParticipants({ sessionUrl: null, status: "live" })).toBe(true)
    expect(shouldTrackParticipants({ sessionUrl: null, status: "ended" })).toBe(false)
    expect(
      shouldTrackParticipants({ sessionUrl: "https://youtu.be/x", status: "live" })
    ).toBe(false)
    // إيقاع أبطأ من لوحة الطلبات لأن هذا المسار وحده ينادي LiveKit
    expect(PARTICIPANT_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(12000)
  })
})

// ============================= 3. صلاحية الطرد (دالة خالصة) =============================

describe("LIVE-9C — canKickParticipant", () => {
  const base = {
    actorUserId: "t-user",
    targetUserId: "s1",
    sessionUrl: null,
    targetIsManager: false,
    hasAdmissionRecord: true,
  }

  it("معرّف غير نصي أو فارغ → invalid-target", () => {
    expect(canKickParticipant({ ...base, targetUserId: undefined })).toEqual({
      ok: false,
      reason: "invalid-target",
    })
    expect(canKickParticipant({ ...base, targetUserId: "" })).toEqual({
      ok: false,
      reason: "invalid-target",
    })
    expect(canKickParticipant({ ...base, targetUserId: { id: "s1" } })).toEqual({
      ok: false,
      reason: "invalid-target",
    })
  })

  it("جلسة برابط خارجي → not-managed", () => {
    expect(
      canKickParticipant({ ...base, sessionUrl: "https://youtu.be/x" })
    ).toEqual({ ok: false, reason: "not-managed" })
  })

  it("طرد النفس مرفوض ويُعطي رسالة النفس لا «لا يوجد سجل»", () => {
    expect(
      canKickParticipant({
        ...base,
        targetUserId: "t-user",
        hasAdmissionRecord: false,
      })
    ).toEqual({ ok: false, reason: "self" })
  })

  it("المعلم/الأدمن لا يُطرد", () => {
    expect(
      canKickParticipant({ ...base, targetIsManager: true, hasAdmissionRecord: false })
    ).toEqual({ ok: false, reason: "manager" })
  })

  it("بلا سجل دخول في هذه الجلسة → no-record", () => {
    expect(canKickParticipant({ ...base, hasAdmissionRecord: false })).toEqual({
      ok: false,
      reason: "no-record",
    })
  })

  it("طالب موافق عليه في جلسة LiveKit → مسموح", () => {
    expect(canKickParticipant(base)).toEqual({ ok: true })
  })

  it("رسائل الرفض عربية بلا أي تفاصيل داخلية", () => {
    expect(KICK_REFUSAL_RESPONSES["invalid-target"].status).toBe(400)
    expect(KICK_REFUSAL_RESPONSES["not-managed"].status).toBe(400)
    expect(KICK_REFUSAL_RESPONSES.self.status).toBe(403)
    expect(KICK_REFUSAL_RESPONSES.manager.status).toBe(403)
    expect(KICK_REFUSAL_RESPONSES["no-record"].status).toBe(404)
    for (const refusal of Object.values(KICK_REFUSAL_RESPONSES)) {
      expect(refusal.error).not.toMatch(/livekit|prisma|error:|at |stack/i)
    }
    expect(describeRemoveFailure()).not.toMatch(/livekit|prisma|stack/i)
  })
})

// ============================= 4. مهايئ LiveKit =============================

describe("LIVE-9C — toRoomParticipantSnapshot", () => {
  it("يحوّل bigint إلى number ويحيّد الحالة والاسم", () => {
    const snap = toRoomParticipantSnapshot({
      identity: "s1",
      name: "اسم من LiveKit لا يجب أن يُستخدم",
      state: sdkMock.ParticipantInfo_State.ACTIVE,
      joinedAt: BigInt(0),
      joinedAtMs: BigInt(1_700_000_000_000),
    } as never)

    expect(snap.identity).toBe("s1")
    expect(snap.connected).toBe(true)
    expect(snap.joinedAtMs).toBe(1_700_000_000_000)
    // لا حقل اسم في اللقطة إطلاقاً — participantName لا يمكن أن يتسرب
    expect("name" in snap).toBe(false)
  })

  it("joinedAt بالثواني احتياط عندما يكون joinedAtMs صفراً", () => {
    const snap = toRoomParticipantSnapshot({
      identity: "s1",
      state: sdkMock.ParticipantInfo_State.JOINED,
      joinedAt: BigInt(1_700_000_000),
      joinedAtMs: BigInt(0),
    } as never)
    expect(snap.joinedAtMs).toBe(1_700_000_000_000)
  })

  it("DISCONNECTED → connected=false", () => {
    const snap = toRoomParticipantSnapshot({
      identity: "s1",
      state: sdkMock.ParticipantInfo_State.DISCONNECTED,
      joinedAt: BigInt(0),
      joinedAtMs: BigInt(0),
    } as never)
    expect(snap.connected).toBe(false)
    expect(snap.joinedAtMs).toBeNull()
  })
})

// ============================= 5. GET /participants =============================

describe("LIVE-9C — GET /api/live/[id]/participants", () => {
  it("401 بلا تسجيل دخول", async () => {
    setUser(null)
    const res = await getParticipants(...getReq("/participants"))
    expect(res.status).toBe(401)
    expect(sdkMock.listParticipants).not.toHaveBeenCalled()
  })

  it("404 لجلسة غير موجودة", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    prismaMock.liveSession.findUnique.mockResolvedValue(null as never)
    const res = await getParticipants(...getReq("/participants"))
    expect(res.status).toBe(404)
  })

  it("403 للطالب — لا تتسرب أسماء المشاركين", async () => {
    setUser({ id: "s1", role: "STUDENT" })
    mockSession()
    const res = await getParticipants(...getReq("/participants"))
    expect(res.status).toBe(403)
    expect(prismaMock.liveSessionAdmission.findMany).not.toHaveBeenCalled()
    expect(sdkMock.listParticipants).not.toHaveBeenCalled()
  })

  it("403 لمعلم غير مالك للجلسة", async () => {
    setUser({ id: "t2-user", role: "TEACHER", teacherId: "t2" })
    mockSession({ teacherId: "t1" })
    const res = await getParticipants(...getReq("/participants"))
    expect(res.status).toBe(403)
    expect(prismaMock.liveSessionAdmission.findMany).not.toHaveBeenCalled()
  })

  it("200 للمعلم المالك: دمج قاعدة البيانات مع حضور LiveKit", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    mockSession()
    dbRosterRows([
      { userId: "s1", status: "approved" },
      { userId: "s2", status: "kicked" },
    ])
    sdkMock.listParticipants.mockResolvedValue([
      {
        identity: "s1",
        state: sdkMock.ParticipantInfo_State.ACTIVE,
        joinedAt: BigInt(0),
        joinedAtMs: BigInt(1_700_000_000_000),
      },
    ])

    const res = await getParticipants(...getReq("/participants"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.managed).toBe(true)
    expect(body.roomReachable).toBe(true)
    expect(body.connectedCount).toBe(1)
    expect(body.participants).toHaveLength(2)
    expect(body.participants[0]).toMatchObject({
      userId: "s1",
      presence: "connected",
      admission: "approved",
      name: "سارة علي",
    })
    // اسم الغرفة هو معرّف الجلسة (نفس عرف إصدار التوكن)
    expect(sdkMock.listParticipants).toHaveBeenCalledWith("live-1")
  })

  it("الأدمن مصرَّح له حتى لو لم يملك الجلسة", async () => {
    setUser({ id: "admin-1", role: "ADMIN" })
    mockSession({ teacherId: "t1" })
    dbRosterRows([{ userId: "s1", status: "approved" }])
    const res = await getParticipants(...getReq("/participants"))
    expect(res.status).toBe(200)
  })

  it("تعذّر الوصول إلى LiveKit → 200 مع roomReachable=false وحالة unknown", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    mockSession()
    dbRosterRows([{ userId: "s1", status: "approved" }])
    sdkMock.listParticipants.mockRejectedValue(new Error("network down"))

    const res = await getParticipants(...getReq("/participants"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.roomReachable).toBe(false)
    expect(body.participants[0].presence).toBe("unknown")
    expect(body.connectedCount).toBe(0)
    // لا تفاصيل SDK في الاستجابة
    expect(JSON.stringify(body)).not.toMatch(/network down/)
  })

  it("غرفة لم تُنشأ بعد (not_found) ليست خطأ — القائمة offline", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    mockSession({ status: "waiting" })
    dbRosterRows([{ userId: "s1", status: "approved" }])
    sdkMock.listParticipants.mockRejectedValue(
      new sdkMock.ServerError("room not found", 404, "not_found")
    )

    const res = await getParticipants(...getReq("/participants"))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.roomReachable).toBe(true)
    expect(body.participants[0].presence).toBe("offline")
  })

  it("جلسة برابط خارجي → managed=false بلا أي نداء LiveKit", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    mockSession({ url: "https://youtu.be/abc" })
    const res = await getParticipants(...getReq("/participants"))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.managed).toBe(false)
    expect(sdkMock.listParticipants).not.toHaveBeenCalled()
    expect(prismaMock.liveSessionAdmission.findMany).not.toHaveBeenCalled()
  })

  it("503 عندما يكون جدول طلبات الدخول غير موجود", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    mockSession()
    prismaMock.liveSessionAdmission.findMany.mockRejectedValue(tableMissing() as never)
    const res = await getParticipants(...getReq("/participants"))
    expect(res.status).toBe(503)
  })
})

// ============================= 6. POST /participants/kick =============================

describe("LIVE-9C — POST /api/live/[id]/participants/kick", () => {
  it("401 بلا تسجيل دخول — لا كتابة ولا إزالة", async () => {
    setUser(null)
    const res = await postKick(...postReq("/participants/kick", { userId: "s1" }))
    expect(res.status).toBe(401)
    expect(prismaMock.liveSessionAdmission.update).not.toHaveBeenCalled()
    expect(sdkMock.removeParticipant).not.toHaveBeenCalled()
  })

  it("404 لجلسة غير موجودة", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    prismaMock.liveSession.findUnique.mockResolvedValue(null as never)
    const res = await postKick(...postReq("/participants/kick", { userId: "s1" }))
    expect(res.status).toBe(404)
  })

  it("403 — الطالب لا يستطيع طرد طالب آخر", async () => {
    setUser({ id: "s1", role: "STUDENT" })
    mockSession()
    const res = await postKick(...postReq("/participants/kick", { userId: "s2" }))
    expect(res.status).toBe(403)
    expect(prismaMock.liveSessionAdmission.update).not.toHaveBeenCalled()
    expect(sdkMock.removeParticipant).not.toHaveBeenCalled()
  })

  it("403 — الطالب لا يستطيع طرد نفسه", async () => {
    setUser({ id: "s1", role: "STUDENT" })
    mockSession()
    const res = await postKick(...postReq("/participants/kick", { userId: "s1" }))
    expect(res.status).toBe(403)
    expect(prismaMock.liveSessionAdmission.update).not.toHaveBeenCalled()
    expect(sdkMock.removeParticipant).not.toHaveBeenCalled()
  })

  it("403 — معلم غير مالك للجلسة", async () => {
    setUser({ id: "t2-user", role: "TEACHER", teacherId: "t2" })
    mockSession({ teacherId: "t1" })
    const res = await postKick(...postReq("/participants/kick", { userId: "s1" }))
    expect(res.status).toBe(403)
    expect(prismaMock.liveSessionAdmission.update).not.toHaveBeenCalled()
  })

  it("400 عند غياب userId أو كونه غير نصي", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    mockSession()
    const res = await postKick(...postReq("/participants/kick", {}))
    expect(res.status).toBe(400)

    mockSession()
    const res2 = await postKick(...postReq("/participants/kick", { userId: 42 }))
    expect(res2.status).toBe(400)
    expect(prismaMock.liveSessionAdmission.findUnique).not.toHaveBeenCalled()
  })

  it("403 — المعلم لا يطرد نفسه", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    mockSession()
    prismaMock.liveSessionAdmission.findUnique.mockResolvedValue(null as never)
    prismaMock.user.findUnique.mockResolvedValue({
      role: "TEACHER",
      teacherId: "t1",
    } as never)

    const res = await postKick(...postReq("/participants/kick", { userId: "t-user" }))
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.error).toContain("نفسك")
    expect(sdkMock.removeParticipant).not.toHaveBeenCalled()
  })

  it("403 — لا يمكن طرد معلم الجلسة أو الأدمن (الدور من قاعدة البيانات)", async () => {
    setUser({ id: "admin-1", role: "ADMIN" })
    mockSession({ teacherId: "t1" })
    prismaMock.liveSessionAdmission.findUnique.mockResolvedValue(null as never)
    prismaMock.user.findUnique.mockResolvedValue({
      role: "TEACHER",
      teacherId: "t1",
    } as never)

    const res = await postKick(...postReq("/participants/kick", { userId: "t-user" }))
    expect(res.status).toBe(403)
    expect(prismaMock.liveSessionAdmission.update).not.toHaveBeenCalled()
    expect(sdkMock.removeParticipant).not.toHaveBeenCalled()
  })

  it("404 عندما لا يوجد سجل دخول للمستهدَف في هذه الجلسة", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    mockSession()
    prismaMock.liveSessionAdmission.findUnique.mockResolvedValue(null as never)
    const res = await postKick(...postReq("/participants/kick", { userId: "s-other" }))
    expect(res.status).toBe(404)
    expect(sdkMock.removeParticipant).not.toHaveBeenCalled()
  })

  it("400 لجلسة برابط خارجي (لا غرفة LiveKit)", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    mockSession({ url: "https://youtu.be/abc" })
    prismaMock.liveSessionAdmission.findUnique.mockResolvedValue({
      status: "approved",
    } as never)
    const res = await postKick(...postReq("/participants/kick", { userId: "s1" }))
    expect(res.status).toBe(400)
    expect(sdkMock.removeParticipant).not.toHaveBeenCalled()
  })

  it("200 — الحظر في قاعدة البيانات يسبق الإزالة من LiveKit", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    mockSession()
    prismaMock.liveSessionAdmission.findUnique.mockResolvedValue({
      status: "approved",
    } as never)

    const res = await postKick(...postReq("/participants/kick", { userId: "s1" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, status: "kicked", userId: "s1", removed: true })
    expect(body.warning).toBeUndefined()

    // الترتيب هو العقد: لو انعكس لأمكن للطالب إعادة الاتصال في الفجوة
    expect(sdkMock.callOrder).toEqual(["db:kicked", "livekit:remove"])

    const updateArgs = prismaMock.liveSessionAdmission.update.mock.calls[0][0]
    expect(updateArgs.data.status).toBe("kicked")
    expect(updateArgs.data.decidedBy).toBe("t-user")
    // السجل مقيَّد بجلسة الـ URL — لا يمكن التأثير على جلسة أخرى
    expect(updateArgs.where.sessionId_userId).toEqual({
      sessionId: "live-1",
      userId: "s1",
    })
    expect(sdkMock.removeParticipant).toHaveBeenCalledWith(
      "live-1",
      "s1",
      expect.objectContaining({ revokeTokenTs: expect.anything() })
    )
  })

  it("فشل الإزالة من LiveKit لا يُلغي الحظر — 200 مع تحذير", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    mockSession()
    prismaMock.liveSessionAdmission.findUnique.mockResolvedValue({
      status: "approved",
    } as never)
    sdkMock.removeParticipant.mockRejectedValue(new Error("rpc timeout"))

    const res = await postKick(...postReq("/participants/kick", { userId: "s1" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe("kicked")
    expect(body.removed).toBe(false)
    expect(typeof body.warning).toBe("string")
    expect(prismaMock.liveSessionAdmission.update).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(body)).not.toMatch(/rpc timeout/)
  })

  it("مشارك غير موجود في الغرفة = نتيجة محققة (idempotent)", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    mockSession()
    prismaMock.liveSessionAdmission.findUnique.mockResolvedValue({
      status: "approved",
    } as never)
    sdkMock.removeParticipant.mockRejectedValue(
      new sdkMock.ServerError("participant not found", 404, "not_found")
    )

    const res = await postKick(...postReq("/participants/kick", { userId: "s1" }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.removed).toBe(true)
    expect(body.warning).toBeUndefined()
  })

  it("طرد طالب مطرود سابقاً لا يفشل (تكرار آمن)", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    mockSession()
    prismaMock.liveSessionAdmission.findUnique.mockResolvedValue({
      status: "kicked",
    } as never)
    const res = await postKick(...postReq("/participants/kick", { userId: "s1" }))
    expect(res.status).toBe(200)
    expect(sdkMock.callOrder).toEqual(["db:kicked", "livekit:remove"])
  })

  it("503 عندما يكون جدول طلبات الدخول غير موجود — بلا إزالة", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    mockSession()
    prismaMock.liveSessionAdmission.findUnique.mockRejectedValue(tableMissing() as never)
    const res = await postKick(...postReq("/participants/kick", { userId: "s1" }))
    expect(res.status).toBe(503)
    expect(sdkMock.removeParticipant).not.toHaveBeenCalled()
  })

  it("لا يُسرَّب أي سر ولا roomAdmin في الاستجابة", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    mockSession()
    prismaMock.liveSessionAdmission.findUnique.mockResolvedValue({
      status: "approved",
    } as never)
    const res = await postKick(...postReq("/participants/kick", { userId: "s1" }))
    const raw = JSON.stringify(await res.json())
    expect(raw).not.toMatch(/test-api-secret|test-api-key|roomAdmin|token/i)
  })
})

// ============================= 7. المطرود لا يعود =============================

describe("LIVE-9C — المطرود لا يستعيد الدخول", () => {
  it("طلب توكن جديد بعد الطرد → 403 برسالة الطرد", async () => {
    setUser({ id: "s1", role: "STUDENT" })
    mockSession()
    prismaMock.liveSessionAdmission.findUnique.mockResolvedValue({
      status: "kicked",
    } as never)

    const res = await getToken(...getReq("/token"))
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.admission).toBe("kicked")
    expect(body.error).toContain("إخراجك")
    expect(body.token).toBeUndefined()
  })

  it("attend مرفوض للمطرود بلا كتابة أي حضور", async () => {
    setUser({ id: "s1", role: "STUDENT" })
    mockSession()
    prismaMock.liveSessionAdmission.findUnique.mockResolvedValue({
      status: "kicked",
    } as never)

    const res = await postAttend(...postReq("/attend"))
    expect(res.status).toBe(403)
    expect(prismaMock.liveSessionAttendance.upsert).not.toHaveBeenCalled()
  })

  it("heartbeat مرفوض للمطرود بلا تأكيد حضور", async () => {
    setUser({ id: "s1", role: "STUDENT" })
    mockSession()
    prismaMock.liveSessionAdmission.findUnique.mockResolvedValue({
      status: "kicked",
    } as never)

    const res = await postHeartbeat(...postReq("/heartbeat"))
    expect(res.status).toBe(403)
    expect(prismaMock.liveSessionAttendance.upsert).not.toHaveBeenCalled()
  })

  it("الطالب الموافق عليه يسجّل حضوره كما كان", async () => {
    setUser({ id: "s1", role: "STUDENT" })
    mockSession()
    prismaMock.liveSessionAdmission.findUnique.mockResolvedValue({
      status: "approved",
    } as never)

    const res = await postAttend(...postReq("/attend"))
    expect(res.status).toBe(200)
    expect(prismaMock.liveSessionAttendance.upsert).toHaveBeenCalledTimes(1)
  })

  it("المعلم المالك لا يخضع لبوابة الدخول (لا سجل له)", async () => {
    setUser({ id: "t-user", role: "TEACHER", teacherId: "t1" })
    mockSession({ teacherId: "t1" })

    const res = await postHeartbeat(...postReq("/heartbeat"))
    expect(res.status).toBe(200)
    expect(prismaMock.liveSessionAdmission.findUnique).not.toHaveBeenCalled()
  })

  it("جلسة برابط خارجي: attend يبقى كما كان قبل LIVE-9C", async () => {
    setUser({ id: "s1", role: "STUDENT" })
    mockSession({ url: "https://youtu.be/abc" })

    const res = await postAttend(...postReq("/attend"))
    expect(res.status).toBe(200)
    expect(prismaMock.liveSessionAdmission.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.liveSessionAttendance.upsert).toHaveBeenCalledTimes(1)
  })

  it("fail-closed: تعذّر قراءة حالة الدخول → لا حضور", async () => {
    setUser({ id: "s1", role: "STUDENT" })
    mockSession()
    prismaMock.liveSessionAdmission.findUnique.mockRejectedValue(tableMissing() as never)

    const res = await postAttend(...postReq("/attend"))
    expect(res.status).toBe(503)
    expect(prismaMock.liveSessionAttendance.upsert).not.toHaveBeenCalled()
  })

  it("الطالب بلا طلب دخول لا يسجّل حضوراً في جلسة LiveKit", async () => {
    setUser({ id: "s1", role: "STUDENT" })
    mockSession()
    prismaMock.liveSessionAdmission.findUnique.mockResolvedValue(null as never)

    const res = await postAttend(...postReq("/attend"))
    expect(res.status).toBe(403)
    expect(prismaMock.liveSessionAttendance.upsert).not.toHaveBeenCalled()
  })
})

// ============================= 8. حدود السيرفر/العميل =============================

describe("LIVE-9C — أسرار LiveKit لا تصل إلى العميل", () => {
  /** كل ملفات .ts/.tsx تحت src */
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, out)
      else if (/\.tsx?$/.test(entry)) out.push(full)
    }
    return out
  }

  const files = walk(join(process.cwd(), "src"))
  const clientFiles = files.filter((f) => {
    const src = readFileSync(f, "utf8")
    return /^\s*["']use client["']/m.test(src)
  })

  it("لا يستورد أي ملف \"use client\" مهايئ إدارة LiveKit", () => {
    expect(clientFiles.length).toBeGreaterThan(0)
    const offenders = clientFiles.filter((f) =>
      /from\s+["'][^"']*livekit-admin["']/.test(readFileSync(f, "utf8"))
    )
    expect(offenders).toEqual([])
  })

  it("لا يلمس أي ملف \"use client\" السر أو RoomServiceClient", () => {
    const offenders = clientFiles.filter((f) => {
      const src = readFileSync(f, "utf8")
      return /LIVEKIT_API_SECRET|RoomServiceClient/.test(src)
    })
    expect(offenders).toEqual([])
  })

  it("لا يُمنح roomAdmin في أي توكن مشارك", () => {
    const tokenSources = files.filter((f) => /addGrant/.test(readFileSync(f, "utf8")))
    expect(tokenSources.length).toBeGreaterThan(0)
    for (const file of tokenSources) {
      expect(readFileSync(file, "utf8")).not.toMatch(/roomAdmin/)
    }
  })
})
