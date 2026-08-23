import type { Metadata } from "next"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { CourseCard } from "@/components/ui/course-card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { getCurrentUser } from "@/lib/auth"
import { Search, SlidersHorizontal, X } from "lucide-react"

export const metadata: Metadata = { title: "الكورسات" }
export const revalidate = 300

interface CoursesPageProps {
  searchParams: Promise<{ year?: string; subject?: string; teacher?: string; q?: string }>
}

export default async function CoursesPage({ searchParams }: CoursesPageProps) {
  const params = await searchParams
  const user = await getCurrentUser()
  const yearId = params.year ?? ""
  const subjectId = params.subject ?? ""
  const teacherId = params.teacher ?? ""
  const q = params.q ?? ""

  const [years, subjects, teachers, courses] = await Promise.all([
    prisma.year.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { order: "asc" },
    }),
    prisma.subject.findMany({
      where: { isActive: true },
      select: { id: true, name: true, icon: true },
      orderBy: { order: "asc" },
    }),
    prisma.teacher.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.course.findMany({
      where: {
        isActive: true,
        ...(yearId ? { yearId } : {}),
        ...(subjectId ? { subjectId } : {}),
        ...(teacherId ? { teacherId } : {}),
        ...(q ? { name: { contains: q } } : {}),
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
      orderBy: { order: "asc" },
    }),
  ])

  const withCounts = courses.map((c) => {
    const _count = c.sections.reduce(
      (acc, s) => {
        acc.videos += s._count.videos
        acc.books += s._count.books
        acc.exams += s._count.exams
        return acc
      },
      { sections: c.sections.length, videos: 0, books: 0, exams: 0 }
    )
    return { ...c, _count, price: Number(c.price), priceBeforeDiscount: c.priceBeforeDiscount ? Number(c.priceBeforeDiscount) : null }
  })

  const favIds =
    user?.role === "STUDENT"
      ? new Set((await prisma.favorite.findMany({ where: { userId: user.id }, select: { courseId: true } })).map((f) => f.courseId))
      : new Set<string>()

  function filterLink(updates: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    const next = { year: yearId, subject: subjectId, teacher: teacherId, q, ...updates }
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v)
    }
    const qs = sp.toString()
    return qs ? `/courses?${qs}` : "/courses"
  }

  const yearName = years.find((y) => y.id === yearId)?.name
  const subjectName = subjects.find((s) => s.id === subjectId)?.name
  const teacherName = teachers.find((t) => t.id === teacherId)?.name

  const chips: { key: string; label: string; removeHref: string }[] = []
  if (yearId && yearName) chips.push({ key: "year", label: `الصف: ${yearName}`, removeHref: filterLink({ year: undefined }) })
  if (subjectId && subjectName) chips.push({ key: "subject", label: `المادة: ${subjectName}`, removeHref: filterLink({ subject: undefined }) })
  if (teacherId && teacherName) chips.push({ key: "teacher", label: `المدرس: ${teacherName}`, removeHref: filterLink({ teacher: undefined }) })
  if (q) chips.push({ key: "q", label: `بحث: ${q}`, removeHref: filterLink({ q: undefined }) })

  const activeFilterCount = chips.length

  const optionClasses = (active: boolean) =>
    `block rounded-lg px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
      active ? "bg-primary-500 text-white" : "text-muted-foreground hover:bg-primary-50 hover:text-primary-600"
    }`

  const renderFilterGroups = () => {
    return (
      <>
        <fieldset className="rounded-2xl border border-border bg-card p-5">
          <legend className="px-1 text-sm font-extrabold text-navy">الصف الدراسي</legend>
          <div className="space-y-1.5">
            {years.map((y) => (
              <Link key={y.id} href={filterLink({ year: yearId === y.id ? undefined : y.id })} className={optionClasses(yearId === y.id)} aria-current={yearId === y.id ? "true" : undefined}>
                {y.name}
              </Link>
            ))}
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-border bg-card p-5">
          <legend className="px-1 text-sm font-extrabold text-navy">المواد</legend>
          <div className="space-y-1.5">
            {subjects.map((s) => (
              <Link key={s.id} href={filterLink({ subject: subjectId === s.id ? undefined : s.id })} className={`${optionClasses(subjectId === s.id)} flex items-center justify-between`} aria-current={subjectId === s.id ? "true" : undefined}>
                <span className="flex items-center gap-2">
                  {s.icon && <span aria-hidden="true">{s.icon}</span>}
                  {s.name}
                </span>
              </Link>
            ))}
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-border bg-card p-5">
          <legend className="px-1 text-sm font-extrabold text-navy">المدرسون</legend>
          <div className="space-y-1.5">
            {teachers.map((t) => (
              <Link key={t.id} href={filterLink({ teacher: teacherId === t.id ? undefined : t.id })} className={optionClasses(teacherId === t.id)} aria-current={teacherId === t.id ? "true" : undefined}>
                {t.name}
              </Link>
            ))}
          </div>
        </fieldset>
      </>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {/* A. Page Header */}
      <header className="mb-6">
        <h1 className="text-3xl font-black text-navy">الكورسات</h1>
        <p className="mt-2 text-muted-foreground">
          تصفح كورسات المنصة حسب الصف الدراسي والمادة والمدرس، وابحث عن الكورس المناسب لك
        </p>
      </header>

      {/* B. Search */}
      <form method="GET" action="/courses" role="search" className="relative mb-4">
        <label htmlFor="course-search" className="sr-only">
          ابحث عن كورس بالاسم
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 start-4 h-5 w-5 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          id="course-search"
          name="q"
          defaultValue={q}
          placeholder="ابحث عن كورس..."
          className={`h-13 w-full rounded-2xl border-2 border-border bg-card pe-12 text-sm text-ink outline-none transition-colors placeholder:text-muted-foreground focus:border-primary-400 focus:ring-4 focus:ring-primary-100 ${
            q ? "ps-12" : "ps-12"
          }`}
        />
        {q && (
          <Link
            href={filterLink({ q: undefined })}
            aria-label="مسح البحث"
            title="مسح البحث"
            className="absolute top-1/2 end-3 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-danger-50 hover:text-danger-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            <X className="h-4 w-4" />
          </Link>
        )}
      </form>

      {/* C-mobile. Filters trigger */}
      <details className="group mb-4 lg:hidden">
        <summary className="flex w-full cursor-pointer list-none items-center justify-between rounded-xl border-2 border-border bg-card px-4 py-3 text-sm font-black text-navy [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary-600" aria-hidden="true" />
            الفلاتر
            {activeFilterCount > 0 && (
              <Badge variant="primary" size="sm">{activeFilterCount}</Badge>
            )}
          </span>
          <span className="text-xs font-bold text-primary-600 group-open:hidden">عرض</span>
          <span className="hidden text-xs font-bold text-primary-600 group-open:inline">إخفاء</span>
        </summary>
        <div className="mt-3 space-y-4 rounded-2xl border border-border bg-background p-4">
          {renderFilterGroups()}
          {activeFilterCount > 0 && (
            <Button href="/courses" variant="outline" size="sm" className="w-full">
              مسح كل الفلاتر
            </Button>
          )}
        </div>
      </details>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* C-desktop. Sidebar */}
        <aside className="hidden space-y-5 lg:block">
          {renderFilterGroups()}
        </aside>

        <div>
          {/* D+E. Active filter chips + results count */}
          {activeFilterCount > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <Badge key={chip.key} variant="primary" size="md" className="gap-1.5 py-1.5">
                  {chip.label}
                  <Link
                    href={chip.removeHref}
                    aria-label={`إزالة فلتر ${chip.label}`}
                    className="ms-1 flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-primary-200"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </Badge>
              ))}
              {activeFilterCount > 1 && (
                <Button href="/courses" variant="ghost" size="sm">
                  مسح الكل
                </Button>
              )}
            </div>
          )}

          <p className="mb-5 text-sm font-medium text-muted-foreground" aria-live="polite">
            عدد الكورسات المتاحة: <span className="font-black text-navy">{withCounts.length}</span>
          </p>

          {/* F+G. Grid / Empty */}
          {withCounts.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {withCounts.map((c) => (
                <CourseCard key={c.id} course={c} favorite={user?.role === "STUDENT" ? favIds.has(c.id) : undefined} />
              ))}
            </div>
          ) : activeFilterCount > 0 || q ? (
            <EmptyState
              title="لا توجد نتائج للفلاتر الحالية"
              description="جرّب تعديل الفلاتر أو البحث بكلمة مختلفة"
              action={
                <Button href="/courses" variant="primary" size="md">
                  مسح الفلاتر وعرض كل الكورسات
                </Button>
              }
              icon={<span className="text-3xl" aria-hidden="true">🔍</span>}
              className="rounded-3xl border-2 border-dashed border-border bg-card py-20"
            />
          ) : (
            <EmptyState
              title="لا توجد كورسات على المنصة بعد"
              description="سيتم إضافة الكورسات قريباً — تابعنا لاحقاً"
              icon={<span className="text-3xl" aria-hidden="true">📚</span>}
              className="rounded-3xl border-2 border-dashed border-border bg-card py-20"
            />
          )}
        </div>
      </div>
    </div>
  )
}
