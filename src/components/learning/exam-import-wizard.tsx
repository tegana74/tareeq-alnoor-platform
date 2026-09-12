"use client"

import { startTransition, useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  AlertCircle,
  FileUp,
  Import,
  Loader2,
  XCircle,
} from "lucide-react"
import { importExamAction } from "@/app/actions/exam-import"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert } from "@/components/ui/alert"
import { Input } from "@/components/ui/field"


type ImportedType = "MCQ" | "TRUE_FALSE" | "ESSAY"

interface ImportedQuestion {
  order: number
  text: string
  type: ImportedType
  options: string[]
  correctAnswer: number | null
  points: number
}

interface InvalidQuestion {
  order: number
  text: string
  reason: string
}

const ACCEPT = ".txt,.docx,.pdf,.doc"
const MAX_SIZE = 10 * 1024 * 1024

export function ExamImportWizard({ sectionId }: { sectionId: string }) {
  const router = useRouter()
  const [session, setSession] = useState(0)

  // إعادة ضبط كاملة لجلسة الاستيراد (حالة النموذج + نتيجة الإجراء) عند استيراد اختبار آخر
  function repeatImport() {
    router.refresh()
    setSession((s) => s + 1)
  }

  return (
    <ExamImportWizardSession key={session} sectionId={sectionId} onRepeat={repeatImport} />
  )
}

