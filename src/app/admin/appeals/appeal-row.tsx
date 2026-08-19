import { formatDateTime } from "@/lib/utils"
import { AppealReviewForm } from "@/app/(site)/teacher/appeals/appeal-review-form"

type AppealRowData = {
  id: string
  userId: string
  reason: string
  response: string | null
  status: string
  extraPoints: number
  createdAt: Date
  user: { firstName: string; lastName: string; phone: string }
  attempt: {
    score: unknown
    totalScore: unknown
    exam: {
      title: string
      section: { course: { name: string; teacher: { name: string } | null } }
    }
    answers: { question: { type: string; text: string; points: unknown }; userAnswer: string | null; earnedPoints: unknown; feedback: string | null }[]
  }
}

export function AppealAdminRow({ appeal }: { appeal: AppealRowData }) {
  const essayAnswers = appeal.attempt.answers
    .filter((a) => a.question.type !== "MCQ")
    .map((a) => ({
      question: a.question.text,
      answer: a.userAnswer ?? "",
      earned: Number(a.earnedPoints),
      max: Number(a.question.points),
      feedback: a.feedback,
    }))
  const resolved = appeal.status !== "pending"

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-black text-navy">
          {appeal.user.firstName} {appeal.user.lastName}
          <span className="mr-2 text-sm font-bold text-slate-500">({appeal.user.phone})</span>
        </p>
        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            appeal.status === "approved"
              ? "bg-mint-50 text-mint-dark"
              : appeal.status === "rejected"
                ? "bg-rose-50 text-rose-600"
                : "bg-amber-50 text-amber-700"
          }`}
        >
          {appeal.status === "approved" ? "مقبول" : appeal.status === "rejected" ? "مرفوض" : "قيد المراجعة"}
        </span>
      </div>
      <p className="text-sm font-bold text-amber-700">
        {appeal.attempt.exam.title} — {appeal.attempt.exam.section.course.name}
        {appeal.attempt.exam.section.course.teacher ? ` (${appeal.attempt.exam.section.course.teacher.name})` : ""}
      </p>
      <p className="mt-1 text-sm text-slate-600">{appeal.reason}</p>
      <p className="mt-1 text-xs text-slate-400">
        {formatDateTime(appeal.createdAt)} · الدرجة {Number(appeal.attempt.score)}/{Number(appeal.attempt.totalScore)}
      </p>

      <div className="mt-4">
        {resolved ? (
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <span className="font-black text-navy">الرد: </span>
            {appeal.response}
            {appeal.status === "approved" && appeal.extraPoints > 0 && (
              <span className="mr-2 font-black text-mint-dark">+{appeal.extraPoints} نقطة</span>
            )}
          </div>
        ) : (
          <AppealReviewForm
            appealId={appeal.id}
            currentScore={Number(appeal.attempt.score)}
            totalScore={Number(appeal.attempt.totalScore)}
            essayAnswers={essayAnswers}
          />
        )}
      </div>
    </div>
  )
}
