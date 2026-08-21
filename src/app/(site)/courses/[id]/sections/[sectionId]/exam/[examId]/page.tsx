import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { AlertTriangle, ChevronLeft, Clock, FileText, Info } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import { Button } from "@/components/ui/button"

interface ExamIntroProps {
  params: Promise<{ id: string; sectionId: string; examId: string }>
}

export async function generateMetadata({ params }: ExamIntroProps): Promise<Metadata> {
  try {
    const { examId } = await params
    const exam = await prisma.exam.findUnique({ where: { id: examId } })
    return { title: exam?.title ?? "الاختبار" }
  } catch {
    return { title: "الاختبار" }
  }
}

export default async function ExamIntroPage({ params }: ExamIntroProps) {
  const { id: courseId, sectionId, examId } = await params

  console.log("EXAM PAGE PARAMS:", { courseId, sectionId, examId })

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

    console.log("EXAM FETCH RESULT:", exam ? `found: ${exam.title}` : "NOT FOUND")

    if (!exam || exam.section.courseId !== courseId) {
      console.log("EXAM NOT FOUND OR courseId mismatch:", { examCourseId: exam?.section.courseId, expectedCourseId: courseId })
      notFound()
    }

    const hasAccess = await canAccessCourse(user, courseId)
    if (!exam.isFree && !hasAccess) {
      redirect(`/courses/${courseId}`)
    }

    const previousAttempt = exam.attempts.find(
      (a) => a.status === "submitted" || a.status === "graded"
    )
    const hasAttempt = Boolean(previousAttempt)

    const mcqCount = exam.questions.filter((q) => q.type === "MCQ").length
    const essayCount = exam.questions.filter((q) => q.type !== "MCQ").length
    const totalPoints = exam.questions.reduce((a, q) => a + q.points, 0)

    const isHomework = exam.type === "HOMEWORK"

    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Link href="/courses" className="hover:text-amber-600">
            الكورسات
          </Link>
          <ChevronLeft className="h-4 w-4" />
          <Link href={`/courses/${courseId}`} className="hover:text-amber-600">
            {exam.section.course.name}
          </Link>
          <ChevronLeft className="h-4 w-4" />
          <span className="font-bold text-navy">{exam.title}</span>
        </nav>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-4 bg-gradient-to-l from-violet-600 to-indigo-600 p-6 text-white">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20">
              <FileText className="h-7 w-7" />
            </span>
            <div>
              <h1 className="text-xl font-black">{exam.title}</h1>
              <p className="mt-0.5 text-sm text-violet-100">
                {isHomework ? "واجب" : "اختبار"} · {exam.section.name}
              </p>
            </div>
          </div>

          <div className="space-y-6 p-6 sm:p-8">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-2xl bg-slate-50 p-4 text-center">
                <Clock className="mx-auto mb-1 h-5 w-5 text-violet-600" />
                <p className="text-lg font-black text-navy">{exam.durationMinutes}</p>
                <p className="text-xs text-slate-500">دقيقة</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-center">
                <Info className="mx-auto mb-1 h-5 w-5 text-violet-600" />
                <p className="text-lg font-black text-navy">{exam.questions.length}</p>
                <p className="text-xs text-slate-500">سؤال</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-center">
                <span className="mx-auto mb-1 block text-center text-lg font-black text-violet-600">🏆</span>
                <p className="text-lg font-black text-navy">{totalPoints}</p>
                <p className="text-xs text-slate-500">درجة</p>
              </div>
            </div>

            <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="text-sm leading-7 text-amber-800">
                  <p className="font-extrabold">تنبيه مهم: الاختبار يُفتح مرة واحدة فقط</p>
                  <p>
                    بمجرد الضغط على «ابدأ»، سينطلق المؤقت ولا يمكنك إعادة المحاولة. تأكد من جاهزيتك
                    قبل البدء.
                  </p>
                </div>
              </div>
            </div>

            {mcqCount > 0 && (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-extrabold text-navy mb-1">معلومات إضافية</p>
                <p>
                  الاختبار يحتوي على {mcqCount} سؤال اختيار من متعدد
                  {essayCount > 0 && ` و ${essayCount} سؤال مقالي`}، ويتم تصحيح
                  {mcqCount > 0 ? " أسئلة الاختيار تلقائياً" : ""}
                  {essayCount > 0 ? "، وتراجع الأسئلة المقالية يدوياً" : ""}.
                </p>
              </div>
            )}

            {hasAttempt ? (
              <div className="rounded-2xl border border-mint-200 bg-mint-50 p-4 text-center">
                <p className="font-extrabold text-mint-dark">
                  ✓ لقد أدّيت هذا {isHomework ? "الواجب" : "الاختبار"} بالفعل
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  الدرجة: <b>{Number(previousAttempt!.score)} / {Number(previousAttempt!.totalScore)}</b>
                  {previousAttempt!.status === "in_progress" && " (محاولة قيد التقدم)"}
                </p>
                <Button
                  href={`/courses/${courseId}/sections/${sectionId}/exam/${examId}/result/${previousAttempt!.id}`}
                  variant="mint"
                  className="mt-3"
                >
                  عرض النتيجة
                </Button>
              </div>
            ) : (
              <Button
                href={`/courses/${courseId}/sections/${sectionId}/exam/${examId}/take`}
                size="lg"
                className="w-full"
              >
                ابدأ الآن
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  } catch (err) {
    console.error("EXAM FETCH ERROR:", err)
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-lg font-bold text-slate-500">حدث خطأ أثناء تحميل الاختبار</p>
        <a href={`/courses/${courseId}`} className="text-sm font-bold text-amber-600 hover:underline">
          العودة للدورة ←
        </a>
      </div>
    )
  }
}
