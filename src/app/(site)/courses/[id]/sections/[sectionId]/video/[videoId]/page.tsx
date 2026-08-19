import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { BookOpen, ChevronLeft, FileText, Lock, PlayCircle, Star } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { VideoPlayer } from "@/components/player/video-player"
import { Button } from "@/components/ui/button"
import { ExamType } from "@/generated/prisma/enums"
import { BookmarkButton } from "@/components/bookmark-button"

interface VideoPageProps {
  params: Promise<{ id: string; sectionId: string; videoId: string }>
}

export async function generateMetadata({ params }: VideoPageProps): Promise<Metadata> {
  const { videoId } = await params
  const video = await prisma.video.findUnique({ where: { id: videoId } })
  return { title: video?.title ?? "المحاضرة" }
}

export default async function VideoPage({ params }: VideoPageProps) {
  const { id: courseId, sectionId, videoId } = await params
  const user = await getCurrentUser()

  const [video, course] = await Promise.all([
    prisma.video.findUnique({
      where: { id: videoId },
      include: {
        section: {
          include: {
            videos: { orderBy: { order: "asc" } },
            books: { orderBy: { order: "asc" } },
            exams: { orderBy: { order: "asc" } },
          },
        },
      },
    }),
    prisma.course.findUnique({
      where: { id: courseId },
      include: { sections: { orderBy: { order: "asc" } } },
    }),
  ])

  if (!video || !course || video.section.courseId !== courseId) notFound()

  const hasAccess = await canAccessCourse(user, courseId)
  if (!video.isFree && !hasAccess) {
    redirect(`/courses/${courseId}`)
  }

  const bookmarked =
    user?.role === "STUDENT"
      ? Boolean(await prisma.bookmark.findFirst({ where: { userId: user.id, videoId } }))
      : false

  const section = video.section
  const currentIndex = section.videos.findIndex((v) => v.id === videoId)
  const prevVideo = currentIndex > 0 ? section.videos[currentIndex - 1] : null
  const nextVideo = currentIndex < section.videos.length - 1 ? section.videos[currentIndex + 1] : null

  const items = [
    ...section.videos.map((v) => ({ kind: "video", id: v.id, title: v.title, meta: "محاضرة" })),
    ...section.books.map((b) => ({ kind: "book", id: b.id, title: b.title, meta: "ملف" })),
    ...section.exams.map((e) => ({
      kind: "exam",
      id: e.id,
      title: e.title,
      meta: e.type === ExamType.HOMEWORK ? "واجب" : "اختبار",
    })),
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/courses" className="hover:text-amber-600">
          الكورسات
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <Link href={`/courses/${courseId}`} className="hover:text-amber-600">
          {course.name}
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-bold text-navy">{section.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-black text-navy">{video.title}</h1>
            {user?.role === "STUDENT" && <BookmarkButton videoId={video.id} initial={bookmarked} />}
          </div>
          <VideoPlayer
            videoId={video.id}
            provider={video.provider}
            url={video.url}
            title={video.title}
            downloadAllowed={video.downloadAllowed}
            userName={user ? `${user.firstName} ${user.lastName}` : ""}
          />

          {video.description && (
            <p className="mt-6 leading-8 text-slate-600">{video.description}</p>
          )}

          <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-6">
            {prevVideo ? (
              <Button
                href={`/courses/${courseId}/sections/${sectionId}/video/${prevVideo.id}`}
                variant="outline"
              >
                <ChevronLeft className="h-4 w-4" />
                المحاضرة السابقة
              </Button>
            ) : (
              <span />
            )}
            {nextVideo && (
              <Button href={`/courses/${courseId}/sections/${sectionId}/video/${nextVideo.id}`}>
                المحاضرة التالية
                <ChevronLeft className="h-4 w-4 rotate-180" />
              </Button>
            )}
          </div>
        </div>

        {/* قائمة المحتوى */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 px-2 font-extrabold text-navy">{section.name}</h2>
          <div className="space-y-1">
            {items.map((item) => {
              const Icon = item.kind === "video" ? PlayCircle : item.kind === "book" ? BookOpen : FileText
              const href =
                item.kind === "video"
                  ? `/courses/${courseId}/sections/${sectionId}/video/${item.id}`
                  : item.kind === "book"
                    ? `/courses/${courseId}/sections/${sectionId}/book/${item.id}`
                    : `/courses/${courseId}/sections/${sectionId}/exam/${item.id}`
              const isActive = item.kind === "video" && item.id === videoId
              return (
                <Link
                  key={`${item.kind}-${item.id}`}
                  href={href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    isActive ? "bg-amber-50 font-bold text-amber-700" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="line-clamp-1">{item.title}</span>
                  {isActive && <Star className="mr-auto h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                </Link>
              )
            })}
          </div>
        </aside>
      </div>
    </div>
  )
}
