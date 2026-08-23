import { describe, it, expect } from "vitest"
import { validateAIQuestion } from "@/app/api/ai/generate-questions/route"
import type { AIGeneratedQuestion } from "@/app/api/ai/generate-questions/route"

// ============================= MCQ Validation =============================

describe("validateAIQuestion — MCQ", () => {
  it("valid MCQ with text correctAnswer → resolves index", () => {
    const raw: AIGeneratedQuestion = {
      question: "ما عاصمة مصر؟",
      type: "MCQ",
      options: ["الإسكندرية", "القاهرة", "الأقصر", "أسوان"],
      correctAnswer: "القاهرة",
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(false)
    if (!("reason" in result)) {
      expect(result.type).toBe("MCQ")
      expect(result.correctAnswer).toBe(1)
      expect(result.options).toHaveLength(4)
      expect(result.originalType).toBe("MCQ")
    }
  })

  it("valid MCQ with numeric correctAnswer index", () => {
    const raw: AIGeneratedQuestion = {
      question: "What is 2+2?",
      type: "MCQ",
      options: ["3", "4", "5", "6"],
      correctAnswer: 1,
      difficulty: "easy",
    }
    const result = validateAIQuestion(raw, 0, "en")
    expect("reason" in result).toBe(false)
    if (!("reason" in result)) {
      expect(result.correctAnswer).toBe(1)
    }
  })

  it("MCQ with alef-normalized answer matches option", () => {
    const raw: AIGeneratedQuestion = {
      question: "اختر الإجابة",
      type: "MCQ",
      options: ["إبراهيم", "أحمد", "خالد", "عمر"],
      correctAnswer: "ابراهيم", // no hamza — should match إبراهيم
      difficulty: "متوسط",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(false)
    if (!("reason" in result)) {
      expect(result.correctAnswer).toBe(0)
    }
  })

  it("INVALID: MCQ correctAnswer does not match any option — NO fallback to 0", () => {
    const raw: AIGeneratedQuestion = {
      question: "سؤال اختيار",
      type: "MCQ",
      options: ["أ", "ب", "ج", "د"],
      correctAnswer: "هاء",
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(true)
    if ("reason" in result) {
      expect(result.reason).toContain("تعذّر تحويل")
    }
  })

  it("INVALID: MCQ with null correctAnswer", () => {
    const raw: AIGeneratedQuestion = {
      question: "سؤال بلا إجابة",
      type: "MCQ",
      options: ["أ", "ب", "ج", "د"],
      correctAnswer: null,
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(true)
    if ("reason" in result) {
      expect(result.reason).toContain("مفقودة")
    }
  })

  it("INVALID: MCQ with out-of-range numeric index", () => {
    const raw: AIGeneratedQuestion = {
      question: "سؤال",
      type: "MCQ",
      options: ["أ", "ب"],
      correctAnswer: 5,
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(true)
    if ("reason" in result) {
      expect(result.reason).toContain("تعذّر تحويل")
    }
  })

  it("INVALID: MCQ with no options", () => {
    const raw: AIGeneratedQuestion = {
      question: "سؤال بلا خيارات",
      type: "MCQ",
      options: [],
      correctAnswer: "أ",
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(true)
    if ("reason" in result) {
      expect(result.reason).toContain("غير صالح")
    }
  })

  it("INVALID: MCQ with too short question text", () => {
    const raw: AIGeneratedQuestion = {
      question: "أ",
      type: "MCQ",
      options: ["1", "2", "3", "4"],
      correctAnswer: "1",
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(true)
    if ("reason" in result) {
      expect(result.reason).toContain("فارغ أو قصير")
    }
  })

  it("MCQ with numeric string correctAnswer '2' → index 2", () => {
    const raw: AIGeneratedQuestion = {
      question: "ما هو الصحيح؟",
      type: "MCQ",
      options: ["أول", "ثاني", "ثالث", "رابع"],
      correctAnswer: "2",
      difficulty: "متوسط",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(false)
    if (!("reason" in result)) {
      expect(result.correctAnswer).toBe(2)
    }
  })
})

// ============================= TRUE/FALSE Validation =============================

describe("validateAIQuestion — TRUE_FALSE", () => {
  it("valid Arabic TRUE_FALSE with صح answer", () => {
    const raw: AIGeneratedQuestion = {
      question: "الشمس تشرق من الشرق",
      type: "TRUE_FALSE",
      options: ["صح", "خطأ"],
      correctAnswer: "صح",
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(false)
    if (!("reason" in result)) {
      expect(result.type).toBe("MCQ") // stored as MCQ
      expect(result.originalType).toBe("TRUE_FALSE")
      expect(result.options).toEqual(["صح", "خطأ"])
      expect(result.correctAnswer).toBe(0)
    }
  })

  it("valid Arabic TRUE_FALSE with خطأ answer", () => {
    const raw: AIGeneratedQuestion = {
      question: "القمر أكبر من الشمس",
      type: "TRUE_FALSE",
      options: ["صح", "خطأ"],
      correctAnswer: "خطأ",
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(false)
    if (!("reason" in result)) {
      expect(result.correctAnswer).toBe(1)
    }
  })

  it("valid English TRUE_FALSE", () => {
    const raw: AIGeneratedQuestion = {
      question: "The sky is green",
      type: "TRUE_FALSE",
      options: ["True", "False"],
      correctAnswer: "False",
      difficulty: "easy",
    }
    const result = validateAIQuestion(raw, 0, "en")
    expect("reason" in result).toBe(false)
    if (!("reason" in result)) {
      expect(result.type).toBe("MCQ")
      expect(result.originalType).toBe("TRUE_FALSE")
      expect(result.options).toEqual(["True", "False"])
      expect(result.correctAnswer).toBe(1)
    }
  })

  it("valid TRUE_FALSE with numeric correctAnswer 0", () => {
    const raw: AIGeneratedQuestion = {
      question: "Water boils at 100°C",
      type: "TRUE_FALSE",
      options: ["True", "False"],
      correctAnswer: 0,
      difficulty: "easy",
    }
    const result = validateAIQuestion(raw, 0, "en")
    expect("reason" in result).toBe(false)
    if (!("reason" in result)) {
      expect(result.correctAnswer).toBe(0)
    }
  })

  it("INVALID: TRUE_FALSE with 3 options", () => {
    const raw: AIGeneratedQuestion = {
      question: "سؤال صح وخطأ",
      type: "TRUE_FALSE",
      options: ["صح", "خطأ", "ربما"],
      correctAnswer: "صح",
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(true)
    if ("reason" in result) {
      expect(result.reason).toContain("خيارين فقط")
    }
  })

  it("INVALID: TRUE_FALSE with 0 options", () => {
    const raw: AIGeneratedQuestion = {
      question: "سؤال بلا خيارات",
      type: "TRUE_FALSE",
      options: [],
      correctAnswer: "صح",
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(true)
    if ("reason" in result) {
      expect(result.reason).toContain("خيارين فقط")
    }
  })

  it("INVALID: TRUE_FALSE with non-TF options", () => {
    const raw: AIGeneratedQuestion = {
      question: "سؤال",
      type: "TRUE_FALSE",
      options: ["نعم", "لا"],
      correctAnswer: "نعم",
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(true)
    if ("reason" in result) {
      expect(result.reason).toContain("غير صالحة")
    }
  })

  it("INVALID: TRUE_FALSE with ambiguous correctAnswer", () => {
    const raw: AIGeneratedQuestion = {
      question: "سؤال",
      type: "TRUE_FALSE",
      options: ["صح", "خطأ"],
      correctAnswer: "ربما",
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(true)
    if ("reason" in result) {
      expect(result.reason).toContain("يجب أن تكون 0 أو 1")
    }
  })

  it("INVALID: TRUE_FALSE with correctAnswer 2", () => {
    const raw: AIGeneratedQuestion = {
      question: "سؤال",
      type: "TRUE_FALSE",
      options: ["صح", "خطأ"],
      correctAnswer: 2,
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(true)
    if ("reason" in result) {
      expect(result.reason).toContain("يجب أن تكون 0 أو 1")
    }
  })
})

// ============================= ESSAY Validation =============================

describe("validateAIQuestion — ESSAY", () => {
  it("valid ESSAY with no options and null answer", () => {
    const raw: AIGeneratedQuestion = {
      question: "اكتب موضوعاً عن أهمية العلم في تقدم الأمم.",
      type: "ESSAY",
      options: [],
      correctAnswer: null,
      difficulty: "صعب",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(false)
    if (!("reason" in result)) {
      expect(result.type).toBe("ESSAY")
      expect(result.originalType).toBe("ESSAY")
      expect(result.options).toEqual([])
      expect(result.correctAnswer).toBeNull()
    }
  })

  it("valid English ESSAY", () => {
    const raw: AIGeneratedQuestion = {
      question: "Explain the theory of relativity in your own words.",
      type: "ESSAY",
      options: [],
      correctAnswer: null,
      difficulty: "hard",
    }
    const result = validateAIQuestion(raw, 0, "en")
    expect("reason" in result).toBe(false)
    if (!("reason" in result)) {
      expect(result.type).toBe("ESSAY")
      expect(result.correctAnswer).toBeNull()
    }
  })

  it("INVALID: ESSAY with options present", () => {
    const raw: AIGeneratedQuestion = {
      question: "اشرح مفهوم العدالة الاجتماعية.",
      type: "ESSAY",
      options: ["خيار", "آخر"],
      correctAnswer: null,
      difficulty: "متوسط",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(true)
    if ("reason" in result) {
      expect(result.reason).toContain("لا يحتوي على خيارات")
    }
  })
})

// ============================= MIXED Mode =============================

describe("validateAIQuestion — MIXED (all types together)", () => {
  it("processes a batch of mixed types correctly", () => {
    const batch: AIGeneratedQuestion[] = [
      {
        question: "ما أكبر كوكب في المجموعة الشمسية؟",
        type: "MCQ",
        options: ["المريخ", "المشتري", "زحل", "الأرض"],
        correctAnswer: "المشتري",
        difficulty: "سهل",
      },
      {
        question: "الماء يغلي عند 100 درجة مئوية",
        type: "TRUE_FALSE",
        options: ["صح", "خطأ"],
        correctAnswer: "صح",
        difficulty: "سهل",
      },
      {
        question: "اكتب عن أسباب التلوث البيئي.",
        type: "ESSAY",
        options: [],
        correctAnswer: null,
        difficulty: "صعب",
      },
    ]

    const results = batch.map((q, i) => validateAIQuestion(q, i, "ar"))
    expect(results.every((r) => !("reason" in r))).toBe(true)

    const validated = results.filter((r): r is Exclude<typeof r, { reason: string }> => !("reason" in r))
    expect(validated[0].type).toBe("MCQ")
    expect(validated[0].correctAnswer).toBe(1)
    expect(validated[1].type).toBe("MCQ") // TRUE_FALSE stored as MCQ
    expect(validated[1].originalType).toBe("TRUE_FALSE")
    expect(validated[1].correctAnswer).toBe(0)
    expect(validated[2].type).toBe("ESSAY")
    expect(validated[2].correctAnswer).toBeNull()
  })

  it("mixed batch with one invalid question isolates it", () => {
    const batch: AIGeneratedQuestion[] = [
      {
        question: "سؤال صالح؟",
        type: "MCQ",
        options: ["نعم", "لا", "ربما", "أكيد"],
        correctAnswer: "نعم",
        difficulty: "سهل",
      },
      {
        question: "سؤال فاسد",
        type: "MCQ",
        options: ["أ", "ب"],
        correctAnswer: "ج", // does not match any option
        difficulty: "متوسط",
      },
    ]

    const results = batch.map((q, i) => validateAIQuestion(q, i, "ar"))
    const valid = results.filter((r) => !("reason" in r))
    const invalid = results.filter((r) => "reason" in r)
    expect(valid).toHaveLength(1)
    expect(invalid).toHaveLength(1)
  })
})

// ============================= Language Handling =============================

describe("validateAIQuestion — Language", () => {
  it("English TRUE_FALSE normalizes to [True, False]", () => {
    const raw: AIGeneratedQuestion = {
      question: "The Earth is flat",
      type: "TRUE_FALSE",
      options: ["True", "False"],
      correctAnswer: "False",
      difficulty: "easy",
    }
    const result = validateAIQuestion(raw, 0, "en")
    expect("reason" in result).toBe(false)
    if (!("reason" in result)) {
      expect(result.options).toEqual(["True", "False"])
      expect(result.correctAnswer).toBe(1)
    }
  })

  it("Arabic TRUE_FALSE normalizes to [صح, خطأ]", () => {
    const raw: AIGeneratedQuestion = {
      question: "مصر في أفريقيا",
      type: "TRUE_FALSE",
      options: ["صح", "خطأ"],
      correctAnswer: "صح",
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(false)
    if (!("reason" in result)) {
      expect(result.options).toEqual(["صح", "خطأ"])
      expect(result.correctAnswer).toBe(0)
    }
  })

  it("difficulty mapping: سهل=1, متوسط=2, صعب=3, easy/medium/hard", () => {
    const makeQ = (d: string): AIGeneratedQuestion => ({
      question: "سؤال اختبار الصعوبة؟",
      type: "ESSAY",
      options: [],
      correctAnswer: null,
      difficulty: d,
    })
    for (const [d, _expected] of [["سهل", "سهل"], ["easy", "easy"], ["صعب", "صعب"], ["hard", "hard"]]) {
      const result = validateAIQuestion(makeQ(d), 0, "ar")
      expect("reason" in result).toBe(false)
      if (!("reason" in result)) {
        expect(result.difficulty).toBe(d)
      }
    }
  })
})

// ============================= Edge Cases =============================

describe("validateAIQuestion — edge cases", () => {
  it("empty question text → INVALID", () => {
    const raw: AIGeneratedQuestion = {
      question: "",
      type: "MCQ",
      options: ["أ", "ب", "ج", "د"],
      correctAnswer: "أ",
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(true)
  })

  it("whitespace-only question → INVALID", () => {
    const raw: AIGeneratedQuestion = {
      question: "   ",
      type: "MCQ",
      options: ["أ", "ب", "ج", "د"],
      correctAnswer: "أ",
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(true)
  })

  it("MCQ with 2 options is valid (e.g. yes/no that's not TF)", () => {
    const raw: AIGeneratedQuestion = {
      question: "هل يمكن تقسيم الذرة؟",
      type: "MCQ",
      options: ["نعم", "لا"],
      correctAnswer: "نعم",
      difficulty: "متوسط",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(false)
    if (!("reason" in result)) {
      expect(result.type).toBe("MCQ")
      expect(result.correctAnswer).toBe(0)
    }
  })

  it("MCQ with 6 options is valid", () => {
    const raw: AIGeneratedQuestion = {
      question: "اختر الصحيح",
      type: "MCQ",
      options: ["أ", "ب", "ج", "د", "هـ", "و"],
      correctAnswer: "و",
      difficulty: "صعب",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(false)
    if (!("reason" in result)) {
      expect(result.correctAnswer).toBe(5)
    }
  })

  it("MCQ with 7+ options → INVALID", () => {
    const raw: AIGeneratedQuestion = {
      question: "اختر",
      type: "MCQ",
      options: ["1", "2", "3", "4", "5", "6", "7"],
      correctAnswer: "1",
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(true)
  })

  it("TRUE_FALSE with 'صحيح' variant resolves to index 0", () => {
    const raw: AIGeneratedQuestion = {
      question: "القاهرة عاصمة مصر",
      type: "TRUE_FALSE",
      options: ["صحيح", "خطأ"],
      correctAnswer: "صحيح",
      difficulty: "سهل",
    }
    const result = validateAIQuestion(raw, 0, "ar")
    expect("reason" in result).toBe(false)
    if (!("reason" in result)) {
      expect(result.correctAnswer).toBe(0)
    }
  })
})
