import { NextResponse, NextRequest } from "next/server"
import { randomUUID } from "crypto"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { getCurrentUser } from "@/lib/auth"

const MAX_VIDEO = 500 * 1024 * 1024 // 500MB
const MAX_FILE = 25 * 1024 * 1024 // 25MB
const ALLOWED_FILES = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"])
const ALLOWED_VIDEO = new Set([".mp4", ".webm", ".mov", ".mkv", ".ogv", ".avi"])

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

  const uploadDir = path.join(process.cwd(), "data", "uploads")
  await mkdir(uploadDir, { recursive: true })
  const filename = `${randomUUID()}${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(path.join(uploadDir, filename), buffer)

  return NextResponse.json({ url: `/api/files/${filename}` })
}
