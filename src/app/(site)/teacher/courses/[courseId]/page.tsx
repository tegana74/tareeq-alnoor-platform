import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { BookOpen, ChevronLeft, FileText, ListVideo, PlayCircle, Settings2 } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import {
  SectionForm,
  SectionDelete,
  VideoEditor,
  VideoDelete,
  BookEditor,
  BookDelete,
  ExamEditor,
  ExamDelete,
  QuestionList,
} from "./teacher-content-forms"
import { SectionAIGenerator } from "./section-ai-generator"
import { ExamType } from "@/generated/prisma/enums"

export const metadata: Metadata = { title: "إدارة الكورس" }

interface ManageCourseProps {
  params: Promise<{ courseId: string }>
}

export default async function ManageCoursePage({ params }: ManageCourseProps) {
  const { courseId } = await params
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const isAdmin = user.role === "ADMIN"
  if (user.role !== "TEACHER" && !isAdmin) redirect("/teacher")

  const course = await (isAdmin
    ? prisma.course.findUnique({
        where: { id: courseId },
        include: {
          subject: true,
          sections: {
            include: {
              videos: { orderBy: { order: "asc" } },
              books: { orderBy: { order: "asc" } },
              exams: {
                include: { questions: { orderBy: { order: "asc" } } },
                orderBy: { order: "asc" },
              },
            },
            orderBy: { order: "asc" },
          },
        },
      })
    : prisma.course.findFirst({
        where: { id: courseId, teacherId: user.teacherId! },
        include: {
          subject: true,
          sections: {
            include: {
              videos: { orderBy: { order: "asc" } },
              books: { orderBy: { order: "asc" } },
              exams: {
                include: { questions: { orderBy: { order: "asc" } } },
                orderBy: { order: "asc" },
              },
            },
            orderBy: { order: "asc" },
          },
        },
      }))

  if (!course) notFound()

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/teacher" className="hover:text-amber-600">
          لوحة المدرس
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-bold text-navy">{course.name}</span>
      </nav>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-navy">
            <Settings2 className="h-7 w-7 text-amber-500" />
            إدارة الكورس
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {course.subject?.icon} {course.subject?.name} — {course.sections.length} أقسام،{" "}
            {course.sections.reduce((a, s) => a + s.videos.length, 0)} درس
          </p>
        </div>
        <a
          href={`/courses/${course.id}/sections`}
          target="_blank"
          className="rounded-xl border-2 border-amber-500 px-4 py-2 text-sm font-black text-amber-600 hover:bg-amber-50"
        >
          معاينة الكورس ←
        </a>
      </div>

      <div className="space-y-5">
        {course.sections.map((section) => (
          <div key={section.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
              <h2 className="font-black text-navy">{section.name}</h2>
              <div className="flex items-center gap-1">
                <VideoEditor sectionId={section.id} />
                <SectionDelete sectionId={section.id} />
              </div>
            </div>

            <div className="divide-y divide-slate-50 px-5">
              {/* الدروس */}
              {section.videos.map((video) => (
                <div key={video.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <PlayCircle className="h-4 w-4 shrink-0 text-amber-500" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-navy">{video.title}</p>
                      <p className="text-[10px] text-slate-400" dir="ltr">
                        {video.url}
                      </p>
                    </div>
                    {video.isFree && (
                      <span className="shrink-0 rounded-full bg-mint-50 px-2 py-0.5 text-[10px] font-black text-mint-dark">
                        مجاني
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center">
                    <VideoEditor
                      sectionId={section.id}
                      video={{
                        id: video.id,
                        title: video.title,
                        description: video.description ?? undefined,
                        provider: video.provider,
                        url: video.url,
                        isFree: video.isFree,
                        downloadAllowed: video.downloadAllowed,
                        order: video.order,
                      }}
                    />
                    <VideoDelete videoId={video.id} />
                  </div>
                </div>
              ))}
              <div className="py-1">
                <VideoEditor sectionId={section.id} />
              </div>

              {/* الكتب */}
              {section.books.map((book) => (
                <div key={book.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <BookOpen className="h-4 w-4 shrink-0 text-blue-500" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-navy">{book.title}</p>
                      <p className="truncate text-[10px] text-slate-400" dir="ltr">
                        {book.fileUrl}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <BookEditor sectionId={section.id} book={book} />
                    <BookDelete bookId={book.id} />
                  </div>
                </div>
              ))}
              <div className="py-1">
                <BookEditor sectionId={section.id} />
              </div>

              {/* الامتحانات */}
              {section.exams.map((exam) => (
                <div key={exam.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="h-4 w-4 shrink-0 text-violet-500" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-navy">{exam.title}</p>
                        <p className="text-[10px] text-slate-400">
                          {exam.type === ExamType.HOMEWORK ? "واجب منزلي" : "اختبار"} — {exam.questions.length} سؤالاً —{" "}
                          {exam.durationMinutes} دقيقة — {exam.totalScore} درجة
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <ExamEditor sectionId={section.id} exam={exam} />
                      <ExamDelete examId={exam.id} />
                    </div>
                  </div>
                  <QuestionList
                    exam={{
                      id: exam.id,
                      questions: exam.questions.map((q) => ({
                        id: q.id,
                        text: q.text,
                        type: q.type,
                        points: q.points,
                        options: q.options as string[] | null,
                        correctAnswer: q.correctAnswer,
                        order: q.order,
                      })),
                    }}
                  />
                </div>
              ))}
              <div className="py-1">
                <ExamEditor sectionId={section.id} />
              </div>

              {/* مولّد الأسئلة بالذكاء الاصطناعي */}
              <div className="py-1">
                <SectionAIGenerator sectionId={section.id} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <SectionForm courseId={course.id} />
    </div>
  )
}
