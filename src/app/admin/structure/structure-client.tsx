"use client"

import { useActionState, useState } from "react"
import { BookOpen, Check, ChevronDown, ChevronUp, GraduationCap, Layers, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, Input, Select } from "@/components/ui/field"
import {
  createYearAction,
  updateYearAction,
  toggleYearAction,
  deleteYearAction,
  createDepartmentAction,
  toggleDepartmentAction,
  deleteDepartmentAction,
  createSubjectAction,
  toggleSubjectAction,
  deleteSubjectAction,
} from "@/app/actions/structure"

type YearItem = { id: string; name: string; order: number; isActive: boolean; coursesCount: number; usersCount: number; departments: DeptItem[] }
type DeptItem = { id: string; name: string; order: number; isActive: boolean; coursesCount: number }
type SubjectItem = { id: string; name: string; icon: string | null; color: string | null; yearId: string | null; isActive: boolean; coursesCount: number }

interface Props {
  years: YearItem[]
  subjects: SubjectItem[]
}

function ErrorBox({ error }: { error?: string }) {
  if (!error) return null
  return <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{error}</p>
}

function ToggleDelete({ id, isActive, onToggle, onDelete }: { id: string; isActive: boolean; onToggle: (fd: FormData) => void; onDelete: (fd: FormData) => void }) {
  return (
    <div className="flex items-center gap-1">
      <form action={onToggle}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className={`rounded-full px-2.5 py-1 text-[11px] font-black ${isActive ? "bg-mint-50 text-mint-dark" : "bg-slate-100 text-slate-400"}`}
        >
          {isActive ? "مفعل" : "معطل"}
        </button>
      </form>
      <form action={onDelete}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" title="حذف" className="rounded-full p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500">
          <Trash2 className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}

function InlineEdit({
  id, initialName, initialOrder, yearLabel, action,
}: {
  id: string
  initialName: string
  initialOrder?: number
  yearLabel?: string
  action: (prev: unknown, fd: FormData) => Promise<{ ok: boolean; error?: string }>
}) {
  const [editing, setEditing] = useState(false)
  const [state, formAction, pending] = useActionState(action, null)
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} title="تعديل" className="rounded-full p-1.5 text-slate-300 hover:bg-amber-50 hover:text-amber-600">
        <Pencil className="h-4 w-4" />
      </button>
    )
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="name" defaultValue={initialName} required className="w-36" placeholder="الاسم" />
      {initialOrder !== undefined && (
        <Input name="order" type="number" defaultValue={initialOrder} className="w-16" dir="ltr" />
      )}
      {yearLabel}
      <button type="submit" disabled={pending} className="rounded-full p-1.5 text-mint-dark hover:bg-mint-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="rounded-full p-1.5 text-slate-300 hover:bg-slate-100">
        <X className="h-4 w-4" />
      </button>
      <ErrorBox error={state?.error} />
    </form>
  )
}

function SectionTitle({ icon: Icon, title, sub }: { icon: typeof Layers; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
        <Icon className="h-5 w-5 text-slate-500" />
      </div>
      <div>
        <h2 className="font-black text-navy">{title}</h2>
        <p className="text-xs text-slate-400">{sub}</p>
      </div>
    </div>
  )
}

