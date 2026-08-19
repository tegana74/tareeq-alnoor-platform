import { NextRequest } from "next/server"
import { stat } from "fs/promises"
import { createReadStream } from "fs"
import path from "path"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"

const STORAGE = path.join(process.cwd(), "data", "uploads")

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".ogv": "video/ogg",
  ".avi": "video/x-msvideo",
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
}

async function resolveAccess(
  filename: string,
  user: { id: string; role: string; teacherId: string | null }
) {
  const filePath = `/api/files/${filename}`

  const [video, book, invoice] = await Promise.all([
    prisma.video.findFirst({ where: { url: filePath }, include: { section: { include: { course: true } } } }),
    prisma.book.findFirst({ where: { fileUrl: filePath }, include: { section: { include: { course: true } } } }),
    prisma.invoice.findFirst({ where: { proofImage: filePath } }),
  ])

  if (video) {
    const allowed = video.isFree || (await canAccessCourse(user, video.section.courseId))
    return { allowed, downloadAllowed: video.downloadAllowed }
  }
  if (book) {
    const allowed = book.isFree || (await canAccessCourse(user, book.section.courseId))
    return { allowed, downloadAllowed: book.downloadAllowed }
  }
  if (invoice) {
    return { allowed: invoice.userId === user.id || user.role === "ADMIN", downloadAllowed: true }
  }
  return { allowed: false, downloadAllowed: false }
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ filename: string }> }) {
  const user = await getCurrentUser()
  if (!user) return new Response("يجب تسجيل الدخول", { status: 401 })

  const { filename } = await ctx.params
  if (!/^[\w-]+(\.[a-z0-9]+)?$/i.test(filename)) return new Response("غير موجود", { status: 404 })

  const wantDownload = new URL(request.url).searchParams.get("dl") === "1"
  const { allowed, downloadAllowed } = await resolveAccess(filename, user)
  if (!allowed) return new Response("غير مصرح", { status: 403 })
  if (wantDownload && !downloadAllowed) {
    return new Response("التنزيل غير متاح لهذا الملف", { status: 403 })
  }

  const filePath = path.join(STORAGE, filename)
  let size: number
  try {
    size = (await stat(filePath)).size
  } catch {
    return new Response("غير موجود", { status: 404 })
  }

  const ext = path.extname(filename).toLowerCase()
  const contentType = MIME[ext] ?? "application/octet-stream"
  const disposition = wantDownload ? "attachment" : "inline"

  const range = request.headers.get("range")
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0
      let end = m[2] ? parseInt(m[2], 10) : size - 1
      if (isNaN(start)) start = 0
      if (isNaN(end) || end >= size) end = size - 1
      if (start > end || start >= size) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } })
      }
      const stream = createReadStream(filePath, { start, end })
      return new Response(stream as unknown as BodyInit, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": `${disposition}; filename="${filename}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      })
    }
  }

  const stream = createReadStream(filePath)
  return new Response(stream as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

export async function HEAD(request: NextRequest, ctx: { params: Promise<{ filename: string }> }) {
  const res = await GET(request, ctx)
  return new Response(null, { status: res.status })
}
