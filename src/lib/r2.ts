import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const R2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.R2_BUCKET_NAME!

export async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await R2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))
}

export async function getR2SignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(R2, cmd, { expiresIn })
}

export async function headR2(key: string): Promise<{ size: number; contentType: string } | null> {
  try {
    const res = await R2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? "application/octet-stream" }
  } catch {
    return null
  }
}

export async function getR2Object(key: string) {
  return R2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
}
