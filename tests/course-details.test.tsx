import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactNode } from "react"

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }: Record<string, unknown> & { children?: ReactNode }) => (
    <a href={href as string} className={className as string | undefined} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND")
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}))

const prismaMock = vi.hoisted(() => ({
  course: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
  favorite: { count: vi.fn().mockResolvedValue(0) },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}))
const subsMock = vi.hoisted(() => ({
  isSubscribed: vi.fn(),
  canAccessCourse: vi.fn(),
}))
vi.mock("@/lib/subscriptions", () => subsMock)

import CoursePage from "@/app/(site)/courses/[id]/page"
import { getCurrentUser } from "@/lib/auth"

function setUser(u: { id: string; role: string; teacherId: string | null } | null) {
  vi.mocked(getCurrentUser).mockResolvedValue(
    u as unknown as Awaited<ReturnType<typeof getCurrentUser>>
  )
}

function makeCourse() {
  return {
    id: "c1",
    name: "كورس النحو المتقدم",
    description: "شرح شامل لقواعد النحو مع تدريبات واختبارات دورية.",
    price: 150,
    priceBeforeDiscount: 200,
    isFeatured: true,
    isActive: true,
    teacher: { id: "t1", name: "أستاذ أحمد", title: "خبير نحو", image: null },
    subject: { id: "s1", name: "لغة عربية", icon: "📘", color: "#2563eb" },
    year: { id: "y1", name: "الصف الثالث الثانوي" },
    department: null,
    sections: [
      {
        id: "sec1",
        name: "القسم الأول",
        videos: [
          { id: "v1", title: "المبتدأ والخبر", duration: 900, isFree: true },
          { id: "v2", title: "من كان فعلًا", duration: 1200, isFree: false },
        ],
        books: [{ id: "b1", title: "ملخص القسم", isFree: true }],
        exams: [{ id: "e1", title: "اختبار القسم", type: "EXAM", isFree: false }],
      },
      {
        id: "sec2",
        name: "القسم الثاني",
        videos: [{ id: "v3", title: "التوكيد", duration: 600, isFree: false }],
        books: [],
        exams: [],
      },
    ],
  }
}

async function renderPage(id = "c1") {
  return renderToStaticMarkup(await CoursePage({ params: Promise.resolve({ id }) }))
}

import { renderToStaticMarkup } from "react-dom/server"

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.course.findUnique.mockImplementation(async () => makeCourse())
  prismaMock.course.findMany.mockResolvedValue([
    {
      id: "c2",
      name: "كورس البلاغة",
      description: null,
      price: 120,
      priceBeforeDiscount: null,
      isFeatured: false,
      teacher: { name: "أستاذ أحمد" },
      subject: { name: "لغة عربية", icon: "📘", color: "#2563eb" },
      sections: [{ _count: { videos: 5, books: 2, exams: 3 } }],
    },
  ])
  prismaMock.favorite.count.mockResolvedValue(0)
})

