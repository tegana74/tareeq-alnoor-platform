import { NextResponse, NextRequest } from "next/server"
import { randomUUID } from "crypto"
import path from "path"
import { getCurrentUser } from "@/lib/auth"
import { uploadToR2 } from "@/lib/r2"

const MAX_VIDEO = 500 * 1024 * 1024
const MAX_FILE = 25 * 1024 * 1024
const ALLOWED_FILES = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"])
const ALLOWED_VIDEO = new Set([".mp4", ".webm", ".mov", ".mkv", ".ogv", ".avi"])

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".pdf": "application/pdf",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".mkv": "video/x-matroska", ".ogv": "video/ogg", ".avi": "video/x-msvideo",
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })

  const kind = new URL(request.url).searchParams.get("kind") ?? "file"
  if (kind === "video" && user.role !== "TEACHER" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "غير مصرح برفع الفيديوهات" }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "لم يتم إرفاق ملف" }, { status: 400 })
  }

  const maxSize = kind === "video" ? MAX_VIDEO : MAX_FILE
  if (file.size > maxSize) {
    const mb = Math.round(maxSize / (1024 * 1024))
    return NextResponse.json({ error: `حجم الملف يجب ألا يتجاوز ${mb} ميجا` }, { status: 400 })
  }

  const ext = path.extname(file.name).toLowerCase()
  const allowed = kind === "video" ? ALLOWED_VIDEO : ALLOWED_FILES
  if (!allowed.has(ext)) {
    return NextResponse.json({ error: "نوع الملف غير مدعوم" }, { status: 400 })
  }

  const filename = `${randomUUID()}${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const contentType = MIME[ext] ?? "application/octet-stream"

  try {
    await uploadToR2(filename, buffer, contentType)
    return NextResponse.json({ url: `/api/files/${filename}` })
  } catch (e) {
    return NextResponse.json({ error: "فشل رفع الملف" + (e instanceof Error ? `: ${e.message}` : "") }, { status: 500 })
  }
}
