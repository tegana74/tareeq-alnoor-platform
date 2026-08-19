import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { CalendarClock, Radio, Users } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { formatPrice } from "@/lib/utils"
import { LiveForm, DeleteLive } from "./live-forms"

export const metadata: Metadata = { title: "البث المباشر — لوحة المدرس" }

export default async function TeacherLivePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const isAdmin = user.role === "ADMIN"
  if (user.role !== "TEACHER" && !isAdmin) redirect("/teacher")

  const courses = isAdmin
    ? await prisma.course.findMany({ orderBy: { name: "asc" } })
    : await prisma.course.findMany({ where: { teacherId: user.teacherId! }, orderBy: { name: "asc" } })

  const sessions = await prisma.liveSession.findMany({
    where: isAdmin ? {} : { teacherId: user.teacherId! },
    include: {
      course: true,
      attendances: { include: { user: true }, orderBy: { attendedAt: "asc" } },
    },
    orderBy: { startAt: "desc" },
  })

  // إحصائية حضور كل طالب
  const teacherId = isAdmin ? undefined : user.teacherId!
  const attendeesGroup = await prisma.liveSessionAttendance.groupBy({
    by: ["userId"],
    where: { session: teacherId ? { teacherId } : {} },
    _count: { _all: true },
    orderBy: { _count: { userId: "desc" } },
  })
  const attendeeIds = attendeesGroup.map((a) => a.userId)
  const attendees = attendeeIds.length
    ? await prisma.user.findMany({
        where: { id: { in: attendeeIds } },
        select: { id: true, firstName: true, lastName: true, phone: true },
      })
    : []
  const attendeeName = new Map(attendees.map((u) => [u.id, `${u.firstName} ${u.lastName}`]))
  const attendeePhone = new Map(attendees.map((u) => [u.id, u.phone]))
  const attendCount = new Map(attendeesGroup.map((a) => [a.userId, a._count._all]))

  // طلاب المعلم المشتركون في كورساته
  const students = isAdmin
    ? []
    : await prisma.subscription.findMany({
        where: { course: { teacherId }, status: "active" },
        distinct: ["userId"],
        include: { user: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      })
  const studentAttend = new Map(
    students.map((s) => [s.userId, attendCount.get(s.userId) ?? 0])
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/teacher" className="hover:text-amber-600">
          لوحة المدرس
        </Link>
        <span className="font-black text-navy">البث المباشر</span>
      </nav>

      <h1 className="mb-6 text-2xl font-black text-navy">الجلسات المباشرة</h1>
      <div className="mb-8">
        <LiveForm courses={courses} />
      </div>

      {sessions.length === 0 ? (
        <p className="mb-10 text-sm text-slate-400">لا توجد جلسات بعد — أنشئ أول جلسة الآن.</p>
      ) : (
        <div className="mb-10 space-y-3">
          {sessions.map((s) => {
            const attend = s.attendances
            return (
              <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-navy">{s.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {s.startAt.toLocaleString("ar-EG", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {s.course && <span>{s.course.name}</span>}
                      {!s.isFree && Number(s.price) > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-black text-amber-600">
                          {formatPrice(s.price)}
                        </span>
                      )}
                      <span className="flex items-center gap-1 font-black text-mint-dark">
                        <Users className="h-3.5 w-3.5" /> {attend.length} حاضر
                      </span>
                      {s.isFree && <span className="rounded-full bg-mint-50 px-2 py-0.5 font-black text-mint-dark">مجانية</span>}
                      {s.url ? (
                        <span className="flex items-center gap-1 text-rose-600">
                          <Radio className="h-3.5 w-3.5" /> جاهزة للبث
                        </span>
                      ) : (
                        <span className="text-amber-600">بدون رابط بث</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <LiveForm
                      courses={courses}
                      session={{
                        id: s.id,
                        title: s.title,
                        description: s.description ?? undefined,
                        courseId: s.courseId ?? undefined,
                        startAt: s.startAt,
                        durationMinutes: s.durationMinutes,
                        url: s.url ?? undefined,
                        isFree: s.isFree,
                        maxCapacity: s.maxCapacity,
                        price: Number(s.price),
                      }}
                    />
                    <DeleteLive id={s.id} />
                  </div>
                </div>

                {attend.length > 0 && (
                  <details className="mt-3 border-t border-slate-100 pt-3">
                    <summary className="cursor-pointer text-xs font-black text-slate-500 hover:text-amber-600">
                      أسماء الحاضرين ({attend.length})
                    </summary>
                    <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                      {attend.map((a) => (
                        <li key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                          <span className="font-bold text-navy">
                            {a.user.firstName} {a.user.lastName}
                          </span>
                          <span className="text-slate-400" dir="ltr">
                            {a.user.phone}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )
          })}
        </div>
      )}

      <h2 className="mb-4 text-lg font-black text-navy">إحصائية حضور الطلاب</h2>
      {isAdmin ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black text-slate-500">إجمالي حضور كل طالب (كل المعلمين):</p>
          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {attendeeIds.map((uid) => (
              <li key={uid} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                <span className="font-bold text-navy">{attendeeName.get(uid) ?? uid}</span>
                <span className="text-slate-500">{attendCount.get(uid) ?? 0} جلسة</span>
              </li>
            ))}
            {attendeeIds.length === 0 && <li className="text-xs text-slate-400">لا حضور بعد.</li>}
          </ul>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-right text-xs text-slate-500">
                <th className="px-4 py-3 font-black">الطالب</th>
                <th className="px-4 py-3 font-black">الهاتف</th>
                <th className="px-4 py-3 font-black">الجلسات الحاضرة</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.userId} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 font-bold text-navy">
                    {s.user.firstName} {s.user.lastName}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500" dir="ltr">
                    {s.user.phone}
                  </td>
                  <td className="px-4 py-2.5 font-black text-mint-dark">{studentAttend.get(s.userId)}</td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-xs text-slate-400">
                    لا يوجد مشتركون بعد في كورساتك.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isAdmin && attendeeIds.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 font-extrabold text-navy">أكثر الطلاب حضوراً</h3>
          <ul className="space-y-2">
            {attendeeIds.slice(0, 5).map((uid, i) => (
              <li key={uid} className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-2.5 text-sm">
                <span className="font-bold text-navy">
                  <span className="ml-2 font-black text-amber-500">#{i + 1}</span>
                  {attendeeName.get(uid) ?? uid}
                </span>
                <span className="text-xs text-slate-500">
                  {attendeePhone.get(uid) ?? ""} — {attendCount.get(uid)} جلسات
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
