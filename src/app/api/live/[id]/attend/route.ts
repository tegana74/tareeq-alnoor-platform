import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })

  const { id } = await ctx.params
  const session = await prisma.liveSession.findUnique({ where: { id } })
  if (!session) return NextResponse.json({ error: "غير موجودة" }, { status: 404 })

  const hasAccess =
    session.isFree ||
    !session.courseId ||
    (await canAccessCourse(user, session.courseId))
  if (!hasAccess) return NextResponse.json({ error: "غير مصرح" }, { status: 403 })

  const start = new Date(session.startAt)
  const end = new Date(start.getTime() + session.durationMinutes * 60000)
  const now = new Date()
  if (now < start || now > end) return NextResponse.json({ error: "خارج وقت البث" }, { status: 400 })

  await prisma.liveSessionAttendance.upsert({
    where: { userId_sessionId: { userId: user.id, sessionId: id } },
    create: { userId: user.id, sessionId: id },
    update: {},
  })
  return NextResponse.json({ ok: true })
}
