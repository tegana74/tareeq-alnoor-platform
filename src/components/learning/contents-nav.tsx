import Link from "next/link"
import { BookOpen, CheckCircle2, ChevronDown, ChevronLeft, FileText, Lock, PlayCircle } from "lucide-react"
import { classNames } from "@/lib/utils"
import type { FlatItem, LearningKind, SectionProgress } from "@/lib/learning-shell"
import { Badge } from "@/components/ui/badge"

const kindIcon = { video: PlayCircle, book: BookOpen, exam: FileText } as const

function ItemRow({
  courseId,
  sectionId,
  item,
  active,
}: {
  courseId: string
  sectionId: string
  item: FlatItem
  active: boolean
}) {
  const Icon = item.status === "locked" ? Lock : item.status === "done" ? CheckCircle2 : kindIcon[item.kind]
  const locked = item.status === "locked"

  const rowClass = classNames(
    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400",
    active
      ? "bg-primary-100 font-bold text-primary-700"
      : locked
        ? "text-muted-foreground/70"
        : "text-muted-foreground hover:bg-primary-50 hover:text-primary-600"
  )

  const inner = (
    <>
      <Icon
        className={classNames(
          "h-4 w-4 shrink-0",
          item.status === "done" && !active ? "text-success-strong" : locked ? "" : active ? "text-primary-700" : "text-primary-500"
        )}
        aria-hidden="true"
      />
      <span className="line-clamp-1 flex-1">{item.title}</span>
      {item.free && !active && (
        <span className="shrink-0 rounded-full bg-success-50 px-1.5 py-0.5 text-[10px] font-bold text-success-strong">
          مجاني
        </span>
      )}
      {locked && <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
    </>
  )

  if (locked) {
    return (
      <div className={rowClass} aria-disabled="true" title="يتطلب اشتراكاً نشطاً">
        {inner}
      </div>
    )
  }

  return (
    <Link
      href={`/courses/${courseId}/sections/${sectionId}/${item.kind as LearningKind}/${item.id}`}
      className={rowClass}
      {...(active ? { "aria-current": "page" as const } : {})}
    >
      {inner}
    </Link>
  )
}

/** قائمة محتوى الكورس الكاملة — aside على الشاشات الكبيرة، details قابل للطي على الموبايل */
export function ContentsNav({
  courseId,
  courseName,
  flat,
  currentIndex,
  sectionsProgress,
}: {
  courseId: string
  courseName: string
  flat: FlatItem[]
  /** فهرس العنصر الحالي — للتمييز حتى لو كان العنصر مكتملًا */
  currentIndex?: number
  sectionsProgress?: SectionProgress[]
}) {
  const sectionPercent = new Map((sectionsProgress ?? []).map((s) => [s.id, s.percent]))
  const sections: { id: string; name: string; items: { item: FlatItem; index: number }[] }[] = []
  flat.forEach((item, index) => {
    let s = sections.find((x) => x.id === item.sectionId)
    if (!s) {
      s = { id: item.sectionId, name: item.sectionName, items: [] }
      sections.push(s)
    }
    s.items.push({ item, index })
  })

  const list = (
    <nav aria-label="محتوى الكورس" className="space-y-4">
      {sections.map((section, si) => (
        <div key={section.id}>
          <p className="mb-1.5 flex items-center gap-2 px-1 text-xs font-black text-navy">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-primary-100 text-[10px] text-primary-700" aria-hidden="true">
              {si + 1}
            </span>
            <span className="truncate">{section.name}</span>
            {(() => {
              const sp = sectionPercent.get(section.id)
              return sp !== undefined ? (
                <Badge variant={sp >= 100 ? "success" : "primary"} size="sm">
                  {sp}%
                </Badge>
              ) : null
            })()}
          </p>
          <ul className="space-y-0.5">
            {section.items.map(({ item, index }) => (
              <li key={`${item.kind}-${item.id}`}>
                <ItemRow
                  courseId={courseId}
                  sectionId={item.sectionId}
                  item={item}
                  active={
                    item.status === "current" || (currentIndex !== undefined && index === currentIndex)
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )

  return (
    <>
      {/* موبايل — قابل للطي */}
      <details className="mb-6 lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-black text-navy [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
          <span>محتوى الكورس — {courseName}</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-3 rounded-2xl border border-border bg-card p-4">{list}</div>
      </details>

      {/* سطح المكتب */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-border bg-card p-4">
          {list}
        </div>
      </aside>
    </>
  )
}

/** السابق / التالي — يتخطيان المقفول، أسهم متوافقة مع RTL */
export function PrevNextNav({
  prev,
  next,
  courseId,
}: {
  prev: FlatItem | null
  next: FlatItem | null
  courseId: string
}) {
  const btn =
    "inline-flex h-11 max-w-[48%] items-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
  const linkFor = (item: FlatItem) =>
    `/courses/${courseId}/sections/${item.sectionId}/${item.kind}/${item.id}`

  return (
    <nav aria-label="الدرس السابق والتالي" className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">
      {prev ? (
        <Link href={linkFor(prev)} className={classNames(btn, "border-2 border-border text-muted-foreground hover:border-primary-300 hover:text-primary-600")}>
          <ChevronLeft className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
          <span className="min-w-0"><span className="block text-[10px] opacity-70">السابق</span><span className="line-clamp-1">{prev.title}</span></span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={linkFor(next)} className={classNames(btn, "bg-primary-50 text-primary-700 hover:bg-primary-100")}>
          <span className="min-w-0 text-end"><span className="block text-[10px] opacity-70">التالي</span><span className="line-clamp-1">{next.title}</span></span>
          <ChevronLeft className="h-4 w-4 shrink-0 rotate-180" aria-hidden="true" />
        </Link>
      )}
    </nav>
  )
}
