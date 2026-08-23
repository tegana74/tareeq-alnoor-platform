import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ===== mocks =====
const storageMock = vi.hoisted(() => {
  const fileApi = {
    createSignedUploadUrl: vi.fn(),
    createSignedUrl: vi.fn(),
    upload: vi.fn(),
  }
  return {
    fileApi,
    client: {
      storage: {
        from: vi.fn(() => fileApi),
        listBuckets: vi.fn().mockResolvedValue({ data: [{ name: "uploads", public: false }], error: null }),
        createBucket: vi.fn().mockResolvedValue({ data: {}, error: null }),
        updateBucket: vi.fn().mockResolvedValue({ data: {}, error: null }),
      },
    },
  }
})

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => storageMock.client,
}))

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }))
const subs = vi.hoisted(() => ({ canAccessCourse: vi.fn() }))
vi.mock("@/lib/subscriptions", () => ({ canAccessCourse: subs.canAccessCourse }))

import { getSupabaseSignedUploadUrl } from "@/lib/storage"
import { shouldUseSignedUpload } from "@/lib/upload-client"
import { getCurrentUser } from "@/lib/auth"
import { POST } from "@/app/api/upload/route"

function setUser(u: { id: string; role: string; teacherId?: null } | null) {
  vi.mocked(getCurrentUser).mockResolvedValue(
    u ? ({ firstName: "", lastName: "", ...u } as never) : (null as never)
  )
}

function signedRequest(params: Record<string, string>) {
  const sp = new URLSearchParams({ mode: "signed", ...params })
  return new NextRequest(`https://site.com/api/upload?${sp.toString()}`, { method: "POST" })
}

async function jsonOf(req: Request) {
  const res = await POST(req as never)
  const body = await res.json()
  return { status: res.status, body }
}

beforeEach(() => {
  vi.clearAllMocks()
  storageMock.fileApi.createSignedUploadUrl.mockResolvedValue({
    data: { signedUrl: "https://sb/upload/sign?token=x", path: "k" },
    error: null,
  })
  setUser({ id: "u1", role: "STUDENT", teacherId: null })
})

describe("getSupabaseSignedUploadUrl (FIX-2 core)", () => {
  it("uses createSignedUploadUrl — NOT the download createSignedUrl", async () => {
    const url = await getSupabaseSignedUploadUrl("abc.mp4")
    expect(url).toBe("https://sb/upload/sign?token=x")
    expect(storageMock.fileApi.createSignedUploadUrl).toHaveBeenCalledWith("abc.mp4")
    expect(storageMock.fileApi.createSignedUrl).not.toHaveBeenCalled()
  })

  it("returns null on supabase error", async () => {
    storageMock.fileApi.createSignedUploadUrl.mockResolvedValue({ data: null, error: { message: "boom" } })
    expect(await getSupabaseSignedUploadUrl("x")).toBeNull()
  })
})

describe("shouldUseSignedUpload routing matrix", () => {
  it("videos ALWAYS use direct signed upload (any size)", () => {
    expect(shouldUseSignedUpload("video", 1024)).toBe(true)
    expect(shouldUseSignedUpload("video", 500 * 1024 * 1024)).toBe(true)
  })

  it("small files keep buffer; large files go signed (Vercel ~4.5MB limit)", () => {
    expect(shouldUseSignedUpload("file", 3 * 1024 * 1024)).toBe(false)
    expect(shouldUseSignedUpload("file", 4.6 * 1024 * 1024)).toBe(true)
    expect(shouldUseSignedUpload("file", 25 * 1024 * 1024)).toBe(true)
  })
})

describe("/api/upload signed flow contract", () => {
  it("returns uploadUrl + key + internal url — no service secrets", async () => {
    setUser({ id: "u1", role: "TEACHER", teacherId: null })
    const { status, body } = await jsonOf(signedRequest({ kind: "video", name: "lesson.mp4", size: "52428800" }))
    expect(status).toBe(200)
    expect(body.uploadUrl).toContain("/upload/sign")
    expect(body.key).toMatch(/^[0-9a-f-]+\.mp4$/)
    expect(body.url).toBe(`/api/files/${body.key}`)
    expect(JSON.stringify(body)).not.toMatch(/service|SUPABASE_|apikey/i)
  })

  it("arabic filename → valid uuid-based storage key with same extension", async () => {
    const { body } = await jsonOf(signedRequest({ kind: "file", name: "نحو الصف الثالث الإعدادي.pdf", size: "1048576" }))
    expect(body.key).toMatch(/^[0-9a-f-]+\.pdf$/)
  })

  it("unauthenticated → 401", async () => {
    setUser(null)
    const { status, body } = await jsonOf(signedRequest({ kind: "video", name: "a.mp4", size: "10" }))
    expect(status).toBe(401)
    expect(body.error).toBeTruthy()
  })

  it("student cannot upload video → 403", async () => {
    setUser({ id: "u1", role: "STUDENT", teacherId: null })
    const { status } = await jsonOf(signedRequest({ kind: "video", name: "a.mp4", size: "10" }))
    expect(status).toBe(403)
  })

  it("invalid extension rejected server-side (name is source of truth, not content-type)", async () => {
    setUser({ id: "u1", role: "TEACHER", teacherId: null })
    const { status } = await jsonOf(
      signedRequest({ kind: "file", name: "malware.exe", size: "10" })
    )
    expect(status).toBe(400)
  })

  it("oversized declared size rejected against kind limits", async () => {
    setUser({ id: "u1", role: "TEACHER", teacherId: null })
    const { status } = await jsonOf(signedRequest({ kind: "file", name: "big.pdf", size: String(30 * 1024 * 1024) }))
    expect(status).toBe(400)
  })

  it("missing extension rejected", async () => {
    setUser({ id: "u1", role: "TEACHER", teacherId: null })
    const { status } = await jsonOf(signedRequest({ kind: "file", name: "noext", size: "10" }))
    expect(status).toBe(400)
  })

  it("signed-url creation failure → 500 generic Arabic message only", async () => {
    setUser({ id: "u1", role: "TEACHER", teacherId: null })
    storageMock.fileApi.createSignedUploadUrl.mockResolvedValue({ data: null, error: { message: "internal-supabase-detail" } })
    const { status, body } = await jsonOf(signedRequest({ kind: "video", name: "v.mp4", size: "10" }))
    expect(status).toBe(500)
    expect(body.error).not.toContain("internal-supabase-detail")
  })
})
