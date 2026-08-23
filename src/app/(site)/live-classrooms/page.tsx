import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { Radio } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { listStudentClassrooms } from "@/lib/live-classroom/classrooms"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"

export const metadata: Metadata = { title: "القاعات المباشرة" }
export const dynamic = "force-dynamic"

export default async function StudentLiveClassroomsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (user.role !== "STUDENT") notFound()

  const classrooms = await listStudentClassrooms(user.id)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="flex items-center gap-2.5 text-2xl font-black text-navy sm:text-3xl">
          <Radio className="h-7 w-7 text-primary-600" aria-hidden="true" />
          القاعات المباشرة
        </h1>
        <p className="mt-2 text-muted-foreground">
          قاعات البث المرتبطة بكورساتك وحجوزاتك — غرفة البث تُفتح هنا عند بدء الجلسة
        </p>
      </header>

      {classrooms.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classrooms.map((c) => (
            <Card key={c.id} variant="interactive">
              <Link
                href={`/teacher/live-classrooms/${c.id}`}
                className="block rounded-2xl p-5 focus-visible:outline-none"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="font-extrabold text-navy">{c.title}</p>
                  <Badge variant={c.upcomingCount > 0 ? "primary" : "neutral"} size="sm">
                    {c.upcomingCount > 0 ? `${c.upcomingCount} قادمة` : "لا قادمة"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{c.teacherName}</p>
                {c.courseName && (
                  <p className="mt-1 text-xs text-muted-foreground">الكورس: {c.courseName}</p>
                )}
                <p className="mt-3 text-xs font-bold text-primary-600">عرض تفاصيل القاعة</p>
              </Link>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="لا توجد قاعات متاحة لك بعد"
          description="تظهر هنا قاعات بث كورساتك المشتركة والجلسات التي تحجزها."
          icon={<Radio className="h-7 w-7 text-primary-600" />}
          action={<Button href="/courses" size="sm">تصفح الكورسات</Button>}
          className="rounded-3xl border-2 border-dashed border-border bg-card"
        />
      )}

      <p className="mt-10 text-center text-xs text-muted-foreground">
        تحتاج حصة مباشرة عادية (بدون قاعة)؟{" "}
        <Link href="/live" className="font-bold text-primary-600 hover:underline">
          انتقل إلى صفحة البث الحالي
        </Link>
      </p>
    </div>
  )
}
