import { prisma } from "@/lib/prisma"
import { canAccessCourse } from "@/lib/subscriptions"

export type LearningKind = "video" | "book" | "exam"

export interface FlatItem {
  kind: LearningKind
  id: string
  title: string
  meta: string
  free: boolean
  sectionId: string
  sectionName: string
  /** done = فيديو مكتمل / كتاب مُعلَّم مقروءًا / اختبار بأفضل نتيجة ≥50% */
  status: "done" | "current" | "available" | "locked"
  href: string
}

export interface SectionProgress {
  id: string
  name: string
  total: number
  completed: number
  percent: number
}

export interface LearningShellData {
  course: { id: string; name: string; teacherName: string }
  canAccess: boolean
  progress: { completed: number; total: number; percent: number }
  sections: SectionProgress[]
  flat: FlatItem[]
  currentIndex: number
  prev: FlatItem | null
  next: FlatItem | null
}

const itemHref = (courseId: string, sectionId: string, kind: LearningKind, id: string) =>
  `/courses/${courseId}/sections/${sectionId}/${kind}/${id}`

/** نسبة الإنجاز — المحتوى المقفول لا يدخل في المقام */
export function calculateLearningProgress(items: { status: string }[]) {
  const counted = items.filter((i) => i.status !== "locked")
  const completed = counted.filter((i) => i.status === "done").length
  const total = counted.length
  return {
    completed,
    total,
    percent: total > 0 ? Math.min(Math.round((completed / total) * 100), 100) : 0,
  }
}

/**
 * خريطة تنقّل موحدة لكل صفحات التعلّم داخل الكورس.
 * استعلامات ثابتة مهما كان حجم الكورس:
 * 1) شجرة الكورس بحقول مختارة
 * 2) VideoView دفعة واحدة
 * 3) BookView دفعة واحدة
 * 4) ExamAttempt دفعة واحدة (أفضل نتيجة ≥50%)
 * (+ استعلام اختياري لتحديد الدرس الحالي عند غيابه)
 */
