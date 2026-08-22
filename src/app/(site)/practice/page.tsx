import type { Metadata } from "next"
import Link from "next/link"
import { ChevronLeft, Dumbbell, GraduationCap } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { PracticeLauncher } from "./practice-launcher"

export const metadata: Metadata = { title: "بنك الأسئلة" }

export default async function PracticePage() {
  const user = await getCurrentUser()

  const subjects = await prisma.subject.findMany({
    where: { isActive: true },
    include: {
      bankChapters: {
        where: { isActive: true },
        include: { _count: { select: { questions: true } } },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { order: "asc" },
  })

  const totalQuestions = subjects.reduce(
    (a, s) => a + s.bankChapters.reduce((b, c) => b + c._count.questions, 0),
    0
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="hover:text-amber-600">
          الرئيسية
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-bold text-navy">بنك الأسئلة</span>
      </nav>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-l from-violet-600 to-indigo-600 p-6 text-white">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <Dumbbell className="h-7 w-7" />
            بنك الأسئلة
          </h1>
          <p className="mt-1 text-sm text-violet-100">
            تدرب على {totalQuestions}+ سؤال في مختلف المواد — ابدأ اختباراً وقيّم مستواك فوراً
          </p>
        </div>
        <span className="rounded-2xl bg-white/15 px-4 py-3 text-center">
          <span className="block text-2xl font-black">{totalQuestions}</span>
          <span className="text-xs text-violet-100">سؤالاً</span>
        </span>
      </div>

      {subjects.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
          <GraduationCap className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-500">بنك الأسئلة قيد التجهيز — عد قريباً</p>
        </div>
      ) : (
        <div className="space-y-6">
          {subjects
            .filter((s) => s.bankChapters.length > 0)
            .map((subject) => (
              <div key={subject.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
                  <h2 className="flex items-center gap-3 font-black text-navy">
                    <span className="text-2xl">{subject.icon ?? "📚"}</span>
                    {subject.name}
                  </h2>
                  <span className="text-xs font-medium text-slate-500">
                    {subject.bankChapters.reduce((a, c) => a + c._count.questions, 0)} سؤال
                  </span>
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-2">
                  {subject.bankChapters.map((chapter) => (
                    <PracticeLauncher
                      key={chapter.id}
                      chapterId={chapter.id}
                      chapterName={chapter.name}
                      questionCount={chapter._count.questions}
                      loggedIn={Boolean(user)}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
