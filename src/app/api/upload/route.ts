import { NextResponse, NextRequest } from "next/server"
import { randomUUID } from "crypto"
import path from "path"
import { getCurrentUser } from "@/lib/auth"
import { getSupabaseSignedUploadUrl, uploadToSupabase, getSupabaseSignedUrl } from "@/lib/storage"
import { MIME_MAP, ALLOWED_FILE_EXTENSIONS, ALLOWED_VIDEO_EXTENSIONS, MAX_FILE_SIZE, MAX_VIDEO_SIZE } from "@/lib/mime"

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })

  const searchParams = new URL(request.url).searchParams
  const kind = searchParams.get("kind") ?? "file"
  if (kind === "video" && user.role !== "TEACHER" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "غير مصرح برفع الفيديوهات" }, { status: 403 })
  }

  const mode = searchParams.get("mode") ?? "buffer"
  const allowed = kind === "video" ? ALLOWED_VIDEO_EXTENSIONS : ALLOWED_FILE_EXTENSIONS
  const maxSize = kind === "video" ? MAX_VIDEO_SIZE : MAX_FILE_SIZE

  // ===== مسار Signed Upload — مباشر نحو Supabase دون مرور الجسم عبر Serverless =====
  if (mode === "signed") {
    try {
      const rawName = searchParams.get("name") ?? ""
      const ext = path.extname(rawName).toLowerCase()
      if (!ext || !allowed.has(ext)) {
        return NextResponse.json({ error: "نوع الملف غير مدعوم" }, { status: 400 })
      }

      const declaredSize = Number(searchParams.get("size") ?? 0)
      if (Number.isFinite(declaredSize) && declaredSize > maxSize) {
        return NextResponse.json(
          { error: `حجم الملف يجب ألا يتجاوز ${Math.round(maxSize / (1024 * 1024))} ميجا` },
          { status: 400 }
        )
      }

      const filename = `${randomUUID()}${ext}`
      const uploadUrl = await getSupabaseSignedUploadUrl(filename)
      if (!uploadUrl) {
        console.error("[UPLOAD_SIGNED_URL_ERROR]", { kind, ext })
        return NextResponse.json({ error: "فشل تجهيز رابط الرفع" }, { status: 500 })
      }

      return NextResponse.json({
        uploadUrl,
        key: filename,
        url: `/api/files/${filename}`,
      })
    } catch (error) {
      console.error("[UPLOAD_SIGNED_URL_ERROR]", error instanceof Error ? error.message : "unknown")
      return NextResponse.json({ error: "فشل تجهيز رابط الرفع" }, { status: 500 })
    }
  }

  // ===== مسار Buffer — للملفات الصغيرة فقط (أقل من حد Vercel body) =====
  try {
    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "لم يتم إرفاق ملف" }, { status: 400 })
    }

    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `حجم الملف يجب ألا يتجاوز ${Math.round(maxSize / (1024 * 1024))} ميجا` },
        { status: 400 }
      )
    }

    const ext = path.extname(file.name).toLowerCase()
    if (!allowed.has(ext)) {
      return NextResponse.json({ error: "نوع الملف غير مدعوم" }, { status: 400 })
    }

    const filename = `${randomUUID()}${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const fileContentType = MIME_MAP[ext] ?? "application/octet-stream"

    await uploadToSupabase(filename, buffer, fileContentType)
    const signedUrl = await getSupabaseSignedUrl(filename, 3600)
    if (!signedUrl) {
      console.error("[UPLOAD_SIGNED_READ_ERROR]", { key: filename })
      return NextResponse.json({ error: "فشل إنشاء رابط الملف" }, { status: 500 })
    }

    return NextResponse.json({ url: `/api/files/${filename}`, signedUrl })
  } catch (error) {
    console.error("[UPLOAD_STORAGE_ERROR]", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ error: "فشل رفع الملف" }, { status: 500 })
  }
}
