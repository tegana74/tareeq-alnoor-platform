import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const BUCKET = "uploads"

export async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some((b) => b.name === BUCKET)
  if (!exists) {
    await supabase.storage.createBucket(BUCKET, { public: true })
  }
}

export async function uploadToSupabase(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await ensureBucket()
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, buffer, { contentType, upsert: true })
  if (error) throw new Error(error.message)
}

export function getSupabasePublicUrl(key: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key)
  return data.publicUrl
}

export async function getSupabaseFile(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(key)
  if (error || !data) return null
  const arrayBuffer = await data.arrayBuffer()
  const contentType = data.type || "application/octet-stream"
  return { buffer: Buffer.from(arrayBuffer), contentType }
}
