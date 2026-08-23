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
    await supabase.storage.createBucket(BUCKET, { public: false })
  } else {
    const bucket = buckets?.find((b) => b.name === BUCKET)
    if (bucket?.public) {
      await supabase.storage.updateBucket(BUCKET, { public: false })
    }
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

export async function getSupabaseSignedUrl(key: string, expiresInSec = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(key, expiresInSec)
  if (error || !data) return null
  return data.signedUrl
}

/**
 * رابط رفع موقّع مباشر (Signed Upload URL) — يستخدم واجهة Supabase الصحيحة
 * createSignedUploadUrl (وليس createSignedUrl التي هي للتنزيل).
 * العميل ينفذ PUT على الرابط الناتج مباشرة نحو Supabase متجاوزًا Serverless.
 */
export async function getSupabaseSignedUploadUrl(key: string): Promise<string | null> {
  await ensureBucket()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(key)
  if (error || !data) return null
  return data.signedUrl
}

export async function getSupabaseFile(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(key)
  if (error || !data) return null
  const arrayBuffer = await data.arrayBuffer()
  const contentType = data.type || "application/octet-stream"
  return { buffer: Buffer.from(arrayBuffer), contentType }
}

export async function supabaseFileExists(key: string): Promise<boolean> {
  const parts = key.split("/")
  const fileName = parts.pop() ?? key
  const folderPath = parts.length > 0 ? parts.join("/") : undefined
  const { data, error } = await supabase.storage.from(BUCKET).list(folderPath, {
    search: fileName,
    limit: 1,
  })
  if (error || !data) return false
  return data.some((f) => f.name === fileName)
}
