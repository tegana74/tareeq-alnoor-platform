/**
 * حد جسم طلب Vercel Serverless (~4.5MB) — ما فوقه يجب ألا يمر عبر Next.js.
 */
export const VERCEL_BODY_LIMIT = 4.5 * 1024 * 1024

/**
 * اختيار مسار الرفع:
 * - الفيديو: دائما Signed Upload مباشر نحو Supabase (يتجاوز حد Vercel وذاكرة الـFunction).
 * - بقية الملفات (PDF/صور/مستندات): buffer للملفات الصغيرة، وsigned لما يتجاوز الحد.
 */
export function shouldUseSignedUpload(kind: "video" | "file", size: number): boolean {
  if (kind === "video") return true
  return size > VERCEL_BODY_LIMIT
}

export interface UploadResult {
  url: string
  key: string
}

type ProgressFn = (percent: number) => void

async function uploadViaSignedUrl(
  file: File,
  kind: "video" | "file",
  onProgress?: ProgressFn
): Promise<UploadResult> {
  onProgress?.(0)

  const params = new URLSearchParams({ kind, mode: "signed", name: file.name, size: String(file.size) })
  const metaRes = await fetch(`/api/upload?${params.toString()}`, { method: "POST" })
  const meta = await metaRes.json().catch(() => ({}))

  if (!metaRes.ok || !meta.uploadUrl) {
    throw new Error(meta.error ?? "فشل تجهيز رابط الرفع")
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", meta.uploadUrl)
    if (file.type) xhr.setRequestHeader("Content-Type", file.type)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("فشل رفع الملف مباشرة")))
    xhr.onerror = () => reject(new Error("خطأ في الشبكة أثناء الرفع"))
    xhr.send(file)
  })

  return { url: meta.url as string, key: meta.key as string }
}

async function uploadViaBuffer(
  file: File,
  kind: "video" | "file",
  onProgress?: ProgressFn
): Promise<UploadResult> {
  onProgress?.(0)

  const fd = new FormData()
  fd.set("file", file)
  const res = await fetch(`/api/upload?kind=${kind}`, { method: "POST", body: fd })
  const data = await res.json().catch(() => ({}))

  onProgress?.(100)

  if (!res.ok) throw new Error(data.error ?? "فشل الرفع")
  return { url: data.url as string, key: (data.url as string).replace("/api/files/", "") }
}

/** نقطة الدخول الموحدة لكل الرفع داخل المنصة */
export async function uploadFile(
  file: File,
  kind: "video" | "file" = "file",
  onProgress?: ProgressFn
): Promise<UploadResult> {
  if (shouldUseSignedUpload(kind, file.size)) {
    return uploadViaSignedUrl(file, kind, onProgress)
  }
  return uploadViaBuffer(file, kind, onProgress)
}
