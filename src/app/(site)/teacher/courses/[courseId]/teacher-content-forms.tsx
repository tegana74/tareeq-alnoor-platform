"use client"

import { useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, ChevronDown, FileUp, Loader2, Plus, Save, Trash2, Upload, X, Brain } from "lucide-react"
import { Button } from "@/components/ui/button"
import { classNames } from "@/lib/utils"
import { AIGenerator } from "@/components/ai-generator"
import {
  createSectionAction,
  deleteSectionAction,
  saveVideoAction,
  deleteVideoAction,
  saveBookAction,
  deleteBookAction,
  saveExamAction,
  deleteExamAction,
  saveQuestionAction,
  deleteQuestionAction,
} from "@/app/actions/teacher-content"

type State = { ok: boolean; error?: string }
const initialState: State = { ok: false }

function useSubmit(action: (prev: State, form: FormData) => Promise<State>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(async (prev: State, form: FormData) => {
    const res = await action(prev, form)
    if (res.ok) {
      try { await router.refresh() } catch { /* ignore refresh errors */ }
      return { ok: true }
    }
    return res
  }, initialState)
  return { open, setOpen, state, formAction, pending }
}

function ErrorBox({ error }: { error?: string }) {
  if (!error) return null
  return <p className="text-xs font-bold text-rose-600">{error}</p>
}

async function uploadFile(file: File, kind: "video" | "file") {
  const fd = new FormData()
  fd.set("file", file)
  const res = await fetch(`/api/upload?kind=${kind}`, { method: "POST", body: fd })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? "فشل الرفع")
  return data.url as string
}

