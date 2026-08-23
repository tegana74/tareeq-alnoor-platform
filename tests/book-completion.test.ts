import { describe, it, expect, vi, beforeEach } from "vitest"

const prismaMock = vi.hoisted(() => ({
  book: { findUnique: vi.fn() },
  bookView: { upsert: vi.fn() },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }))
const subs = vi.hoisted(() => ({ canAccessCourse: vi.fn() }))
vi.mock("@/lib/subscriptions", () => subs)

import { markBookCompletedAction } from "@/app/actions/books"
import { getCurrentUser } from "@/lib/auth"

function setUser(u: { id: string; role: string; teacherId?: null } | null) {
  vi.mocked(getCurrentUser).mockResolvedValue(
    u ? ({ firstName: "", lastName: "", ...u } as never) : (null as never)
  )
}

function formData(bookId = "b1") {
  const f = new FormData()
  f.set("bookId", bookId)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.book.findUnique.mockResolvedValue({
    id: "b1",
    isFree: false,
    section: { courseId: "c1" },
  })
  subs.canAccessCourse.mockResolvedValue(true)
})

describe("markBookCompletedAction security + idempotency", () => {
  it("guest → rejected", async () => {
    setUser(null)
    const res = await markBookCompletedAction(null, formData())
    expect(res.ok).toBe(false)
    expect(prismaMock.bookView.upsert).not.toHaveBeenCalled()
  })

  it("non-student → rejected", async () => {
    setUser({ id: "t1", role: "TEACHER" })
    const res = await markBookCompletedAction(null, formData())
    expect(res.ok).toBe(false)
    expect(prismaMock.bookView.upsert).not.toHaveBeenCalled()
  })

  it("paid book without access → rejected even if client spoofs ids", async () => {
    setUser({ id: "u1", role: "STUDENT" })
    subs.canAccessCourse.mockResolvedValue(false)
    const res = await markBookCompletedAction(null, formData())
    expect(res.ok).toBe(false)
    expect(res.error).toBe("غير مصرح")
    expect(prismaMock.bookView.upsert).not.toHaveBeenCalled()
  })

  it("free book bypasses subscription but still requires auth", async () => {
    setUser({ id: "u1", role: "STUDENT" })
    prismaMock.book.findUnique.mockResolvedValue({
      id: "b2",
      isFree: true,
      section: { courseId: "c1" },
    })
    const res = await markBookCompletedAction(null, formData("b2"))
    expect(res.ok).toBe(true)
    expect(subs.canAccessCourse).not.toHaveBeenCalled()
    expect(prismaMock.bookView.upsert).toHaveBeenCalledTimes(1)
  })

  it("authorized student → upsert with session userId (never client-supplied)", async () => {
    setUser({ id: "u1", role: "STUDENT" })
    const res = await markBookCompletedAction(null, formData())
    expect(res.ok).toBe(true)
    expect(prismaMock.bookView.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_bookId: { userId: "u1", bookId: "b1" } },
        update: expect.objectContaining({ isCompleted: true }),
        create: expect.objectContaining({ userId: "u1", isCompleted: true }),
      })
    )
  })

  it("duplicate submission safe (idempotent upsert, single call each time)", async () => {
    setUser({ id: "u1", role: "STUDENT" })
    await markBookCompletedAction(null, formData())
    const res2 = await markBookCompletedAction(null, formData())
    expect(res2.ok).toBe(true)
    expect(prismaMock.bookView.upsert).toHaveBeenCalledTimes(2)
  })

  it("missing/unknown bookId rejected", async () => {
    setUser({ id: "u1", role: "STUDENT" })
    prismaMock.book.findUnique.mockResolvedValue(null)
    expect((await markBookCompletedAction(null, formData("nope"))).ok).toBe(false)
    const empty = new FormData()
    expect((await markBookCompletedAction(null, empty)).ok).toBe(false)
  })
})
