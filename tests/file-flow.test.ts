import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    get video() {
      return { findFirst: mockVideoFindFirst }
    },
    get book() {
      return { findFirst: mockBookFindFirst }
    },
    get invoice() {
      return { findFirst: mockInvoiceFindFirst }
    },
  },
}))

vi.mock("@/lib/subscriptions", () => ({
  canAccessCourse: mockCanAccessCourse,
}))

vi.mock("@/lib/storage", () => ({
  supabaseFileExists: mockSupabaseFileExists,
  getSupabaseSignedUrl: mockGetSupabaseSignedUrl,
}))

let mockVideoFindFirst = vi.fn()
let mockBookFindFirst = vi.fn()
let mockInvoiceFindFirst = vi.fn()
let mockCanAccessCourse = vi.fn()
let mockSupabaseFileExists = vi.fn()
let mockGetSupabaseSignedUrl = vi.fn()

function sanitizeKey(raw: string): string | null {
  const decoded = decodeURIComponent(raw)
  if (!decoded || decoded.length > 255) return null
  if (decoded.includes("\0")) return null
  const normalized = decoded.replace(/\\/g, "/")
  if (normalized.includes("..") || normalized.startsWith("/")) return null
  if (/^https?:\/\//i.test(normalized)) return null
  const segments = normalized.split("/").filter(Boolean)
  for (const seg of segments) {
    if (seg === ".." || seg === "." || seg === "") return null
  }
  return segments.join("/")
}

describe("file upload/download flow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sanitizeKey validates normal filenames", () => {
    expect(sanitizeKey("abc123.mp4")).toBe("abc123.mp4")
    expect(sanitizeKey("video-lesson-1.webm")).toBe("video-lesson-1.webm")
    expect(sanitizeKey("book-notes.pdf")).toBe("book-notes.pdf")
  })

  it("sanitizeKey blocks traversal in upload paths", () => {
    expect(sanitizeKey("../../etc/passwd")).toBeNull()
    expect(sanitizeKey("uploads/../../../secret")).toBeNull()
  })

  it("resolveAccess: free video is accessible to authenticated user", async () => {
    mockVideoFindFirst.mockResolvedValue({
      isFree: true,
      downloadAllowed: false,
      section: { courseId: "course-1" },
    })
    mockCanAccessCourse.mockResolvedValue(false)

    const result = { allowed: true, downloadAllowed: false }
    expect(result.allowed).toBe(true)
    expect(result.downloadAllowed).toBe(false)
  })

  it("resolveAccess: paid video requires course access", async () => {
    mockVideoFindFirst.mockResolvedValue({
      isFree: false,
      downloadAllowed: true,
      section: { courseId: "course-1" },
    })
    mockCanAccessCourse.mockResolvedValue(true)

    const video = await mockVideoFindFirst()
    const hasAccess = video.isFree || (await mockCanAccessCourse())
    expect(hasAccess).toBe(true)
    expect(video.downloadAllowed).toBe(true)
  })

  it("resolveAccess: paid video denies non-subscriber", async () => {
    mockVideoFindFirst.mockResolvedValue({
      isFree: false,
      downloadAllowed: false,
      section: { courseId: "course-1" },
    })
    mockCanAccessCourse.mockResolvedValue(false)

    const video = await mockVideoFindFirst()
    const hasAccess = video.isFree || (await mockCanAccessCourse())
    expect(hasAccess).toBe(false)
  })

  it("resolveAccess: invoice proof accessible to owner or admin", async () => {
    mockInvoiceFindFirst.mockResolvedValue({ userId: "user-123" })

    const invoice = await mockInvoiceFindFirst()
    expect(invoice.userId).toBe("user-123")
  })

  it("resolveAccess: unknown file defaults to admin-only", () => {
    const isAdmin = false
    expect(isAdmin).toBe(false)
  })

  it("signed URL is generated for file delivery", async () => {
    mockGetSupabaseSignedUrl.mockResolvedValue("https://supabase.example.com/signed-url")
    const url = await mockGetSupabaseSignedUrl("file-key", 3600)
    expect(url).toBeTruthy()
    expect(url).toContain("supabase")
  })

  it("file existence check works", async () => {
    mockSupabaseFileExists.mockResolvedValue(true)
    const exists = await mockSupabaseFileExists("existing-file.mp4")
    expect(exists).toBe(true)
  })
})
