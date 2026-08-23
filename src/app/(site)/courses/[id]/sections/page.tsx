import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { BookOpen, CheckCircle2, Circle, FileText, PlayCircle } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { ExamType } from "@/generated/prisma/enums"
import { LearningHeader } from "@/components/learning/learning-header"

interface StudyPageProps {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = { title: "المذاكرة" }

export default async function StudyPage({ params }: StudyPageProps) {
  const { id: courseId } = await params
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      teacher: true,
      subject: true,
      sections: {
        include: {
          videos: { orderBy: { order: "asc" } },
          books: { orderBy: { order: "asc" } },
          exams: { orderBy: { order: "asc" } },
        },
        orderBy: { order: "asc" },
      },
    },
  })

  if (!course || !course.isActive) notFound()

  const hasAccess = await canAccessCourse(user, courseId)
  if (!hasAccess && Number(course.price) > 0) {
    redirect(`/courses/${courseId}`)
  }

  const videoViews = await prisma.videoView.findMany({
    where: {
      userId: user.id,
      videoId: { in: course.sections.flatMap((s) => s.videos.map((v) => v.id)) },
    },
  })
  const viewMap = new Map(videoViews.map((v) => [v.videoId, v]))

  let totalVideos = 0
  let completedVideos = 0
  course.sections.forEach((s) => {
    s.videos.forEach((v) => {
      totalVideos++
      if (viewMap.get(v.id)?.isCompleted) completedVideos++
    })
  })
  const progressPct = totalVideos ? Math.round((completedVideos / totalVideos) * 100) : 0

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <LearningHeader
        courseId={courseId}
        courseName={course.name}
        teacherName={course.teacher.name}
        percent={progressPct}
        completed={completedVideos}
        total={totalVideos}
        trail={[{ label: "المذاكرة" }]}
      />

      <h1 className="sr-only">محتوى كورس {course.name}</h1>

      <div className="space-y-6">
        {course.sections.map((section, si) => (
          <div key={section.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4">
              <h2 className="flex items-center gap-3 font-extrabold text-navy">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-sm font-black text-white">
                  {si + 1}
                </span>
                {section.name}
              </h2>
              <span className="text-xs font-medium text-slate-500">
                {section.videos.length + section.books.length + section.exams.length} عنصر
              </span>
            </div>

            <div className="divide-y divide-slate-50">
              {section.videos.map((v) => {
                const view = viewMap.get(v.id)
                const done = view?.isCompleted
                const href = `/courses/${courseId}/sections/${section.id}/video/${v.id}`
                return (
                  <Link
                    key={v.id}
                    href={href}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-amber-50/40"
                  >
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-mint" />
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-slate-300" />
                    )}
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-royal-50 text-royal">
                      <PlayCircle className="h-5 w-5" />
                    </span>
                    <div className="flex-1">
                      <p className="font-bold text-navy">{v.title}</p>
                      <p className="text-xs text-slate-500">
                        {Math.floor(v.duration / 60)} د · {done ? "مكتمل" : view ? `${view.progress}%` : "لم تبدأ"}
                      </p>
                    </div>
                    {view && (
                      <div className="hidden w-24 sm:block">
                        <div className="h-1.5 rounded-full bg-slate-100">
                          <div
                            className="h-1.5 rounded-full bg-royal"
                            style={{ width: `${view.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </Link>
                )
              })}

              {section.books.map((b) => (
                <Link
                  key={b.id}
                  href={`/courses/${courseId}/sections/${section.id}/book/${b.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-mint-50/40"
                >
                  <Circle className="h-5 w-5 shrink-0 text-slate-300" />
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-50 text-mint">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="font-bold text-navy">{b.title}</p>
                    <p className="text-xs text-slate-500">ملف تعليمي</p>
                  </div>
                </Link>
              ))}

              {section.exams.map((e) => (
                <Link
                  key={e.id}
                  href={`/courses/${courseId}/sections/${section.id}/exam/${e.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-violet-50/40"
                >
                  <Circle className="h-5 w-5 shrink-0 text-slate-300" />
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="font-bold text-navy">{e.title}</p>
                    <p className="text-xs text-slate-500">
                      {e.type === ExamType.HOMEWORK ? "واجب" : "اختبار"} · {e.durationMinutes} دقيقة
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
