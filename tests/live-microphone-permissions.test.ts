import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ============ LIVE-9E — Microphone Permissions + Mute All ============
// العقود المحمية هنا:
//   1. المنح/السحب server-authorized حصراً: المعلم المالك أو الأدمن فقط.
//   2. الطالب لا يمنح نفسه ولا غيره — لا يصل إلى ما بعد حراسة الملكية.
//   3. المنح لا يشمل إلا الميكروفون: الكاميرا/الشاشة/نشر البيانات تبقى محجوبة.
//   4. المطرود وغير المقبول والمعلم لا يُمنحون إطلاقاً.
//   5. لا حالة ميكروفون مخزَّنة: منحٌ لغير متصل لا يُحفظ ويُبلَّغ عنه بتحذير.
//   6. «كتم الجميع» يستهدف طلاب هذه الجلسة المتصلين وحدهم — لا المعلم ولا هوية
//      غريبة عن سجل الدخول — وتعذّر الوصول إلى LiveKit يُفشل الطلب صراحة.
//   7. العميل لا يفتح الميكروفون إلا بصلاحية من الغرفة نفسها، لا برسالة.
//
// النمط: Prisma مُموّه بالكامل + livekit-server-sdk و livekit-client وهميان
// (نفس عرف tests/live-room-participants.test.ts). لا مفاتيح حقيقية ولا شبكة.

const prismaMock = vi.hoisted(() => ({
  liveSession: {
    findUnique: vi.fn(),
  },
  liveSessionAdmission: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }))

const sdkMock = vi.hoisted(() => {
  const listParticipants = vi.fn()
  const updateParticipant = vi.fn()

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
    updateParticipant = updateParticipant
  }

  const ParticipantInfo_State = { JOINING: 0, JOINED: 1, ACTIVE: 2, DISCONNECTED: 3 }

  /** قيم مطابقة لـ enum TrackSource في @livekit/protocol */
  const TrackSource = {
    UNKNOWN: 0,
    CAMERA: 1,
    MICROPHONE: 2,
    SCREEN_SHARE: 3,
    SCREEN_SHARE_AUDIO: 4,
  }

  return {
    listParticipants,
    updateParticipant,
    ServerError,
    FakeRoomServiceClient,
    ParticipantInfo_State,
    TrackSource,
  }
})

vi.mock("livekit-server-sdk", () => ({
  RoomServiceClient: sdkMock.FakeRoomServiceClient,
  ServerError: sdkMock.ServerError,
  ParticipantInfo_State: sdkMock.ParticipantInfo_State,
  TrackSource: sdkMock.TrackSource,
}))

/** livekit-client وهمي — غرفة بأحداث قابلة للإطلاق يدوياً */
const lk = vi.hoisted(() => {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>()

  class FakeRoom {
    localParticipant: {
      identity: string
      permissions?: { canPublish?: boolean; canPublishSources?: number[] }
      setMicrophoneEnabled: ReturnType<typeof vi.fn>
    } = {
      identity: "s1",
      permissions: undefined,
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
    }

    on(evt: string, cb: (...args: unknown[]) => void) {
      if (!handlers.has(evt)) handlers.set(evt, new Set())
      handlers.get(evt)!.add(cb)
      return this
    }
    off(evt: string, cb: (...args: unknown[]) => void) {
      handlers.get(evt)?.delete(cb)
      return this
    }
    emit(evt: string, ...args: unknown[]) {
      for (const cb of handlers.get(evt) ?? []) cb(...args)
    }
    countListeners(evt: string) {
      return handlers.get(evt)?.size ?? 0
    }
  }

  return { FakeRoom, resetHandlers: () => handlers.clear() }
})

vi.mock("livekit-client", () => ({
  Room: lk.FakeRoom,
  RoomEvent: {
    ParticipantPermissionsChanged: "participantPermissionsChanged",
    LocalTrackPublished: "localTrackPublished",
    LocalTrackUnpublished: "localTrackUnpublished",
  },
  Track: { Source: { Microphone: "microphone" } },
}))

import { getCurrentUser } from "@/lib/auth"
import {
  canModerateMicrophoneTarget,
  describeMicNotApplied,
  describeMuteAllPartialFailure,
  MIC_GRANT_REVOKE_LIMIT,
  MIC_INVALID_ACTION,
  MIC_MUTE_ALL_LIMIT,
  MIC_RATE_LIMITED,
  MIC_ROOM_UNREACHABLE,
  MICROPHONE_ACTIONS,
  MICROPHONE_REFUSAL_RESPONSES,
  selectMuteAllTargets,
  toMicrophoneAction,
  type MicRefusalReason,
} from "@/lib/live-classroom/microphone-permissions"
import {
  bindMicrophonePermission,
  describeMicrophoneFailure,
  disableStudentMicrophone,
  enableStudentMicrophone,
  hasLocalMicrophonePermission,
  MICROPHONE_TRACK_SOURCE,
  readRoomMicrophonePermission,
} from "@/lib/live-classroom/student-microphone"
import {
  grantParticipantMicrophone,
  revokeParticipantMicrophone,
  toRoomParticipantSnapshot,
} from "@/lib/live-classroom/livekit-admin"
import { POST as postMicrophone } from "@/app/api/live/[id]/microphone/route"
import { POST as postMuteAll } from "@/app/api/live/[id]/microphone/mute-all/route"

