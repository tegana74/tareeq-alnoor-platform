import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { BookOpen, FileText, GraduationCap, Lock, PlayCircle, Star } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { formatPrice } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse, isSubscribed } from "@/lib/subscriptions"
import { ExamType } from "@/generated/prisma/enums"

interface CoursePageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const { id } = await params
  const course = await prisma.course.findUnique({
    where: { id },
    include: { teacher: true, subject: true },
  })
  if (!course) return { title: "الكورس غير موجود" }
  return { title: course.name }
}

export default async function CoursePage({ params }: CoursePageProps) {
  const { id } = await params
  const user = await getCurrentUser()

  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      teacher: true,
      subject: true,
      year: true,
      department: true,
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

  const subscribed = user ? await isSubscribed(user.id, course.id) : false
  const isFreeContent = Number(course.price) === 0
  const canAccess = subscribed || isFreeContent || (user ? await canAccessCourse(user, course.id) : false)

  const totalVideos = course.sections.reduce((a, s) => a + s.videos.length, 0)
  const totalBooks = course.sections.reduce((a, s) => a + s.books.length, 0)
  const totalExams = course.sections.reduce((a, s) => a + s.exams.length, 0)
  const discount =
    course.priceBeforeDiscount && Number(course.priceBeforeDiscount) > Number(course.price)
      ? Math.round(
          ((Number(course.priceBeforeDiscount) - Number(course.price)) / Number(course.priceBeforeDiscount)) * 100
        )
      : 0

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {/* ===== رأس الكورس ===== */}
      <div className="mb-10 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div
          className="relative flex h-44 items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${course.subject.color ?? "#f59e0b"}33, #ffffff)`,
          }}
        >
          <span className="text-7xl drop-shadow">{course.subject.icon ?? "📚"}</span>
          {discount > 0 && (
            <span className="absolute top-4 right-4 rounded-full bg-rose-500 px-3 py-1.5 text-sm font-extrabold text-white shadow">
              وفّر {discount}%
            </span>
          )}
        </div>

        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-700">
                {course.subject.name}
              </span>
              {course.year && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-600">
                  {course.year.name}
                </span>
              )}
              {course.department && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-600">
                  {course.department.name}
                </span>
              )}
              {course.isFeatured && (
                <span className="flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold text-white">
                  <Star className="h-3 w-3 fill-white" /> مميز
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black text-navy sm:text-3xl">{course.name}</h1>
            {course.description && (
              <p className="mt-3 max-w-2xl leading-8 text-slate-600">{course.description}</p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-600">
              <span className="flex items-center gap-2 font-bold">
                <GraduationCap className="h-5 w-5 text-amber-500" />
                {course.teacher.name}
              </span>
              <span className="flex items-center gap-1.5">
                <PlayCircle className="h-4 w-4" /> {totalVideos} محاضرة
              </span>
              <span className="flex items-center gap-1.5">
                <BookOpen className="h-4 w-4" /> {totalBooks} كتاب/مذكرة
              </span>
              <span className="flex items-center gap-1.5">
                <FileText className="h-4 w-4" /> {totalExams} اختبار
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:w-64">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-amber-600">
                {formatPrice(Number(course.price))}
              </span>
              {discount > 0 && (
                <span className="text-sm text-slate-400 line-through">
                  {formatPrice(Number(course.priceBeforeDiscount))}
                </span>
              )}
            </div>
            {canAccess ? (
              <Button href={`/courses/${course.id}/sections`} variant="mint" size="lg">
                <PlayCircle className="h-5 w-5" />
                ابدأ المذاكرة
              </Button>
            ) : (
              <Button href={`/courses/${course.id}/subscribe`} size="lg">
                اشترك الآن
              </Button>
            )}
            {subscribed && (
              <p className="text-center text-xs font-bold text-mint">✓ أنت مشترك في هذا الكورس</p>
            )}
          </div>
        </div>
      </div>

      {/* ===== محتوى الكورس ===== */}
      <h2 className="mb-6 text-2xl font-black text-navy">محتوى الكورس</h2>
      <div className="space-y-6">
        {course.sections.map((section, si) => (
          <div key={section.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4">
              <h3 className="flex items-center gap-3 font-extrabold text-navy">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-sm font-black text-white">
                  {si + 1}
                </span>
                {section.name}
              </h3>
              <span className="text-xs font-medium text-slate-500">
                {section.videos.length + section.books.length + section.exams.length} عنصر
              </span>
            </div>

            <div className="divide-y divide-slate-50">
              {[
                ...section.videos.map((v) => ({ kind: "video", id: v.id, title: v.title, meta: `${Math.floor(v.duration / 60)} د`, free: v.isFree })),
                ...section.books.map((b) => ({ kind: "book", id: b.id, title: b.title, meta: "ملف", free: b.isFree })),
                ...section.exams.map((e) => ({
                  kind: "exam",
                  id: e.id,
                  title: e.title,
                  meta: e.type === ExamType.HOMEWORK ? "واجب" : "اختبار",
                  free: e.isFree,
                })),
              ]
                .sort((a, b) => a.title.localeCompare(b.title, "ar"))
                .map((item) => {
                  const Icon =
                    item.kind === "video" ? PlayCircle : item.kind === "book" ? BookOpen : FileText
                  const itemLink = canAccess
                    ? `/courses/${course.id}/sections/${section.id}/${item.kind}/${item.id}`
                    : null
                  const isLocked = !canAccess && !item.free

                  const inner = (
                    <div className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-amber-50/40">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          item.kind === "video"
                            ? "bg-royal-50 text-royal"
                            : item.kind === "book"
                              ? "bg-mint-50 text-mint"
                              : "bg-violet-50 text-violet-600"
                        }`}
                      >
                        {isLocked ? <Lock className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                      </span>
                      <div className="flex-1">
                        <p className="font-bold text-navy">{item.title}</p>
                        <p className="text-xs text-slate-500">
                          {item.meta}
                          {item.free && <span className="ms-2 text-mint-dark">· مجاني</span>}
                        </p>
                      </div>
                      {item.free && !canAccess && (
                        <span className="rounded-full bg-mint-50 px-3 py-1 text-xs font-bold text-mint-dark">
                          مجاني
                        </span>
                      )}
                      {isLocked && (
                        <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 sm:block">
                          بعد الاشتراك
                        </span>
                      )}
                    </div>
                  )

                  return itemLink ? (
                    <a key={item.id} href={itemLink}>
                      {inner}
                    </a>
                  ) : (
                    <div key={item.id}>{inner}</div>
                  )
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
