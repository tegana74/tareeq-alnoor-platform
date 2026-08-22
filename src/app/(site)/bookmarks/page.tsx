import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { BookOpen, Bookmark, ChevronLeft, PlayCircle } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export const metadata: Metadata = { title: "الإشارات المرجعية" }

export default async function BookmarksPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (user.role !== "STUDENT") return null

  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: user.id },
    include: {
      video: { include: { section: { include: { course: true } } } },
      book: { include: { section: { include: { course: true } } } },
    },
    orderBy: { createdAt: "desc" },
  })

  const courseIds = new Set<string>()
  for (const b of bookmarks) {
    if (b.video) courseIds.add(b.video.section.courseId)
    if (b.book) courseIds.add(b.book.section.courseId)
  }

  const subscriptions = await prisma.subscription.findMany({
    where: {
      userId: user.id,
      courseId: { in: [...courseIds] },
      status: "active",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { courseId: true },
  })
  const subscribedCourseIds = new Set(subscriptions.map((s) => s.courseId))

  type Entry = {
    kind: "video" | "book"
    id: string
    title: string
    href: string
    courseName: string
    sectionName: string
  }
  const entries: Entry[] = []
  for (const b of bookmarks) {
    if (b.video) {
      const v = b.video
      const courseId = v.section.courseId
      if (v.isFree || subscribedCourseIds.has(courseId)) {
        entries.push({
          kind: "video",
          id: v.id,
          title: v.title,
          href: `/courses/${courseId}/sections/${v.sectionId}/video/${v.id}`,
          courseName: v.section.course.name,
          sectionName: v.section.name,
        })
      }
      continue
    }
    if (b.book) {
      const bk = b.book
      const courseId = bk.section.courseId
      if (bk.isFree || subscribedCourseIds.has(courseId)) {
        entries.push({
          kind: "book",
          id: bk.id,
          title: bk.title,
          href: `/courses/${courseId}/sections/${bk.sectionId}/book/${bk.id}`,
          courseName: bk.section.course.name,
          sectionName: bk.section.name,
        })
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-2xl font-black text-navy">الإشارات المرجعية</h1>
      <p className="mb-8 text-sm text-slate-500">المحاضرات والملفات التي حفظتها للرجوع إليها</p>

      {entries.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
          <Bookmark className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">لا توجد إشارات مرجعية بعد — احفظ محاضرة أو ملفاً</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((item) => (
            <Link
              key={`${item.kind}-${item.id}`}
              href={item.href}
              className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-amber-300 hover:shadow-md"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                {item.kind === "video" ? <PlayCircle className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-black text-navy">
                  {item.title}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                    {item.kind === "video" ? "محاضرة" : "ملف"}
                  </span>
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                  {item.courseName}
                  <ChevronLeft className="h-3 w-3" />
                  {item.sectionName}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