export async function getLearningShell(
  courseId: string,
  opts: {
    user: { id: string; role: string; teacherId: string | null } | null
    current?: { kind: LearningKind; id: string } | null
  }
): Promise<LearningShellData | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      name: true,
      isActive: true,
      price: true,
      teacher: { select: { name: true } },
      sections: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          videos: {
            orderBy: { order: "asc" },
            select: { id: true, title: true, duration: true, isFree: true },
          },
          books: { orderBy: { order: "asc" }, select: { id: true, title: true, isFree: true } },
          exams: {
            orderBy: { order: "asc" },
            select: { id: true, title: true, type: true, isFree: true, durationMinutes: true },
          },
        },
      },
    },
  })
  if (!course || !course.isActive) return null

  const canAccess = await canAccessCourse(opts.user, courseId)

  const allVideoIds = course.sections.flatMap((s) => s.videos.map((v) => v.id))
  const allBookIds = course.sections.flatMap((s) => s.books.map((b) => b.id))
  const allExamIds = course.sections.flatMap((s) => s.exams.map((e) => e.id))

  const [views, bookViews, examAttempts] = await Promise.all([
    allVideoIds.length > 0 && opts.user
      ? prisma.videoView.findMany({
          where: { userId: opts.user.id, videoId: { in: allVideoIds } },
          select: { videoId: true, isCompleted: true },
        })
      : Promise.resolve([] as { videoId: string; isCompleted: boolean }[]),
    allBookIds.length > 0 && opts.user
      ? prisma.bookView.findMany({
          where: { userId: opts.user.id, bookId: { in: allBookIds }, isCompleted: true },
          select: { bookId: true },
        })
      : Promise.resolve([] as { bookId: string }[]),
    allExamIds.length > 0 && opts.user
      ? prisma.examAttempt.findMany({
          where: {
            userId: opts.user.id,
            examId: { in: allExamIds },
            status: { in: ["submitted", "graded"] },
          },
          select: { examId: true, score: true, totalScore: true },
        })
      : Promise.resolve([] as { examId: string; score: unknown; totalScore: unknown }[]),
  ])

  const completedVideos = new Set(views.filter((v) => v.isCompleted).map((v) => v.videoId))
  const readBooks = new Set(bookViews.map((b) => b.bookId))

  // أفضل نتيجة لكل اختبار (نفس قاعدة المحرك: 50%)
  const bestExamPct = new Map<string, number>()
  for (const a of examAttempts) {
    const total = Number(a.totalScore)
    if (total <= 0) continue
    const pctVal = Math.round((Number(a.score) / total) * 100)
    const prevBest = bestExamPct.get(a.examId) ?? -1
    if (pctVal > prevBest) bestExamPct.set(a.examId, pctVal)
  }

  const flat: FlatItem[] = []

  for (const s of course.sections) {
    for (const v of s.videos) {
      const done = completedVideos.has(v.id)
      const locked = !canAccess && !v.isFree
      flat.push({
        kind: "video",
        id: v.id,
        title: v.title,
        meta: `${Math.floor(v.duration / 60)} دقيقة`,
        free: v.isFree,
        sectionId: s.id,
        sectionName: s.name,
        status: locked ? "locked" : done ? "done" : "available",
        href: itemHref(course.id, s.id, "video", v.id),
      })
    }
    for (const b of s.books) {
      const done = readBooks.has(b.id)
      const locked = !canAccess && !b.isFree
      flat.push({
        kind: "book",
        id: b.id,
        title: b.title,
        meta: "ملف تعليمي",
        free: b.isFree,
        sectionId: s.id,
        sectionName: s.name,
        status: locked ? "locked" : done ? "done" : "available",
        href: itemHref(course.id, s.id, "book", b.id),
      })
    }
    for (const e of s.exams) {
      const pctVal = bestExamPct.get(e.id)
      const done = pctVal !== undefined && pctVal >= 50
      const locked = !canAccess && !e.isFree
      const meta =
        (e.type === ("HOMEWORK" as never) ? "واجب" : "اختبار") +
        (done && pctVal !== undefined ? ` · ${pctVal}%` : "")
      flat.push({
        kind: "exam",
        id: e.id,
        title: e.title,
        meta,
        free: e.isFree,
        sectionId: s.id,
        sectionName: s.name,
        status: locked ? "locked" : done ? "done" : "available",
        href: itemHref(course.id, s.id, "exam", e.id),
      })
    }
  }

  // الدرس الحالي — قرار حتمي:
  // 1) العنصر الممرر من الصفحة إن وُجد
  // 2) أول فيديو بدأ ولم يكتمل
  // 3) أول عنصر متاح
  let currentIndex = -1
  if (opts.current) {
    currentIndex = flat.findIndex((f) => f.kind === opts.current!.kind && f.id === opts.current!.id)
  }
  if (currentIndex === -1) {
    const startedViews = opts.user
      ? await prisma.videoView.findFirst({
          where: { userId: opts.user.id, videoId: { in: allVideoIds }, isCompleted: false, progress: { gt: 0 } },
          orderBy: { lastWatchedAt: "desc" },
          select: { videoId: true },
        })
      : null
    if (startedViews) {
      currentIndex = flat.findIndex((f) => f.kind === "video" && f.id === startedViews.videoId)
    }
  }
  if (currentIndex !== -1 && flat[currentIndex].status !== "done") {
    flat[currentIndex] = { ...flat[currentIndex], status: "current" }
  }

  // السابق/التالي يتخطيان المقفول تمامًا
  const navigable = flat.map((f, i) => ({ f, i })).filter(({ f }) => f.status !== "locked")
  const pos = navigable.findIndex(({ i }) => i === currentIndex)
  const prev = pos > 0 ? navigable[pos - 1].f : null
  const next = pos >= 0 && pos < navigable.length - 1 ? navigable[pos + 1].f : null

  // نسب الأقسام — من نفس البيانات المجمّعة، بلا استعلامات إضافية
  const sectionsProgress: SectionProgress[] = course.sections.map((s) => ({
    id: s.id,
    name: s.name,
    ...calculateLearningProgress(flat.filter((f) => f.sectionId === s.id)),
  }))

  return {
    course: { id: course.id, name: course.name, teacherName: course.teacher.name },
    canAccess,
    progress: calculateLearningProgress(flat),
    sections: sectionsProgress,
    flat,
    currentIndex,
    prev,
    next,
  }
}
