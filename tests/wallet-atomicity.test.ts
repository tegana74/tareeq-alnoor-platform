import { describe, it, expect, vi, beforeEach } from "vitest"

const mockPrisma = {
  $transaction: vi.fn(),
  user: { findUnique: vi.fn(), update: vi.fn() },
  insertCode: { findUnique: vi.fn(), update: vi.fn() },
  insertCodeUsage: { create: vi.fn() },
  walletTransaction: { create: vi.fn() },
  course: { findUnique: vi.fn() },
  invoice: { create: vi.fn() },
  subscription: { create: vi.fn() },
  notification: { createMany: vi.fn(), create: vi.fn() },
  coupon: { findUnique: vi.fn(), updateMany: vi.fn() },
  paymentProof: { create: vi.fn(), update: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}))
vi.mock("@/lib/subscriptions", () => ({
  isSubscribed: vi.fn().mockResolvedValue(false),
}))

import { getCurrentUser } from "@/lib/auth"

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe("payFromWalletAction atomicity", () => {
  it("wraps deduction in $transaction", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "u1", role: "STUDENT", firstName: "A",
    } as any)
    mockPrisma.course.findUnique.mockResolvedValue({ id: "c1", name: "X", price: 200 })
    mockPrisma.user.findUnique.mockResolvedValue({ walletBalance: 500 })
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma))

    const { payFromWalletAction } = await import("@/app/actions/payments")
    const fd = new FormData()
    fd.append("courseId", "c1")

    await payFromWalletAction(null, fd)

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "u1" } })
  })

  it("rejects insufficient balance inside transaction", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "u1", role: "STUDENT", firstName: "A",
    } as any)
    mockPrisma.course.findUnique.mockResolvedValue({ id: "c1", name: "X", price: 200 })
    mockPrisma.user.findUnique.mockResolvedValue({ walletBalance: 50 })
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma))

    const { payFromWalletAction } = await import("@/app/actions/payments")
    const fd = new FormData()
    fd.append("courseId", "c1")

    const result = await payFromWalletAction(null, fd)
    expect(result.ok).toBe(false)
  })
})