// ============================= Helpers =============================

function setUser(u: { id: string; role: string; teacherId?: string | null } | null) {
  vi.mocked(getCurrentUser).mockResolvedValue(
    u
      ? ({
          firstName: "أحمد",
          middleName: null,
          lastName: "محمد",
          walletBalance: 0,
          teacherId: null,
          ...u,
        } as never)
      : (null as never)
  )
}

/** جلسة LiveKit افتراضية: بلا رابط خارجي = مُدارة بنظام الدخول */
function mockSession(overrides: Record<string, unknown> = {}) {
  prismaMock.liveSession.findUnique.mockResolvedValue({
    id: "live-1",
    teacherId: "t1",
    url: null,
    ...overrides,
  } as never)
}

/** هدف الإشراف: سجل الدخول + دور صاحبه كما يقرأهما readModerationTarget */
function mockTarget(
  admission: { status: string } | null,
  user: { role: string; teacherId: string | null } | null = {
    role: "STUDENT",
    teacherId: null,
  }
) {
  prismaMock.liveSessionAdmission.findUnique.mockResolvedValue(admission as never)
  prismaMock.user.findUnique.mockResolvedValue(user as never)
}

function rosterRows(rows: { userId: string; status?: string }[]) {
  prismaMock.liveSessionAdmission.findMany.mockResolvedValue(
    rows.map((r) => ({
      userId: r.userId,
      status: r.status ?? "approved",
      decidedAt: new Date("2026-08-28T10:00:00Z"),
      user: {
        firstName: "سارة",
        middleName: null,
        lastName: "علي",
        year: { name: "الثالث الثانوي" },
        department: null,
      },
    })) as never
  )
}

