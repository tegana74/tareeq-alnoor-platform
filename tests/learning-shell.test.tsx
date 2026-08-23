import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

const prismaMock = vi.hoisted(() => ({
  course: { findUnique: vi.fn() },
  videoView: { findMany: vi.fn(), findFirst: vi.fn() },
  bookView: { findMany: vi.fn() },
  examAttempt: { findMany: vi.fn() },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
const subs = vi.hoisted(() => ({ canAccessCourse: vi.fn() }))
vi.mock("@/lib/subscriptions", () => subs)

import { calculateLearningProgress, getLearningShell } from "@/lib/learning-shell"
import { ContentsNav, PrevNextNav } from "@/components/learning/contents-nav"

function courseFixture() {
  return {
    id: "c1",
    name: "كورس النحو",
    isActive: true,
    price: 100,
    teacher: { name: "أستاذ أحمد" },
    sections: [
      {
        id: "s1",
        name: "الوحدة الأولى",
        videos: [
          { id: "v1", title: "الدرس الأول", duration: 600, isFree: true },
          { id: "v2", title: "الدرس الثاني", duration: 900, isFree: false },
        ],
        books: [{ id: "b1", title: "ملخص الوحدة", isFree: false }],
        exams: [{ id: "e1", title: "اختبار الوحدة", type: "EXAM", isFree: false, durationMinutes: 30 }],
      },
      {
        id: "s2",
        name: "الوحدة الثانية",
        videos: [{ id: "v3", title: "الدرس الثالث", duration: 1200, isFree: false }],
        books: [],
        exams: [],
      },
    ],
  }
}

const student = { id: "u1", role: "STUDENT", teacherId: null }

function seed() {
  prismaMock.course.findUnique.mockResolvedValue(courseFixture())
  prismaMock.videoView.findMany.mockResolvedValue([{ videoId: "v2", isCompleted: true }])
  prismaMock.videoView.findFirst.mockResolvedValue(null)
  prismaMock.bookView.findMany.mockResolvedValue([])
  prismaMock.examAttempt.findMany.mockResolvedValue([])
  subs.canAccessCourse.mockResolvedValue(true)
}

beforeEach(() => {
  vi.clearAllMocks()
  seed()
})

describe("calculateLearningProgress (unified)", () => {
  it("counts all non-locked kinds: videos + books + exams", () => {
    const items = [
      { status: "done" },
      { status: "available" },
      { status: "done" },
      { status: "done" },
    ]
    expect(calculateLearningProgress(items)).toEqual({ completed: 3, total: 4, percent: 75 })
  })

  it("excludes locked content from denominator", () => {
    const items = [
      { status: "done" },
      { status: "locked" },
      { status: "locked" },
      { status: "available" },
    ]
    expect(calculateLearningProgress(items)).toEqual({ completed: 1, total: 2, percent: 50 })
  })

  it("exam completion rule: 49% available / 50-100% done", async () => {
    const cases: [number, number, boolean][] = [
      [49, 100, false],
      [50, 100, true],
      [75, 100, true],
      [100, 100, true],
      [1, 2, true], // 50%
      [0, 2, false], // 0%
    ]
    for (const [score, totalScore, expectedDone] of cases) {
      vi.clearAllMocks()
      seed()
      prismaMock.examAttempt.findMany.mockResolvedValue([
        { examId: "e1", score, totalScore },
      ])
      const shell = (await getLearningShell("c1", { user: student }))!
      const done = shell.flat.find((f) => f.id === "e1")!.status === "done"
      expect(done).toBe(expectedDone)
    }
  })

  it("best attempt wins: 42%,38%,56% → done (56%)", async () => {
    seed()
    prismaMock.examAttempt.findMany.mockResolvedValue([
      { examId: "e1", score: 42, totalScore: 100 },
      { examId: "e1", score: 38, totalScore: 100 },
      { examId: "e1", score: 56, totalScore: 100 },
    ])
    const shell = (await getLearningShell("c1", { user: student }))!
    const examItem = shell.flat.find((f) => f.id === "e1")!
    expect(examItem.status).toBe("done")
    expect(examItem.meta).toContain("56%")
  })

  it("failed-only attempts stay available; in_progress never fetched", async () => {
    seed()
    prismaMock.examAttempt.findMany.mockResolvedValue([
      { examId: "e1", score: 42, totalScore: 100 },
      { examId: "e1", score: 10, totalScore: 100 },
    ])
    const shell = (await getLearningShell("c1", { user: student }))!
    expect(shell.flat.find((f) => f.id === "e1")!.status).toBe("available")
    // where clause excludes in_progress by design
    const whereArg = prismaMock.examAttempt.findMany.mock.calls[0][0].where
    expect(whereArg.status.in).toEqual(["submitted", "graded"])
  })

  it("book completion via BookView marks done and counts toward progress", async () => {
    seed()
    prismaMock.videoView.findMany.mockResolvedValue([]) // no videos completed
    prismaMock.bookView.findMany.mockResolvedValue([{ bookId: "b1" }])
    const shell = (await getLearningShell("c1", { user: student }))!
    expect(shell.flat.find((f) => f.id === "b1")!.status).toBe("done")
    // totals: subscriber sees all 5 items, only book done
    expect(shell.progress.total).toBe(5)
    expect(shell.progress.completed).toBe(1)
    expect(shell.progress.percent).toBe(20)
  })

  it("section percentages computed from same data (no extra queries)", async () => {
    seed()
    prismaMock.videoView.findMany.mockResolvedValue([
      { videoId: "v1", isCompleted: true },
      { videoId: "v2", isCompleted: true },
    ])
    prismaMock.bookView.findMany.mockResolvedValue([{ bookId: "b1" }])
    prismaMock.examAttempt.findMany.mockResolvedValue([{ examId: "e1", score: 60, totalScore: 100 }])
    const shell = (await getLearningShell("c1", { user: student }))!

    const s1 = shell.sections.find((s) => s.id === "s1")! // v1✓ v2✓ b1✓ e1(60≥50)✓ → 4/4
    const s2 = shell.sections.find((s) => s.id === "s2")! // v3 ✗ → 0/1
    expect(s1.percent).toBe(100)
    expect(s2.percent).toBe(0)

    // batched calls only — one per store
    expect(prismaMock.videoView.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.bookView.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.examAttempt.findMany).toHaveBeenCalledTimes(1)
  })
})

describe("getLearningShell", () => {
  it("builds flat ordered map across sections (videos→books→exams per section)", async () => {
    const shell = await getLearningShell("c1", { user: student })
    expect(shell!.flat.map((f) => f.id)).toEqual(["v1", "v2", "b1", "e1", "v3"])
    expect(shell!.flat[0].sectionName).toBe("الوحدة الأولى")
  })

  it("computes REAL unified progress from batched stores (video done + books/exams counted)", async () => {
    const shell = await getLearningShell("c1", { user: student })
    // 5 عناصر قابلة للإنجاز (2 فيديو + كتاب + اختبار + فيديو) — مكتمل واحد فقط
    expect(shell!.progress).toEqual({ completed: 1, total: 5, percent: 20 })
    expect(prismaMock.videoView.findMany).toHaveBeenCalledTimes(1)
  })

  it("explicit current overrides; completed video keeps done status", async () => {
    const shell = await getLearningShell("c1", {
      user: student,
      current: { kind: "video", id: "v1" },
    })
    expect(shell!.flat.find((f) => f.id === "v1")!.status).toBe("current")
    expect(shell!.flat.find((f) => f.id === "v2")!.status).toBe("done")

    // إعادة فتح درس مكتمل: يبقى «done» والواجهة تميّزه عبر currentIndex
    const rewatch = await getLearningShell("c1", {
      user: student,
      current: { kind: "video", id: "v2" },
    })
    expect(rewatch!.flat.find((f) => f.id === "v2")!.status).toBe("done")
    expect(rewatch!.currentIndex).toBe(1)
  })

  it("deterministic fallback current = first started-unfinished video", async () => {
    prismaMock.videoView.findFirst.mockResolvedValue({ videoId: "v3" })
    const shell = await getLearningShell("c1", { user: student })
    expect(shell!.flat.find((f) => f.id === "v3")!.status).toBe("current")
    expect(shell!.currentIndex).toBe(4)
  })

  it("locked items for non-subscriber; prev/next skip them entirely", async () => {
    subs.canAccessCourse.mockResolvedValue(false)
    const shell = await getLearningShell("c1", { user: student, current: { kind: "video", id: "v1" } })
    expect(shell!.flat.filter((f) => f.status === "locked")).toHaveLength(4)
    // v1 هو الوحيد المتاح → لا يوجد سابق ولا تالٍ متاح بعد تخطي المقفول
    expect(shell!.prev).toBeNull()
    expect(shell!.next).toBeNull()
    expect(shell!.flat.find((f) => f.id === "b1")!.status).toBe("locked")
  })

  it("never returns sensitive provider/url fields", async () => {
    const shell = await getLearningShell("c1", { user: student })
    const serialized = JSON.stringify(shell)
    expect(serialized).not.toContain("provider")
    expect(serialized).not.toContain('"url"')
    expect(serialized).not.toContain("fileUrl")
    expect(serialized).not.toContain("password")
  })

  it("returns null for inactive/missing course", async () => {
    prismaMock.course.findUnique.mockResolvedValue(null)
    expect(await getLearningShell("cX", { user: student })).toBeNull()
  })
})

describe("ContentsNav / PrevNextNav rendering", () => {
  it("aria-current on active item; locked item NOT a link; free chip for subscriber view", async () => {
    subs.canAccessCourse.mockResolvedValue(false)
    const shell = (await getLearningShell("c1", { user: student, current: { kind: "video", id: "v1" } }))!
    const out = renderToStaticMarkup(
      <ContentsNav courseId="c1" courseName="كورس النحو" flat={shell.flat} currentIndex={shell.currentIndex} />
    )
    expect(out).toContain('aria-current="page"')
    expect(out).toContain('aria-disabled="true"')
    expect(out).toContain("يتطلب اشتراكاً نشطاً")

    // مشترك: شارة «مجاني» تظهر على العنصر الحر غير النشط
    subs.canAccessCourse.mockResolvedValue(true)
    const subShell = (await getLearningShell("c1", { user: student, current: { kind: "exam", id: "e1" } }))!
    const subOut = renderToStaticMarkup(
      <ContentsNav courseId="c1" courseName="كورس النحو" flat={subShell.flat} currentIndex={subShell.currentIndex} />
    )
    expect(subOut).toContain("مجاني")
    expect(subOut).toContain('aria-current="page"')
  })

  it("prev/next arrows use rtl-rotated chevrons and logical layout", async () => {
    const shell = (await getLearningShell("c1", { user: student, current: { kind: "video", id: "v2" } }))!
    const out = renderToStaticMarkup(<PrevNextNav prev={shell.prev} next={shell.next} courseId="c1" />)
    expect(out).toContain("السابق")
    expect(out).toContain("التالي")
    expect(out).toContain("rtl:rotate-180")
    expect(out).not.toMatch(/\b(mr|ml|pr|pl)-\d/)
  })
})
