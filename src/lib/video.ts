import type { VideoProvider } from "@/generated/prisma/enums"

/**
 * استخراج معرف فيديو يوتيوب من كل الصيغ الشائعة:
 * watch?v= · youtu.be/ · /shorts/ · /embed/ · /live/ · studio.youtube.com
 */
export function extractYouTubeId(url: string): string | null {
  // يجب أن يكون الرابط لنطاق يوتيوب فعلاً
  if (!/(youtube\.com|youtu\.be)/i.test(url)) return null

  const patterns = [
    /[?&]v=([A-Za-z0-9_-]+)/,
    /youtu\.be\/([A-Za-z0-9_-]+)/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]+)/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]+)/,
    /youtube\.com\/live\/([A-Za-z0-9_-]+)/,
    /studio\.youtube\.com\/video\/([A-Za-z0-9_-]+)/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    // معرف اليوتيوب القياسي 11 حرفاً
    if (m?.[1] && /^[A-Za-z0-9_-]{11}$/.test(m[1])) return m[1]
  }
  return null
}

export function extractVimeoId(url: string): string | null {
  return url.match(/vimeo\.com\/(\d+)/)?.[1] ?? null
}

export type VideoUrlValidation =
  | { ok: true; id: string | null }
  | { ok: false; error: string }

/** تحقق وقت الحفظ — رسائل عربية واضحة بدل قبول أي نص */
export function validateVideoUrl(provider: VideoProvider | string, url: string): VideoUrlValidation {
  const trimmed = url.trim()
  switch (provider) {
    case "YOUTUBE": {
      const id = extractYouTubeId(trimmed)
      return id ? { ok: true, id } : { ok: false, error: "رابط يوتيوب غير صالح — الصق رابطاً بصيغة watch أو youtu.be أو shorts" }
    }
    case "VIMEO": {
      const id = extractVimeoId(trimmed)
      return id ? { ok: true, id } : { ok: false, error: "رابط فيميو غير صالح — يجب أن يكون بالصيغة vimeo.com/123456789" }
    }
    case "UPLOAD":
      return { ok: true, id: null }
    default:
      // VDOCIPHER/BUNNY/GUMLET — روابط تشغيل تُمرَّر كما هي (سلوك قائم)
      return trimmed.length >= 5 ? { ok: true, id: null } : { ok: false, error: "رابط التشغيل مطلوب" }
  }
}

/**
 * رابط التضمين النهائي — صارم: إن لم يستخرج معرفاً صالحاً يرجع null
 * (بدلاً من حقن الرابط الخام في iframe كما كان سابقاً).
 * Vimeo/Bunny/VdoCipher/Gumlet سلوكها القائم بدون تغيير.
 */
export function getVideoEmbedUrl(provider: VideoProvider, url: string): string | null {
  switch (provider) {
    case "YOUTUBE": {
      const id = extractYouTubeId(url)
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    case "VIMEO": {
      const id = extractVimeoId(url)
      return id ? `https://player.vimeo.com/video/${id}` : null
    }
    case "VDOCIPHER":
      return url
    case "BUNNY":
    case "GUMLET":
    case "UPLOAD":
    default:
      return url
  }
}

export function isEmbeddableProvider(provider: VideoProvider) {
  return provider === "YOUTUBE" || provider === "VIMEO" || provider === "VDOCIPHER"
}
