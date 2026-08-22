import { describe, it, expect, vi, beforeEach } from "vitest"

const mockPrisma = {
  $transaction: vi.fn(),
  user: { findUnique: vi.fn(), update: vi.fn() },
  insertCode: { findUnique: vi.fn(), update: vi.fn() },
  insertCodeUsage: { create: vi.fn() },
  walletTransaction: { create: vi.fn() },
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

function mockTransactionPassthrough() {
  mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma))
}

describe("redeemCodeAction atomicity", () => {
  it("rejects already-used code inside transaction", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "u1", role: "STUDENT",
    } as any)
    mockPrisma.insertCode.findUnique.mockResolvedValue({
      id: "ic1", code: "USED123", isUsed: true, value: 100,
    })
    mockTransactionPassthrough()

    const { redeemCodeAction } = await import("@/app/actions/payments")
    const fd = new FormData()
    fd.append("code", "USED123")

    const result = await redeemCodeAction(null, fd)
    expect(result.ok).toBe(false)
    expect(mockPrisma.insertCode.update).not.toHaveBeenCalled()
  })

  it("processes valid code inside transaction", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "u1", role: "STUDENT",
    } as any)
    mockPrisma.insertCode.findUnique.mockResolvedValue({
      id: "ic1", code: "FRESH1", isUsed: false, value: 100,
    })
    mockPrisma.user.findUnique.mockResolvedValue({ walletBalance: 0 })
    mockTransactionPassthrough()

    const { redeemCodeAction } = await import("@/app/actions/payments")
    const fd = new FormData()
    fd.append("code", "FRESH1")

    const result = await redeemCodeAction(null, fd)
    expect(result.ok).toBe(true)
    expect(mockPrisma.insertCode.update).toHaveBeenCalledWith({
      where: { id: "ic1" },
      data: { isUsed: true, usedAt: expect.any(Date) },
    })
  })
})