/** لقطة مشارك LiveKit كما تُعاد من listParticipants (بعد التحويل) */
function roomSnapshot(rows: { identity: string; connected?: boolean; mic?: boolean }[]) {
  sdkMock.listParticipants.mockResolvedValue(
    rows.map((r) => ({
      identity: r.identity,
      state:
        r.connected === false
          ? sdkMock.ParticipantInfo_State.DISCONNECTED
          : sdkMock.ParticipantInfo_State.ACTIVE,
      joinedAt: BigInt(0),
      joinedAtMs: BigInt(1_700_000_000_000),
      permission: r.mic
        ? { canPublish: true, canPublishSources: [sdkMock.TrackSource.MICROPHONE] }
        : { canPublish: false, canPublishSources: [] },
      tracks: [],
    })) as never
  )
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

/**
 * حد المعدل يعيش في وحدة مشتركة على مستوى العملية، فلكل اختبار معلّم بهوية
 * فريدة — وإلا سرّبت اختبارات الحد فشلاً إلى ما بعدها.
 */
let teacherSeq = 0
function freshTeacher() {
  teacherSeq += 1
  const id = `teacher-${teacherSeq}`
  setUser({ id, role: "TEACHER", teacherId: "t1" })
  return id
}

beforeEach(() => {
  vi.clearAllMocks()
  lk.resetHandlers()
  sdkMock.FakeRoomServiceClient._constructorArgs = []

  // مفاتيح وهمية — لا أسرار حقيقية في الاختبارات ولا في السجلات
  process.env.LIVEKIT_API_KEY = "test-api-key"
  process.env.LIVEKIT_API_SECRET = "test-api-secret"
  process.env.NEXT_PUBLIC_LIVEKIT_URL = "wss://test.livekit.local"

  mockSession()
  mockTarget({ status: "approved" })
  rosterRows([{ userId: "s1" }])
  roomSnapshot([])
  sdkMock.updateParticipant.mockResolvedValue(undefined)
  freshTeacher()
})

// ===================== 1. سياسة المنح (دالة خالصة) =====================

const approvedStudent = {
  sessionUrl: null as string | null,
  targetUserId: "s1" as unknown,
  targetRole: "STUDENT" as string | null,
  targetIsManager: false,
  hasAdmissionRecord: true,
  admission: "approved" as never,
}

describe("LIVE-9E — canModerateMicrophoneTarget", () => {
  it("طالب مقبول في جلسة مُدارة = مسموح", () => {
    expect(canModerateMicrophoneTarget(approvedStudent)).toEqual({ ok: true })
  })

  it("هوية غير صالحة تُرفض قبل أي فحص آخر", () => {
    for (const bad of [undefined, null, "", 42, {}, []]) {
      expect(
        canModerateMicrophoneTarget({ ...approvedStudent, targetUserId: bad })
      ).toEqual({ ok: false, reason: "invalid-target" })
    }
  })

  it("جلسة برابط خارجي لا غرفة لها = مرفوض", () => {
    expect(
      canModerateMicrophoneTarget({
        ...approvedStudent,
        sessionUrl: "https://youtu.be/abc",
      })
    ).toEqual({ ok: false, reason: "not-managed" })
  })

  it("المعلم أو الأدمن لا يُمنح ميكروفوناً بهذا المسار", () => {
    expect(
      canModerateMicrophoneTarget({
        ...approvedStudent,
        targetRole: "TEACHER",
        targetIsManager: true,
      })
    ).toEqual({ ok: false, reason: "manager" })
  })

  it("دور غير STUDENT (ولو لم يكن مدير الجلسة) = مرفوض", () => {
    expect(
      canModerateMicrophoneTarget({ ...approvedStudent, targetRole: "TEACHER" })
    ).toEqual({ ok: false, reason: "not-student" })
    expect(canModerateMicrophoneTarget({ ...approvedStudent, targetRole: null })).toEqual({
      ok: false,
      reason: "not-student",
    })
  })

  it("لا سجل دخول في هذه الجلسة = مرفوض", () => {
    expect(
      canModerateMicrophoneTarget({ ...approvedStudent, hasAdmissionRecord: false })
    ).toEqual({ ok: false, reason: "no-record" })
  })

  it("المطرود يُرفض بسبب الطرد صراحة", () => {
    expect(
      canModerateMicrophoneTarget({ ...approvedStudent, admission: "kicked" as never })
    ).toEqual({ ok: false, reason: "kicked" })
  })

  it("كل حالة غير approved تُرفض (pending / rejected / none)", () => {
    for (const state of ["pending", "rejected", "none"]) {
      expect(
        canModerateMicrophoneTarget({ ...approvedStudent, admission: state as never })
      ).toEqual({ ok: false, reason: "not-approved" })
    }
  })

  it("لكل سبب رفض رسالة عربية ورمز حالة صالح", () => {
    const reasons: MicRefusalReason[] = [
      "invalid-target",
      "not-managed",
      "manager",
      "not-student",
      "no-record",
      "not-approved",
      "kicked",
    ]
    for (const reason of reasons) {
      const refusal = MICROPHONE_REFUSAL_RESPONSES[reason]
      expect(refusal.status).toBeGreaterThanOrEqual(400)
      expect(refusal.status).toBeLessThan(500)
      expect(refusal.error.length).toBeGreaterThan(0)
      // لا تفاصيل تقنية في رسائل المستخدم
      expect(refusal.error.toLowerCase()).not.toContain("livekit")
    }
  })
})

describe("LIVE-9E — toMicrophoneAction", () => {
  it("grant و revoke فقط", () => {
    expect(MICROPHONE_ACTIONS).toEqual(["grant", "revoke"])
    expect(toMicrophoneAction("grant")).toBe("grant")
    expect(toMicrophoneAction("revoke")).toBe("revoke")
  })

  it("أي قيمة أخرى → null بلا افتراض ضمني", () => {
    for (const bad of ["GRANT", "Revoke", "mute", "", " grant", null, undefined, 1, {}, []]) {
      expect(toMicrophoneAction(bad)).toBeNull()
    }
  })
})

// ===================== 2. أهداف «كتم الجميع» (دالة خالصة) =====================

describe("LIVE-9E — selectMuteAllTargets", () => {
  const room = [
    { identity: "s1", connected: true, micGranted: true },
    { identity: "s2", connected: true, micGranted: false },
    { identity: "s3", connected: false, micGranted: true },
    { identity: "teacher-1", connected: true, micGranted: true },
    { identity: "ghost", connected: true, micGranted: true },
  ]

  it("المتصلون المالكون للصلاحية من سجل هذه الجلسة فقط", () => {
    expect(selectMuteAllTargets({ rosterUserIds: ["s1", "s2", "s3"], room })).toEqual([
      "s1",
    ])
  })

  it("المعلم والهويات الغريبة عن سجل الدخول لا تُستهدف", () => {
    const targets = selectMuteAllTargets({ rosterUserIds: ["s1", "s2", "s3"], room })
    expect(targets).not.toContain("teacher-1")
    expect(targets).not.toContain("ghost")
  })

  it("غرفة فارغة أو سجل فارغ = لا أهداف", () => {
    expect(selectMuteAllTargets({ rosterUserIds: ["s1"], room: [] })).toEqual([])
    expect(selectMuteAllTargets({ rosterUserIds: [], room })).toEqual([])
  })
})

describe("LIVE-9E — رسائل التحذير", () => {
  it("منح لطالب غير متصل يُشرح صراحة أنه لا يُحفظ", () => {
    expect(describeMicNotApplied("not_connected")).toContain("غير متصل")
    expect(describeMicNotApplied("rpc_failed")).toContain("أعد المحاولة")
  })

  it("فشل جزئي في الكتم يذكر العدد", () => {
    expect(describeMuteAllPartialFailure(3)).toContain("3")
  })

  it("رسائل الحد والخدمة برموز HTTP صحيحة", () => {
    expect(MIC_RATE_LIMITED.status).toBe(429)
    expect(MIC_ROOM_UNREACHABLE.status).toBe(503)
    expect(MIC_INVALID_ACTION.status).toBe(400)
    expect(MIC_GRANT_REVOKE_LIMIT.max).toBeGreaterThan(0)
    expect(MIC_MUTE_ALL_LIMIT.max).toBeGreaterThan(0)
  })
})

// ===================== 3. ميكروفون الطالب (العميل) =====================

describe("LIVE-9E — hasLocalMicrophonePermission", () => {
  it("قيمة MICROPHONE في TrackSource مثبَّتة على 2", () => {
    expect(MICROPHONE_TRACK_SOURCE).toBe(2)
  })

  it("بلا صلاحيات أو بلا canPublish = ممنوع", () => {
    expect(hasLocalMicrophonePermission(undefined)).toBe(false)
    expect(hasLocalMicrophonePermission(null)).toBe(false)
    expect(hasLocalMicrophonePermission({})).toBe(false)
    expect(hasLocalMicrophonePermission({ canPublish: false, canPublishSources: [2] })).toBe(
      false
    )
  })

  it("canPublish بلا قائمة مصادر = كل المصادر مسموحة (دلالات LiveKit)", () => {
    expect(hasLocalMicrophonePermission({ canPublish: true })).toBe(true)
    expect(hasLocalMicrophonePermission({ canPublish: true, canPublishSources: [] })).toBe(
      true
    )
  })

  it("قائمة مصادر بلا ميكروفون = ممنوع", () => {
    expect(hasLocalMicrophonePermission({ canPublish: true, canPublishSources: [1] })).toBe(
      false
    )
    expect(
      hasLocalMicrophonePermission({ canPublish: true, canPublishSources: [1, 3] })
    ).toBe(false)
    expect(hasLocalMicrophonePermission({ canPublish: true, canPublishSources: [2] })).toBe(
      true
    )
  })
})

describe("LIVE-9E — readRoomMicrophonePermission", () => {
  it("غرفة غير موجودة = ممنوع (الحالة الافتراضية)", () => {
    expect(readRoomMicrophonePermission(null)).toBe(false)
    expect(readRoomMicrophonePermission(undefined)).toBe(false)
  })

  it("تُقرأ من صلاحيات المشارك المحلي لا من حالة محلية", () => {
    const room = new lk.FakeRoom()
    expect(readRoomMicrophonePermission(room as never)).toBe(false)
    room.localParticipant.permissions = { canPublish: true, canPublishSources: [2] }
    expect(readRoomMicrophonePermission(room as never)).toBe(true)
  })
})

describe("LIVE-9E — bindMicrophonePermission", () => {
  it("تغيّر صلاحية المشارك المحلي يصل إلى الواجهة", () => {
    const room = new lk.FakeRoom()
    const seen: boolean[] = []
    bindMicrophonePermission(room as never, (g) => seen.push(g))

    room.emit("participantPermissionsChanged", undefined, {
      identity: "s1",
      permissions: { canPublish: true, canPublishSources: [2] },
    })
    room.emit("participantPermissionsChanged", undefined, {
      identity: "s1",
      permissions: { canPublish: false, canPublishSources: [] },
    })

    expect(seen).toEqual([true, false])
  })

  it("صلاحيات طالب آخر تُتجاهل تماماً", () => {
    const room = new lk.FakeRoom()
    const onChange = vi.fn()
    bindMicrophonePermission(room as never, onChange)

    room.emit("participantPermissionsChanged", undefined, {
      identity: "s2",
      permissions: { canPublish: true, canPublishSources: [2] },
    })

    expect(onChange).not.toHaveBeenCalled()
  })

  it("الإلغاء يزيل المستمع فلا يبقى معلّقاً على غرفة مهجورة", () => {
    const room = new lk.FakeRoom()
    const onChange = vi.fn()
    const detach = bindMicrophonePermission(room as never, onChange)
    expect(room.countListeners("participantPermissionsChanged")).toBe(1)

    detach()
    expect(room.countListeners("participantPermissionsChanged")).toBe(0)
    room.emit("participantPermissionsChanged", undefined, {
      identity: "s1",
      permissions: { canPublish: true },
    })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe("LIVE-9E — تشغيل/إيقاف ميكروفون الطالب", () => {
  it("بلا صلاحية: لا يُطلب إذن المتصفح ولا يُنشر شيء", async () => {
    const room = new lk.FakeRoom()
    const result = await enableStudentMicrophone(room as never)

    expect(result.ok).toBe(false)
    expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled()
  })

  it("بصلاحية: يُشغَّل الميكروفون", async () => {
    const room = new lk.FakeRoom()
    room.localParticipant.permissions = { canPublish: true, canPublishSources: [2] }

    await expect(enableStudentMicrophone(room as never)).resolves.toEqual({ ok: true })
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true)
  })

  it("رفض المتصفح يُترجم إلى رسالة عربية لا استثناء", async () => {
    const room = new lk.FakeRoom()
    room.localParticipant.permissions = { canPublish: true }
    room.localParticipant.setMicrophoneEnabled.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { name: "NotAllowedError" })
    )

    const result = await enableStudentMicrophone(room as never)
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("المتصفح منع الوصول"),
    })
  })

  it("الإيقاف لا يرمي أبداً ولو كانت الغرفة في حالة انتقالية", async () => {
    const room = new lk.FakeRoom()
    room.localParticipant.setMicrophoneEnabled.mockRejectedValueOnce(new Error("boom"))
    await expect(disableStudentMicrophone(room as never)).resolves.toBeUndefined()
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false)
  })

  it("أخطاء الأجهزة تُترجم بلا كشف تفاصيل تقنية", () => {
    const cases: [string, string][] = [
      ["NotAllowedError", "المتصفح منع الوصول"],
      ["PermissionDeniedError", "المتصفح منع الوصول"],
      ["NotFoundError", "لا يوجد ميكروفون"],
      ["DevicesExhaustedError", "لا يوجد ميكروفون"],
      ["NotReadableError", "مستخدم بواسطة تطبيق آخر"],
    ]
    for (const [name, expected] of cases) {
      const message = describeMicrophoneFailure(
        Object.assign(new Error("x"), { name })
      )
      expect(message).toContain(expected)
    }
    expect(describeMicrophoneFailure(new Error("weird"))).toContain("تعذر تشغيل الميكروفون")
    expect(describeMicrophoneFailure(undefined)).toContain("تعذر تشغيل الميكروفون")
  })
})

