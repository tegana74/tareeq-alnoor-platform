import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    get session() {
      return { deleteMany: mockDeleteMany }
    },
  },
}))
vi.mock("@/lib/sms", () => ({ sendSms: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({ getClientIp: vi.fn().mockResolvedValue("127.0.0.1") }))
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ get: () => undefined, delete: vi.fn() }) }))

let mockDeleteMany = vi.fn()

import { invalidateOtherSessions, invalidateAllSessions, hashSessionToken } from "@/lib/auth"

describe("session invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("invalidateOtherSessions hashes token before comparison", async () => {
    mockDeleteMany.mockResolvedValue({ count: 3 })

    const rawToken = "current-token-abc"
    const expectedHash = hashSessionToken(rawToken)
    await invalidateOtherSessions("user-1", rawToken)

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", token: { not: expectedHash } },
    })
  })

  it("invalidateAllSessions deletes all sessions for user", async () => {
    mockDeleteMany.mockResolvedValue({ count: 5 })

    await invalidateAllSessions("user-2")

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-2" },
    })
  })
})
