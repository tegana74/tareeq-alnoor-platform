import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { LiveRoomClient } from "./live-room-client"
import type { LiveSessionStatus } from "@/lib/live-classroom/types"

interface LivePageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: LivePageProps): Promise<Metadata> {
  const { id } = await params
  const s = await prisma.liveSession.findUnique({ where: { id } })
  return { title: s?.title ?? "بث مباشر" }
}

export default async function LiveSessionPage({ params }: LivePageProps) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const session = await prisma.liveSession.findUnique({
    where: { id },
    include: {
      teacher: { include: { user: true } },
      course: true,
      attendances: { where: { userId: user.id } },
      bookings: { where: { userId: user.id } },
    },
  })
  if (!session) notFound()

  // 1. التحقق من صلاحيات الكورس الأساسية
  const hasAccess =
    session.isFree ||
    !session.courseId ||
    (await canAccessCourse(user, session.courseId))
  if (!hasAccess) redirect("/")

  // 2. التحقق من صلاحيات إدارة القاعة (معلم الجلسة أو أدمن)
  const isManager =
    user.role === "ADMIN" ||
    (user.role === "TEACHER" && user.teacherId === session.teacherId)

  const booking = session.bookings[0]

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/live" className="hover:text-amber-600">
          البث المباشر
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-black text-navy">{session.title}</span>
      </nav>

      <LiveRoomClient
        sessionId={session.id}
        initialStatus={(session.status || "scheduled") as LiveSessionStatus}
        title={session.title}
        description={session.description}
        price={Number(session.price)}
        isFree={session.isFree}
        userWallet={Number(user.walletBalance)}
        hasBooking={booking?.status === "booked"}
        isManager={isManager}
        teacherName={session.teacher.user?.firstName ?? ""}
        courseName={session.course?.name ?? null}
        startAt={session.startAt.toISOString()}
        durationMinutes={session.durationMinutes}
      />
    </div>
  )
}
