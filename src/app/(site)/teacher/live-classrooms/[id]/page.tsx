import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { UsersRound } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { getClassroomForUser } from "@/lib/live-classroom/classrooms"
import { canManageClassroom } from "@/lib/live-classroom/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"

interface ClassroomDetailProps {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = { title: "تفاصيل القاعة" }

export default async function ClassroomDetailPage({ params }: ClassroomDetailProps) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  // الوصول: مالك المعلم / أدمن / طالب عضو (اشتراك كورس أو حجز جلسة)
  const classroom = user.role === "STUDENT" || user.role === "TEACHER" || user.role === "ADMIN"
    ? await getClassroomForUser(id, {
        id: user.id,
        role: user.role,
        teacherId: user.teacherId,
      })
    : null
  if (!classroom) notFound()

  const isManager = canManageClassroom(
    { role: user.role, teacherId: user.teacherId },
    { teacherId: classroom.teacherId }
  )

  // Server Component: الطابع الزمني يُحسب مرة عند الطلب — استثناء مقصود لقاعدة النقاء
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const upcoming = classroom.sessions.filter((s) => s.startAt.getTime() > now)
  const past = classroom.sessions.filter((s) => s.startAt.getTime() <= now)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={classroom.status === "active" ? "success" : "neutral"} size="sm">
            {classroom.status === "active" ? "قاعة نشطة" : "مؤرشفة"}
          </Badge>
          {isManager && <Badge variant="primary" size="sm">صلاحية إدارة</Badge>}
        </div>
        <h1 className="text-2xl font-black text-navy sm:text-3xl">{classroom.title}</h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <UsersRound className="h-4 w-4 text-primary-600" aria-hidden="true" />
          المدرس: {classroom.teacherName}
          {classroom.courseName && <> · الكورس: {classroom.courseName}</>}
        </p>
      </header>

      {classroom.description && (
        <Card className="mb-10 p-5">
          <p className="text-sm leading-7 text-muted-foreground">{classroom.description}</p>
        </Card>
      )}

      <section aria-labelledby="sessions-title" className="space-y-8">
        <div>
          <h2 id="sessions-title" className="mb-4 text-xl font-black text-navy">الجلسات</h2>
          {upcoming.length > 0 || past.length > 0 ? (
            <ul className="space-y-3">
              {[...upcoming, ...past].map((s) => {
                const isUpcoming = s.startAt.getTime() > now
                return (
                  <li key={s.id}>
                    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-navy">{s.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Intl.DateTimeFormat("ar-EG", {
                            day: "numeric",
                            month: "long",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(s.startAt)}
                        </p>
                      </div>
                      <Badge variant={isUpcoming ? "primary" : "neutral"} size="sm">
                        {isUpcoming ? "قادمة" : "انتهت"}
                      </Badge>
                    </Card>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState
              title="لا توجد جلسات مجدولة بعد"
              description={
                isManager
                  ? "يمكنك جدولة جلسات من صفحة البث الحالي، وربطها بهذه القاعة قريبًا."
                  : "تابع مع معلمك لمواعيد الجلسات القادمة."
              }
              icon={<UsersRound className="h-7 w-7 text-primary-600" />}
              className="rounded-2xl border border-dashed border-border bg-card py-10"
            />
          )}
        </div>

        <AlertNote />
      </section>

      <div className="mt-10">
        <Link href={user.role === "TEACHER" ? "/teacher/live-classrooms" : "/live-classrooms"} className="rounded text-sm font-bold text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
          رجوع إلى القائمة
        </Link>
      </div>

      {/* Placeholder CTA — يُستبدل بغرفة البث في مرحلة المحرك */}
      {upcoming.length > 0 && (
        <div className="mt-10 rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm font-bold text-navy">غرفة البث المباشر</p>
          <p className="mt-1 text-xs text-muted-foreground">تُفتح هنا تلقائيًا عند بدء الجلسة (المرحلة الثانية)</p>
          <Button variant="outline" size="sm" disabled aria-disabled="true" className="mt-4">
            الدخول للغرفة — قريبًا
          </Button>
        </div>
      )}
    </div>
  )
}

function AlertNote() {
  return (
    <p className="rounded-xl bg-primary-50 px-4 py-3 text-xs font-bold text-primary-700">
      هذه الصفحة جزء من تأسيس قسم البث — غرفة البث الفعلية تُضاف في المرحلة الثالثة.
    </p>
  )
}