// ===================== 4. مهايئ LiveKit (السيرفر) =====================

describe("LIVE-9E — grant/revokeParticipantMicrophone", () => {
  it("المنح يقتصر على الميكروفون: لا كاميرا ولا شاشة ولا نشر بيانات", async () => {
    await expect(grantParticipantMicrophone("live-1", "s1")).resolves.toEqual({
      applied: true,
    })

    expect(sdkMock.updateParticipant).toHaveBeenCalledWith("live-1", "s1", {
      permission: {
        canSubscribe: true,
        canPublish: true,
        canPublishData: false,
        canPublishSources: [sdkMock.TrackSource.MICROPHONE],
      },
    })
  })

  it("السحب يُلغي canPublish نفسه لا mute المسار فقط", async () => {
    await expect(revokeParticipantMicrophone("live-1", "s1")).resolves.toEqual({
      applied: true,
    })

    expect(sdkMock.updateParticipant).toHaveBeenCalledWith("live-1", "s1", {
      permission: {
        canSubscribe: true,
        canPublish: false,
        canPublishData: false,
        canPublishSources: [],
      },
    })
  })

  it("مشارك غير موجود في الغرفة = not_connected (لا يُحفظ المنح)", async () => {
    sdkMock.updateParticipant.mockRejectedValueOnce(
      new sdkMock.ServerError("not found", 404, "not_found")
    )
    await expect(grantParticipantMicrophone("live-1", "s1")).resolves.toEqual({
      applied: false,
      reason: "not_connected",
    })
  })

  it("أي فشل آخر = rpc_failed بلا رمي", async () => {
    sdkMock.updateParticipant.mockRejectedValueOnce(new Error("network down"))
    await expect(revokeParticipantMicrophone("live-1", "s1")).resolves.toEqual({
      applied: false,
      reason: "rpc_failed",
    })
  })

  it("مفاتيح ناقصة: لا يُنشأ عميل ولا تُطلب الشبكة", async () => {
    delete process.env.LIVEKIT_API_SECRET
    await expect(grantParticipantMicrophone("live-1", "s1")).resolves.toEqual({
      applied: false,
      reason: "rpc_failed",
    })
    expect(sdkMock.FakeRoomServiceClient._constructorArgs).toHaveLength(0)
    expect(sdkMock.updateParticipant).not.toHaveBeenCalled()
  })
})

