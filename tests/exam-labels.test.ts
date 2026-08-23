import { describe, it, expect } from "vitest"
import { getOptionLabel, OPTION_LETTERS } from "@/lib/exam-labels"

describe("exam option labels (FIX-4)", () => {
  it("arabic default: أ ب ج د", () => {
    expect(getOptionLabel(0)).toBe("أ")
    expect(getOptionLabel(1)).toBe("ب")
    expect(getOptionLabel(2)).toBe("ج")
    expect(getOptionLabel(3)).toBe("د")
  })

  it("english: A B C D", () => {
    expect(getOptionLabel(0, "en")).toBe("A")
    expect(getOptionLabel(3, "en")).toBe("D")
  })

  it("extends beyond four options", () => {
    expect(getOptionLabel(4)).toBe("هـ")
    expect(getOptionLabel(5)).toBe("و")
    expect(getOptionLabel(7, "en")).toBe("H")
  })

  it("falls back to ordinal number beyond letter lists", () => {
    expect(getOptionLabel(10, "ar")).toBe("11")
    expect(getOptionLabel(12, "en")).toBe("13")
  })

  it("handles negative index defensively", () => {
    expect(getOptionLabel(-1)).toBe("-1")
  })

  it("letters are unique per language and match storage-free contract", () => {
    for (const lang of ["ar", "en"] as const) {
      const set = new Set(OPTION_LETTERS[lang])
      expect(set.size).toBe(OPTION_LETTERS[lang].length)
    }
  })
})
