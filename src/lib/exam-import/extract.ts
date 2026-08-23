/**
 * استخراج النص من ملفات الاستيراد — in-memory فقط، لا يُخزَّن الملف إطلاقاً.
 * .txt مباشر · .docx عبر mammoth(extractRawText) · .pdf عبر pdf-parse
 * .doc القديم: غير مدعوم عمداً (رسالة تحويل واضحة) — لا ادعاء دعم.
 */

export interface ExtractResult {
  text: string
}

export type ExtractErrorCode =
  | "UNSUPPORTED_EXTENSION"
  | "LEGACY_DOC"
  | "EMPTY_FILE"
  | "EXTRACTION_FAILED"
  | "NO_TEXT_FOUND"

export class ExtractError extends Error {
  code: ExtractErrorCode
  constructor(code: ExtractErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export const IMPORT_EXTENSIONS = [".txt", ".docx", ".pdf", ".doc"] as const

export function isImportExtension(filename: string): boolean {
  const lower = filename.toLowerCase()
  return IMPORT_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export async function extractTextFromFile(buffer: Buffer, filename: string): Promise<string> {
  if (buffer.length === 0) throw new ExtractError("EMPTY_FILE", "الملف فارغ")

  const lower = filename.toLowerCase()

  if (lower.endsWith(".txt")) {
    return buffer.toString("utf8")
  }

  if (lower.endsWith(".doc")) {
    throw new ExtractError(
      "LEGACY_DOC",
      "هذا الإصدار من Word غير مدعوم للاستيراد المباشر. يرجى حفظ الملف بصيغة DOCX أو PDF ثم إعادة المحاولة."
    )
  }

  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth")
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (lower.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse")
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    try {
      const result = await parser.getText()
      return result.text
    } finally {
      await parser.destroy()
    }
  }

  throw new ExtractError("UNSUPPORTED_EXTENSION", "صيغة الملف غير مدعومة — المسموح: TXT أو DOCX أو PDF")
}
