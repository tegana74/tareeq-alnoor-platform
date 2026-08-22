import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { getSupabaseSignedUrl, supabaseFileExists } from "@/lib/storage"
import { MIME_MAP } from "@/lib/mime"

function sanitizeKey(raw: string): string | null {
  const decoded = decodeURIComponent(raw)
  if (!decoded || decoded.length > 255) return null
  if (decoded.includes("\0")) return null
  const normalized = decoded.replace(/\\/g, "/")
  if (normalized.includes("..") || normalized.startsWith("/")) return null
  if (/^https?:\/\//i.test(normalized)) return null
  const segments = normalized.split("/").filter(Boolean)
  for (const seg of segments) {
    if (seg === ".." || seg === "." || seg === "") return null
  }
  return segments.join("/")
}

async function resolveAccess(
  key: string,
  user: { id: string; role: string; teacherId: string | null }
) {
  const filePath = `/api/files/${key}`

  const [video, book, invoice] = await Promise.all([
    prisma.video.findFirst({ where: { url: filePath }, select: { isFree: true, downloadAllowed: true, section: { select: { courseId: true } } } }),
    prisma.book.findFirst({ where: { fileUrl: filePath }, select: { isFree: true, downloadAllowed: true, section: { select: { courseId: true } } } }),
    prisma.invoice.findFirst({ where: { proofImage: filePath }, select: { userId: true } }),
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
  const key = sanitizeKey(filename)
  if (!key) return new Response("غير موجود", { status: 404 })

  const wantDownload = new URL(request.url).searchParams.get("dl") === "1"
  const { allowed, downloadAllowed } = await resolveAccess(key, user)
  if (!allowed) return new Response("غير مصرح", { status: 403 })
  if (wantDownload && !downloadAllowed) {
    return new Response("التنزيل غير متاح لهذا الملف", { status: 403 })
  }

  const exists = await supabaseFileExists(key)
  if (!exists) return new Response("غير موجود", { status: 404 })

  const ext = `.${key.split(".").pop()}`
  const contentType = MIME_MAP[ext] || "application/octet-stream"
  const expiresIn = wantDownload ? 300 : 3600
  const signedUrl = await getSupabaseSignedUrl(key, expiresIn)
  if (!signedUrl) return new Response("فشل إنشاء رابط الملف", { status: 500 })

  return Response.redirect(signedUrl, 302)
}

export async function HEAD(request: NextRequest, ctx: { params: Promise<{ filename: string }> }) {
  const user = await getCurrentUser()
  if (!user) return new Response(null, { status: 401 })

  const { filename } = await ctx.params
  const key = sanitizeKey(filename)
  if (!key) return new Response(null, { status: 404 })

  const { allowed } = await resolveAccess(key, user)
  if (!allowed) return new Response(null, { status: 403 })

  const exists = await supabaseFileExists(key)
  if (!exists) return new Response(null, { status: 404 })

  const ext = `.${key.split(".").pop()}`
  const contentType = MIME_MAP[ext] || "application/octet-stream"

  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
