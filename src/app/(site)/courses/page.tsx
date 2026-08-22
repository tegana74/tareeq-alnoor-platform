import type { Metadata } from "next"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { CourseCard } from "@/components/ui/course-card"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { getCurrentUser } from "@/lib/auth"
import { Search } from "lucide-react"

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
    prisma.year.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.subject.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.teacher.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.course.findMany({
      where: {
        isActive: true,
        ...(yearId ? { yearId } : {}),
        ...(subjectId ? { subjectId } : {}),
        ...(teacherId ? { teacherId } : {}),
        ...(q ? { name: { contains: q } } : {}),
      },
      include: {
        teacher: true,
        subject: true,
        sections: {
          include: { _count: { select: { videos: true, books: true, exams: true } } },
        },
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
    const { sections: _sections, ...rest } = c
    return { ...rest, _count, price: Number(c.price), priceBeforeDiscount: c.priceBeforeDiscount ? Number(c.priceBeforeDiscount) : null }
  })

  const activeFilters = [yearId, subjectId, teacherId, q].filter(Boolean).length
  const hasFilters = activeFilters > 0

  const favIds = user?.role === "STUDENT"
    ? new Set((await prisma.favorite.findMany({ where: { userId: user.id } })).map((f) => f.courseId))
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-navy">كل الكورسات</h1>
        <p className="mt-2 text-slate-500">اختر المادة والمدرس المناسب لتبدأ رحلة التفوق</p>
      </div>

      {/* البحث */}
      <form method="GET" action="/courses" className="relative mb-6">
        <Search className="absolute top-1/2 right-4 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          name="q"
          defaultValue={q}
          placeholder="ابحث عن كورس..."
          className="h-13 w-full rounded-2xl border-2 border-slate-200 bg-white ps-12 pe-4 text-sm outline-none transition-colors focus:border-amber-400"
        />
      </form>

      {/* الفلاتر */}
      <div className="mb-8 grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 font-extrabold text-navy">الصف الدراسي</h3>
            <div className="space-y-2">
              {years.map((y) => (
                <Link
                  key={y.id}
                  href={filterLink({ year: yearId === y.id ? undefined : y.id })}
                  className={`block rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                    yearId === y.id ? "bg-amber-500 text-white" : "text-slate-600 hover:bg-amber-50"
                  }`}
                >
                  {y.name}
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 font-extrabold text-navy">المواد</h3>
            <div className="space-y-2">
              {subjects.map((s) => (
                <Link
                  key={s.id}
                  href={filterLink({ subject: subjectId === s.id ? undefined : s.id })}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                    subjectId === s.id ? "bg-amber-500 text-white" : "text-slate-600 hover:bg-amber-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>{s.icon}</span> {s.name}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 font-extrabold text-navy">المدرسين</h3>
            <div className="space-y-2">
              {teachers.map((t) => (
                <Link
                  key={t.id}
                  href={filterLink({ teacher: teacherId === t.id ? undefined : t.id })}
                  className={`block rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                    teacherId === t.id ? "bg-amber-500 text-white" : "text-slate-600 hover:bg-amber-50"
                  }`}
                >
                  {t.name}
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <div>
          {hasFilters && (
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-slate-500">
                نتائج ({withCounts.length}) — {yearId && years.find((y) => y.id === yearId)?.name}{" "}
                {subjectId && subjects.find((s) => s.id === subjectId)?.name}{" "}
                {teacherId && teachers.find((t) => t.id === teacherId)?.name} {q && `"${q}"`}
              </span>
              <Button href="/courses" variant="ghost" size="sm">
                مسح الفلاتر
              </Button>
            </div>
          )}

          {withCounts.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {withCounts.map((c) => (
                <CourseCard key={c.id} course={c} favorite={user?.role === "STUDENT" ? favIds.has(c.id) : undefined} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="لا توجد نتائج"
              description="جرّب تعديل الفلاتر أو البحث بكلمة مختلفة"
              icon={<span className="text-3xl">🔍</span>}
              className="rounded-3xl border-2 border-dashed border-border bg-card py-20"
            />
          )}
        </div>
      </div>
    </div>
  )
}