function ExamImportWizardSession({
  sectionId,
  onRepeat,
}: {
  sectionId: string
  onRepeat: () => void
}) {
  const [step, setStep] = useState<"upload" | "preview">("upload")
  const [fileName, setFileName] = useState("")
  const [extracting, setExtracting] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [duration, setDuration] = useState(45)
  const [questions, setQuestions] = useState<ImportedQuestion[]>([])
  const [invalid, setInvalid] = useState<InvalidQuestion[]>([])
  const [stats, setStats] = useState({ MCQ: 0, TRUE_FALSE: 0, ESSAY: 0 })

  const [state, formAction, importing] = useActionState(importExamAction, { ok: false } as never)

  // ===== نجاح الحفظ =====
  const saved = state.ok ? (state as { ok: true; importedCount: number }) : null
  // بعد الحفظ نعود تلقائياً لخطوة الرفع ونعرض رسالة النجاح
  const activeStep = saved ? "upload" : step

  async function handleFile(file: File) {
    setUploadError(null)
    if (!/\.(txt|docx|pdf)$/i.test(file.name)) {
      setUploadError("صيغة غير مدعومة — المسموح: TXT أو DOCX أو PDF (ملفات DOC القديمة غير مدعومة)")
      return
    }
    if (file.size > MAX_SIZE) {
      setUploadError(`حجم الملف يتجاوز ${MAX_SIZE / (1024 * 1024)} ميجا`)
      return
    }

    setFileName(file.name)
    setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 200))
    setExtracting(true)

    try {
      const fd = new FormData()
      fd.set("file", file)
      const res = await fetch("/api/exams/import/extract", { method: "POST", body: fd })
      const data = await res.json()

      if (!res.ok) {
        setUploadError(data.error ?? "تعذر قراءة الملف")
        return
      }

      setQuestions(
        (data.questions ?? []).map((q: ImportedQuestion) => ({
          ...q,
          points: q.points || 1,
          correctAnswer: q.correctAnswer ?? 0,
        }))
      )
      setInvalid(data.invalid ?? [])
      setStats(data.stats ?? { MCQ: 0, TRUE_FALSE: 0, ESSAY: 0 })
      setStep("preview")
    } catch {
      setUploadError("خطأ في الشبكة أثناء رفع الملف")
    } finally {
      setExtracting(false)
    }
  }

  function updateQuestion(index: number, patch: Partial<ImportedQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)))
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index))
  }

  // إرسال بيانات الاستيراد إلى الـ Server Action برمجياً (بدون form متداخل)
  function handleImport() {
    const fd = new FormData()
    fd.set("sectionId", sectionId)
    fd.set("title", title || fileName.replace(/\.[^.]+$/, ""))
    fd.set("durationMinutes", String(duration))
    fd.set("examType", "EXAM")
    fd.set("isFree", "false")
    fd.set("questions", JSON.stringify(questions))
    startTransition(() => formAction(fd))
  }

  // ===== نجاح الاستيراد =====
  return (
    <div className="space-y-6">
      {saved !== null && (
        <Alert variant="success" title={`تم حفظ الاختبار بنجاح — ${saved.importedCount} سؤالاً`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>تمت إضافة الاختبار إلى القسم ويمكن لطلاب الكورس دخوله الآن.</span>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onRepeat}>استيراد اختبار آخر</Button>
              <Link href="/teacher">
                <Button variant="primary" size="sm">عرض كورساتي</Button>
              </Link>
            </div>
          </div>
        </Alert>
      )}
      {/* STEP 1 — Upload */}
      {activeStep === "upload" && (
        <>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card p-10 text-center transition-colors hover:border-primary-300 hover:bg-primary-50/30 focus-within:outline-none focus-within:ring-2 focus-within:ring-primary-400">
            <FileUp className="h-10 w-10 text-primary-500" aria-hidden="true" />
            <span className="text-base font-black text-navy">
              {extracting ? "جارٍ التحليل..." : "اسحب الملف هنا أو اضغط للاختيار"}
            </span>
            <span className="text-xs text-muted-foreground">TXT · DOCX · PDF — حتى 10 ميجا</span>
            <span className="sr-only">اختر ملف الاختبار للاستيراد</span>
            <input
              type="file"
              accept={ACCEPT}
              className="sr-only"
              disabled={extracting}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
                e.currentTarget.value = ""
              }}
            />
            {extracting && (
              <Loader2 className="absolute h-6 w-6 animate-spin text-primary-500" aria-hidden="true" />
            )}
          </label>

          {fileName && extracting && (
            <p className="text-center text-xs font-bold text-muted-foreground">{fileName}</p>
          )}

          {uploadError && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm font-bold text-danger-strong">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {uploadError}
            </div>
          )}

          <p className="rounded-xl bg-muted/30 p-3.5 text-[11px] leading-5 text-muted-foreground">
            التنسيق المتوقع: ترقيم للأسئلة (1. نص السؤال)، خيارات بأحرف (أ) ب) أو A. B.)،
            ثم «الإجابة:» أو «Answer:». أسئلة المقالى تُكتب بلا خيارات مع «الدرجة:» اختيارياً.
          </p>
        </>
      )}

      {/* STEPS 3–5 — Preview / Edit / Import */}
      {activeStep === "preview" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-navy">
                تم اكتشاف {questions.length} سؤالاً صالحاً
                {invalid.length > 0 && (
                  <span className="font-medium text-danger-strong"> و{invalid.length} غير صالح</span>
                )}
              </p>
              <div className="mt-1.5 flex gap-2">
                <Badge variant="primary" size="sm">MCQ: {stats.MCQ}</Badge>
                <Badge variant="info" size="sm">صح/خطأ: {stats.TRUE_FALSE}</Badge>
                <Badge variant="neutral" size="sm">مقالي: {stats.ESSAY}</Badge>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep("upload")}>تغيير الملف</Button>
          </div>

          <Card className="space-y-4 p-5">
            <p className="text-sm font-black text-navy">عنوان الاختبار</p>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label="عنوان الاختبار" />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-bold text-muted-foreground">المدة (دقيقة)</span>
                <Input type="number" min={1} max={300} value={duration} onChange={(e) => setDuration(Number(e.target.value))} aria-label="مدة الاختبار بالدقائق" />
              </label>
            </div>
          </Card>

          {questions.map((q, qi) => (
            <Card key={qi} className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="primary" size="sm">سؤال {qi + 1}</Badge>
                <button type="button" onClick={() => removeQuestion(qi)} aria-label={`حذف السؤال ${qi + 1}`} className="text-danger-strong hover:text-danger-strong/80">
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <textarea
                value={q.text}
                rows={2}
                aria-label={`نص السؤال ${qi + 1}`}
                className="w-full rounded-lg border border-border bg-background p-2.5 text-sm text-ink outline-none focus:border-primary-400"
                onChange={(e) => updateQuestion(qi, { text: e.target.value })}
              />

              <div className="flex items-center gap-2">
                <select
                  value={q.type}
                  aria-label={`نوع السؤال ${qi + 1}`}
                  className="h-9 rounded-lg border border-border bg-background px-2 text-xs font-bold text-ink"
                  onChange={(e) => {
                    const t = e.target.value as ImportedType
                    if (t === "ESSAY") updateQuestion(qi, { type: t, options: [], correctAnswer: null })
                    else if (t === "TRUE_FALSE") updateQuestion(qi, { type: t, options: ["صح", "خطأ"], correctAnswer: 0 })
                    else updateQuestion(qi, { type: t, options: q.options.length >= 2 ? q.options : ["", "", "", ""], correctAnswer: q.correctAnswer ?? 0 })
                  }}
                >
                  <option value="MCQ">اختيار من متعدد</option>
                  <option value="TRUE_FALSE">صح / خطأ</option>
                  <option value="ESSAY">مقالي</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  الدرجة
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={q.points}
                    aria-label={`درجة السؤال ${qi + 1}`}
                    className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-sm text-ink"
                    onChange={(e) => updateQuestion(qi, { points: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </label>
              </div>

              {q.type !== "ESSAY" && (
                <ul className="space-y-1.5">
                  {q.options.map((opt, oi) => (
                    <li key={oi} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${qi}`}
                        checked={q.correctAnswer === oi}
                        onChange={() => updateQuestion(qi, { correctAnswer: oi })}
                        aria-label={`تعيين الخيار ${oi + 1} كإجابة صحيحة`}
                        className="accent-success-strong"
                      />
                      <input
                        value={opt}
                        aria-label={`نص الخيار ${oi + 1}`}
                        className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-ink focus:border-primary-400 focus:outline-none"
                        onChange={(e) =>
                          updateQuestion(qi, {
                            options: q.options.map((o, j) => (j === oi ? e.target.value : o)),
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}

          {invalid.length > 0 && (
            <Card className="border-danger-200 bg-danger-50 p-5">
              <p className="mb-3 flex items-center gap-2 text-sm font-black text-danger-strong">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {invalid.length} سؤالاً غير مكتمل (لن يُستورد)
              </p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {invalid.slice(0, 10).map((inv, i) => (
                  <li key={i}>• {inv.text ? `«${inv.text.slice(0, 60)}»` : `سؤال رقم ${inv.order}`} — {inv.reason}</li>
                ))}
              </ul>
            </Card>
          )}

          <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 sm:-mx-6 sm:px-6">
            {state.ok === false && "error" in state && typeof state.error === "string" && (
              <p role="alert" className="me-auto flex items-center gap-1.5 text-xs font-bold text-danger-strong">
                <XCircle className="h-4 w-4" aria-hidden="true" />{state.error}
              </p>
            )}
            {questions.length > 0 && (
              <div className="ms-auto flex items-center gap-2">
                <Button
                  type="button"
                  size="lg"
                  disabled={importing || questions.length === 0}
                  loading={importing}
                  onClick={handleImport}
                >
                  {!importing && <Import className="h-4 w-4" aria-hidden="true" />}
                  استيراد الاختبار ({questions.length})
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
