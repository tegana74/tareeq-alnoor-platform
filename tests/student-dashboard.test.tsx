import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactNode } from "react"

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }: Record<string, unknown> & { children?: ReactNode }) => (
    <a href={href as string} className={className as string | undefined} {...rest}>
      {children}
    </a>
  ),
}))

const prismaMock = vi.hoisted(() => ({
  subscription: { findMany: vi.fn() },
  videoView: { findFirst: vi.fn(), findMany: vi.fn() },
  examAttempt: { findMany: vi.fn() },
  sessionBooking: { findMany: vi.fn() },
  notification: { findMany: vi.fn() },
  course: { findMany: vi.fn() },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }))

import CoursesPage from "@/app/(site)/dashboard/page"
import { getCurrentUser } from "@/lib/auth"

function setUser(u: { id: string; role: string; teacherId?: null; firstName?: string; walletBalance?: unknown } | null) {
  vi.mocked(getCurrentUser).mockResolvedValue(
    u
      ? ({ firstName: "", lastName: "", phone: "", walletBalance: 0, ...u } as unknown as Awaited<
          ReturnType<typeof getCurrentUser>
        >)
      : (null as unknown as Awaited<ReturnType<typeof getCurrentUser>>)
  )
}

function seed({
  subs = 1,
  continueView = true,
  attempts = 1,
  live = 1,
  notifs = 2,
}: { subs?: number; continueView?: boolean; attempts?: number; live?: number; notifs?: number } = {}) {
  prismaMock.subscription.findMany.mockResolvedValue(
    Array.from({ length: subs }, (_, i) => ({
      courseId: `c${i}`,
      expiresAt: new Date("2027-01-01"),
      course: {
        id: `c${i}`,
        name: `كورس ${i + 1}`,
        teacher: { name: "أستاذ أحمد" },
        sections: [{ _count: { videos: 10 } }],
      },
    }))
  )
  prismaMock.course.findMany.mockResolvedValue(
    Array.from({ length: subs }, (_, i) => ({ id: `c${i}`, sections: [{ _count: { videos: 10 } }] }))
  )
  prismaMock.videoView.findMany.mockResolvedValue([
    { video: { section: { courseId: "c0" } } },
    { video: { section: { courseId: "c0" } } },
    { video: { section: { courseId: "c0" } } },
    { video: { section: { courseId: "c1" } } },
  ])
  prismaMock.videoView.findFirst.mockResolvedValue(
    continueView
      ? {
          progress: 40,
          video: {
            id: "v9",
            title: "درس المبتدأ والخبر",
            duration: 900,
            section: { id: "sec1", course: { id: "c0", name: "كورس 1" } },
          },
        }
      : null
  )
  prismaMock.examAttempt.findMany.mockResolvedValue(
    Array.from({ length: attempts }, (_, i) => ({
      id: `a${i}`,
      score: i === 0 ? 85 : 45,
      totalScore: 100,
      finishedAt: new Date("2026-08-20"),
      exam: {
        title: `اختبار ${i + 1}`,
        section: { course: { name: "كورس 1", subject: { name: "لغة عربية" } } },
      },
      answers: [
        { question: { id: `q${i}`, text: `سؤال ${i}` } },
        { question: { id: `q${i}-b`, text: `سؤال ب${i}` } },
      ],
    }))
  )
  prismaMock.sessionBooking.findMany.mockResolvedValue(
    Array.from({ length: live }, () => ({
      session: {
        title: "مراجعة نهائية",
        startAt: new Date("2026-09-01T18:00:00"),
        durationMinutes: 90,
        teacher: { name: "أستاذ أحمد" },
      },
    }))
  )
  prismaMock.notification.findMany.mockResolvedValue(
    Array.from({ length: notifs }, (_, i) => ({
      id: `n${i}`,
      title: `إشعار ${i + 1}`,
      body: "نص الإشعار",
      link: null,
      isRead: i > 0,
      createdAt: new Date("2026-08-21"),
    }))
  )
}

async function render() {
  const { renderToStaticMarkup } = await import("react-dom/server")
  return renderToStaticMarkup(await CoursesPage())
}

