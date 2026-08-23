/**
 * أحرف خيارات الأسئلة — توليد وقت العرض فقط (لا تخزين).
 * التصحيح يقارن الفهرس الرقمي دائماً؛ الأحرف عرضية بحتة.
 */

export type ExamLang = "ar" | "en"

export const OPTION_LETTERS: Record<ExamLang, readonly string[]> = {
  ar: ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي"],
  en: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
}

/** حرف الخيار حسب اللغة — يسقط إلى الرقم الترتيبي إن تجاوز القائمة */
export function getOptionLabel(index: number, lang: ExamLang = "ar"): string {
  if (index < 0) return String(index)
  const set = OPTION_LETTERS[lang]
  return set[index] ?? String(index + 1)
}