describe("LIVE-9E — toRoomParticipantSnapshot يعرض حالة الميكروفون", () => {
  function info(overrides: Record<string, unknown>) {
    return toRoomParticipantSnapshot({
      identity: "s1",
      state: sdkMock.ParticipantInfo_State.ACTIVE,
      joinedAt: BigInt(0),
      joinedAtMs: BigInt(1_700_000_000_000),
      permission: { canPublish: false, canPublishSources: [] },
      tracks: [],
      ...overrides,
    } as never)
  }

  it("micGranted تُقرأ من صلاحية الغرفة لا من قاعدة البيانات", () => {
    expect(info({}).micGranted).toBe(false)
    expect(
      info({
        permission: {
          canPublish: true,
          canPublishSources: [sdkMock.TrackSource.MICROPHONE],
        },
      }).micGranted
    ).toBe(true)
    // canPublish بلا ميكروفون في المصادر (كاميرا المعلم مثلاً) لا يُعد منحاً
    expect(
      info({
        permission: { canPublish: true, canPublishSources: [sdkMock.TrackSource.CAMERA] },
      }).micGranted
    ).toBe(false)
  })

  // LIVE-9F — تفسير واحد للطرفين: الفارغة = كل المصادر مسموحة (دلالة LiveKit)
  it("canPublishSources الفارغة مع canPublish تُقرأ صلاحية قائمة على الطرفين", () => {
    expect(
      info({ permission: { canPublish: true, canPublishSources: [] } }).micGranted
    ).toBe(true)
    expect(info({ permission: { canPublish: true } }).micGranted).toBe(true)
    // نفس النتيجة في قارئ العميل — لا انقسام بين السيرفر والعميل بعد الآن
    expect(hasLocalMicrophonePermission({ canPublish: true, canPublishSources: [] })).toBe(
      true
    )
    expect(hasLocalMicrophonePermission({ canPublish: true })).toBe(true)
    // ولا يوسّع ذلك أي صلاحية: canPublish=false يبقى منعاً على الطرفين
    expect(
      info({ permission: { canPublish: false, canPublishSources: [] } }).micGranted
    ).toBe(false)
    expect(hasLocalMicrophonePermission({ canPublish: false, canPublishSources: [] })).toBe(
      false
    )
  })

  it("micActive تعني مسار ميكروفون منشور غير مكتوم", () => {
    expect(
      info({
        tracks: [{ source: sdkMock.TrackSource.MICROPHONE, muted: false }],
      }).micActive
    ).toBe(true)
    expect(
      info({
        tracks: [{ source: sdkMock.TrackSource.MICROPHONE, muted: true }],
      }).micActive
    ).toBe(false)
    expect(
      info({ tracks: [{ source: sdkMock.TrackSource.CAMERA, muted: false }] }).micActive
    ).toBe(false)
  })
})

