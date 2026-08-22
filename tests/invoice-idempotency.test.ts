import { describe, it, expect, vi, beforeEach } from "vitest"

const mockPrisma = {
  $transaction: vi.fn(),
  invoice: { findUnique: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
  subscription: { findUnique: vi.fn(), create: vi.fn() },
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

describe("approveInvoiceAction idempotency", () => {
  it("uses updateMany with status PENDING inside transaction", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "admin1", role: "ADMIN",
    } as any)
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1", status: "PENDING", type: "SUBSCRIBE",
      courseId: "c1", userId: "u1", amount: 500,
    })
    mockPrisma.user.findUnique.mockResolvedValue({ walletBalance: 0 })
    mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma))

    const { approveInvoiceAction } = await import("@/app/actions/admin")
    const result = await approveInvoiceAction("inv1")

    expect(result.ok).toBe(true)
    // updateMany with status condition = idempotent
    expect(mockPrisma.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "inv1", status: "PENDING" },
      data: expect.objectContaining({ status: "PAID" }),
    })
  })

  it("returns error when already reviewed (count=0)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "admin1", role: "ADMIN",
    } as any)
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1", status: "PENDING", type: "SUBSCRIBE",
      courseId: "c1", userId: "u1", amount: 500,
    })
    mockPrisma.user.findUnique.mockResolvedValue({ walletBalance: 0 })
    mockPrisma.invoice.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma))

    const { approveInvoiceAction } = await import("@/app/actions/admin")
    const result = await approveInvoiceAction("inv1")

    expect(result.ok).toBe(false)
    expect(result.error).toContain("تمت")
  })
})
