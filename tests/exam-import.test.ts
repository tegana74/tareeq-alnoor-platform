import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

import {
  parseExamText,
  IMPORT_LIMITS,
} from "@/lib/exam-import/parser"

// ============================= Parser =============================

describe("parseExamText — Format A (عربي)", () => {
  const txt = `1. ما هو المفعول به؟
أ) مبتدأ
ب) خبر
ج) فاعل
د) مفعول به
الإجابة: د

2. عرّف الأسلوب الخبري.
الدرجة: 5
الإجابة النموذجية: أسلوب يفيد الثبوت.`

  it("parses MCQ arabic with label→index answer", () => {
    const { questions, invalid } = parseExamText(txt)
    expect(questions).toHaveLength(2)
    expect(invalid).toHaveLength(0) // المقالى بلا «الإجابة النموذجية»؟ لا — لديه. انظر أدناه
    expect(questions[0].type).toBe("MCQ")
    expect(questions[0].correctAnswer).toBe(3)
    expect(questions[0].options[3]).toBe("مفعول به")
  })
})

describe("parseExamText — Format B (إنجليزي)", () => {
  const txt = `1) What is OOP?
A. Programming paradigm
B. Database model
Answer: A`

  it("maps Answer letter to index 0", () => {
    const { questions } = parseExamText(txt)
    expect(questions).toHaveLength(1)
    expect(questions[0].correctAnswer).toBe(0)
    expect(questions[0].options[0]).toBe("Programming paradigm")
  })
})

describe("TRUE / FALSE", () => {
  it("implicit TF: answer صح without options", () => {
    const { questions } = parseExamText(`1. الشمس تشرق من الشرق.
الإجابة: صح`)
    expect(questions[0].type).toBe("TRUE_FALSE")
    expect(questions[0].options).toEqual(["صح", "خطأ"])
    expect(questions[0].correctAnswer).toBe(0)
  })

  it("explicit two options صح/خطأ → TRUE_FALSE type", () => {
    const { questions } = parseExamText(`1. الأرض كوكب.
أ) صح
ب) خطأ
الإجابة: ب`)
    expect(questions[0].type).toBe("TRUE_FALSE")
    expect(questions[0].correctAnswer).toBe(1)
  })

  it("english True/False", () => {
    const { questions } = parseExamText(`1. The sky is blue.
True
False
Answer: False`)
    expect(questions[0].type).toBe("TRUE_FALSE")
    expect(questions[0].correctAnswer).toBe(1)
  })
})

describe("ESSAY", () => {
  it("essay with model answer and points", () => {
    const { questions } = parseExamText(`1. اكتب موضوعاً عن الصدق.
الدرجة: 10
الإجابة النموذجية: الصدق أساس الأخلاق...`)
    expect(questions[0].type).toBe("ESSAY")
    expect(questions[0].points).toBe(10)
    expect((questions[0] as { explanation?: string }).explanation).toContain("الصدق")
  })

  it("essay without model answer is still valid", () => {
    const { questions } = parseExamText(`1. اشرح مفهوم العدل.
الدرجة: 3`)
    expect(questions[0].type).toBe("ESSAY")
    expect(questions[0].points).toBe(3)
  })
})

describe("Mixed + invalid handling", () => {
  it("mixed file separates valid from invalid with reasons", () => {
    const txt = `1. سؤال سليم؟
أ) نعم
ب) لا
الإجابة: أ

2. سؤال ناقص الإجابة
أ) خيار واحد فقط

3. سؤال ثالث؟
أ) خ
ب) ل
الإجابة: أ`
    const { questions, invalid } = parseExamText(txt)
    expect(questions.map((q) => q.order)).toEqual([1, 2])
    expect(invalid).toHaveLength(1)
    expect(invalid[0].reason).toContain("أقل من المطلوب")
  })

  it("respects maxQuestions limit", () => {
    const many = Array.from({ length: 250 }, (_, i) => `${i + 1}. س${i}`).join("\n\n")
    const { questions } = parseExamText(many)
    expect(questions.length).toBeLessThanOrEqual(IMPORT_LIMITS.maxQuestions)
  })

  it("empty text yields nothing", () => {
    expect(parseExamText("").questions).toHaveLength(0)
    expect(parseExamText("\n\n").invalid).toHaveLength(0)
  })
})

import { extractTextFromFile, ExtractError, isImportExtension } from "@/lib/exam-import/extract"

describe("extractTextFromFile", () => {
  it("txt direct utf8", async () => {
    const t = await extractTextFromFile(Buffer.from("1. سؤال"), "quiz.txt")
    expect(t).toContain("سؤال")
  })

  it("legacy .doc → LEGACY_DOC with conversion message", async () => {
    await expect(extractTextFromFile(Buffer.from("x"), "old.doc")).rejects.toMatchObject({
      code: "LEGACY_DOC",
    })
    await expect(extractTextFromFile(Buffer.from("x"), "old.doc")).rejects.toThrow(/DOCX أو PDF/)
  })

  it("unsupported ext throws UNSUPPORTED_EXTENSION", async () => {
    await expect(extractTextFromFile(Buffer.from("x"), "virus.exe")).rejects.toMatchObject({
      code: "UNSUPPORTED_EXTENSION",
    })
  })

  it("isImportExtension accepts the four types only", () => {
    for (const f of ["a.txt", "b.docx", "c.pdf", "d.doc"]) expect(isImportExtension(f)).toBe(true)
    for (const f of ["e.rtf", "f.html", "g.exe", "doc"]) expect(isImportExtension(f)).toBe(false)
  })
})

