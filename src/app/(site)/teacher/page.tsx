import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ClipboardList, Radio, Settings2, HelpCircle } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { formatDateTime, formatPrice } from "@/lib/utils"
import { StageForm, CourseForm } from "./teacher-structure-forms"
import { CourseActions } from "@/components/course-actions"

export const metadata: Metadata = { title: "لوحة المدرس" }

export default async function TeacherDashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (user.role !== "TEACHER" && user.role !== "ADMIN") redirect("/")
  const isAdmin = user.role === "ADMIN"

  const teacher = await prisma.teacher.findFirst({
    where: isAdmin ? {} : { user: { id: user.id } },
    include: { courses: { include: { subject: true, _count: { select: { subscriptions: true } } } } },
    orderBy: { createdAt: "desc" },
  })

  const courses = teacher?.courses ?? []

  const pendingEssays = await prisma.examAnswer.count({
    where: {
      question: { type: { not: "MCQ" } },
      attempt: { status: "submitted", exam: { section: { course: { teacherId: teacher?.id } } } },
    },
  })

  const [years, subjects, teachers] = await Promise.all([
    prisma.year.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.subject.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    isAdmin ? prisma.teacher.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ])

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-black text-navy">أهلاً، أستاذ {user.firstName} 👨‍🏫</h1>
      <p className="mb-8 text-sm text-slate-500">إدارة كورساتك ومتابعة طلابك</p>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <a
          href="/teacher/grading"
          className={`rounded-2xl border-2 p-4 transition-colors hover:border-amber-400 ${pendingEssays > 0 ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
        >
          <p className="font-black text-navy">📝 تصحيح الإجابات</p>
          <p className="mt-1 text-xs text-slate-500">
            {pendingEssays > 0 ? `${pendingEssays} إجابة بانتظار تصحيحك` : "لا يوجد بانتظار التصحيح"}
          </p>
        </a>
        <a
          href="/teacher/attempts"
          className="rounded-2xl border-2 border-slate-200 bg-white p-4 transition-colors hover:border-amber-400"
        >
          <p className="flex items-center gap-1 font-black text-navy">
            <ClipboardList className="h-4 w-4 text-amber-500" /> محاولات الطلاب
          </p>
          <p className="mt-1 text-xs text-slate-500">نتائج وإجابات طلابك على الاختبارات</p>
        </a>
        <a
          href="/teacher/live"
          className="rounded-2xl border-2 border-slate-200 bg-white p-4 transition-colors hover:border-amber-400"
        >
          <p className="flex items-center gap-1 font-black text-navy">
            <Radio className="h-4 w-4 text-rose-500" /> البث المباشر
          </p>
          <p className="mt-1 text-xs text-slate-500">جدولة جلسات مباشرة لطلابك ومتابعة حضورهم</p>
        </a>
        <Link
          href="/teacher/live-classrooms"
          className="rounded-2xl border-2 border-slate-200 bg-white p-4 transition-colors hover:border-amber-400"
        >
          <p className="flex items-center gap-1 font-black text-navy">
            <Radio className="h-4 w-4 text-primary-500" /> قاعات البث
          </p>
          <p className="mt-1 text-xs text-slate-500">نظّم قاعات تعليمية دائمة لجلساتك المباشرة</p>
        </Link>
        <a
          href="/teacher/question-bank"
          className="rounded-2xl border-2 border-slate-200 bg-white p-4 transition-colors hover:border-amber-400"
        >
          <p className="flex items-center gap-1 font-black text-navy">
            <HelpCircle className="h-4 w-4 text-amber-500" /> بنك الأسئلة
          </p>
          <p className="mt-1 text-xs text-slate-500">إضافة وحذف الأسئلة في بنك الأسئلة</p>
        </a>
        <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
          <p className="flex items-center gap-1 font-black text-navy">
            <Settings2 className="h-4 w-4 text-amber-500" /> إدارة المحتوى
          </p>
          <p className="mt-1 text-xs text-slate-500">اضغط على أي كورس بالأسفل</p>
        </div>
      </div>

      <div className="mb-8 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-black text-navy">إضافة مرحلة تعليمية أو كورس جديد</h2>
        <p className="mb-4 text-sm text-slate-500">أضف مرحلة جديدة للمنصة، أو أنشئ كورسك وحدّد سعره</p>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-start">
          <div className="w-full sm:w-72">
            <p className="mb-2 text-xs font-bold text-slate-500">مرحلة تعليمية جديدة</p>
            <StageForm />
          </div>
          <div className="w-full">
            <p className="mb-2 text-xs font-bold text-slate-500">كورس جديد بسعر محدد</p>
            <CourseForm
              years={years.map((y) => ({ id: y.id, name: y.name }))}
              subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
              teachers={teachers.map((t) => ({ id: t.id, name: t.name }))}
              isAdmin={isAdmin}
            />
          </div>
        </div>
      </div>

      <h2 className="mb-4 text-lg font-black text-navy">كورساتي ({courses.length})</h2>
      <div className="space-y-4">
        {courses.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-amber-400 hover:shadow-md"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <a href={`/teacher/courses/${c.id}`} className="min-w-0 flex-1">
                <p className="font-black text-navy">{c.name}</p>
                <p className="text-sm text-slate-500">{c.subject?.name}</p>
              </a>
              <div className="flex items-center gap-4 text-sm font-medium text-slate-500">
                <span>👥 {c._count.subscriptions} مشترك</span>
                <span className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-black text-amber-600">
                  {formatPrice(c.price)}
                </span>
                <span className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-black text-amber-600">
                  إدارة المحتوى ←
                </span>
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
            <p className="mt-2 text-xs text-slate-400">أُنشئ في {formatDateTime(c.createdAt)}</p>
          </div>
        ))}
        {courses.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
            لم تُسنَد لك أي كورسات بعد — أضف كورسك الأول من النموذج أعلاه
          </p>
        )}
      </div>
    </div>
  )
}
