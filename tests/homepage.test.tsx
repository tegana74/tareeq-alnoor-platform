import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { ReactNode } from "react"

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }: Record<string, unknown> & { children?: ReactNode }) => (
    <a href={href as string} className={className as string | undefined} {...rest}>
      {children}
    </a>
  ),
}))

const prismaMock = vi.hoisted(() => ({
  course: {
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  teacher: { findMany: vi.fn(), count: vi.fn() },
  year: { findMany: vi.fn() },
  subject: { findMany: vi.fn() },
  setting: { findMany: vi.fn().mockResolvedValue([]) },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

import Home from "@/app/(site)/page"
import type { Course, Subject, Teacher, Year } from "@/generated/prisma/client"

function makeCourse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "c1",
    name: "كورس اللغة العربية",
    description: null,
    cover: null,
    price: 100,
    priceBeforeDiscount: 150,
    isFeatured: true,
    isActive: true,
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    yearId: null,
    departmentId: null,
    subjectId: "s1",
    teacherId: "t1",
    teacher: { id: "t1", name: "أستاذ أحمد", image: null, title: "خبير لغة عربية" },
    subject: { id: "s1", name: "لغة عربية", icon: "📘", color: null },
    sections: [
      { _count: { videos: 3, books: 2, exams: 1 } },
      { _count: { videos: 4, books: 0, exams: 2 } },
    ],
    ...overrides,
  } as unknown as Course & {
    teacher: { id: string; name: string; image: string | null; title: string | null }
    subject: { id: string; name: string; icon: string | null; color: string | null }
    sections: { _count: { videos: number; books: number; exams: number } }[]
  }
}

function seedDb({
  years = ["الصف الأول الإعدادي", "الصف الثالث الثانوي"],
  subjects = [{ id: "s1", name: "لغة عربية", icon: "📘", color: null }],
}: {
  years?: string[]
  subjects?: { id: string; name: string; icon: string | null; color: string | null }[]
} = {}) {
  prismaMock.year.findMany.mockResolvedValue(
    years.map((name, i) => ({ id: `y${i}`, name, order: i, isActive: true })) as Year[]
  )
  prismaMock.subject.findMany.mockResolvedValue(subjects as Subject[])
  prismaMock.teacher.findMany.mockResolvedValue([
    { id: "t1", name: "أستاذ أحمد", title: "خبير لغة عربية", image: null },
  ] as Teacher[])
  prismaMock.course.findMany.mockResolvedValue([makeCourse()])
  prismaMock.course.count.mockResolvedValue(12)
  prismaMock.teacher.count.mockResolvedValue(3)
  prismaMock.course.groupBy.mockResolvedValue([{ subjectId: "s1", _count: { _all: 7 } }])
}

const html = async () => renderToStaticMarkup(await Home())

describe("Homepage (6B-2B)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seedDb()
  })

  it("renders hero with H1 and primary/secondary CTAs", async () => {
    const out = await html()
    expect(out).toMatch(/<h1[\s\S]*?طريق النور/)
    expect(out).toContain('href="/courses"')
    expect(out).toContain('href="/register"')
    expect(out).toContain("ابدأ رحلتك التعليمية")
  })

  it("shows real platform stats (no hardcoded invented numbers)", async () => {
    const out = await html()
    expect(out).toContain(">12<") // courseCount from prisma.course.count
    expect(out).toContain(">3<") // teacherCount
    expect(out).toContain(">2<") // yearsCount
  })

  it("groups academic stages from real year names (إعدادية + ثانوية)", async () => {
    const out = await html()
    expect(out).toContain("المرحلة الإعدادية")
    expect(out).toContain("المرحلة الثانوية")
    expect(out).toContain('href="/courses?year=y0"')
    expect(out).toContain('href="/courses?year=y1"')
    expect(out).not.toContain("مراحل أخرى")
  })

  it("subject chips link with real per-subject course counts", async () => {
    const out = await html()
    expect(out).toContain('href="/courses?subject=s1"')
    expect(out).toContain("7 كورس")
  })

  it("featured courses render via CourseCard data without fake metrics", async () => {
    const out = await html()
    expect(out).toContain("كورس اللغة العربية")
    expect(out).not.toMatch(/تقييم|rating|★/)
    expect(out).not.toContain("طالب مشترك")
  })

  it("teacher cards deep-link to filtered courses route", async () => {
    const out = await html()
    expect(out).toContain('href="/courses?teacher=t1"')
    expect(out).toContain("أستاذ أحمد")
  })

  it("contains all section anchors with sticky-header offset", async () => {
    const out = await html()
    for (const id of ["stages", "subjects", "courses", "teachers", "why", "how", "value", "faq"]) {
      expect(out).toContain(`id="${id}"`)
    }
    expect((out.match(/scroll-mt-20/g) ?? []).length).toBeGreaterThanOrEqual(8)
  })

  it("FAQ renders real system answers (payment numbers + subscription days)", async () => {
    const out = await html()
    expect(out).toContain("365 يوماً")
    expect(out).toContain("فودافون كاش")
    expect(out).toContain("كود التحقق")
  })

  it("hero preview card shows real featured-course content counts only when present", async () => {
    const out = await html()
    expect(out).toContain("من كورساتنا المميزة")
    expect(out).toContain(">7<") // videos aggregated: 3 + 4
  })

  it("empty DB degrades gracefully (sections hidden, no crash)", async () => {
    seedDb({ years: [], subjects: [] })
    prismaMock.course.findMany.mockResolvedValue([])
    prismaMock.teacher.findMany.mockResolvedValue([])
    const out = await html()
    expect(out).toContain("اختر صفك الدراسي")
    expect(out).not.toContain("كورسات مختارة لك")
    expect(out).not.toContain("مدرسون متخصصون")
  })
})