beforeEach(() => {
  vi.clearAllMocks()
  setUser({ id: "u1", role: "STUDENT", firstName: "حسين", walletBalance: 75 })
  seed()
})

describe("Student Dashboard (6B-2E)", () => {
  it("greets with real first name", async () => {
    const out = await render()
    expect(out).toContain("أهلاً يا حسين")
  })

  it("safe fallback when name missing", async () => {
    setUser({ id: "u1", role: "STUDENT", firstName: "  " })
    const out = await render()
    expect(out).toContain("أهلاً بك")
  })

  it("continue-learning task uses real last watched lesson + real progress percent", async () => {
    seed({ subs: 2, continueView: true })
    const out = await render()
    expect(out).toContain("تابع من حيث توقفت")
    expect(out).toContain("درس المبتدأ والخبر")
    expect(out).toContain('href="/courses/c0/sections/sec1/video/v9"')
    expect(out).toContain('aria-valuenow="40"')
  })

  it("no-progress fallback task = start first lesson of a subscribed course", async () => {
    seed({ subs: 1, continueView: false })
    const out = await render()
    expect(out).toContain("مهمتك القادمة")
    expect(out).toContain('href="/courses/c0/sections"')
  })

  it("course cards show REAL completion from completed VideoViews (3/10, 1/10)", async () => {
    seed({ subs: 2 })
    const out = await render()
    expect(out).toContain(">3/10 درس<".replace("<", "").replace(">", ""))
    expect(out).toContain('aria-valuenow="30"')
    expect(out).toContain('aria-valuenow="10"')
  })

  it("recent results use thresholds via Badge variants (85 success / 45 danger)", async () => {
    seed({ attempts: 2 })
    const out = await render()
    expect(out).toContain(">85%<")
    expect(out).toContain(">45%<")
    expect(out).not.toContain("ممتاز")
  })

  it("weak areas aggregate from wrong answers by subject; links to practice", async () => {
    seed({ attempts: 2 })
    const out = await render()
    expect(out).toContain("لغة عربية")
    expect(out).toContain("4 إجابة خاطئة")
    expect(out).toContain('href="/practice"')
  })

  it("weak areas empty → honest EmptyState (no invented list)", async () => {
    seed({ attempts: 0 })
    const out = await render()
    expect(out).toContain("لا توجد نقاط ضعف كافية للتحليل بعد")
  })

  it("upcoming booked live sessions only (future startAt)", async () => {
    seed({ live: 1 })
    const out = await render()
    expect(out).toContain("بث مباشر قادم")
    expect(out).toContain("مراجعة نهائية")
    expect(out).toContain("أستاذ أحمد")
  })

  it("latest notifications with unread badge + view-all link", async () => {
    seed({ notifs: 2 })
    const out = await render()
    expect(out).toContain("إشعار 1")
    expect(out).toContain(">جديد<")
    expect(out).toContain('href="/notifications"')
  })

  it("subscription summary shows active count, nearest expiry, REAL wallet balance", async () => {
    seed({ subs: 2 })
    const out = await render()
    expect(out).toContain("اشتراكات نشطة")
    expect(out).toContain(formatPriceLike(75))
    expect(out).not.toContain("وفّر لك")
  })

  it("brand-new student gets empty dashboard CTA to courses", async () => {
    seed({ subs: 0, continueView: false, attempts: 0, live: 0, notifs: 0 })
    const out = await render()
    expect(out).toContain("ابدأ رحلتك التعليمية")
    expect(out).toContain('href="/courses"')
    expect(out).not.toContain("كورساتي")
  })

  it("non-students and guests are rejected (notFound)", async () => {
    setUser(null)
    await expect(render()).rejects.toThrow(/NOT_FOUND|404/)
    setUser({ id: "a1", role: "ADMIN" })
    await expect(render()).rejects.toThrow(/NOT_FOUND|404/)
  })
})

import { formatPrice } from "@/lib/utils"
function formatPriceLike(n: number) {
  return formatPrice(n)
}
