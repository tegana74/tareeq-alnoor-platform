import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { HelpCircle } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { QuestionForm, QuestionActions } from "./question-bank-client"
import { getOptionLabel } from "@/lib/exam-labels"

export const metadata: Metadata = { title: "بنك الأسئلة | لوحة المعلم" }

export default async function TeacherQuestionBankPage() {
  const user = await getCurrentUser()
  if (!user || (user.role !== "TEACHER" && user.role !== "ADMIN")) redirect("/login")

  const chapters = await prisma.bankChapter.findMany({
    include: {
      subject: { select: { name: true } },
      questions: true,
    },
    orderBy: { order: "asc" },
  })

  const difficultyLabels: Record<string, string> = {
    easy: "سهل",
    medium: "متوسط",
    hard: "صعب",
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-navy">
          <HelpCircle className="mb-1 inline-block h-6 w-6 text-amber-500" />
          {" "}بنك الأسئلة
        </h1>
        <p className="text-sm text-slate-500">إضافة وحذف الأسئلة في الفصول المتاحة</p>
      </div>

      <div className="space-y-4">
        {chapters.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <p className="text-sm text-slate-400">لا توجد فصول في بنك الأسئلة بعد</p>
          </div>
        ) : (
          chapters.map((chapter) => (
            <div key={chapter.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-navy">{chapter.name}</span>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                    {chapter.subject.name}
                  </span>
                  <span className="text-xs text-slate-400">{chapter.questions.length} سؤال</span>
                </div>
                <QuestionForm chapterId={chapter.id} />
              </div>

              {chapter.questions.length > 0 && (
                <div className="divide-y divide-slate-50">
                  {chapter.questions.map((q, i) => (
                    <div key={q.id} className="flex items-start gap-3 px-5 py-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-navy">{q.text}</p>
                        {q.options && Array.isArray(q.options) && (
                          <div className="mt-1 flex flex-wrap gap-2">
                            {q.options.map((opt, oi) => (
                              <span
                                key={oi}
                                className={`rounded-lg px-2 py-0.5 text-xs ${
                                  String(oi) === q.correctAnswer
                                    ? "bg-mint-50 font-bold text-mint-dark"
                                    : "bg-slate-50 text-slate-500"
                                }`}
                              >
                                {getOptionLabel(oi)}. {String(opt)}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">
                            {q.type === "MCQ" ? "اختيار من متعدد" : "مقالي"} · {q.points} درجة · {difficultyLabels[q.difficulty] ?? q.difficulty}
                          </span>
                        </div>
                      </div>
                      <QuestionActions questionId={q.id} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
