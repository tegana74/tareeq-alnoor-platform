import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { BookOpen, Download, FileDown } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { Button } from "@/components/ui/button"
import { BookmarkButton } from "@/components/bookmark-button"
import { BookReadButton } from "@/components/learning/book-read-button"
import { resolveFileUrl } from "@/lib/resolve-file-url"
import { getLearningShell } from "@/lib/learning-shell"
import { LearningHeader } from "@/components/learning/learning-header"
import { ContentsNav, PrevNextNav } from "@/components/learning/contents-nav"

interface BookPageProps {
  params: Promise<{ id: string; sectionId: string; bookId: string }>
}

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { bookId } = await params
  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { title: true } })
  return { title: book?.title ?? "الكتاب" }
}

export default async function BookPage({ params }: BookPageProps) {
  const { id: courseId, sectionId, bookId } = await params
  const user = await getCurrentUser()

  const [book, courseExists] = await Promise.all([
    prisma.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        fileUrl: true,
        downloadAllowed: true,
        isFree: true,
        sectionId: true,
      },
    }),
    prisma.course.findUnique({ where: { id: courseId }, select: { id: true } }),
  ])

  if (!book || !courseExists || book.sectionId !== sectionId) notFound()

  const hasAccess = await canAccessCourse(user, courseId)
  if (!book.isFree && !hasAccess) {
    redirect(`/courses/${courseId}`)
  }

  const shell = await getLearningShell(courseId, {
    user,
    current: { kind: "book", id: bookId },
  })
  if (!shell) notFound()

  const bookmarked =
    user?.role === "STUDENT"
      ? Boolean(await prisma.bookmark.findFirst({ where: { userId: user.id, bookId } }))
      : false

  const bookTypeLabels: Record<string, string> = {
    BOOK: "كتاب",
    NOTES: "مذكرة",
    SUMMARY: "ملخص",
    AUDIO: "تسجيل صوتي",
    FILE: "ملف",
  }

  const isUploaded = book.fileUrl.startsWith("/api/files/") || book.fileUrl.includes("supabase")
  const fileUrl = resolveFileUrl(book.fileUrl)
  const bookDone = shell.flat.find((f) => f.kind === "book" && f.id === bookId)?.status === "done"

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <LearningHeader
        courseId={courseId}
        courseName={shell.course.name}
        teacherName={shell.course.teacherName}
        percent={shell.progress.percent}
        completed={shell.progress.completed}
        total={shell.progress.total}
        trail={[{ label: shell.flat.find((f) => f.sectionId === sectionId)?.sectionName ?? "", href: `/courses/${courseId}/sections` }, { label: book.title }]}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {isUploaded && !book.type.includes("AUDIO") ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl font-black text-navy">{book.title}</h1>
                <div className="flex shrink-0 items-center gap-2 text-xs font-bold text-muted-foreground">
                  {user?.role === "STUDENT" && (
                    <BookReadButton bookId={book.id} initialDone={bookDone} />
                  )}
                  {user?.role === "STUDENT" && <BookmarkButton bookId={book.id} initial={bookmarked} />}
                  {book.downloadAllowed ? (
                    <a href={`${fileUrl}?dl=1`} className="flex items-center gap-1 rounded px-2 py-1 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
                      <Download className="h-4 w-4" aria-hidden="true" /> تنزيل الملف
                    </a>
                  ) : (
                    <span>العرض فقط — التنزيل محمي بإذن المعلم</span>
                  )}
                </div>
              </div>
              <div className="overflow-hidden rounded-3xl border border-border bg-slate-100">
                <iframe src={fileUrl} title={book.title} className="h-[85vh] w-full" />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center rounded-3xl border border-border bg-card p-10 text-center">
              <span className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-success-50">
                {book.type === "AUDIO" ? (
                  <FileDown className="h-10 w-10 text-success-strong" aria-hidden="true" />
                ) : (
                  <BookOpen className="h-10 w-10 text-success-strong" aria-hidden="true" />
                )}
              </span>
              <h1 className="text-2xl font-black text-navy">{book.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{bookTypeLabels[book.type] ?? "ملف"}</p>
              {user?.role === "STUDENT" && (
                <div className="mt-3 flex flex-col items-center gap-3">
                  <BookmarkButton bookId={book.id} initial={bookmarked} />
                  <BookReadButton bookId={book.id} initialDone={bookDone} />
                </div>
              )}
              {book.description && <p className="mt-4 max-w-lg leading-8 text-muted-foreground">{book.description}</p>}
              {book.downloadAllowed && (
                <Button href={isUploaded ? `${fileUrl}?dl=1` : fileUrl} variant="mint" size="lg" className="mt-6">
                  <Download className="h-5 w-5" aria-hidden="true" />
                  تحميل الملف
                </Button>
              )}
            </div>
          )}

          <PrevNextNav prev={shell.prev} next={shell.next} courseId={courseId} />
        </div>

        <ContentsNav
          courseId={courseId}
          courseName={shell.course.name}
          flat={shell.flat}
        />
      </div>

      <Link href={`/courses/${courseId}/sections`} className="mt-10 inline-block rounded text-sm font-bold text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
        عرض كل أقسام الكورس
      </Link>
    </div>
  )
}
