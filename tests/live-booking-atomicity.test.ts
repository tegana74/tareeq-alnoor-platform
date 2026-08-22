import { describe, it, expect, vi, beforeEach } from "vitest"

const mockPrisma = {
  $transaction: vi.fn(),
  liveSession: { findUnique: vi.fn() },
  sessionBooking: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
  walletTransaction: { create: vi.fn() },
  notification: { create: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}))

import { getCurrentUser } from "@/lib/auth"

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe("bookLiveSessionAction capacity", () => {
  it("checks capacity atomically inside transaction", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "u1", role: "STUDENT", firstName: "A",
    } as any)

    const futureDate = new Date(Date.now() + 86400000)
    mockPrisma.liveSession.findUnique.mockResolvedValue({
      id: "ls1", title: "Test", price: 100, isFree: false,
      maxCapacity: 2, startAt: futureDate, teacherId: "t1",
    })
    mockPrisma.sessionBooking.findUnique.mockResolvedValue(null)
    mockPrisma.sessionBooking.count.mockResolvedValue(1) // 1 of 2 spots used
    mockPrisma.user.findUnique.mockResolvedValue({ walletBalance: 500 })
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma))

    const { bookLiveSessionAction } = await import("@/app/actions/student-live")
    const fd = new FormData()
    fd.append("sessionId", "ls1")

    const result = await bookLiveSessionAction(null, fd)
    expect(result.ok).toBe(true)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    // Count is checked INSIDE transaction
    expect(mockPrisma.sessionBooking.count).toHaveBeenCalled()
  })

  it("rejects when capacity is full", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "u1", role: "STUDENT", firstName: "A",
    } as any)

    const futureDate = new Date(Date.now() + 86400000)
    mockPrisma.liveSession.findUnique.mockResolvedValue({
      id: "ls1", title: "Test", price: 100, isFree: false,
      maxCapacity: 2, startAt: futureDate, teacherId: "t1",
    })
    mockPrisma.sessionBooking.findUnique.mockResolvedValue(null)
    mockPrisma.sessionBooking.count.mockResolvedValue(2) // full
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma))

    const { bookLiveSessionAction } = await import("@/app/actions/student-live")
    const fd = new FormData()
    fd.append("sessionId", "ls1")

    const result = await bookLiveSessionAction(null, fd)
    expect(result.ok).toBe(false)
  })

  it("rejects when wallet balance is insufficient inside transaction", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "u1", role: "STUDENT", firstName: "A",
    } as any)

    const futureDate = new Date(Date.now() + 86400000)
    mockPrisma.liveSession.findUnique.mockResolvedValue({
      id: "ls1", title: "Test", price: 100, isFree: false,
      maxCapacity: 10, startAt: futureDate, teacherId: "t1",
    })
    mockPrisma.sessionBooking.findUnique.mockResolvedValue(null)
    mockPrisma.sessionBooking.count.mockResolvedValue(0)
    // Low balance inside transaction
    mockPrisma.user.findUnique.mockResolvedValue({ walletBalance: 10 })
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma))

    const { bookLiveSessionAction } = await import("@/app/actions/student-live")
    const fd = new FormData()
    fd.append("sessionId", "ls1")

    const result = await bookLiveSessionAction(null, fd)
    expect(result.ok).toBe(false)
  })
})
