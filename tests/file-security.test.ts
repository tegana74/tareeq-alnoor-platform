import { describe, it, expect } from "vitest"

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

describe("sanitizeKey - path traversal protection", () => {
  it("allows normal file keys", () => {
    expect(sanitizeKey("abc123.pdf")).toBe("abc123.pdf")
    expect(sanitizeKey("folder/file.pdf")).toBe("folder/file.pdf")
    expect(sanitizeKey("a/b/c/image.jpg")).toBe("a/b/c/image.jpg")
  })

  it("rejects ../ traversal", () => {
    expect(sanitizeKey("../../etc/passwd")).toBeNull()
    expect(sanitizeKey("files/../../secret")).toBeNull()
    expect(sanitizeKey("../secret")).toBeNull()
  })

  it("rejects encoded traversal %2e%2e", () => {
    expect(sanitizeKey("%2e%2e/%2e%2e/etc/passwd")).toBeNull()
    expect(sanitizeKey("files/%2e%2e/secret")).toBeNull()
  })

  it("rejects absolute paths", () => {
    expect(sanitizeKey("/etc/passwd")).toBeNull()
    expect(sanitizeKey("/api/files/secret")).toBeNull()
  })

  it("rejects URLs", () => {
    expect(sanitizeKey("https://evil.com/steal")).toBeNull()
    expect(sanitizeKey("http://localhost:3000/secret")).toBeNull()
  })

  it("rejects null bytes", () => {
    expect(sanitizeKey("file.pdf\0.jpg")).toBeNull()
  })

  it("rejects empty or too long keys", () => {
    expect(sanitizeKey("")).toBeNull()
    expect(sanitizeKey("a".repeat(256))).toBeNull()
  })

  it("rejects dot segments", () => {
    expect(sanitizeKey(".")).toBeNull()
    expect(sanitizeKey("..")).toBeNull()
  })

  it("handles backslash traversal", () => {
    expect(sanitizeKey("..\\..\\windows\\system32")).toBeNull()
  })
})
