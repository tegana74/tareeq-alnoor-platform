import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { CalendarClock, Radio, Video } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { formatPrice } from "@/lib/utils"

export const metadata: Metadata = { title: "البث المباشر" }

export default async function LiveListPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const sessions = await prisma.liveSession.findMany({
    include: {
      teacher: { select: { user: { select: { firstName: true } } } },
      course: { select: { id: true, name: true } },
      bookings: { where: { userId: user.id }, select: { status: true }, take: 1 },
    },
    orderBy: { startAt: "desc" },
  })

  const paidCourseIds = new Set<string>()
  for (const s of sessions) {
    if (s.courseId) paidCourseIds.add(s.courseId)
  }

  let subscribedCourseIds = new Set<string>()
  if (paidCourseIds.size > 0 && user.role === "STUDENT") {
    const subs = await prisma.subscription.findMany({
      where: {
        userId: user.id,
        courseId: { in: [...paidCourseIds] },
        status: "active",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { courseId: true },
    })
    subscribedCourseIds = new Set(subs.map((s) => s.courseId))
  }

  const now = new Date()
  const accessible: typeof sessions = []
  for (const s of sessions) {
    const ok = s.isFree || !s.courseId || user.role === "ADMIN" || subscribedCourseIds.has(s.courseId)
    if (ok) accessible.push(s)
  }

  const upcoming = accessible
    .filter((s) => new Date(s.startAt).getTime() > now.getTime() - s.durationMinutes * 60000)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
  const past = accessible.filter((s) => !upcoming.includes(s))

  const Card = ({ s, status }: { s: (typeof accessible)[number]; status: string }) => {
    const start = new Date(s.startAt)
    const isLive = start.getTime() <= now.getTime() && now.getTime() < start.getTime() + s.durationMinutes * 60000
    return (
      <Link
        href={`/live/${s.id}`}
        className="block rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md"
      >
        <div className="flex items-center justify-between">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${
              isLive
                ? "bg-rose-50 text-rose-600"
                : status === "upcoming"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-slate-100 text-slate-500"
            }`}
          >
            {isLive ? (
              <>
                <Radio className="h-3 w-3 animate-pulse" /> مباشر الآن
              </>
            ) : status === "upcoming" ? (
              <>
                <CalendarClock className="h-3 w-3" /> جارية لاحقاً
              </>
            ) : (
              <>
                <Video className="h-3 w-3" /> مسجلة
              </>
            )}
          </span>
          {s.isFree && <span className="text-[11px] font-black text-mint-dark">مجانية</span>}
          {!s.isFree && Number(s.price) > 0 && (
            <span className="text-[11px] font-black text-amber-600">{formatPrice(Number(s.price))}</span>
          )}
          {!s.isFree && Number(s.price) > 0 && s.bookings[0]?.status === "booked" && (
            <span className="text-[11px] font-black text-mint-dark">· محجوزة</span>
          )}
        </div>
        <h3 className="mt-3 text-lg font-black text-navy">{s.title}</h3>
        {s.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{s.description}</p>}
        <p className="mt-3 text-xs text-slate-400">
          {start.toLocaleString("ar-EG", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {" · "}
          {s.course?.name ?? s.teacher.user?.firstName ?? ""}
        </p>
      </Link>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-navy">البث المباشر</h1>
        <Link
          href="/live-classrooms"
          className="rounded-xl border-2 border-primary-300 bg-primary-50 px-4 py-2 text-sm font-bold text-primary-700 transition-colors hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        >
          القاعات المباشرة ←
        </Link>
      </div>

      {upcoming.length > 0 && (
        <>
          <h2 className="mb-4 font-extrabold text-slate-600">القادم والمباشر الآن</h2>
          <div className="mb-10 grid gap-4 sm:grid-cols-2">
            {upcoming.map((s) => (
              <Card key={s.id} s={s} status="upcoming" />
            ))}
          </div>
        </>
      )}

      <h2 className="mb-4 font-extrabold text-slate-600">الجلسات السابقة</h2>
      {past.length === 0 ? (
        <p className="text-sm text-slate-400">لا توجد جلسات بعد.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {past.map((s) => (
            <Card key={s.id} s={s} status="past" />
          ))}
        </div>
      )}
    </div>
  )
}
