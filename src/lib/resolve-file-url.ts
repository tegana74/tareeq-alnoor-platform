const BUCKET = "uploads"

export function resolveFileUrl(url: string): string {
  if (!url) return url

  if (url.includes("supabase")) return url

  const match = url.match(/\/api\/files\/([\w.-]+)/i)
  if (match) {
    const supabaseUrl = process.env.SUPABASE_URL
    if (supabaseUrl) {
      return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${match[1]}`
    }
    return url
  }

  return url
}
