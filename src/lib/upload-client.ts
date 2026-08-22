const MAX_BUFFER_SIZE = 25 * 1024 * 1024
const SIGNED_URL_TTL = 300

export interface UploadResult {
  url: string
  key: string
}

export async function uploadFile(
  file: File,
  kind: "video" | "file" = "file",
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  const useSigned = kind === "video" && file.size > MAX_BUFFER_SIZE

  if (useSigned) {
    return uploadViaSignedUrl(file, kind, onProgress)
  }
  return uploadViaBuffer(file, kind, onProgress)
}

async function uploadViaSignedUrl(
  file: File,
  kind: "video" | "file",
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  const metaRes = await fetch(`/api/upload?kind=${kind}&mode=signed`, {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream" },
  })
  const meta = await metaRes.json().catch(() => ({}))
  if (!metaRes.ok || !meta.uploadUrl) {
    throw new Error(meta.error ?? "فشل إنشاء رابط الرفع")
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", meta.uploadUrl)
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ url: meta.url, key: meta.key })
      } else {
        reject(new Error("فشل رفع الملف مباشرة"))
      }
    }

    xhr.onerror = () => reject(new Error("خطأ في الشبكة أثناء الرفع"))
    xhr.send(file)
  })
}

async function uploadViaBuffer(
  file: File,
  kind: "video" | "file",
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  if (onProgress) onProgress(0)

  const fd = new FormData()
  fd.set("file", file)
  const res = await fetch(`/api/upload?kind=${kind}`, { method: "POST", body: fd })
  const data = await res.json().catch(() => ({}))

  if (onProgress) onProgress(100)

  if (!res.ok) throw new Error(data.error ?? "فشل الرفع")
  return { url: data.url, key: data.url.replace("/api/files/", "") }
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|webm|mov|mkv|ogv|avi)$/i.test(file.name)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}