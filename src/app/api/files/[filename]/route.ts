import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { headR2, getR2Object } from "@/lib/r2"

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

  const head = await headR2(filename)
  if (!head) return new Response("غير موجود", { status: 404 })

  const ext = `.${filename.split(".").pop()}`
  const contentType = head.contentType || MIME[ext] || "application/octet-stream"
  const disposition = wantDownload ? "attachment" : "inline"

  try {
    const obj = await getR2Object(filename)
    const body = obj.Body
    if (!body) return new Response("غير موجود", { status: 404 })

    const webStream = body.transformToWebStream()
    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(head.size),
        "Accept-Ranges": "bytes",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return new Response("خطأ في جلب الملف", { status: 500 })
  }
}

export async function HEAD(request: NextRequest, ctx: { params: Promise<{ filename: string }> }) {
  const res = await GET(request, ctx)
  return new Response(null, { status: res.status })
}
