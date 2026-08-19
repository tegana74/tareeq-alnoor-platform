import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { CalendarClock, ChevronLeft, Radio } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { getVideoEmbedUrl } from "@/lib/video"
import { formatPrice } from "@/lib/utils"
import { LiveCountdown } from "./live-countdown"
import { MarkAttendance } from "./mark-attendance"
import { BookingPanel } from "./booking-form"

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

  const hasAccess =
    session.isFree ||
    !session.courseId ||
    (await canAccessCourse(user, session.courseId))
  if (!hasAccess) redirect("/")

  const isPaidSession = !session.isFree && Number(session.price) > 0
  const booking = session.bookings[0]
  const canWatch = !isPaidSession || booking?.status === "booked"

  const start = new Date(session.startAt)
  const end = new Date(start.getTime() + session.durationMinutes * 60000)
  const now = new Date()
  const isLive = start.getTime() <= now.getTime() && now.getTime() < end.getTime()
  const isPast = now.getTime() >= end.getTime()
  const attended = session.attendances.length > 0

  const rawUrl = session.url ?? ""
  const isEmbeddable = /youtube\.com|youtu\.be/i.test(rawUrl)
  const embedUrl = rawUrl && isEmbeddable ? getVideoEmbedUrl("YOUTUBE", rawUrl) : null

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/live" className="hover:text-amber-600">
          البث المباشر
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-black text-navy">{session.title}</span>
      </nav>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-black text-navy">{session.title}</h1>
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black ${
            isLive ? "bg-rose-50 text-rose-600" : isPast ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"
          }`}
        >
          {isLive ? (
            <>
              <Radio className="h-3.5 w-3.5 animate-pulse" /> مباشر الآن
            </>
          ) : isPast ? (
            "انتهت الجلسة"
          ) : (
            <>
              <CalendarClock className="h-3.5 w-3.5" /> لم تبدأ بعد
            </>
          )}
        </span>
      </div>

      {session.description && <p className="mb-6 leading-8 text-slate-600">{session.description}</p>}

      {!session.isFree && Number(session.price) > 0 && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <span className="text-2xl font-black text-amber-600">{formatPrice(Number(session.price))}</span>
          <span className="text-sm font-bold text-amber-800">
            {canWatch ? "تكلفة الحصة — تم الحجز بنجاح" : "تكلفة الحصة — يلزم حجزها لحضور البث"}
          </span>
        </div>
      )}

      {isPaidSession && (
        <div className="mb-6">
          <BookingPanel
            sessionId={session.id}
            title={session.title}
            price={Number(session.price)}
            wallet={Number(user.walletBalance)}
            booked={booking?.status === "booked"}
          />
        </div>
      )}

      {(isLive || isPast) && canWatch && embedUrl && (
        <div className="mb-6 overflow-hidden rounded-2xl bg-black shadow-xl">
          <iframe
            src={embedUrl}
            className="aspect-video w-full"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            title={session.title}
          />
        </div>
      )}

      {(isLive || isPast) && canWatch && rawUrl && !isEmbeddable && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <p className="mb-1 text-sm font-black text-navy">
            جلسة عبر {rawUrl.includes("zoom.us") ? "Zoom" : rawUrl.includes("meet.google") ? "Google Meet" : "رابط خارجي"}
          </p>
          <p className="mb-4 text-xs text-slate-500">
            يفتح البث في تطبيق أو نافذة خارجية. تأكد من تسجيل حضورك بعد الالتحاق.
          </p>
          <a
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-6 py-3 text-sm font-black text-white hover:opacity-90"
          >
            <Radio className="h-4 w-4 animate-pulse" />
            {isLive ? "انضم للجلسة الآن" : "فتح رابط الجلسة"}
          </a>
          <p className="mt-3 break-all text-[11px] text-slate-400" dir="ltr">
            {rawUrl}
          </p>
        </div>
      )}

      {!isLive && canWatch && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <LiveCountdown
            start={start.getTime()}
            end={end.getTime()}
            kind={!rawUrl ? "none" : isEmbeddable ? "embed" : "link"}
          />
        </div>
      )}

      <div className="mb-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <p className="font-black text-navy">{session.teacher.user?.firstName ?? ""}</p>
          {session.course && <p className="text-xs text-slate-500">كورس: {session.course.name}</p>}
        </div>
        {canWatch && <MarkAttendance sessionId={session.id} isLive={isLive} attended={attended} />}
      </div>
    </div>
  )
}