describe("Course Details (6B-2D)", () => {
  it("renders breadcrumb with real links and current page marker", async () => {
    setUser(null)
    subsMock.isSubscribed.mockResolvedValue(false)
    subsMock.canAccessCourse.mockResolvedValue(false)
    prismaMock.course.findUnique
      .mockImplementationOnce(async () => makeCourse())
      .mockImplementation(async () => makeCourse())

    const out = await renderPage()
    expect(out).toContain('aria-label="مسار التنقل"')
    expect(out).toContain('href="/courses"')
    expect(out).toContain('href="/courses?year=y1"')
    expect(out).toContain('aria-current="page"')
  })

  it("shows real counts aggregated from sections (3 videos / 1 book / 1 exam)", async () => {
    setUser(null)
    subsMock.isSubscribed.mockResolvedValue(false)
    subsMock.canAccessCourse.mockResolvedValue(false)
    const out = await renderPage()
    expect(out).toContain(">3<")
    expect(out).toContain(">1<")
    expect(out).toContain(">45<")
    expect(out).toContain("دقيقة فيديو")
  })

  it("guest CTA → subscribe link + login hint; free preview items stay linked", async () => {
    setUser(null)
    subsMock.isSubscribed.mockResolvedValue(false)
    subsMock.canAccessCourse.mockResolvedValue(false)
    const out = await renderPage()
    expect(out).toContain('href="/courses/c1/subscribe"')
    expect(out).not.toContain('href="/courses/c1/sections"')
    expect(out).toContain("ستحتاج إلى حساب لإتمام الاشتراك")
    // free preview accessible without subscription
    expect(out).toContain('href="/courses/c1/sections/sec1/video/v1"')
    expect(out).toContain("شاهد الآن")
    // locked paid item NOT linked
    expect(out).not.toContain('/video/v2"')
    expect(out).toContain("بعد الاشتراك")
  })

  it("subscriber CTA → start-studying link to sections", async () => {
    setUser({ id: "u1", role: "STUDENT", teacherId: null })
    subsMock.isSubscribed.mockResolvedValue(true)
    const out = await renderPage()
    expect(out).toContain('href="/courses/c1/sections"')
    expect(out).toContain("ابدأ المذاكرة")
    expect(out).not.toContain('href="/courses/c1/subscribe"')
  })

  it("subscription panel uses SUBSCRIPTION_DAYS constant not hardcoded copy", async () => {
    setUser(null)
    subsMock.isSubscribed.mockResolvedValue(false)
    subsMock.canAccessCourse.mockResolvedValue(false)
    const out = await renderPage()
    expect(out).toContain("365 يوماً كاملة")
  })

  it("price and old-price with discount badge render from real data", async () => {
    setUser(null)
    subsMock.isSubscribed.mockResolvedValue(false)
    subsMock.canAccessCourse.mockResolvedValue(false)
    const out = await renderPage()
    expect(out).toContain(formatPriceLike(150))
    expect(out).toContain(formatPriceLike(200))
    expect(out).toContain("وفّر 25%")
  })

  it("no fabricated social proof anywhere", async () => {
    setUser(null)
    subsMock.isSubscribed.mockResolvedValue(false)
    subsMock.canAccessCourse.mockResolvedValue(false)
    const out = await renderPage()
    expect(out).not.toMatch(/تقييم|rating|★|طالب مشترك|عدد الطلاب/)
  })

  it("teacher section shows real fields + filtered courses link", async () => {
    setUser(null)
    subsMock.isSubscribed.mockResolvedValue(false)
    subsMock.canAccessCourse.mockResolvedValue(false)
    const out = await renderPage()
    expect(out).toContain("أستاذ أحمد")
    expect(out).toContain("خبير نحو")
    expect(out).toContain('href="/courses?teacher=t1"')
  })

  it("favorite button appears only for students", async () => {
    setUser({ id: "u1", role: "STUDENT", teacherId: null })
    subsMock.isSubscribed.mockResolvedValue(false)
    const out = await renderPage()
    expect(out).toContain("button")

    setUser(null)
    subsMock.isSubscribed.mockResolvedValue(false)
    const guestOut = await renderPage()
    expect(guestOut).not.toContain("toggleFavorite")
  })

  it("related courses section renders when related exist", async () => {
    setUser(null)
    subsMock.isSubscribed.mockResolvedValue(false)
    const out = await renderPage()
    expect(out).toContain("كورسات ذات صلة")
  })

  it("inactive course triggers notFound", async () => {
    setUser(null)
    prismaMock.course.findUnique.mockImplementation(async () => ({ ...makeCourse(), isActive: false }))
    await expect(renderPage()).rejects.toThrow("NOT_FOUND")
  })
})

import { formatPrice } from "@/lib/utils"
function formatPriceLike(n: number) {
  return formatPrice(n)
}
