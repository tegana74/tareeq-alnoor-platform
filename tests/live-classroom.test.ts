import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

const prismaMock = vi.hoisted(() => ({
  classroom: { findMany: vi.fn(), findUnique: vi.fn() },
  subscription: { findMany: vi.fn(), findFirst: vi.fn() },
  sessionBooking: { findMany: vi.fn(), findFirst: vi.fn() },
  liveSession: { findMany: vi.fn().mockResolvedValue([]) },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

import {
  CLASSROOM_STATUSES,
  LIVE_SESSION_STATUSES,
  canTransitionSessionStatus,
  canManageClassroom,
} from "@/lib/live-classroom/types"
import {
  listStudentClassrooms,
  getClassroomForUser,
} from "@/lib/live-classroom/classrooms"

describe("Live Classroom statuses (Phase 1 contracts)", () => {
  it("exposes the full spec'd status enums", () => {
    expect(CLASSROOM_STATUSES).toEqual(["active", "archived"])
    expect(LIVE_SESSION_STATUSES).toEqual([
      "scheduled", "waiting", "live", "ended", "recording", "archived", "cancelled",
    ])
  })

  it("valid lifecycle transitions only", () => {
    expect(canTransitionSessionStatus("scheduled", "live")).toBe(true)
    expect(canTransitionSessionStatus("live", "recording")).toBe(true)
    expect(canTransitionSessionStatus("ended", "archived")).toBe(true)
    expect(canTransitionSessionStatus("cancelled", "live")).toBe(false)
    expect(canTransitionSessionStatus("archived", "live")).toBe(false)
  })
})

describe("canManageClassroom (role scoping)", () => {
  const room = { teacherId: "t1" }

  it("admin manages any classroom; teacher owns-only; student never", () => {
    expect(canManageClassroom({ role: "ADMIN", teacherId: null }, room)).toBe(true)
    expect(canManageClassroom({ role: "TEACHER", teacherId: "t1" }, room)).toBe(true)
    expect(canManageClassroom({ role: "TEACHER", teacherId: "t2" }, room)).toBe(false)
    expect(canManageClassroom({ role: "STUDENT", teacherId: null }, room)).toBe(false)
    expect(canManageClassroom(null, room)).toBe(false)
  })
})

describe("listStudentClassrooms membership scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.subscription.findMany.mockResolvedValue([{ courseId: "c1" }])
    prismaMock.sessionBooking.findMany.mockResolvedValue([
      { session: { classroomId: "room-b" } },
      { session: { classroomId: null } }, // جلسة بلا قاعة تُتجاهل
    ])
    prismaMock.classroom.findMany.mockResolvedValue([
      {
        id: "room-a",
        teacherId: "t1",
        title: "قاعة النحو",
        description: null,
        status: "active",
        teacher: { name: "أستاذ أحمد" },
        course: { name: "كورس 1" },
        _count: { sessions: 3 },
      },
    ])
  })

  it("scopes by subscribed-course OR booked-session classrooms (single batched query)", async () => {
    const rooms = await listStudentClassrooms("u1")
    expect(rooms).toHaveLength(1)
    expect(rooms[0]).toMatchObject({
      id: "room-a",
      title: "قاعة النحو",
      upcomingCount: 3,
    })
    const whereArg = prismaMock.classroom.findMany.mock.calls[0][0].where
    expect(whereArg.OR).toEqual([
      { courseId: { in: ["c1"] } },
      { id: { in: ["room-b"] } },
    ])
    // دفعتان فقط قبل جلب القاعات — لا N+1
    expect(prismaMock.subscription.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.sessionBooking.findMany).toHaveBeenCalledTimes(1)
  })

  it("returns empty without any membership source", async () => {
    prismaMock.subscription.findMany.mockResolvedValue([])
    prismaMock.sessionBooking.findMany.mockResolvedValue([])
    expect(await listStudentClassrooms("u1")).toEqual([])
    expect(prismaMock.classroom.findMany).not.toHaveBeenCalled()
  })
})

describe("getClassroomForUser access matrix", () => {
  const row = {
    id: "room-a",
    teacherId: "t1",
    title: "قاعة النحو",
    description: null,
    status: "active",
    teacher: { name: "أ" },
    course: { name: "كورس" },
    sessions: [],
    _count: { sessions: 0 },
  }
  const roomRow = { ...row, courseId: "c1" }

  it("owner teacher passes; other teacher denied", async () => {
    prismaMock.classroom.findUnique.mockResolvedValue(roomRow)
    expect(
      await getClassroomForUser("room-a", { id: "u", role: "TEACHER", teacherId: "t1" })
    ).toMatchObject({ id: "room-a" })
    expect(
      await getClassroomForUser("room-a", { id: "u", role: "TEACHER", teacherId: "other" })
    ).toBeNull()
  })

  it("admin passes; student needs membership", async () => {
    prismaMock.classroom.findUnique.mockResolvedValue(roomRow)

    expect(
      await getClassroomForUser("room-a", { id: "a1", role: "ADMIN", teacherId: null })
    ).not.toBeNull()

    // طالب بلا اشتراك ولا حجز → رفض
    prismaMock.subscription.findFirst.mockResolvedValue(null)
    prismaMock.sessionBooking.findFirst.mockResolvedValue(null)
    expect(
      await getClassroomForUser("room-a", { id: "u1", role: "STUDENT", teacherId: null })
    ).toBeNull()

    // مشترك في كورس القاعة → دخول
    prismaMock.subscription.findFirst.mockResolvedValue({ id: "s9" })
    expect(
      await getClassroomForUser("room-a", { id: "u1", role: "STUDENT", teacherId: null })
    ).not.toBeNull()
  })

  it("archived classroom hidden from students even with membership", async () => {
    prismaMock.classroom.findUnique.mockResolvedValue({ ...roomRow, status: "archived" })
    prismaMock.subscription.findFirst.mockResolvedValue({ id: "s9" })
    expect(
      await getClassroomForUser("room-a", { id: "u1", role: "STUDENT", teacherId: null })
    ).toBeNull()
  })

  it("no sensitive broadcast fields in returned payload", async () => {
    prismaMock.classroom.findUnique.mockResolvedValue(roomRow)
    const room = await getClassroomForUser("room-a", { id: "a1", role: "ADMIN", teacherId: null })
    const serialized = JSON.stringify(room)
    for (const secret of ["url", "provider", "token", "password", "joinCode"]) {
      expect(serialized).not.toContain(`"${secret}"`)
    }
  })
})
