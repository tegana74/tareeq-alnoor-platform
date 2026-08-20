import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { formatDate, formatPrice } from "@/lib/utils"
import { StudentForm, StudentActions } from "./student-form"
import { GrantCourseButton } from "./grant-course-form"

export const metadata: Metadata = { title: "الطلاب | لوحة الإدارة" }

export default async function AdminUsersPage() {
  const [users, years, courses] = await Promise.all([
    prisma.user.findMany({
      where: { role: "STUDENT" },
      include: {
        year: true,
        department: true,
        _count: { select: { subscriptions: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.year.findMany({ orderBy: { order: "asc" } }),
    prisma.course.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
  ])
  const courseOptions = courses.map((c) => ({ id: c.id, name: c.name }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-navy">الطلاب ({users.length})</h1>
        <p className="text-sm text-slate-500">أضف طالباً يدوياً أو قم بإزالة طالب (حظر الحساب)</p>
      </div>

      <StudentForm years={years.map((y) => ({ id: y.id, name: y.name }))} />

      <div className="overflow-visible rounded-2xl border border-slate-200 bg-white">
        <div className="divide-y divide-slate-50">
          {users.map((u) => (
            <a
              key={u.id}
              href={`/admin/users/${u.id}`}
              className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-royal-50 font-black text-royal">
                {u.firstName[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-navy">
                  {u.firstName} {u.middleName} {u.lastName}
                </p>
                <p className="text-xs text-slate-500">
                  {u.phone} · {u.year?.name ?? "بدون سنة"} {u.department ? `· ${u.department.name}` : ""}
                </p>
              </div>
              <span className="text-xs font-bold text-slate-500">{u._count.subscriptions} اشتراك</span>
              <span className="text-xs font-bold text-slate-400">{formatDate(u.createdAt)}</span>
              <span className="text-xs font-black text-navy">
                {u.points} نقطة · {formatPrice(u.walletBalance)}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  u.isBlocked ? "bg-rose-50 text-rose-600" : "bg-mint-50 text-mint-dark"
                }`}
              >
                {u.isBlocked ? "محظور" : "نشط"}
              </span>
              <GrantCourseButton studentId={u.id} studentName={u.firstName} courses={courseOptions} />
              <StudentActions id={u.id} blocked={u.isBlocked} name={`${u.firstName} ${u.lastName}`} />
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
