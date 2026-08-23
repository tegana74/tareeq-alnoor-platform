import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { VideoPlayer } from "@/components/player/video-player"
import { BookmarkButton } from "@/components/bookmark-button"
import { LearningHeader } from "@/components/learning/learning-header"
import { ContentsNav, PrevNextNav } from "@/components/learning/contents-nav"
import { getLearningShell } from "@/lib/learning-shell"

interface VideoPageProps {
  params: Promise<{ id: string; sectionId: string; videoId: string }>
}

export async function generateMetadata({ params }: VideoPageProps): Promise<Metadata> {
  const { videoId } = await params
  const video = await prisma.video.findUnique({ where: { id: videoId }, select: { title: true } })
  return { title: video?.title ?? "المحاضرة" }
}

export default async function VideoPage({ params }: VideoPageProps) {
  const { id: courseId, sectionId, videoId } = await params
  const user = await getCurrentUser()

  const [video, courseExists] = await Promise.all([
    prisma.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        title: true,
        description: true,
        provider: true,
        url: true,
        downloadAllowed: true,
        isFree: true,
        sectionId: true,
      },
    }),
    prisma.course.findUnique({ where: { id: courseId }, select: { id: true } }),
  ])

  if (!video || !courseExists || video.sectionId !== sectionId) notFound()

  const hasAccess = await canAccessCourse(user, courseId)
  if (!video.isFree && !hasAccess) {
    redirect(`/courses/${courseId}`)
  }

  const shell = await getLearningShell(courseId, {
    user,
    current: { kind: "video", id: videoId },
  })
  if (!shell) notFound()

  const bookmarked =
    user?.role === "STUDENT"
      ? Boolean(await prisma.bookmark.findFirst({ where: { userId: user.id, videoId } }))
      : false

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <LearningHeader
        courseId={courseId}
        courseName={shell.course.name}
        teacherName={shell.course.teacherName}
        percent={shell.progress.percent}
        completed={shell.progress.completed}
        total={shell.progress.total}
        trail={[{ label: shell.flat.find((f) => f.sectionId === sectionId)?.sectionName ?? "", href: `/courses/${courseId}/sections` }, { label: video.title }]}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
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
            <p className="mt-6 leading-8 text-muted-foreground">{video.description}</p>
          )}

          <PrevNextNav prev={shell.prev} next={shell.next} courseId={courseId} />
        </div>

        <ContentsNav
          courseId={courseId}
          courseName={shell.course.name}
          flat={shell.flat}
        />
      </div>

      {/* روابط سياقية مسموح بها — لا تكشف أي محتوى محمي */}
      {shell.canAccess && (
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={`/courses/${courseId}/sections`} className="text-sm font-bold text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded">
            عرض كل أقسام الكورس
          </Link>
        </div>
      )}
    </div>
  )
}
