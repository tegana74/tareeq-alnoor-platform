import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft, Scale } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { formatDateTime } from "@/lib/utils"

export const metadata: Metadata = { title: "تظلماتي" }

export default async function AppealsPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== "STUDENT") redirect("/login")

  const appeals = await prisma.appeal.findMany({
    where: { userId: user.id },
    include: { attempt: { include: { exam: { include: { section: { include: { course: true } } } } } } },
    orderBy: { createdAt: "desc" },
  })

  const statusBadge = (status: string) =>
    status === "approved"
      ? "bg-mint-50 text-mint-dark"
      : status === "rejected"
        ? "bg-rose-50 text-rose-600"
        : "bg-amber-50 text-amber-700"
  const statusText = (status: string) =>
    status === "approved" ? "مقبول" : status === "rejected" ? "مرفوض" : "قيد المراجعة"

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="hover:text-amber-600">
          الرئيسية
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-bold text-navy">تظلماتي</span>
      </nav>

      <h1 className="mb-6 flex items-center gap-2 text-2xl font-black text-navy">
        <Scale className="h-7 w-7 text-amber-500" />
        تظلماتي
      </h1>

      {appeals.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm text-slate-400">
            لا توجد تظلمات. عند عدم رضاك عن تصحيح إجابة، قدّم تظلماً من صفحة نتيجة الاختبار.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {appeals.map((a) => (
            <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/courses/${a.attempt.exam.section.courseId}/sections/${a.attempt.exam.sectionId}/exam/${a.attempt.examId}/result/${a.attemptId}`}
                  className="font-black text-navy hover:text-amber-600"
                >
                  {a.attempt.exam.title}
                </Link>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${statusBadge(a.status)}`}>
                  {statusText(a.status)}
                </span>
              </div>
              <p className="text-sm text-slate-600">{a.reason}</p>
              <p className="mt-2 text-xs text-slate-400">
                {formatDateTime(a.createdAt)}
                {a.status === "approved" && a.extraPoints > 0 && (
                  <span className="ms-2 font-black text-mint-dark">+{a.extraPoints} نقطة أُضيفت لدرجتك</span>
                )}
              </p>
              {a.response && (
                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                  <span className="font-black text-navy">رد المدرس: </span>
                  {a.response}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
