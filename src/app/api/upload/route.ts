import { NextResponse, NextRequest } from "next/server"
import { randomUUID } from "crypto"
import path from "path"
import { getCurrentUser } from "@/lib/auth"
import { uploadToSupabase, getSupabaseSignedUrl, getSupabaseSignedUploadUrl } from "@/lib/storage"
import { MIME_MAP, ALLOWED_FILE_EXTENSIONS, ALLOWED_VIDEO_EXTENSIONS, MAX_FILE_SIZE, MAX_VIDEO_SIZE } from "@/lib/mime"

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })

  const kind = new URL(request.url).searchParams.get("kind") ?? "file"
  if (kind === "video" && user.role !== "TEACHER" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "غير مصرح برفع الفيديوهات" }, { status: 403 })
  }

  const mode = new URL(request.url).searchParams.get("mode") ?? "buffer"

  if (mode === "signed") {
    const contentType = request.headers.get("content-type") ?? ""
    const ext = path.extname(contentType).toLowerCase() || ".bin"
    const allowed = kind === "video" ? ALLOWED_VIDEO_EXTENSIONS : ALLOWED_FILE_EXTENSIONS
    if (!allowed.has(ext)) {
      return NextResponse.json({ error: "نوع الملف غير مدعوم" }, { status: 400 })
    }
    const filename = `${randomUUID()}${ext}`
    const signedUrl = await getSupabaseSignedUploadUrl(filename, 300)
    if (!signedUrl) {
      return NextResponse.json({ error: "فشل إنشاء رابط الرفع" }, { status: 500 })
    }
    return NextResponse.json({ uploadUrl: signedUrl, key: filename, url: `/api/files/${filename}` })
  }

  const formData = await request.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "لم يتم إرفاق ملف" }, { status: 400 })
  }

  const maxSize = kind === "video" ? MAX_VIDEO_SIZE : MAX_FILE_SIZE
  if (file.size > maxSize) {
    const mb = Math.round(maxSize / (1024 * 1024))
    return NextResponse.json({ error: `حجم الملف يجب ألا يتجاوز ${mb} ميجا` }, { status: 400 })
  }

  const ext = path.extname(file.name).toLowerCase()
  const allowed = kind === "video" ? ALLOWED_VIDEO_EXTENSIONS : ALLOWED_FILE_EXTENSIONS
  if (!allowed.has(ext)) {
    return NextResponse.json({ error: "نوع الملف غير مدعوم" }, { status: 400 })
  }

  const filename = `${randomUUID()}${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const fileContentType = MIME_MAP[ext] ?? "application/octet-stream"

  try {
    await uploadToSupabase(filename, buffer, fileContentType)
    const signedUrl = await getSupabaseSignedUrl(filename, 3600)
    if (!signedUrl) {
      return NextResponse.json({ error: "فشل إنشاء رابط الملف" }, { status: 500 })
    }
    return NextResponse.json({ url: `/api/files/${filename}`, signedUrl })
  } catch {
    return NextResponse.json({ error: "فشل رفع الملف" }, { status: 500 })
  }
}
