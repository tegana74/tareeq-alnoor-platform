import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHash } from "node:crypto"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    get session() {
      return { create: mockSessionCreate, findUnique: mockSessionFindUnique, deleteMany: mockDeleteMany }
    },
  },
}))
vi.mock("@/lib/sms", () => ({ sendSms: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({ getClientIp: vi.fn().mockResolvedValue("127.0.0.1") }))
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ get: () => undefined, delete: vi.fn() }) }))

let mockSessionCreate = vi.fn()
let mockSessionFindUnique = vi.fn()
let mockDeleteMany = vi.fn()

import { hashSessionToken, createSession } from "@/lib/auth"

function sha256hex(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

describe("session token hashing (SHA-256)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("hashSessionToken returns consistent SHA-256 hex", () => {
    const token = "test-raw-token-12345"
    const result = hashSessionToken(token)
    expect(result).toBe(sha256hex(token))
    expect(result).toHaveLength(64)
  })

  it("hashSessionToken is deterministic", () => {
    const a = hashSessionToken("abc")
    const b = hashSessionToken("abc")
    expect(a).toBe(b)
  })

  it("hashSessionToken produces different hashes for different inputs", () => {
    const a = hashSessionToken("token-a")
    const b = hashSessionToken("token-b")
    expect(a).not.toBe(b)
  })

  it("createSession stores hashed token, returns raw token", async () => {
    mockSessionCreate.mockResolvedValue({})
    const rawToken = await createSession("user-123")

    expect(rawToken).toMatch(/^[a-f0-9]{64}$/)
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          token: sha256hex(rawToken),
          userId: "user-123",
        }),
      })
    )
  })

  it("createSession returns different tokens on each call", async () => {
    mockSessionCreate.mockResolvedValue({})
    const t1 = await createSession("u1")
    const t2 = await createSession("u1")
    expect(t1).not.toBe(t2)
    expect(sha256hex(t1)).not.toBe(sha256hex(t2))
  })

  it("hashed token is 64-char hex (256-bit)", () => {
    const hash = hashSessionToken("any-input")
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("empty string input produces valid hash", () => {
    const hash = hashSessionToken("")
    expect(hash).toBe(sha256hex(""))
    expect(hash).toHaveLength(64)
  })

  it("hash never contains the original token", () => {
    const token = "my-super-secret-session-token"
    const hash = hashSessionToken(token)
    expect(hash).not.toContain(token)
  })
})
