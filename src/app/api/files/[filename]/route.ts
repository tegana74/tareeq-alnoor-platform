import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { getSupabaseFile, getSupabasePublicUrl } from "@/lib/storage"

const MIME: Record<string, string> = {
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".mkv": "video/x-matroska", ".ogv": "video/ogg", ".avi": "video/x-msvideo",
  ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
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
  return { allowed: user.role === "ADMIN", downloadAllowed: false }
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ filename: string }> }) {
  const user = await getCurrentUser()
  if (!user) return new Response("يجب تسجيل الدخول", { status: 401 })

  const { filename } = await ctx.params
  const decoded = decodeURIComponent(filename)
  if (!decoded || decoded.length > 255) return new Response("غير موجود", { status: 404 })

  const wantDownload = new URL(request.url).searchParams.get("dl") === "1"
  const { allowed, downloadAllowed } = await resolveAccess(decoded, user)
  if (!allowed) return new Response("غير مصرح", { status: 403 })
  if (wantDownload && !downloadAllowed) {
    return new Response("التنزيل غير متاح لهذا الملف", { status: 403 })
  }

  const file = await getSupabaseFile(decoded)
  if (!file) return new Response("غير موجود", { status: 404 })

  const ext = `.${decoded.split(".").pop()}`
  const contentType = file.contentType || MIME[ext] || "application/octet-stream"
  const disposition = wantDownload ? "attachment" : "inline"

  return new Response(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(file.buffer.length),
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(decoded)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

export async function HEAD(request: NextRequest, ctx: { params: Promise<{ filename: string }> }) {
  const res = await GET(request, ctx)
  return new Response(null, { status: res.status })
}
