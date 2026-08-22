import { describe, it, expect, vi, beforeEach } from "vitest"

const mockPrisma = {
  $transaction: vi.fn(),
  course: { findUnique: vi.fn() },
  coupon: { findUnique: vi.fn(), updateMany: vi.fn() },
  invoice: { create: vi.fn(), update: vi.fn() },
  paymentProof: { create: vi.fn() },
  notification: { createMany: vi.fn() },
  user: { findMany: vi.fn().mockResolvedValue([]) },
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

describe("submitPaymentAction coupon atomicity", () => {
  it("uses updateMany with usedCount < maxUses condition", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "u1", role: "STUDENT", firstName: "A",
    } as any)
    mockPrisma.course.findUnique.mockResolvedValue({
      id: "c1", name: "X", price: 500,
    })
    mockPrisma.coupon.findUnique.mockResolvedValue({
      id: "cp1", code: "DISC10", isActive: true,
      discountType: "percentage", discountValue: 10,
      maxUses: 100, usedCount: 5, expiresAt: null,
    })
    mockPrisma.coupon.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.invoice.create.mockResolvedValue({ id: "inv1" })
    mockPrisma.paymentProof.create.mockResolvedValue({})

    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma))

    const { submitPaymentAction } = await import("@/app/actions/payments")
    const fd = new FormData()
    fd.append("courseId", "c1")
    fd.append("method", "VODAFONE_CASH")
    fd.append("senderName", "Test")
    fd.append("reference", "ref1")
    fd.append("amount", "450")
    fd.append("couponCode", "DISC10")

    await submitPaymentAction(null, fd)

    // updateMany with condition prevents race condition
    expect(mockPrisma.coupon.updateMany).toHaveBeenCalledWith({
      where: { id: "cp1", usedCount: { lt: 100 } },
      data: { usedCount: { increment: 1 } },
    })
  })

  it("returns null when updateMany count is 0 (coupon race lost)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "u1", role: "STUDENT", firstName: "A",
    } as any)
    mockPrisma.course.findUnique.mockResolvedValue({
      id: "c1", name: "X", price: 500,
    })
    mockPrisma.coupon.findUnique.mockResolvedValue({
      id: "cp1", code: "DISC10", isActive: true,
      discountType: "percentage", discountValue: 10,
      maxUses: 100, usedCount: 99, expiresAt: null,
    })
    // updateMany returns 0 — another request won the race
    mockPrisma.coupon.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma))

    const { submitPaymentAction } = await import("@/app/actions/payments")
    const fd = new FormData()
    fd.append("courseId", "c1")
    fd.append("method", "VODAFONE_CASH")
    fd.append("senderName", "Test")
    fd.append("reference", "ref1")
    fd.append("amount", "450")
    fd.append("couponCode", "DISC10")

    const result = await submitPaymentAction(null, fd)
    expect(result.ok).toBe(false)
  })
})
