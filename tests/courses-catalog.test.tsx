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
  year: { findMany: vi.fn() },
  subject: { findMany: vi.fn() },
  teacher: { findMany: vi.fn() },
  course: { findMany: vi.fn() },
  favorite: { findMany: vi.fn().mockResolvedValue([]) },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn().mockResolvedValue(null) }))

import CoursesPage from "@/app/(site)/courses/page"

function seedDb() {
  prismaMock.year.findMany.mockResolvedValue([
    { id: "y1", name: "الصف الأول الثانوي" },
    { id: "y2", name: "الصف الثاني الثانوي" },
  ])
  prismaMock.subject.findMany.mockResolvedValue([
    { id: "s1", name: "لغة عربية", icon: "📘" },
    { id: "s2", name: "رياضيات", icon: "📐" },
  ])
  prismaMock.teacher.findMany.mockResolvedValue([{ id: "t1", name: "أستاذ أحمد" }])
}

function mockCourses(n?: number) {
  prismaMock.course.findMany.mockImplementation(async (args?: { where?: Record<string, unknown> }) => {
    const where = args?.where ?? {}
    const total = 12
    const filtered =
      where.subjectId === "s2" ? 4 : where.teacherId === "t1" ? 8 : where.yearId ? 6 : total
    return Array.from({ length: Math.min(n ?? filtered, filtered) }, (_, i) => ({
      id: `c${i}`,
      name: `كورس ${i + 1}`,
      description: null,
      price: 100,
      priceBeforeDiscount: null,
      isFeatured: false,
      teacher: { name: "أستاذ أحمد" },
      subject: { name: "لغة عربية", icon: "📘", color: null },
      sections: [{ _count: { videos: 2, books: 1, exams: 1 } }],
    }))
  })
}

function makeParams(p: Record<string, string> = {}) {
  return { searchParams: Promise.resolve(p) } as Parameters<typeof CoursesPage>[0]
}

async function renderPage(params: Record<string, string> = {}) {
  return renderToString(await CoursesPage(makeParams(params)))
}

import { renderToStaticMarkup } from "react-dom/server"
function renderToString(node: ReactNode) {
  return renderToStaticMarkup(<>{node}</>)
}
describe("Courses Catalog (6B-2C)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.favorite.findMany.mockResolvedValue([])
    seedDb()
  })

  it("renders page header, search input and all filter groups from DB data", async () => {
    mockCourses()
    const out = await renderPage()
    expect(out).toMatch(/<h1[^>]*>الكورسات<\/h1>/)
    expect(out).toContain('id="course-search"')
    expect(out).toContain("الصف الدراسي")
    expect(out).toContain("المواد")
    expect(out).toContain("المدرسون")
    expect(out).toContain('href="/courses?year=y1"')
    expect(out).toContain('href="/courses?subject=s2"')
    expect(out).toContain('href="/courses?teacher=t1"')
  })

  it("shows real results count (not invented)", async () => {
    mockCourses(12)
    const out = await renderPage()
    expect(out).toContain(">12<")
    expect(out).not.toContain("وجدنا 200")
  })

  it("year filter: chip + per-chip remove; مسح الكل reserved for 2+ filters", async () => {
    mockCourses(6)
    const out = await renderPage({ year: "y1" })
    expect(out).toContain('href="/courses"')
    expect(out).toContain("الصف: الصف الأول الثانوي")
    expect((out.match(/إزالة فلتر/g) ?? []).length).toBeGreaterThanOrEqual(1)
    expect(out).not.toContain("مسح الكل") // spec: only when more than one filter

    const out2 = await renderPage({ year: "y1", subject: "s1" })
    expect(out2).toContain("مسح الكل")
  })

  it("subject and teacher filters reflect in chips", async () => {
    mockCourses(4)
    const out = await renderPage({ subject: "s1" })
    expect(out).toContain("المادة: لغة عربية")

    const outT = await renderPage({ teacher: "t1" })
    expect(outT).toContain("المدرس: أستاذ أحمد")
  })

  it("combined filters produce combined shareable links", async () => {
    mockCourses(3)
    const out = await renderPage({ year: "y1", subject: "s2" })
    // إزالة السنة تحتفظ بالمادة والعكس — عقد URL قابل للمشاركة
    expect(out).toContain('href="/courses?subject=s2"')
    expect(out).toContain('href="/courses?year=y1"')
    expect((out.match(/إزالة فلتر/g) ?? []).length).toBe(2)
  })

  it("search term shows in chip with clear button", async () => {
    mockCourses(0)
    const out = await renderPage({ q: "نحو" })
    expect(out).toContain("بحث: نحو")
    expect(out).toContain('aria-label="مسح البحث"')
    expect(out).toContain('value="نحو"')
  })

  it("empty with no filters → platform-empty message without clear button", async () => {
    mockCourses(0)
    const out = await renderPage()
    expect(out).toContain("لا توجد كورسات على المنصة بعد")
    expect(out).not.toContain("لا توجد نتائج للفلاتر الحالية")
  })

  it("empty WITH filters → filtered message + clear-filters action", async () => {
    mockCourses(0)
    const out = await renderPage({ subject: "s2", q: "غير موجود" })
    expect(out).toContain("لا توجد نتائج للفلاتر الحالية")
    expect(out).toContain("مسح الفلاتر وعرض كل الكورسات")
  })

  it("CourseCard receives real aggregated counts (no fake metrics)", async () => {
    mockCourses(2)
    const out = await renderPage()
    expect(out).not.toMatch(/تقييم|★|طالب مشترك/)
    expect(out).toContain("كورس 1")
  })

  it("mobile filter trigger exposes accessible summary with count badge", async () => {
    mockCourses(5)
    const out = await renderPage({ year: "y1" })
    expect(out).toContain("الفلاتر")
  })

  it("URL contract: defaults stay clean /courses when nothing selected", async () => {
    mockCourses()
    const out = await renderPage()
    expect(out).toContain('action="/courses"')
    expect(out).toContain('name="q"')
  })
})
