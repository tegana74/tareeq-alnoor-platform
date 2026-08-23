import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { Progress } from "@/components/ui/progress"

/** شريط علوي خفيف: مسار التنقل + اسم الكورس + التقدم الحقيقي */
export function LearningHeader({
  courseId,
  courseName,
  teacherName,
  percent,
  completed,
  total,
  trail,
}: {
  courseId: string
  courseName: string
  teacherName: string
  percent: number
  completed: number
  total: number
  /** عناصر إضافية بعد الكورس مثل: القسم → الدرس */
  trail?: { label: string; href?: string }[]
}) {
  return (
    <header className="mb-6">
      <nav aria-label="مسار التنقل" className="mb-3">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <li>
            <Link href="/" className="rounded transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
              الرئيسية
            </Link>
          </li>
          <li aria-hidden="true"><ChevronLeft className="h-3.5 w-3.5" /></li>
          <li>
            <Link href="/courses" className="rounded transition-colors hover:text-primary-600">الكورسات</Link>
          </li>
          <li aria-hidden="true"><ChevronLeft className="h-3.5 w-3.5" /></li>
          <li>
            <Link href={`/courses/${courseId}`} className="rounded transition-colors hover:text-primary-600">{courseName}</Link>
          </li>
          {trail?.map((t) => (
            <span key={t.label} className="contents">
              <li aria-hidden="true"><ChevronLeft className="h-3.5 w-3.5" /></li>
              <li>
                {t.href ? (
                  <Link href={t.href} className="rounded transition-colors hover:text-primary-600">{t.label}</Link>
                ) : (
                  <span aria-current="page" className="text-navy">{t.label}</span>
                )}
              </li>
            </span>
          ))}
        </ol>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-border bg-card px-5 py-4">
        <div className="min-w-0">
          <p className="truncate text-base font-black text-navy">{courseName}</p>
          <p className="text-xs text-muted-foreground">{teacherName}</p>
        </div>
        <div className="flex items-center gap-4">
          <Progress value={percent} size="sm" label={`تقدم الكورس ${percent}%`} showLabel className="w-40" />
          <p className="whitespace-nowrap text-xs font-bold text-muted-foreground" aria-label={`${completed} من ${total} محاضرة مكتملة`}>
            {completed}/{total} محاضرة
          </p>
        </div>
      </div>
    </header>
  )
}
