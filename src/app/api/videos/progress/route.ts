import { NextResponse, NextRequest } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { awardPoints } from "@/lib/points"

const schema = z.object({
  videoId: z.string().min(1),
  progress: z.number().int().min(0).max(100).default(0),
  completed: z.boolean().default(false),
})

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 })
  }

  const { videoId, progress, completed } = parsed.data

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { section: true },
  })
  if (!video) {
    return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 })
  }

  const courseId = video.section.courseId
  const subscription = await prisma.subscription.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  })
  const canAccess =
    video.isFree ||
    (subscription?.status === "active" && (!subscription.expiresAt || subscription.expiresAt > new Date()))

  if (!canAccess) {
    return NextResponse.json({ error: "أنت غير مشترك في هذا الكورس" }, { status: 403 })
  }

  await prisma.videoView.upsert({
    where: { userId_videoId: { userId: user.id, videoId } },
    update: {
      progress: completed ? 100 : progress,
      isCompleted: completed || progress >= 90,
    },
    create: {
      userId: user.id,
      videoId,
      progress: completed ? 100 : progress,
      isCompleted: completed || progress >= 90,
    },
  })

  const isCompleted = completed || progress >= 90
  if (isCompleted) {
    await awardPoints(user.id, 5, `video:${videoId}`, "إكمال مشاهدة محاضرة")
  }

  return NextResponse.json({ ok: true })
}
