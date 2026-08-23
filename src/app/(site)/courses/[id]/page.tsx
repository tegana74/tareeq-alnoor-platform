import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  FileText,
  GraduationCap,
  Lock,
  PlayCircle,
} from "lucide-react"
import { prisma } from "@/lib/prisma"
import { formatPrice } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { CourseCard } from "@/components/ui/course-card"
import { FavoriteButton } from "@/components/favorite-button"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse, isSubscribed } from "@/lib/subscriptions"
import { SUBSCRIPTION_DAYS } from "@/lib/constants"
import { ExamType } from "@/generated/prisma/enums"
interface CoursePageProps {
  params: Promise<{ id: string }>
}

async function getCourse(id: string) {
  return prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      priceBeforeDiscount: true,
      isFeatured: true,
      isActive: true,
      teacher: { select: { id: true, name: true, title: true, image: true } },
      subject: { select: { id: true, name: true, icon: true, color: true } },
      year: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      sections: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          videos: { orderBy: { order: "asc" }, select: { id: true, title: true, duration: true, isFree: true } },
          books: { orderBy: { order: "asc" }, select: { id: true, title: true, isFree: true } },
          exams: { orderBy: { order: "asc" }, select: { id: true, title: true, type: true, isFree: true } },
        },
      },
    },
  })
}

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const { id } = await params
  const course = await prisma.course.findUnique({
    where: { id },
    select: { name: true, description: true, teacher: { select: { name: true } } },
  })
  if (!course) return { title: "الكورس غير موجود" }
  const description =
    course.description ??
    `كورس ${course.name} مع ${course.teacher.name} على منصة طريق النور — محاضرات وملفات واختبارات مع متابعة كاملة.`
  return {
    title: course.name,
    description: description.slice(0, 160),
  }
}
export default async function CoursePage({ params }: CoursePageProps) {
  const { id } = await params
  const user = await getCurrentUser()
  const course = await getCourse(id)
  if (!course || !course.isActive) notFound()

  const subscribed = user ? await isSubscribed(user.id, course.id) : false
  const isFreeCourse = Number(course.price) === 0
  const canAccess = subscribed || isFreeCourse || (user ? await canAccessCourse(user, course.id) : false)

  const totalVideos = course.sections.reduce((a, s) => a + s.videos.length, 0)
  const totalBooks = course.sections.reduce((a, s) => a + s.books.length, 0)
  const totalExams = course.sections.reduce((a, s) => a + s.exams.length, 0)
  const totalDurationMin = course.sections.reduce(
    (a, s) => a + s.videos.reduce((b, v) => b + Math.floor(v.duration / 60), 0),
    0
  )
  const freeItemsCount = course.sections.reduce(
    (a, s) =>
      a +
      s.videos.filter((v) => v.isFree).length +
      s.books.filter((b) => b.isFree).length +
      s.exams.filter((e) => e.isFree).length,
    0
  )

  const price = Number(course.price)
  const oldPrice = course.priceBeforeDiscount ? Number(course.priceBeforeDiscount) : null
  const discount = oldPrice && oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0

  const isFavorite =
    user?.role === "STUDENT"
      ? (await prisma.favorite.count({ where: { userId: user.id, courseId: course.id } })) > 0
      : false

  const related = await prisma.course.findMany({
    where: {
      isActive: true,
      id: { not: course.id },
      OR: [
        { subjectId: course.subject.id },
        { teacherId: course.teacher.id },
        ...(course.year ? [{ yearId: course.year.id }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      priceBeforeDiscount: true,
      isFeatured: true,
      teacher: { select: { name: true } },
      subject: { select: { name: true, icon: true, color: true } },
      sections: { include: { _count: { select: { videos: true, books: true, exams: true } } } },
    },
    orderBy: [{ isFeatured: "desc" }, { order: "asc" }],
    take: 4,
  })

  const relatedCards = related.map((c) => {
    const _count = c.sections.reduce(
      (acc, s) => {
        acc.videos += s._count.videos
        acc.books += s._count.books
        acc.exams += s._count.exams
        return acc
      },
      { videos: 0, books: 0, exams: 0 }
    )
    return { ...c, _count, price: Number(c.price), priceBeforeDiscount: c.priceBeforeDiscount ? Number(c.priceBeforeDiscount) : null }
  })
  const contentItems = (section: (typeof course.sections)[number]) =>
    [
      ...section.videos.map((v) => ({
        kind: "video" as const,
        id: v.id,
        title: v.title,
        meta: `${Math.floor(v.duration / 60)} دقيقة`,
        free: v.isFree,
      })),
      ...section.books.map((b) => ({ kind: "book" as const, id: b.id, title: b.title, meta: "ملف", free: b.isFree })),
      ...section.exams.map((e) => ({
        kind: "exam" as const,
        id: e.id,
        title: e.title,
        meta: e.type === ExamType.HOMEWORK ? "واجب" : "اختبار",
        free: e.isFree,
      })),
    ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* ===== A. Breadcrumb ===== */}
      <nav aria-label="مسار التنقل" className="mb-5">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <li>
            <Link href="/" className="transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded">الرئيسية</Link>
          </li>
          <li aria-hidden="true"><ChevronLeft className="h-3.5 w-3.5" /></li>
          <li>
            <Link href="/courses" className="transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded">الكورسات</Link>
          </li>
          {course.year && (
            <>
              <li aria-hidden="true"><ChevronLeft className="h-3.5 w-3.5" /></li>
              <li>
                <Link href={`/courses?year=${course.year.id}`} className="transition-colors hover:text-primary-600">{course.year.name}</Link>
              </li>
            </>
          )}
          <li aria-hidden="true"><ChevronLeft className="h-3.5 w-3.5" /></li>
          <li aria-current="page" className="text-navy">{course.name}</li>
        </ol>
      </nav>

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]">
        {/* ===== B/C/D. Hero column ===== */}
        <div className="min-w-0 space-y-10">
          <Card className="overflow-hidden">
            <div
              className="relative flex h-40 items-center justify-center sm:h-48"
              style={{ background: `linear-gradient(135deg, ${course.subject.color ?? "#f59e0b"}33, transparent)` }}
            >
              <span className="text-7xl drop-shadow" aria-hidden="true">{course.subject.icon ?? "📚"}</span>
              {discount > 0 && (
                <Badge variant="danger" size="md" className="absolute top-4 end-4 !text-sm">
                  وفّر {discount}%
                </Badge>
              )}
            </div>

            <div className="p-6 sm:p-8">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="primary" size="md">{course.subject.name}</Badge>
                {course.year && <Badge size="md">{course.year.name}</Badge>}
                {course.department && <Badge variant="neutral" size="md">{course.department.name}</Badge>}
                {course.isFeatured && (
                  <Badge variant="warning" size="md">⭐ مميز</Badge>
                )}
              </div>

              <h1 className="text-2xl font-black leading-snug text-navy sm:text-3xl">{course.name}</h1>

              {course.description && (
                <p className="mt-4 leading-8 text-muted-foreground">{course.description}</p>
              )}

              <dl className="mt-6 flex flex-wrap gap-x-7 gap-y-3 border-t border-border pt-5 text-sm">
                {[
                  { icon: GraduationCap, label: "المدرس", value: course.teacher.name },
                  { icon: PlayCircle, label: "محاضرة", value: totalVideos },
                  { icon: BookOpen, label: "كتاب ومذكرة", value: totalBooks },
                  { icon: FileText, label: "اختبار وواجب", value: totalExams },
                  ...(totalDurationMin > 0 ? [{ icon: PlayCircle, label: "دقيقة فيديو", value: totalDurationMin }] : []),
                ].map((m) => (
                  <div key={m.label} className="flex items-center gap-2">
                    <m.icon className="h-4.5 w-4.5 text-primary-600" aria-hidden="true" />
                    <dt className="sr-only">{m.label}</dt>
                    <dd><span className="font-black text-navy">{m.value}</span>{" "}<span className="text-muted-foreground">{m.label}</span></dd>
                  </div>
                ))}
              </dl>
            </div>
          </Card>
          {/* ===== E. What you get ===== */}
          <section aria-labelledby="what-title">
            <h2 id="what-title" className="mb-5 text-xl font-black text-navy sm:text-2xl">ماذا ستحصل عليه؟</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                { show: totalVideos > 0, text: `${totalVideos} محاضرة فيديو منظمة في ${course.sections.length} أقسام` },
                { show: totalBooks > 0, text: `${totalBooks} كتاب ومذكرة قابلة للتحميل حسب إعدادات الكورس` },
                { show: totalExams > 0, text: `${totalExams} اختبار وواجب بتصحيح فوري ومتابعة للنتائج` },
                { show: freeItemsCount > 0, text: `${freeItemsCount} عنصر متاح كمعاينة مجانية قبل الاشتراك` },
                { show: true, text: `وصول كامل للمحتوى طوال مدة الاشتراك (${SUBSCRIPTION_DAYS} يوماً)` },
              ]
                .filter((i) => i.show)
                .map((i) => (
                  <li key={i.text} className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-4">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-strong" aria-hidden="true" />
                    <span className="text-sm font-medium text-muted-foreground">{i.text}</span>
                  </li>
                ))}
            </ul>
          </section>

          {/* ===== F. Course contents ===== */}
          <section aria-labelledby="content-title">
            <h2 id="content-title" className="mb-5 text-xl font-black text-navy sm:text-2xl">محتوى الكورس</h2>
            <div className="space-y-4">
              {course.sections.map((section, si) => {
                const items = contentItems(section)
                const sectionFree = items.some((i) => i.free)
                return (
                  <details key={section.id} open={si === 0} className="group overflow-hidden rounded-2xl border border-border bg-card">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-primary-50/50 [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-sm font-black text-white" aria-hidden="true">{si + 1}</span>
                        <span className="truncate font-extrabold text-navy">{section.name}</span>
                        {sectionFree && !canAccess && <Badge variant="success" size="sm">فيه معاينة مجانية</Badge>}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">{items.length} عنصر</span>
                    </summary>

                    <div className="divide-y divide-border border-t border-border">
                      {items.map((item) => {
                        const Icon = item.kind === "video" ? PlayCircle : item.kind === "book" ? BookOpen : FileText
                        const isLocked = !canAccess && !item.free
                        const href =
                          canAccess || item.free
                            ? `/courses/${course.id}/sections/${section.id}/${item.kind}/${item.id}`
                            : null

                        const inner = (
                          <>
                            <span
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                                item.kind === "video"
                                  ? "bg-royal-50 text-royal"
                                  : item.kind === "book"
                                    ? "bg-success-50 text-success-strong"
                                    : "bg-violet-50 text-violet-600"
                              }`}
                              aria-hidden="true"
                            >
                              {isLocked ? <Lock className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-bold text-navy">{item.title}</span>
                              <span className="text-xs text-muted-foreground">
                                {item.meta}
                                {item.free && <span className="ms-2 font-bold text-success-strong">· مجاني</span>}
                              </span>
                            </span>
                            {isLocked ? (
                              <Badge variant="neutral" size="sm" className="hidden sm:inline-flex"><Lock className="me-1 h-3 w-3" />بعد الاشتراك</Badge>
                            ) : (
                              !canAccess && <Badge variant="success" size="md">شاهد الآن</Badge>
                            )}
                          </>
                        )

                        const rowClass =
                          "flex w-full items-center gap-4 px-5 py-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 " +
                          (href ? "hover:bg-primary-50/40" : "opacity-90")

                        return href ? (
                          <Link key={`${item.kind}-${item.id}`} href={href} className={rowClass}>{inner}</Link>
                        ) : (
                          <div key={`${item.kind}-${item.id}`} className={rowClass} aria-disabled="true">{inner}</div>
                        )
                      })}
                    </div>
                  </details>
                )
              })}
              {course.sections.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                  لم تُضف أقسام لهذا الكورس بعد
                </p>
              )}
            </div>
          </section>

          {/* ===== G. Teacher ===== */}
          <section aria-labelledby="teacher-title">
            <h2 id="teacher-title" className="mb-5 text-xl font-black text-navy sm:text-2xl">مدرس الكورس</h2>
            <Card className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-start">
              {course.teacher.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={course.teacher.image} alt={`صورة المدرس ${course.teacher.name}`} className="h-20 w-20 shrink-0 rounded-full object-cover ring-4 ring-primary-100" />
              ) : (
                <span aria-hidden="true" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-orange-500 text-2xl font-black text-white">
                  {course.teacher.name.replace(/[^أ-ي]/g, "").slice(0, 2)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold text-navy">{course.teacher.name}</p>
                {course.teacher.title && <p className="mt-0.5 text-sm text-muted-foreground">{course.teacher.title}</p>}
              </div>
              <Button href={`/courses?teacher=${course.teacher.id}`} variant="outline" size="sm" className="shrink-0">
                كورسات المدرس
              </Button>
            </Card>
          </section>
        </div>

        {/* ===== H. Subscription CTA panel (desktop sticky / mobile in-flow) ===== */}
        <aside className="lg:sticky lg:top-24">
          <Card className="space-y-5 p-6 shadow-md">
            <div>
              <p className="text-xs font-bold text-muted-foreground">قيمة الاشتراك</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
                <span className="text-3xl font-black text-navy">{price === 0 ? "مجاناً" : formatPrice(price)}</span>
                {discount > 0 && oldPrice && (
                  <span className="text-sm text-slate-400 line-through">{formatPrice(oldPrice)}</span>
                )}
              </div>
              {discount > 0 && (
                <Badge variant="danger" size="sm" className="mt-2">خصم {discount}% لفترة محدودة</Badge>
              )}
            </div>

            <div className="rounded-xl bg-primary-50 p-3.5 text-sm">
              <p className="font-bold text-primary-700">مدة الاشتراك: {SUBSCRIPTION_DAYS} يوماً كاملة</p>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                تشمل كل المحاضرات والملفات والاختبارات، مع متابعة نتائجك لحظة بلحظة.
              </p>
            </div>

            {canAccess ? (
              <>
                <Button href={`/courses/${course.id}/sections`} variant="mint" size="lg" className="w-full">
                  <PlayCircle className="h-5 w-5" />
                  ابدأ المذاكرة
                </Button>
                {subscribed && (
                  <p className="flex items-center justify-center gap-1.5 text-center text-xs font-bold text-success-strong">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    أنت مشترك في هذا الكورس — بالتوفيق!
                  </p>
                )}
              </>
            ) : (
              <>
                <Button href={`/courses/${course.id}/subscribe`} size="lg" className="w-full">
                  اشترك الآن
                </Button>
                {!user && (
                  <p className="text-center text-xs text-muted-foreground">ستحتاج إلى حساب لإتمام الاشتراك</p>
                )}
              </>
            )}

            <ul className="space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
              {[
                `دفع عبر فودافون كاش أو انستاباي`,
                `تفعيل الاشتراك بعد مراجعة الإيصال من فريق المنصة`,
                `إمكانية الشحن بالمحفظة أو أكواد الشحن`,
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-600" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>

            {user?.role === "STUDENT" && (
              <div className="border-t border-border pt-4">
                <FavoriteButton courseId={course.id} initial={isFavorite} className="w-full" />
              </div>
            )}
          </Card>
        </aside>
      </div>

      {/* ===== J. Related courses ===== */}
      {relatedCards.length > 0 && (
        <section aria-labelledby="related-title" className="mt-14">
          <h2 id="related-title" className="mb-6 text-xl font-black text-navy sm:text-2xl">كورسات ذات صلة</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {relatedCards.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