export function StructureClient({ years, subjects }: Props) {
  const [showYearsForm, setShowYearsForm] = useState(false)
  const [showSubjectsForm, setShowSubjectsForm] = useState(false)
  const [expandedYear, setExpandedYear] = useState<string | null>(null)

  const [yearState, yearAction, yearPending] = useActionState(createYearAction, null)
  const [deptState, deptAction, deptPending] = useActionState(createDepartmentAction, null)
  const [subjectState, subjectAction, subjectPending] = useActionState(createSubjectAction, null)

  const yearOf = (subject: SubjectItem) => years.find((y) => y.id === subject.yearId)

  return (
    <div className="space-y-6">
      {/* ============ السنوات الدراسية ============ */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex items-center justify-between">
          <SectionTitle icon={GraduationCap} title="المراحل الدراسية" sub="السنة الدراسية التي ينضم إليها الطلاب" />
          <button onClick={() => setShowYearsForm((v) => !v)} className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-600 hover:bg-amber-100">
            {showYearsForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            إضافة مرحلة
          </button>
        </div>

        {showYearsForm && (
          <form action={yearAction} className="mb-5 rounded-2xl bg-slate-50 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Field label="اسم المرحلة" required>
                <Input name="name" placeholder="مثال: الصف الثالث الثانوي" required />
              </Field>
              <Field label="الترتيب">
                <Input name="order" type="number" defaultValue={0} dir="ltr" className="w-24 text-left" />
              </Field>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button type="submit" size="sm" disabled={yearPending}>
                {yearPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                حفظ
              </Button>
              <ErrorBox error={yearState?.error} />
            </div>
          </form>
        )}

        <div className="space-y-3">
          {years.map((year) => (
            <div key={year.id} className="overflow-hidden rounded-2xl border border-slate-100">
              <div className="flex items-center justify-between gap-2 bg-slate-50/60 px-4 py-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => setExpandedYear(expandedYear === year.id ? null : year.id)} className="text-slate-400 hover:text-slate-600">
                    {expandedYear === year.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <div>
                    <p className={`font-black ${year.isActive ? "text-navy" : "text-slate-400 line-through"}`}>{year.name}</p>
                    <p className="text-[11px] text-slate-400">{year.coursesCount} كورس • {year.usersCount} طالب • {year.departments.length} شعبة</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <InlineEdit id={year.id} initialName={year.name} initialOrder={year.order} action={updateYearAction} />
                  <ToggleDelete id={year.id} isActive={year.isActive} onToggle={toggleYearAction} onDelete={deleteYearAction} />
                </div>
              </div>

              {expandedYear === year.id && (
                <div className="border-t border-slate-100 p-4">
                  <form action={deptAction} className="mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3">
                    <input type="hidden" name="yearId" value={year.id} />
                    <div>
                      <label className="mb-1 block text-[11px] font-black text-slate-500">اسم الشعبة</label>
                      <Input name="name" placeholder="مثال: علمي علوم" required />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-black text-slate-500">الترتيب</label>
                      <Input name="order" type="number" defaultValue={0} dir="ltr" className="w-20 text-left" />
                    </div>
                    <Button type="submit" size="sm" disabled={deptPending}>
                      {deptPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      إضافة شعبة
                    </Button>
                    <ErrorBox error={deptState?.error} />
                  </form>

                  {year.departments.length === 0 ? (
                    <p className="py-2 text-center text-xs text-slate-400">لا توجد شعوب بعد</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {year.departments.map((dept) => (
                        <div key={dept.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2">
                          <div>
                            <p className={`text-sm font-bold ${dept.isActive ? "text-navy" : "text-slate-400 line-through"}`}>{dept.name}</p>
                            <p className="text-[11px] text-slate-400">{dept.coursesCount} كورس</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <ToggleDelete id={dept.id} isActive={dept.isActive} onToggle={toggleDepartmentAction} onDelete={deleteDepartmentAction} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ============ المواد ============ */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex items-center justify-between">
          <SectionTitle icon={BookOpen} title="المواد الدراسية" sub="المواد المعروضة في «مواد طريق النور» على الرئيسية" />
          <button onClick={() => setShowSubjectsForm((v) => !v)} className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-600 hover:bg-amber-100">
            {showSubjectsForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            إضافة مادة
          </button>
        </div>

        {showSubjectsForm && (
          <form action={subjectAction} className="mb-5 rounded-2xl bg-slate-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="اسم المادة" required>
                <Input name="name" placeholder="مثال: الكيمياء" required />
              </Field>
              <Field label="الأيقونة">
                <Input name="icon" placeholder="🧪" dir="ltr" className="text-left" />
              </Field>
              <Field label="اللون">
                <Input name="color" placeholder="#22c55e" dir="ltr" className="text-left" />
              </Field>
              <Field label="المرحلة">
                <Select name="yearId" defaultValue="">
                  <option value="">كل المراحل</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button type="submit" size="sm" disabled={subjectPending}>
                {subjectPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                حفظ
              </Button>
              <ErrorBox error={subjectState?.error} />
            </div>
          </form>
        )}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((subject) => (
            <div key={subject.id} className="flex items-center justify-between gap-2 rounded-2xl border border-slate-100 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-base"
                  style={{ backgroundColor: `${subject.color ?? "#64748b"}1a`, color: subject.color ?? "#64748b" }}
                >
                  {subject.icon ?? "📘"}
                </span>
                <div>
                  <p className={`text-sm font-bold ${subject.isActive ? "text-navy" : "text-slate-400 line-through"}`}>{subject.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {subject.coursesCount} كورس {subject.yearId && yearOf(subject) ? `• ${yearOf(subject)!.name}` : ""}
                  </p>
                </div>
              </div>
              <ToggleDelete id={subject.id} isActive={subject.isActive} onToggle={toggleSubjectAction} onDelete={deleteSubjectAction} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