function FilePicker({
  label,
  kind,
  accept,
  maxSizeText,
  onUploaded,
}: {
  label: string
  kind: "video" | "file"
  accept: string
  maxSizeText: string
  onUploaded: (url: string, name: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string>()
  const [uploadedName, setUploadedName] = useState<string>()

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(undefined)
    setUploading(true)
    try {
      const url = await uploadFile(file, kind)
      setUploadedName(file.name)
      onUploaded(url, file.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الرفع")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-3 text-center">
      {uploadedName ? (
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1 truncate text-xs font-black text-mint-dark">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{uploadedName}</span>
          </p>
          <label className="shrink-0 cursor-pointer text-[11px] font-black text-amber-600 hover:underline">
            استبدال
            <input type="file" accept={accept} className="hidden" onChange={handleFile} />
          </label>
        </div>
      ) : uploading ? (
        <p className="flex items-center justify-center gap-2 text-sm font-black text-navy">
          <Loader2 className="h-4 w-4 animate-spin" /> جارِ رفع الملف...
        </p>
      ) : (
        <label className="flex cursor-pointer flex-col items-center gap-1 py-2">
          <Upload className="h-6 w-6 text-amber-500" />
          <span className="text-sm font-black text-navy">{label}</span>
          <span className="text-[11px] text-slate-400">{maxSizeText}</span>
          <input type="file" accept={accept} className="hidden" onChange={handleFile} />
        </label>
      )}
      {error && <p className="mt-1 text-xs font-bold text-rose-600">{error}</p>}
    </div>
  )
}

const inputCls =
  "h-10 w-full rounded-lg border-2 border-slate-200 px-3 text-sm font-bold text-navy outline-none focus:border-amber-400"

// ============================= قسم جديد =============================

export function SectionForm({ courseId }: { courseId: string }) {
  const { open, setOpen, state, formAction, pending } = useSubmit(createSectionAction)
  return (
    <div className="mt-6">
      {open ? (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="courseId" value={courseId} />
          <input name="name" required placeholder="اسم القسم الجديد" className={inputCls} />
          <Button type="submit" size="sm" variant="mint" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            إضافة
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
          <ErrorBox error={state.error} />
        </form>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> إضافة قسم
        </Button>
      )}
    </div>
  )
}

export function SectionDelete({ sectionId }: { sectionId: string }) {
  const { formAction, pending } = useSubmit(deleteSectionAction)
  return (
    <form action={formAction} onSubmit={() => confirm("حذف هذا القسم وجميع محتوياته؟")}>
      <input type="hidden" name="sectionId" value={sectionId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} className="text-rose-500 hover:bg-rose-50">
        <Trash2 className="h-4 w-4" />
      </Button>
    </form>
  )
}

// ============================= درس (فيديو) =============================

interface VideoEditorProps {
  sectionId: string
  video?: { id: string; title: string; description?: string; provider: string; url: string; isFree: boolean; downloadAllowed: boolean; order: number }
}

export function VideoEditor({ sectionId, video }: VideoEditorProps) {
  const { open, setOpen, state, formAction, pending } = useSubmit(saveVideoAction)
  const [provider, setProvider] = useState(video?.provider ?? "YOUTUBE")
  const [uploadedUrl, setUploadedUrl] = useState(video?.provider === "UPLOAD" ? video.url : "")

  return (
    <div>
      {open ? (
        <form action={formAction} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <input type="hidden" name="sectionId" value={sectionId} />
          <input type="hidden" name="id" value={video?.id ?? ""} />
          <input type="hidden" name="order" value={video?.order ?? 0} />
          <div className="mb-2 grid gap-2 sm:grid-cols-2">
            <input name="title" required placeholder="عنوان الدرس" defaultValue={video?.title} className={inputCls} />
            <select name="provider" value={provider} onChange={(e) => setProvider(e.target.value)} className={inputCls}>
              <option value="YOUTUBE">يوتيوب</option>
              <option value="VIMEO">Vimeo</option>
              <option value="UPLOAD">رفع على المنصة</option>
            </select>
          </div>

          {provider === "UPLOAD" ? (
            <>
              <input type="hidden" name="url" value={uploadedUrl} />
              <FilePicker
                label="اختر ملف الفيديو من جهازك"
                kind="video"
                accept="video/mp4,video/webm,video/mov,video/x-matroska"
                maxSizeText="MP4 / WebM / MOV — حتى 500 ميجا"
                onUploaded={(url, name) => {
                  setUploadedUrl(url)
                  if (!video?.title) {
                    const input = document.querySelector(`form input[name="title"]`) as HTMLInputElement | null
                    if (input && !input.value) input.value = name.replace(/\.[^.]+$/, "")
                  }
                }}
              />
              {uploadedUrl && (
                <p className="mt-1 text-[11px] font-bold text-slate-500" dir="ltr">
                  {uploadedUrl}
                </p>
              )}
            </>
          ) : (
            <input
              name="url"
              required
              dir="ltr"
              placeholder={
                provider === "YOUTUBE"
                  ? "https://www.youtube.com/watch?v=...  أو https://studio.youtube.com/video/..."
                  : "رابط فيديو Vimeo"
              }
              defaultValue={provider === "UPLOAD" ? "" : video?.url}
              className={classNames(inputCls, "mb-2 text-left")}
            />
          )}

          <textarea
            name="description"
            placeholder="وصف الدرس (اختياري)"
            defaultValue={video?.description}
            className="mb-2 w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"
            rows={2}
          />
          <label className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-600">
            <input type="checkbox" name="isFree" defaultChecked={video?.isFree} className="h-4 w-4 accent-amber-500" />
            درس مجاني
          </label>
          <label className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-600">
            <input type="checkbox" name="downloadAllowed" defaultChecked={video?.downloadAllowed} className="h-4 w-4 accent-amber-500" />
            السماح للطلاب بتنزيل الفيديو
          </label>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" variant="navy" disabled={pending || (provider === "UPLOAD" && !uploadedUrl)}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
          <ErrorBox error={state.error} />
        </form>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {video ? "تعديل" : <><Plus className="h-4 w-4" /> درس</>}
        </Button>
      )}
    </div>
  )
}

export function VideoDelete({ videoId }: { videoId: string }) {
  const { formAction, pending } = useSubmit(deleteVideoAction)
  return (
    <form action={formAction} onSubmit={() => confirm("حذف الدرس؟")}>
      <input type="hidden" name="videoId" value={videoId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} className="text-rose-500 hover:bg-rose-50">
        <Trash2 className="h-4 w-4" />
      </Button>
    </form>
  )
}

// ============================= كتاب =============================

interface BookEditorProps {
  sectionId: string
  book?: { id: string; title: string; type: string; fileUrl: string; isFree: boolean; downloadAllowed: boolean; order: number }
}

export function BookEditor({ sectionId, book }: BookEditorProps) {
  const { open, setOpen, state, formAction, pending } = useSubmit(saveBookAction)
  const [uploadedUrl, setUploadedUrl] = useState(book?.fileUrl ?? "")

  return (
    <div>
      {open ? (
        <form action={formAction} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <input type="hidden" name="sectionId" value={sectionId} />
          <input type="hidden" name="id" value={book?.id ?? ""} />
          <input type="hidden" name="order" value={book?.order ?? 0} />
          <div className="mb-2 grid gap-2 sm:grid-cols-2">
            <input name="title" required placeholder="عنوان الكتاب" defaultValue={book?.title} className={inputCls} />
            <select name="type" defaultValue={book?.type ?? "BOOK"} className={inputCls}>
              <option value="BOOK">كتاب</option>
              <option value="NOTES">ملاحظات</option>
              <option value="SUMMARY">ملخص</option>
              <option value="FILE">ملف</option>
            </select>
          </div>

          <div className="mb-2">
            <input type="hidden" name="fileUrl" value={uploadedUrl} />
            <FilePicker
              label="اختر ملف PDF من جهازك"
              kind="file"
              accept="application/pdf,image/*"
              maxSizeText="PDF أو صورة — حتى 25 ميجا"
              onUploaded={(url, name) => {
                setUploadedUrl(url)
                if (!book?.title) {
                  const input = document.querySelector(`form input[name="title"]`) as HTMLInputElement | null
                  if (input && !input.value) input.value = name.replace(/\.[^.]+$/, "")
                }
              }}
            />
            {uploadedUrl && (
              <p className="mt-1 text-[11px] font-bold text-slate-500" dir="ltr">
                {uploadedUrl}
              </p>
            )}
          </div>

          <label className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-600">
            <input type="checkbox" name="isFree" defaultChecked={book?.isFree} className="h-4 w-4 accent-amber-500" />
            كتاب مجاني
          </label>
          <label className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-600">
            <input type="checkbox" name="downloadAllowed" defaultChecked={book?.downloadAllowed} className="h-4 w-4 accent-amber-500" />
            السماح للطلاب بتنزيل الملف
          </label>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" variant="navy" disabled={pending || !uploadedUrl}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
          <ErrorBox error={state.error} />
        </form>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {book ? "تعديل" : <><Plus className="h-4 w-4" /> كتاب</>}
        </Button>
      )}
    </div>
  )
}

export function BookDelete({ bookId }: { bookId: string }) {
  const { formAction, pending } = useSubmit(deleteBookAction)
  return (
    <form action={formAction} onSubmit={() => confirm("حذف الكتاب؟")}>
      <input type="hidden" name="bookId" value={bookId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} className="text-rose-500 hover:bg-rose-50">
        <Trash2 className="h-4 w-4" />
      </Button>
    </form>
  )
}

// ============================= اختبار =============================

interface ExamEditorProps {
  sectionId: string
  exam?: { id: string; title: string; type: string; durationMinutes: number; isFree: boolean; order: number }
}

export function ExamEditor({ sectionId, exam }: ExamEditorProps) {
  const { open, setOpen, state, formAction, pending } = useSubmit(saveExamAction)
  return (
    <div>
      {open ? (
        <form action={formAction} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <input type="hidden" name="sectionId" value={sectionId} />
          <input type="hidden" name="id" value={exam?.id ?? ""} />
          <input type="hidden" name="order" value={exam?.order ?? 0} />
          <div className="mb-2 grid gap-2 sm:grid-cols-3">
            <input name="title" required placeholder="عنوان الاختبار" defaultValue={exam?.title} className={inputCls} />
            <select name="type" defaultValue={exam?.type ?? "EXAM"} className={inputCls}>
              <option value="EXAM">اختبار</option>
              <option value="HOMEWORK">واجب منزلي</option>
            </select>
            <input
              name="durationMinutes"
              type="number"
              min={1}
              defaultValue={exam?.durationMinutes ?? 60}
              className={inputCls}
              placeholder="المدة (دقيقة)"
            />
          </div>
          <label className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-600">
            <input type="checkbox" name="isFree" defaultChecked={exam?.isFree} className="h-4 w-4 accent-amber-500" />
            اختبار مجاني
          </label>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" variant="navy" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
          <ErrorBox error={state.error} />
        </form>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {exam ? "تعديل" : <><Plus className="h-4 w-4" /> اختبار</>}
        </Button>
      )}
    </div>
  )
}

export function ExamDelete({ examId }: { examId: string }) {
  const { formAction, pending } = useSubmit(deleteExamAction)
  return (
    <form action={formAction} onSubmit={() => confirm("حذف الاختبار وكل الأسئلة؟")}>
      <input type="hidden" name="examId" value={examId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} className="text-rose-500 hover:bg-rose-50">
        <Trash2 className="h-4 w-4" />
      </Button>
    </form>
  )
}

// ============================= سؤال =============================

interface QuestionEditorProps {
  examId: string
  question?: { id: string; text: string; type: string; points: number; options: string[] | null; correctAnswer: string | null; order: number }
}

export function QuestionEditor({ examId, question }: QuestionEditorProps) {
  const { open, setOpen, state, formAction, pending } = useSubmit(saveQuestionAction)
  const [type, setType] = useState(question?.type ?? "MCQ")
  const opts = question?.options ?? []
  const correctIndex = question?.correctAnswer ?? "0"

  return (
    <div>
      {open ? (
        <form action={formAction} className="mt-2 rounded-xl border border-slate-200 bg-amber-50/40 p-4">
          <input type="hidden" name="examId" value={examId} />
          <input type="hidden" name="id" value={question?.id ?? ""} />
          <input type="hidden" name="order" value={question?.order ?? 0} />
          <textarea
            name="text"
            required
            rows={2}
            placeholder="نص السؤال"
            defaultValue={question?.text}
            className="mb-2 w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"
          />
          <div className="mb-2 grid gap-2 sm:grid-cols-3">
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={inputCls}
            >
              <option value="MCQ">اختيار من متعدد</option>
              <option value="ESSAY">مقالي</option>
            </select>
            <input name="points" type="number" min={1} required placeholder="الدرجات" defaultValue={question?.points ?? 1} className={inputCls} />
          </div>

          {type === "MCQ" ? (
            <>
              <div className="mb-2 grid gap-2 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <input
                    key={i}
                    name={`option${i}`}
                    placeholder={`الخيار ${String.fromCharCode(0x0623 + i)}`}
                    defaultValue={opts[i] ?? ""}
                    className={inputCls}
                  />
                ))}
              </div>
              <div className="mb-2">
                <span className="mb-1 block text-xs font-bold text-slate-500">الإجابة الصحيحة</span>
                <select name="correctAnswer" defaultValue={correctIndex} className={inputCls}>
                  {[0, 1, 2, 3].map((i) => (
                    <option key={i} value={i}>
                      {String.fromCharCode(0x0623 + i)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <textarea
              name="correctAnswer"
              rows={2}
              placeholder="الإجابة النموذجية (تظهر للمعلم للمقارنة)"
              defaultValue={question?.correctAnswer ?? ""}
              className="mb-2 w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-400"
            />
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" variant="navy" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} حفظ السؤال
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
          <ErrorBox error={state.error} />
        </form>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {question ? "تعديل" : <><Plus className="h-4 w-4" /> سؤال</>}
        </Button>
      )}
    </div>
  )
}

export function QuestionDelete({ questionId }: { questionId: string }) {
  const { formAction, pending } = useSubmit(deleteQuestionAction)
  return (
    <form action={formAction} onSubmit={() => confirm("حذف السؤال؟")}>
      <input type="hidden" name="questionId" value={questionId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} className="text-rose-500 hover:bg-rose-50">
        <Trash2 className="h-4 w-4" />
      </Button>
    </form>
  )
}

// ============================= قائمة أسئلة الاختبار =============================

export function QuestionList({ exam }: { exam: { id: string; questions: { id: string; text: string; type: string; points: number; options: string[] | null; correctAnswer: string | null; order: number }[] } }) {
  const [open, setOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const router = useRouter()

  async function handleAddAIQuestions(aiQuestions: { text: string; type: string; options?: string[]; correctAnswer?: string; points: number }[]) {
    setAdding(true)
    try {
      for (const q of aiQuestions) {
        const fd = new FormData()
        fd.set("examId", exam.id)
        fd.set("text", q.text)
        fd.set("type", q.type)
        fd.set("points", String(q.points))
        if (q.type === "MCQ" && q.options) {
          q.options.forEach((opt, i) => fd.set(`option${i}`, opt))
          fd.set("correctAnswer", q.correctAnswer ?? "0")
        }
        await saveQuestionAction({ ok: false }, fd)
      }
      setAiOpen(false)
      try { await router.refresh() } catch { /* ignore */ }
    } catch { /* ignore */ }
    setAdding(false)
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-black text-violet-600 hover:underline"
      >
        <ChevronDown className={classNames("h-4 w-4 transition-transform", open && "rotate-180")} />
        إدارة الأسئلة ({exam.questions.length})
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {exam.questions.map((q) => (
            <div key={q.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-white p-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-navy">{q.text}</p>
                <p className="text-[10px] text-slate-400">
                  {q.type === "MCQ" ? "اختياري" : "مقالي"} — {q.points} درجات
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <QuestionEditor examId={exam.id} question={{ ...q, options: q.options }} />
                <QuestionDelete questionId={q.id} />
              </div>
            </div>
          ))}
          <QuestionEditor examId={exam.id} />
          <div className="pt-2 border-t border-slate-100">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAiOpen(!aiOpen)}>
              <Brain className="h-4 w-4 text-violet-500" /> توليد بالذكاء الاصطناعي
            </Button>
            {aiOpen && (
              <div className="mt-2">
                {adding ? (
                  <div className="flex items-center gap-2 rounded-xl bg-violet-50 p-4 text-sm text-violet-600">
                    <Loader2 className="h-4 w-4 animate-spin" /> جاري إضافة الأسئلة...
                  </div>
                ) : (
                  <AIGenerator onAddToExam={handleAddAIQuestions} />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
