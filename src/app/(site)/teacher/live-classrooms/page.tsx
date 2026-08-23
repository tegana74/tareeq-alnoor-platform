import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { Radio } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { listTeacherClassrooms, listUpcomingSessionsForTeacher } from "@/lib/live-classroom/classrooms"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"

export const metadata: Metadata = { title: "قاعات البث المباشر" }

export default async function TeacherLiveClassroomsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (user.role !== "TEACHER" || !user.teacherId) notFound()

  const [classrooms, upcoming] = await Promise.all([
    listTeacherClassrooms(user.teacherId),
    listUpcomingSessionsForTeacher(user.teacherId),
  ])

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-black text-navy sm:text-3xl">
            <Radio className="h-7 w-7 text-primary-600" aria-hidden="true" />
            قاعات البث المباشر
          </h1>
          <p className="mt-2 text-muted-foreground">
            نظّم قاعاتك التعليمية وجلساتك المباشرة في مكان واحد
          </p>
        </div>
        <Button href="/teacher/live-classrooms/create" size="md">إنشاء قاعة</Button>
      </header>

      {/* القاعات */}
      <section aria-labelledby="rooms-title" className="mb-12">
        <h2 id="rooms-title" className="mb-5 text-xl font-black text-navy">القاعات</h2>
        {classrooms.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {classrooms.map((c) => (
              <Card key={c.id} variant="interactive">
                <a href={`/teacher/live-classrooms/${c.id}`} className="block p-5 focus-visible:outline-none rounded-2xl">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="font-extrabold text-navy">{c.title}</p>
                    <Badge variant={c.status === "active" ? "success" : "neutral"} size="sm">
                      {c.status === "active" ? "نشطة" : "مؤرشفة"}
                    </Badge>
                  </div>
                  {c.courseName && (
                    <p className="text-xs text-muted-foreground">الكورس: {c.courseName}</p>
                  )}
                  <p className="mt-2 text-xs font-bold text-primary-600">
                    {c.upcomingCount > 0 ? `${c.upcomingCount} جلسة قادمة` : "لا جلسات قادمة"}
                  </p>
                </a>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="لا توجد قاعات بعد"
            description="أنشئ أول قاعة بث لتنظيم جلساتك المباشرة."
            icon={<Radio className="h-7 w-7 text-primary-600" />}
            action={<Button href="/teacher/live-classrooms/create" size="sm">إنشاء قاعة</Button>}
            className="rounded-3xl border-2 border-dashed border-border bg-card"
          />
        )}
      </section>

      {/* الحصص القادمة */}
      <section aria-labelledby="upcoming-title" className="mb-12">
        <h2 id="upcoming-title" className="mb-5 text-xl font-black text-navy">الحصص القادمة</h2>
        {upcoming.length > 0 ? (
          <ul className="space-y-3">
            {upcoming.map((s) => (
              <li key={s.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-navy">{s.title}</p>
                    <p className="text-xs text-muted-foreground">{s.startLabel}</p>
                  </div>
                  <Badge variant="primary" size="sm">قادمة</Badge>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            لا توجد حصص قادمة مجدولة
          </p>
        )}
      </section>

      {/* الحصص السابقة */}
      <section aria-labelledby="past-title">
        <h2 id="past-title" className="mb-5 text-xl font-black text-navy">الحصص السابقة</h2>
        <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          سجل الحصص المنتهية سيظهر هنا بعد انعقاد الجلسات
        </p>
      </section>
    </div>
  )
}
