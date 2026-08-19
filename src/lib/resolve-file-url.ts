import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL!
const BUCKET = "uploads"

export function resolveFileUrl(url: string): string {
  if (!url) return url

  if (url.includes("supabase")) return url

  const match = url.match(/\/api\/files\/([\w-]+\.[a-z0-9]+)/i)
  if (match) {
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${match[1]}`
  }

  return url
}
