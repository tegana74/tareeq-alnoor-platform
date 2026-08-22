export function resolveFileUrl(url: string): string {
  if (!url) return url

  if (url.includes("/api/files/")) return url

  const supabaseMatch = url.match(/\/storage\/v1\/object\/(?:public|sign)\/uploads\/(.+)/i)
  if (supabaseMatch) {
    const key = supabaseMatch[1]
    return `/api/files/${key}`
  }

  return url
}