// ===================== 5. POST /api/live/[id]/microphone =====================

describe("LIVE-9E — POST /microphone", () => {
  it("زائر بلا جلسة = 401", async () => {
    setUser(null)
    const res = await postMicrophone(...postReq("/microphone", { userId: "s1", action: "grant" }))
    expect(res.status).toBe(401)
    expect(sdkMock.updateParticipant).not.toHaveBeenCalled()
  })

  it("جلسة غير موجودة = 404", async () => {
    prismaMock.liveSession.findUnique.mockResolvedValue(null as never)
    const res = await postMicrophone(...postReq("/microphone", { userId: "s1", action: "grant" }))
    expect(res.status).toBe(404)
  })

  it("الطالب لا يمنح نفسه الميكروفون = 403", async () => {
    setUser({ id: "s1", role: "STUDENT" })
    const res = await postMicrophone(...postReq("/microphone", { userId: "s1", action: "grant" }))
    expect(res.status).toBe(403)
    expect(sdkMock.updateParticipant).not.toHaveBeenCalled()
  })

  it("معلم آخر لا يملك الجلسة = 403", async () => {
    setUser({ id: "teacher-x", role: "TEACHER", teacherId: "t2" })
    const res = await postMicrophone(...postReq("/microphone", { userId: "s1", action: "grant" }))
    expect(res.status).toBe(403)
    expect(sdkMock.updateParticipant).not.toHaveBeenCalled()
  })

  it("الأدمن مسموح له", async () => {
    setUser({ id: "admin-1", role: "ADMIN" })
    const res = await postMicrophone(...postReq("/microphone", { userId: "s1", action: "grant" }))
    expect(res.status).toBe(200)
  })

  it("إجراء غير معروف = 400 بلا نداء LiveKit", async () => {
    for (const action of ["mute", "GRANT", undefined, 1]) {
      sdkMock.updateParticipant.mockClear()
      freshTeacher()
      const res = await postMicrophone(...postReq("/microphone", { userId: "s1", action }))
      expect(res.status).toBe(400)
      expect(sdkMock.updateParticipant).not.toHaveBeenCalled()
    }
  })

  it("هوية طالب ناقصة = 400", async () => {
    const res = await postMicrophone(...postReq("/microphone", { action: "grant" }))
    expect(res.status).toBe(400)
    expect(sdkMock.updateParticipant).not.toHaveBeenCalled()
  })

  it("جلسة برابط خارجي = 400 (لا غرفة LiveKit)", async () => {
    mockSession({ url: "https://youtu.be/abc" })
    const res = await postMicrophone(...postReq("/microphone", { userId: "s1", action: "grant" }))
    expect(res.status).toBe(400)
    expect(sdkMock.updateParticipant).not.toHaveBeenCalled()
  })

  it("المطرود لا يُمنح = 403", async () => {
    mockTarget({ status: "kicked" })
    const res = await postMicrophone(...postReq("/microphone", { userId: "s1", action: "grant" }))
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.error).toBe(MICROPHONE_REFUSAL_RESPONSES.kicked.error)
    expect(sdkMock.updateParticipant).not.toHaveBeenCalled()
  })

  it("طالب لم يُقبل بعد لا يُمنح = 403", async () => {
    mockTarget({ status: "pending" })
    const res = await postMicrophone(...postReq("/microphone", { userId: "s1", action: "grant" }))
    expect(res.status).toBe(403)
    expect(sdkMock.updateParticipant).not.toHaveBeenCalled()
  })

  it("طالب بلا سجل دخول في هذه الجلسة = 404", async () => {
    mockTarget(null)
    const res = await postMicrophone(...postReq("/microphone", { userId: "s9", action: "grant" }))
    expect(res.status).toBe(404)
    expect(sdkMock.updateParticipant).not.toHaveBeenCalled()
  })

  it("استهداف معلم الجلسة نفسه = 403", async () => {
    mockTarget({ status: "approved" }, { role: "TEACHER", teacherId: "t1" })
    const res = await postMicrophone(...postReq("/microphone", { userId: "t1u", action: "grant" }))
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.error).toBe(MICROPHONE_REFUSAL_RESPONSES.manager.error)
  })

  it("الدور يُقرأ من قاعدة البيانات لا من جسم الطلب", async () => {
    mockTarget({ status: "approved" }, { role: "ADMIN", teacherId: null })
    const res = await postMicrophone(
      ...postReq("/microphone", { userId: "a1", action: "grant", role: "STUDENT" })
    )
    expect(res.status).toBe(403)
    expect(sdkMock.updateParticipant).not.toHaveBeenCalled()
  })

  it("منح ناجح: micGranted=true وصلاحية ميكروفون فقط", async () => {
    const res = await postMicrophone(...postReq("/microphone", { userId: "s1", action: "grant" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      userId: "s1",
      action: "grant",
      applied: true,
      micGranted: true,
    })
    expect(body.warning).toBeUndefined()
    expect(sdkMock.updateParticipant).toHaveBeenCalledWith("live-1", "s1", {
      permission: expect.objectContaining({
        canPublish: true,
        canPublishData: false,
        canPublishSources: [sdkMock.TrackSource.MICROPHONE],
      }),
    })
  })

  it("منح لطالب غير متصل لا يُحفظ: micGranted=false + تحذير", async () => {
    sdkMock.updateParticipant.mockRejectedValueOnce(
      new sdkMock.ServerError("not found", 404, "not_found")
    )
    const res = await postMicrophone(...postReq("/microphone", { userId: "s1", action: "grant" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.applied).toBe(false)
    expect(body.micGranted).toBe(false)
    expect(body.warning).toBe(describeMicNotApplied("not_connected"))
  })

  it("سحب ناجح: micGranted=false", async () => {
    const res = await postMicrophone(...postReq("/microphone", { userId: "s1", action: "revoke" }))
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, action: "revoke", applied: true, micGranted: false })
    expect(sdkMock.updateParticipant).toHaveBeenCalledWith("live-1", "s1", {
      permission: expect.objectContaining({ canPublish: false, canPublishSources: [] }),
    })
  })

  // LIVE-9F — لا تُعلَن حالة لا دليل عليها: فشل RPC = غير معروفة (null)
  it("سحب فاشل (rpc_failed) لا يدّعي أن الميكروفون سُحب: micGranted=null", async () => {
    sdkMock.updateParticipant.mockRejectedValueOnce(new Error("network down"))
    const res = await postMicrophone(...postReq("/microphone", { userId: "s1", action: "revoke" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.applied).toBe(false)
    expect(body.micGranted).toBeNull()
    expect(body.warning).toBe(describeMicNotApplied("rpc_failed"))
  })

  it("منح فاشل (rpc_failed) كذلك غير معروف: micGranted=null", async () => {
    sdkMock.updateParticipant.mockRejectedValueOnce(new Error("network down"))
    const res = await postMicrophone(...postReq("/microphone", { userId: "s1", action: "grant" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.applied).toBe(false)
    expect(body.micGranted).toBeNull()
    expect(body.warning).toBe(describeMicNotApplied("rpc_failed"))
  })

  it("سحب لطالب غير متصل: micGranted=false مُثبَتة لا تخمين", async () => {
    sdkMock.updateParticipant.mockRejectedValueOnce(
      new sdkMock.ServerError("not found", 404, "not_found")
    )
    const res = await postMicrophone(...postReq("/microphone", { userId: "s1", action: "revoke" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.applied).toBe(false)
    expect(body.micGranted).toBe(false)
    expect(body.warning).toBe(describeMicNotApplied("not_connected"))
  })

  it("جدول طلبات الدخول مفقود = 503 fail-closed", async () => {
    prismaMock.liveSessionAdmission.findUnique.mockRejectedValue(tableMissing() as never)
    const res = await postMicrophone(...postReq("/microphone", { userId: "s1", action: "grant" }))
    expect(res.status).toBe(503)
    expect(sdkMock.updateParticipant).not.toHaveBeenCalled()
  })

  it("حد المعدل يُفعَّل بعد الحصة المسموحة", async () => {
    freshTeacher()
    for (let i = 0; i < MIC_GRANT_REVOKE_LIMIT.max; i += 1) {
      const ok = await postMicrophone(
        ...postReq("/microphone", { userId: "s1", action: "grant" })
      )
      expect(ok.status).toBe(200)
    }
    const limited = await postMicrophone(
      ...postReq("/microphone", { userId: "s1", action: "grant" })
    )
    expect(limited.status).toBe(429)
  })
})

// ===================== 6. POST /api/live/[id]/microphone/mute-all =====================

describe("LIVE-9E — POST /microphone/mute-all", () => {
  it("زائر بلا جلسة = 401", async () => {
    setUser(null)
    const res = await postMuteAll(...postReq("/microphone/mute-all"))
    expect(res.status).toBe(401)
  })

  it("جلسة غير موجودة = 404", async () => {
    prismaMock.liveSession.findUnique.mockResolvedValue(null as never)
    const res = await postMuteAll(...postReq("/microphone/mute-all"))
    expect(res.status).toBe(404)
  })

  it("الطالب لا يكتم أحداً = 403", async () => {
    setUser({ id: "s1", role: "STUDENT" })
    const res = await postMuteAll(...postReq("/microphone/mute-all"))
    expect(res.status).toBe(403)
    expect(sdkMock.updateParticipant).not.toHaveBeenCalled()
  })

  it("معلم آخر لا يملك الجلسة = 403", async () => {
    setUser({ id: "teacher-x", role: "TEACHER", teacherId: "t2" })
    const res = await postMuteAll(...postReq("/microphone/mute-all"))
    expect(res.status).toBe(403)
  })

  it("جلسة برابط خارجي = 400 بلا قراءة الغرفة", async () => {
    mockSession({ url: "https://meet.google.com/abc" })
    const res = await postMuteAll(...postReq("/microphone/mute-all"))
    expect(res.status).toBe(400)
    expect(sdkMock.listParticipants).not.toHaveBeenCalled()
  })

  it("تعذّر الوصول إلى LiveKit = 503 ولا يُقال إن الجميع كُتم", async () => {
    sdkMock.listParticipants.mockRejectedValueOnce(new Error("rpc down"))
    const res = await postMuteAll(...postReq("/microphone/mute-all"))
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.error).toBe(MIC_ROOM_UNREACHABLE.error)
    expect(body.ok).toBeUndefined()
    expect(sdkMock.updateParticipant).not.toHaveBeenCalled()
  })

  it("مفاتيح LiveKit ناقصة = 503", async () => {
    delete process.env.LIVEKIT_API_SECRET
    const res = await postMuteAll(...postReq("/microphone/mute-all"))
    expect(res.status).toBe(503)
  })

  it("يكتم الطلاب المتصلين المالكين للصلاحية فقط — لا المعلم ولا هوية غريبة", async () => {
    rosterRows([{ userId: "s1" }, { userId: "s2" }, { userId: "s3" }])
    roomSnapshot([
      { identity: "s1", mic: true },
      { identity: "s2", mic: false },
      { identity: "s3", connected: false, mic: true },
      { identity: "teacher-owner", mic: true },
      { identity: "ghost", mic: true },
    ])

    const res = await postMuteAll(...postReq("/microphone/mute-all"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, revoked: 1, failed: 0 })
    expect(body.warning).toBeUndefined()
    expect(sdkMock.updateParticipant).toHaveBeenCalledTimes(1)
    expect(sdkMock.updateParticipant).toHaveBeenCalledWith("live-1", "s1", {
      permission: expect.objectContaining({ canPublish: false, canPublishSources: [] }),
    })
  })

  it("لا أحد يملك الصلاحية = نداء ناجح بلا أي تعديل", async () => {
    roomSnapshot([{ identity: "s1", mic: false }])
    const res = await postMuteAll(...postReq("/microphone/mute-all"))
    const body = await res.json()

    expect(body).toMatchObject({ ok: true, revoked: 0, failed: 0 })
    expect(sdkMock.updateParticipant).not.toHaveBeenCalled()
  })

  it("فشل جزئي يُبلَّغ بعدده ولا يُخفى", async () => {
    rosterRows([{ userId: "s1" }, { userId: "s2" }])
    roomSnapshot([
      { identity: "s1", mic: true },
      { identity: "s2", mic: true },
    ])
    sdkMock.updateParticipant
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("rpc failed"))

    const res = await postMuteAll(...postReq("/microphone/mute-all"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ revoked: 1, failed: 1 })
    expect(body.warning).toBe(describeMuteAllPartialFailure(1))
  })

  it("جدول طلبات الدخول مفقود = 503 fail-closed", async () => {
    prismaMock.liveSessionAdmission.findMany.mockRejectedValueOnce(tableMissing() as never)
    const res = await postMuteAll(...postReq("/microphone/mute-all"))
    expect(res.status).toBe(503)
    expect(sdkMock.updateParticipant).not.toHaveBeenCalled()
  })

  it("حد المعدل أضيق من المنح الفردي", async () => {
    freshTeacher()
    for (let i = 0; i < MIC_MUTE_ALL_LIMIT.max; i += 1) {
      const ok = await postMuteAll(...postReq("/microphone/mute-all"))
      expect(ok.status).toBe(200)
    }
    const limited = await postMuteAll(...postReq("/microphone/mute-all"))
    expect(limited.status).toBe(429)
    expect(MIC_MUTE_ALL_LIMIT.max).toBeLessThan(MIC_GRANT_REVOKE_LIMIT.max)
  })
})
