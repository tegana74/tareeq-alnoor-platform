import type { VideoProvider } from "@/generated/prisma/enums"

export function getVideoEmbedUrl(provider: VideoProvider, url: string) {
  switch (provider) {
    case "YOUTUBE": {
      // https://www.youtube.com/watch?v=ID  أو https://youtu.be/ID
      let id: string | null = null
      const watch = url.match(/[?&]v=([^&]+)/)
      const short = url.match(/youtu\.be\/([^?]+)/)
      const embed = url.match(/embed\/([^?]+)/)
      const studio = url.match(/studio\.youtube\.com\/video\/([^/?]+)/)
      const live = url.match(/youtube\.com\/live\/([^?]+)/)
      id = watch?.[1] ?? short?.[1] ?? embed?.[1] ?? studio?.[1] ?? live?.[1] ?? null
      return id ? `https://www.youtube.com/embed/${id}` : url
    }
    case "VIMEO": {
      const id = url.match(/vimeo\.com\/(\d+)/)?.[1]
      return id ? `https://player.vimeo.com/video/${id}` : url
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
