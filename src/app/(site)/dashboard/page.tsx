import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  GraduationCap,
  PlayCircle,
  Target,
  TrendingDown,
  Wallet,
} from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { formatDateTime, formatPrice } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Progress } from "@/components/ui/progress"

export const metadata: Metadata = {
  title: "لوحتي",
  robots: { index: false, follow: false },
}

function pct(score: number | string, total: number | string) {
  const t = Number(total)
  return t > 0 ? Math.round((Number(score) / t) * 100) : 0
}

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) notFound()
  if (user.role !== "STUDENT") notFound()

  const [subscriptions, continueView, examAttempts, upcomingLive, notifications] = await Promise.all([
    prisma.subscription.findMany({
      where: { userId: user.id, status: "active", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: {
        courseId: true,
        expiresAt: true,
        course: {
          select: {
            id: true,
            name: true,
            teacher: { select: { name: true } },
            sections: { include: { _count: { select: { videos: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.videoView.findFirst({
      where: { userId: user.id, isCompleted: false, progress: { gt: 0 } },
      orderBy: { lastWatchedAt: "desc" },
      select: {
        progress: true,
        video: {
          select: {
            id: true,
            title: true,
            section: {
              select: {
                id: true,
                course: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.examAttempt.findMany({
      where: { userId: user.id, status: { in: ["graded", "submitted"] } },
      orderBy: { finishedAt: "desc" },
      take: 20,
      select: {
        id: true,
        score: true,
        totalScore: true,
        finishedAt: true,
        exam: {
          select: {
            title: true,
            section: { select: { course: { select: { name: true, subject: { select: { name: true } } } } } },
          },
        },
        answers: {
          where: { isCorrect: false, question: { type: "MCQ" } },
          select: { question: { select: { id: true, text: true } } },
        },
      },
    }),
    prisma.sessionBooking.findMany({
      where: { userId: user.id, status: "booked", session: { startAt: { gt: new Date() } } },
      orderBy: { session: { startAt: "asc" } },
      take: 3,
      select: {
        session: {
          select: {
            title: true,
            startAt: true,
            durationMinutes: true,
            teacher: { select: { name: true } },
          },
        },
      },
    }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, title: true, body: true, link: true, isRead: true, createdAt: true },
    }),
  ])

  // ===== تقدم الكورسات — batch فقط، بدون N+1 =====
  const courseIds = subscriptions.map((s) => s.courseId)
  const [totalsList, completedViews] =
    courseIds.length > 0
      ? await Promise.all([
          prisma.course.findMany({
            where: { id: { in: courseIds } },
            select: { id: true, sections: { include: { _count: { select: { videos: true } } } } },
          }),
          prisma.videoView.findMany({
            where: { userId: user.id, isCompleted: true, video: { section: { courseId: { in: courseIds } } } },
            select: { video: { select: { section: { select: { courseId: true } } } } },
          }),
        ])
      : [[], []]

  const totalsByCourse = new Map<string, number>()
  for (const c of totalsList) {
    totalsByCourse.set(c.id, c.sections.reduce((a, s) => a + s._count.videos, 0))
  }
  const completedByCourse = new Map<string, number>()
  for (const v of completedViews) {
    const cid = v.video.section.courseId
    completedByCourse.set(cid, (completedByCourse.get(cid) ?? 0) + 1)
  }

  const myCourses = subscriptions.map((s) => {
    const total = totalsByCourse.get(s.courseId) ?? 0
    const done = completedByCourse.get(s.courseId) ?? 0
    return {
      id: s.courseId,
      name: s.course.name,
      teacher: s.course.teacher.name,
      expiresAt: s.expiresAt,
      done,
      total,
      percent: total > 0 ? Math.min(Math.round((done / total) * 100), 100) : 0,
    }
  })

  // ===== مهمة اليوم — سلم واقعي من بيانات فعلية =====
  const todayTask = continueView
    ? {
        kind: "continue" as const,
        eyebrow: "تابع من حيث توقفت",
        title: continueView.video.title,
        courseName: continueView.video.section.course.name,
        percent: Math.min(continueView.progress, 100),
        href: `/courses/${continueView.video.section.course.id}/sections/${continueView.video.section.id}/video/${continueView.video.id}`,
      }
    : myCourses.length > 0
      ? {
          kind: "start" as const,
          eyebrow: "مهمتك القادمة",
          title: `ابدأ أول درس في كورس ${myCourses[0].name}`,
          courseName: myCourses[0].name,
          percent: null,
          href: `/courses/${myCourses[0].id}/sections`,
        }
      : null

  // ===== آخر النتائج =====
  const recentResults = examAttempts.slice(0, 4).map((a) => ({
    id: a.id,
    name: a.exam?.title ?? "اختبار",
    courseName: a.exam?.section?.course?.name ?? null,
    subjectName: a.exam?.section?.course?.subject?.name ?? null,
    percent: pct(Number(a.score), Number(a.totalScore)),
    finishedAt: a.finishedAt,
  }))

  // ===== نقاط تحتاج مراجعة — نفس مصدر صفحة النتائج مجمّعة بالمادة =====
  const weakBySubject = new Map<string, number>()
  for (const a of examAttempts) {
    const subject = a.exam?.section?.course?.subject?.name ?? "عام"
    if (a.answers.length > 0) {
      weakBySubject.set(subject, (weakBySubject.get(subject) ?? 0) + a.answers.length)
    }
  }
  const weakAreas = [...weakBySubject.entries()]
    .map(([subject, times]) => ({ subject, times }))
    .sort((x, y) => y.times - x.times)
    .slice(0, 3)

  // ===== الاشتراكات / المحفظة =====
  const nearestExpiry = subscriptions
    .map((s) => s.expiresAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => a.getTime() - b.getTime())[0]
  const firstName = user.firstName?.trim() || ""

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* ===== A. Welcome ===== */}
      <header className="mb-8">
        <h1 className="text-2xl font-black text-navy sm:text-3xl">
          {firstName ? `أهلاً يا ${firstName} 👋` : "أهلاً بك 👋"}
        </h1>
        <p className="mt-2 text-muted-foreground">ماذا ستذاكر اليوم؟</p>
      </header>

      {/* ===== K. Empty dashboard ===== */}
      {myCourses.length === 0 && !continueView ? (
        <EmptyState
          title="ابدأ رحلتك التعليمية"
          description="لم تشترك في أي كورس بعد — تصفح الكورسات واختر ما يناسب صفك."
          action={
            <Button href="/courses" variant="primary" size="md">
              تصفح الكورسات
            </Button>
          }
          icon={<GraduationCap className="h-7 w-7 text-primary-600" />}
          className="rounded-3xl border-2 border-dashed border-border bg-card"
        />
      ) : (
        <div className="space-y-10">
          {/* ===== B. Today's task ===== */}
          {todayTask && (
            <section aria-labelledby="task-title">
              <Card className="overflow-hidden border-primary-200 bg-card">
                <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p id="task-title" className="mb-2 flex items-center gap-2 text-sm font-black text-primary-600">
                      <Target className="h-4 w-4" aria-hidden="true" />
                      🎯 {todayTask.eyebrow}
                    </p>
                    <p className="truncate text-lg font-extrabold text-navy">{todayTask.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{todayTask.courseName}</p>
                    {todayTask.percent !== null && (
                      <Progress value={todayTask.percent} size="sm" className="mt-3 max-w-sm" label="تقدمك في هذا الدرس" showLabel />
                    )}
                  </div>
                  <Button href={todayTask.href} size="lg" className="shrink-0">
                    <PlayCircle className="h-5 w-5" />
                    {todayTask.kind === "continue" ? "متابعة الآن" : "ابدأ الآن"}
                  </Button>
                </div>
              </Card>
            </section>
          )}

          <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0 space-y-10">
              {/* ===== C/D. My Courses + progress ===== */}
              <section aria-labelledby="courses-title">
                <div className="mb-5 flex items-center justify-between">
                  <h2 id="courses-title" className="text-xl font-black text-navy">كورساتي</h2>
                  <Button href="/courses" variant="ghost" size="sm">تصفح الكورسات</Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {myCourses.map((c) => (
                    <Card key={c.id} className="flex flex-col gap-3 p-5 transition-shadow hover:shadow-md">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-extrabold text-navy">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.teacher}</p>
                        </div>
                        <Badge variant={c.percent >= 100 ? "success" : "primary"} size="sm">
                          {c.done}/{c.total} درس
                        </Badge>
                      </div>
                      <Progress value={c.total > 0 ? Math.round((c.done / c.total) * 100) : 0} size="sm" label="نسبة الإكمال" showLabel />
                      <div className="mt-auto flex items-center justify-between pt-1">
                        <span className="text-xs text-muted-foreground">
                          {c.expiresAt ? `ينتهي ${formatDateTime(c.expiresAt)}` : "اشتراك مفتوح"}
                        </span>
                        <Button href={`/courses/${c.id}/sections`} variant="outline" size="sm">
                          {c.percent > 0 ? "متابعة" : "ابدأ"}
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>

              {/* ===== E. Recent results ===== */}
              {recentResults.length > 0 && (
                <section aria-labelledby="results-title">
                  <div className="mb-5 flex items-center justify-between">
                    <h2 id="results-title" className="text-xl font-black text-navy">آخر النتائج</h2>
                    <Button href="/results" variant="ghost" size="sm">كل النتائج</Button>
                  </div>
                  <ul className="space-y-3">
                    {recentResults.map((r) => (
                      <li key={r.id}>
                        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-navy">{r.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {[r.subjectName, r.courseName, r.finishedAt ? formatDateTime(r.finishedAt) : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <Badge
                            variant={r.percent >= 70 ? "success" : r.percent >= 50 ? "warning" : "danger"}
                            size="md"
                          >
                            {r.percent}%
                          </Badge>
                        </Card>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* ===== F. Weak areas ===== */}
              <section aria-labelledby="weak-title">
                <h2 id="weak-title" className="mb-5 flex items-center gap-2 text-xl font-black text-navy">
                  <TrendingDown className="h-5 w-5 text-danger-strong" aria-hidden="true" />
                  نقاط تحتاج مراجعة
                </h2>
                {weakAreas.length > 0 ? (
                  <ul className="space-y-2.5">
                    {weakAreas.map((w) => (
                      <li key={w.subject}>
                        <Link
                          href="/practice"
                          className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm transition-colors hover:border-danger-strong/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                        >
                          <span className="font-bold text-navy">{w.subject}</span>
                          <span className="font-medium text-muted-foreground">{w.times} إجابة خاطئة</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    title="لا توجد نقاط ضعف كافية للتحليل بعد"
                    description="اختبر نفسك أكثر لتظهر لدينا المواد التي تحتاج مراجعة."
                    action={<Button href="/practice" variant="outline" size="sm">تدرب على بنك الأسئلة</Button>}
                    className="rounded-2xl border border-dashed border-border bg-card py-8"
                  />
                )}
              </section>
            </div>

            {/* ===== Right rail: H/I/J ===== */}
            <aside className="space-y-8">
              {upcomingLive.length > 0 && (
                <section aria-labelledby="live-title">
                  <h2 id="live-title" className="mb-4 flex items-center gap-2 text-lg font-black text-navy">
                    <CalendarClock className="h-5 w-5 text-primary-600" aria-hidden="true" />
                    بث مباشر قادم
                  </h2>
                  <ul className="space-y-3">
                    {upcomingLive.map(({ session }) => (
                      <li key={session.title + session.startAt.toISOString()}>
                        <Card className="p-4">
                          <p className="truncate text-sm font-bold text-navy">{session.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDateTime(session.startAt)} · {session.durationMinutes} دقيقة · {session.teacher.name}
                          </p>
                        </Card>
                      </li>
                    ))}
                  </ul>
                  <Button href="/live" variant="ghost" size="sm" className="mt-3">صفحة البث</Button>
                </section>
              )}

              {notifications.length > 0 && (
                <section aria-labelledby="notif-title">
                  <h2 id="notif-title" className="mb-4 flex items-center gap-2 text-lg font-black text-navy">
                    <Bell className="h-5 w-5 text-primary-600" aria-hidden="true" />
                    آخر الإشعارات
                  </h2>
                  <ul className="space-y-3">
                    {notifications.map((n) => (
                      <li key={n.id}>
                        <Card className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-bold text-navy">{n.title}</p>
                            {!n.isRead && <Badge variant="danger" size="sm">جديد</Badge>}
                          </div>
                          {n.body && <p className="mt-1 line-clamp-2 text-xs leading-6 text-muted-foreground">{n.body}</p>}
                          <p className="mt-1.5 text-[11px] text-slate-400">{formatDateTime(n.createdAt)}</p>
                        </Card>
                      </li>
                    ))}
                  </ul>
                  <Button href="/notifications" variant="ghost" size="sm" className="mt-3">كل الإشعارات</Button>
                </section>
              )}

              <section aria-labelledby="sub-title">
                <h2 id="sub-title" className="mb-4 flex items-center gap-2 text-lg font-black text-navy">
                  <Wallet className="h-5 w-5 text-primary-600" aria-hidden="true" />
                  الاشتراك والمحفظة
                </h2>
                <Card className="space-y-3 p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-muted-foreground">اشتراكات نشطة</span>
                    <span className="font-black text-navy">{myCourses.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-muted-foreground">أقرب انتهاء</span>
                    <span className="font-bold text-navy">{nearestExpiry ? formatDateTime(nearestExpiry) : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                    <span className="font-medium text-muted-foreground">رصيد المحفظة</span>
                    <span className="font-black text-primary-700">{formatPrice(Number(user.walletBalance))}</span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button href="/wallet" variant="outline" size="sm" className="flex-1 justify-center">المحفظة</Button>
                    <Button href="/profile" variant="ghost" size="sm" className="flex-1 justify-center">حسابي</Button>
                  </div>
                </Card>
              </section>

              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success-strong" aria-hidden="true" />
                كل البيانات معروضة مباشرة من حسابك الحقيقي.
              </p>
            </aside>
          </div>
        </div>
      )}
    </div>
  )
}
