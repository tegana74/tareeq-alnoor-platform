import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { ExamRunner } from "./exam-runner"

interface ExamTakePageProps {
  params: Promise<{ id: string; sectionId: string; examId: string }>
}

export const metadata: Metadata = { title: "حل الاختبار" }

export default async function ExamTakePage({ params }: ExamTakePageProps) {
  const { id: courseId, sectionId, examId } = await params

  console.log("EXAM TAKE PAGE PARAMS:", { courseId, sectionId, examId })

  try {
    const user = await getCurrentUser()
    if (!user) redirect("/login")

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        section: { include: { course: true } },
        questions: { orderBy: { order: "asc" } },
        attempts: { where: { userId: user.id } },
      },
    })

    console.log("EXAM TAKE FETCH:", exam ? `found: ${exam.title}, questions: ${exam.questions.length}` : "NOT FOUND")

    if (!exam || exam.section.courseId !== courseId) notFound()

    const hasAccess = await canAccessCourse(user, courseId)
    if (!exam.isFree && !hasAccess) redirect(`/courses/${courseId}`)

    if (!exam.questions || exam.questions.length === 0) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <p className="text-lg font-bold text-slate-500">لا توجد أسئلة متاحة لهذا الاختبار حالياً</p>
          <a href={`/courses/${courseId}`} className="text-sm font-bold text-amber-600 hover:underline">
            العودة للدورة ←
          </a>
        </div>
      )
    }

    const submitted = exam.attempts.find((a) => a.status === "submitted" || a.status === "graded")
    if (submitted) {
      redirect(`/courses/${courseId}/sections/${sectionId}/exam/${examId}/result/${submitted.id}`)
    }

    let attempt = exam.attempts.find((a) => a.status === "in_progress")
    if (!attempt) {
      attempt = await prisma.examAttempt.create({
        data: { userId: user.id, examId, totalScore: exam.questions.reduce((a, q) => a + q.points, 0) },
      })
    }

    const questions = exam.questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      points: q.points,
      options: (q.options as string[] | null) ?? [],
    }))

    return (
      <ExamRunner
        courseId={courseId}
        sectionId={sectionId}
        examId={examId}
        attemptId={attempt.id}
        examTitle={exam.title}
        durationMinutes={exam.durationMinutes}
        questions={questions}
      />
    )
  } catch (err) {
    console.error("EXAM TAKE ERROR:", err)
    return (
      <div className="p-10 text-white flex flex-col gap-4" dir="rtl">
        <h1 className="text-xl font-bold text-red-500">تفاصيل الخطأ للتشخيص التقني:</h1>
        <p>Exam ID: {examId}</p>
        <p>Course ID: {courseId}</p>
        <p>Section ID: {sectionId}</p>
        <p className="bg-red-900 p-4 rounded text-sm">Error Message: {err instanceof Error ? err.message : String(err)}</p>
        <a href={`/courses/${courseId}`} className="text-yellow-500 mt-4">العودة للدورة</a>
      </div>
    )
  }
}
