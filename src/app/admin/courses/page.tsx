import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { formatPrice } from "@/lib/utils"
import { CourseActions } from "@/components/course-actions"

export const metadata: Metadata = { title: "الكورسات | لوحة الإدارة" }

export default async function AdminCoursesPage() {
  const [courses, years, subjects] = await Promise.all([
    prisma.course.findMany({
      include: {
        teacher: true,
        subject: true,
        _count: { select: { sections: true, subscriptions: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.year.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.subject.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
  ])

  return (
    <div>
      <h1 className="text-2xl font-black text-navy">الكورسات ({courses.length})</h1>
      <p className="mb-6 text-sm text-slate-500">إدارة الكورسات وتعديل أسعارها</p>

      <div className="grid gap-4">
        {courses.map((c) => (
          <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-black text-navy">{c.name}</p>
                <p className="text-sm text-slate-500">
                  {c.subject?.name} · الأستاذ {c.teacher?.name}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-left">
                  <p className="font-black text-amber-600">{formatPrice(c.price)}</p>
                  <p className="text-xs text-slate-400">{c._count.sections} أقسام</p>
                </div>
                <CourseActions
                  course={{
                    id: c.id,
                    name: c.name,
                    description: c.description,
                    price: Number(c.price),
                    yearId: c.yearId,
                    subjectId: c.subjectId,
                  }}
                  years={years.map((y) => ({ id: y.id, name: y.name }))}
                  subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs font-bold text-slate-500">
              <span>👥 {c._count.subscriptions} مشترك</span>
              <span className={c.isActive ? "text-mint-dark" : "text-rose-500"}>
                {c.isActive ? "● نشط" : "○ موقوف"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
