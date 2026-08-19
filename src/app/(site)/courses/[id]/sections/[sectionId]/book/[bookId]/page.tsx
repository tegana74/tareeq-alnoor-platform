import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { BookOpen, ChevronLeft, Download, FileDown, FileText, PlayCircle, Star } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { Button } from "@/components/ui/button"
import { ExamType } from "@/generated/prisma/enums"
import { BookmarkButton } from "@/components/bookmark-button"
import { resolveFileUrl } from "@/lib/resolve-file-url"

interface BookPageProps {
  params: Promise<{ id: string; sectionId: string; bookId: string }>
}

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { bookId } = await params
  const book = await prisma.book.findUnique({ where: { id: bookId } })
  return { title: book?.title ?? "الكتاب" }
}

export default async function BookPage({ params }: BookPageProps) {
  const { id: courseId, sectionId, bookId } = await params
  const user = await getCurrentUser()

  const [book, course] = await Promise.all([
    prisma.book.findUnique({
      where: { id: bookId },
      include: { section: { include: { videos: true, books: true, exams: true } } },
    }),
    prisma.course.findUnique({ where: { id: courseId } }),
  ])

  if (!book || !course || book.section.courseId !== courseId) notFound()

  const hasAccess = await canAccessCourse(user, courseId)
  if (!book.isFree && !hasAccess) {
    redirect(`/courses/${courseId}`)
  }

  const bookmarked =
    user?.role === "STUDENT"
      ? Boolean(await prisma.bookmark.findFirst({ where: { userId: user.id, bookId } }))
      : false

  const items = [
    ...book.section.videos.map((v) => ({ kind: "video", id: v.id, title: v.title })),
    ...book.section.books.map((b) => ({ kind: "book", id: b.id, title: b.title })),
    ...book.section.exams.map((e) => ({ kind: "exam", id: e.id, title: e.title })),
  ]

  const bookTypeLabels: Record<string, string> = {
    BOOK: "كتاب",
    NOTES: "مذكرة",
    SUMMARY: "ملخص",
    AUDIO: "تسجيل صوتي",
    FILE: "ملف",
  }

  const isUploaded = book.fileUrl.startsWith("/api/files/") || book.fileUrl.includes("supabase")
  const fileUrl = resolveFileUrl(book.fileUrl)

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
        <span className="font-bold text-navy">{book.section.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div>
          {isUploaded && !book.type.includes("AUDIO") ? (
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-100">
              <iframe src={fileUrl} title={book.title} className="h-[85vh] w-full" />
            </div>
          ) : (
            <div className="flex flex-col items-center rounded-3xl border border-slate-200 bg-white p-10 text-center">
              <span className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-mint-50">
                {book.type === "AUDIO" ? (
                  <FileDown className="h-10 w-10 text-mint" />
                ) : (
                  <BookOpen className="h-10 w-10 text-mint" />
                )}
              </span>
              <h1 className="text-2xl font-black text-navy">{book.title}</h1>
              <p className="mt-1 text-sm text-slate-500">{bookTypeLabels[book.type] ?? "ملف"}</p>
              {user?.role === "STUDENT" && (
                <div className="mt-3">
                  <BookmarkButton bookId={book.id} initial={bookmarked} />
                </div>
              )}
              {book.description && <p className="mt-4 max-w-lg leading-8 text-slate-600">{book.description}</p>}
              {book.downloadAllowed && (
                <Button
                  href={isUploaded ? `${fileUrl}?dl=1` : fileUrl}
                  variant="mint"
                  size="lg"
                  className="mt-6"
                >
                  <Download className="h-5 w-5" />
                  تحميل الملف
                </Button>
              )}
            </div>
          )}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">
            <h1 className="text-lg font-black text-navy">{book.title}</h1>
            <div className="flex shrink-0 items-center gap-2">
              {user?.role === "STUDENT" && <BookmarkButton bookId={book.id} initial={bookmarked} />}
              {book.downloadAllowed ? (
                  isUploaded ? (
                  <a href={`${fileUrl}?dl=1`} className="flex items-center gap-1 hover:underline">
                    <Download className="h-4 w-4" /> تنزيل الملف
                  </a>
                ) : (
                  <a href={fileUrl} className="flex items-center gap-1 hover:underline">
                    <Download className="h-4 w-4" /> فتح الملف
                  </a>
                )
              ) : (
                <span className="text-xs text-amber-600">العرض فقط — التنزيل محمي بإذن المعلم</span>
              )}
            </div>
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 px-2 font-extrabold text-navy">{book.section.name}</h2>
          <div className="space-y-1">
            {items.map((item) => {
              const Icon = item.kind === "video" ? PlayCircle : item.kind === "book" ? BookOpen : FileText
              const href =
                item.kind === "video"
                  ? `/courses/${courseId}/sections/${sectionId}/video/${item.id}`
                  : item.kind === "book"
                    ? `/courses/${courseId}/sections/${sectionId}/book/${item.id}`
                    : `/courses/${courseId}/sections/${sectionId}/exam/${item.id}`
              const isActive = item.kind === "book" && item.id === bookId
              return (
                <Link
                  key={`${item.kind}-${item.id}`}
                  href={href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    isActive ? "bg-mint-50 font-bold text-mint-dark" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="line-clamp-1">{item.title}</span>
                  {isActive && <Star className="mr-auto h-3.5 w-3.5 fill-mint text-mint" />}
                </Link>
              )
            })}
          </div>
        </aside>
      </div>
    </div>
  )
}