// ============================= Action security/txn =============================

const prismaMock = vi.hoisted(() => ({
  section: { findUnique: vi.fn() },
  exam: { aggregate: vi.fn().mockResolvedValue({ _max: { order: 5 } }), create: vi.fn() },
  question: { createMany: vi.fn() },
  $transaction: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }))

import { importExamAction } from "@/app/actions/exam-import"
import { getCurrentUser } from "@/lib/auth"

function setUser(u: { id: string; role: string; teacherId?: string | null } | null) {
  vi.mocked(getCurrentUser).mockResolvedValue(
    u ? ({ firstName: "", lastName: "", ...u } as never) : (null as never)
  )
}

function fd(overrides: Record<string, string> = {}) {
  const f = new FormData()
  f.set("sectionId", "sec1")
  f.set("title", "اختبار مستورد")
  f.set("examType", "EXAM")
  f.set("durationMinutes", "45")
  f.set(
    "questions",
    JSON.stringify([
      { text: "سؤال صالح؟", type: "MCQ", options: ["نعم", "لا"], correctAnswer: 0, points: 2 },
      { text: "صح أم خطأ؟", type: "TRUE_FALSE", options: ["صح", "خطأ"], correctAnswer: 1, points: 1 },
      { text: "مقالي...", type: "ESSAY", options: [], points: 5 },
    ])
  )
  for (const [k, v] of Object.entries(overrides)) f.set(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  setUser({ id: "u9", role: "TEACHER", teacherId: "t1" })
  prismaMock.section.findUnique.mockResolvedValue({
    id: "sec1",
    course: { id: "c1", teacherId: "t1", isActive: true },
  })
  prismaMock.exam.aggregate.mockResolvedValue({ _max: { order: 5 } })
  prismaMock.$transaction.mockImplementation(async (cb: (tx: never) => Promise<string>) =>
    cb({
      exam: {
        create: prismaMock.exam.create,
        aggregate: prismaMock.exam.aggregate,
      },
      question: { createMany: prismaMock.question.createMany },
    } as never)
  )
  prismaMock.exam.create.mockResolvedValue({ id: "new-exam" })
})

describe("importExamAction", () => {
  it("successful import wraps Exam+Questions in ONE $transaction", async () => {
    const res = await importExamAction(null, fd())
    expect(res, JSON.stringify(res)).toMatchObject({ ok: true })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.question.createMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.question.createMany.mock.calls[0][0].data).toHaveLength(3)
  })

  it("guest rejected before any query", async () => {
    setUser(null)
    const res = await importExamAction(null, fd())
    expect(res.ok).toBe(false)
    expect(prismaMock.section.findUnique).not.toHaveBeenCalled()
  })

  it("non-owner teacher rejected server-side (client cannot spoof ownership)", async () => {
    setUser({ id: "u9", role: "TEACHER", teacherId: "NOT-OWNER" })
    const res = await importExamAction(null, fd())
    expect(res.ok).toBe(false)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("student role rejected via ownsSection role check", async () => {
    setUser({ id: "u2", role: "STUDENT", teacherId: null })
    const res = await importExamAction(null, fd())
    expect(res.ok).toBe(false)
  })

  it("malformed questions JSON rejected", async () => {
    const res = await importExamAction(null, fd({ questions: "{not-json" }))
    expect(res.ok).toBe(false)
  })

  it("empty questions array rejected", async () => {
    const res = await importExamAction(null, fd({ questions: "[]" }))
    expect(res.ok).toBe(false)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("question exceeding max length rejected pre-write", async () => {
    const bad = [{ text: "ط".repeat(1500), type: "MCQ", options: ["أ", "ب"], correctAnswer: 0, points: 1 }]
    const res = await importExamAction(null, fd({ questions: JSON.stringify(bad) }))
    expect(res.ok).toBe(false)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("TRUE_FALSE normalized to MCQ row with index answer", async () => {
    const res = await importExamAction(null, fd())
    expect(res.ok).toBe(true)
    const rowsArg = prismaMock.question.createMany.mock.calls[0][0].data as { type: string; correctAnswer: string }[]
    expect(rowsArg[1].type).toBe("MCQ")
    expect(rowsArg[1].correctAnswer).toBe("1")
  })

  it("db failure inside transaction → ok:false (rollback semantics)", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error("db down"))
    const res = await importExamAction(null, fd())
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error("expected failure")
    expect(typeof res.error).toBe("string")
  })
})
