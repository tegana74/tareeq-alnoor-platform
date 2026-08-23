import { describe, it, expect } from "vitest"
import type { VideoProvider } from "@/generated/prisma/enums"
import {
  extractYouTubeId,
  extractVimeoId,
  getVideoEmbedUrl,
  isEmbeddableProvider,
  validateVideoUrl,
} from "@/lib/video"

const YT = "YOUTUBE" as VideoProvider
const VM = "VIMEO" as VideoProvider

describe("extractYouTubeId — link matrix (FIX-3)", () => {
  it("watch?v=", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(extractYouTubeId("https://www.youtube.com/watch?v=abcdefghijk&t=90s")).toBe("abcdefghijk")
  })

  it("youtu.be/", () => {
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(extractYouTubeId("https://youtu.be/xyz12345670?t=5")).toBe("xyz12345670")
  })

  it("shorts — كان مفقوداً قبل FIX-3", () => {
    expect(extractYouTubeId("https://www.youtube.com/shorts/kJQP7kiw5Fk")).toBe("kJQP7kiw5Fk")
  })

  it("embed و live و studio", () => {
    expect(extractYouTubeId("https://www.youtube.com/embed/abcdefghijk")).toBe("abcdefghijk")
    expect(extractYouTubeId("https://www.youtube.com/live/liveStream1")).toBe("liveStream1")
    expect(extractYouTubeId("https://studio.youtube.com/video/vid12345678/edit")).toBe("vid12345678")
  })

  it("rejects non-youtube and malformed links", () => {
    expect(extractYouTubeId("https://vimeo.com/123456789")).toBeNull()
    expect(extractYouTubeId("not a url")).toBeNull()
    expect(extractYouTubeId("https://example.com/watch?v=abcdefghijk")).toBeNull()
    expect(extractYouTubeId("https://www.youtube.com/shorts/short-id")).toBeNull() // طول غير قياسي
  })
})

describe("getVideoEmbedUrl — strict, no raw fallback", () => {
  it("youtube valid → canonical embed URL", () => {
    expect(getVideoEmbedUrl(YT, "https://youtu.be/dQw4w9WgXcQ?si=z")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    )
    // shorts الآن يعمل أيضاً
    expect(getVideoEmbedUrl(YT, "https://www.youtube.com/shorts/kJQP7kiw5Fk")).toBe(
      "https://www.youtube.com/embed/kJQP7kiw5Fk"
    )
  })

  it("youtube invalid → null (لا يُحقن رابط خام في iframe)", () => {
    expect(getVideoEmbedUrl(YT, "https://www.youtube.com/shorts/short-id")).toBeNull()
    expect(getVideoEmbedUrl(YT, "https://example.com/watch?v=abcdefghijk")).toBeNull()
    expect(getVideoEmbedUrl(YT, "https://example.com/watch?v=zzz")).toBeNull()
  })

  it("vimeo regression: numeric works, non-numeric → null", () => {
    expect(getVideoEmbedUrl(VM, "https://vimeo.com/76979871")).toBe("https://player.vimeo.com/video/76979871")
    expect(getVideoEmbedUrl(VM, "https://vimeo.com/album/123")).toBeNull()
  })

  it("passthrough providers unchanged (Bunny/VdoCipher/Gumlet/Upload)", () => {
    const p = "BUNNY" as VideoProvider
    const bunnyUrl = getVideoEmbedUrl(p, "https://cdn.bunny.net/play.m3u8")
    expect(bunnyUrl).toBe("https://cdn.bunny.net/play.m3u8")
    const v = "VDOCIPHER" as VideoProvider
    const vdoUrl = getVideoEmbedUrl(v, "https://api.vdocipher.com/v2/?otp=x")
    expect(vdoUrl).not.toBeNull()
    expect(vdoUrl!.length).toBeGreaterThan(0)
  })

  it("isEmbeddableProvider unchanged", () => {
    expect(isEmbeddableProvider(YT)).toBe(true)
    expect(isEmbeddableProvider("UPLOAD" as VideoProvider)).toBe(false)
  })
})

describe("validateVideoUrl — save-time gate", () => {
  it("accepts all valid youtube formats", () => {
    for (const u of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/kJQP7kiw5Fk",
    ]) {
      const r = validateVideoUrl(YT, u)
      expect(r.ok).toBe(true)
    }
  })

  it("rejects invalid youtube with clear Arabic error", () => {
    const r = validateVideoUrl(YT, "رابط عشوائي")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("يوتيوب غير صالح")
  })

  it("rejects invalid vimeo", () => {
    const r = validateVideoUrl(VM, "https://vimeo.com/notanumber")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("فيميو غير صالح")
  })

  it("UPLOAD bypasses url check; passthrough providers need non-empty url", () => {
    expect(validateVideoUrl("UPLOAD" as VideoProvider, "").ok).toBe(true)
    expect(validateVideoUrl("BUNNY" as VideoProvider, "").ok).toBe(false)
    expect(validateVideoUrl("GUMLET" as VideoProvider, "https://x.m3u8").ok).toBe(true)
  })
})
