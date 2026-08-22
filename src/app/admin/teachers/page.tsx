import type { Metadata } from "next"
import Link from "next/link"
import { Star } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { TeacherForm, TeacherActions } from "./teacher-form"
import { TeacherPhotoUpload } from "./teacher-photo-upload"

export const metadata: Metadata = { title: "المعلمون | لوحة الإدارة" }

export default async function AdminTeachersPage() {
  const teachers = await prisma.teacher.findMany({
      select: {
        id: true,
        name: true,
        title: true,
        bio: true,
        image: true,
        isFeatured: true,
        sortOrder: true,
        user: { select: { id: true, isBlocked: true, firstName: true, lastName: true } },
        _count: { select: { courses: true, liveSessions: true } },
      },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  })

  const unlinked = teachers.filter((t) => !t.user)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-navy">المعلمون ({teachers.length})</h1>
        <p className="text-sm text-slate-500">
          ارفع صورة المعلم، وفعّل نجمة «النخبة»، ورتّب المعلمين بالأسهم — هذا هو الترتيب الذي سيظهر للطلاب
        </p>
      </div>

      <TeacherForm unlinked={unlinked.map((t) => ({ id: t.id, name: t.name, title: t.title }))} />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="divide-y divide-slate-50">
          {teachers.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <TeacherPhotoUpload teacherId={t.id} image={t.image} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/teachers/${t.id}`}
                  className="inline-flex items-center gap-2 font-black text-navy transition-colors hover:text-amber-600"
                >
                  {t.name}
                  {t.isFeatured && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-600">
                      <Star className="h-3 w-3 fill-amber-500" /> نخبة
                    </span>
                  )}
                </Link>
                <p className="text-xs text-slate-500">
                  {t.title ?? "بدون تخصص"}
                  {t.bio ? ` · ${t.bio}` : ""}
                </p>
              </div>
              <span className="text-xs font-medium text-slate-500">
                {t._count.courses} كورس · {t._count.liveSessions} جلسة
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  t.user
                    ? t.user.isBlocked
                      ? "bg-rose-50 text-rose-600"
                      : "bg-mint-50 text-mint-dark"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {t.user ? (t.user.isBlocked ? "محظور" : "حساب مفعل") : "بدون حساب"}
              </span>
              <TeacherActions
                id={t.id}
                hasUser={!!t.user}
                blocked={t.user?.isBlocked ?? false}
                featured={t.isFeatured}
                name={t.name}
              />
            </div>
          ))}
          {teachers.length === 0 && <p className="p-8 text-center text-sm text-slate-400">لا يوجد معلمون بعد</p>}
        </div>
      </div>
    </div>
  )
}
