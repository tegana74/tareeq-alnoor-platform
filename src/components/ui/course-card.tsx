import Link from "next/link"
import { ClipboardList, FileText, GraduationCap, PlayCircle, Star } from "lucide-react"
import { formatPrice } from "@/lib/utils"
import { FavoriteButton } from "@/components/favorite-button"

interface CourseCardProps {
  course: {
    id: string
    name: string
    description: string | null
    price: number
    priceBeforeDiscount: number | null
    isFeatured: boolean
    teacher: { name: string }
    subject: { name: string; icon: string | null; color: string | null }
    _count?: {
      sections?: number
      videos?: number
      books?: number
      exams?: number
    }
  }
  favorite?: boolean
}

export function CourseCard({ course, favorite }: CourseCardProps) {
  const videos = course._count?.videos ?? 0
  const books = course._count?.books ?? 0
  const exams = course._count?.exams ?? 0
  const discount =
    course.priceBeforeDiscount && course.priceBeforeDiscount > course.price
      ? Math.round(((course.priceBeforeDiscount - course.price) / course.priceBeforeDiscount) * 100)
      : 0

  const isFree = course.price === 0

  const stats = [
    { count: videos, icon: PlayCircle, label: "درس" },
    { count: books, icon: FileText, label: "مذكرات" },
    { count: exams, icon: ClipboardList, label: "امتحانات" },
  ]

  return (
    <Link
      href={`/courses/${course.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm transition-all hover:-translate-y-1 hover:border-primary-300 hover:shadow-xl hover:shadow-primary-500/10"
    >
      <div
        className="relative flex h-32 items-center justify-center overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${course.subject.color ?? "#f59e0b"}22, transparent)`,
        }}
      >
        <span className="text-5xl drop-shadow-sm transition-transform group-hover:scale-110">
          {course.subject.icon ?? "📚"}
        </span>
        {discount > 0 && (
          <span className="absolute top-3 right-3 rounded-full bg-rose-500 px-2.5 py-1 text-xs font-extrabold text-white shadow">
            خصم {discount}%
          </span>
        )}
        {course.isFeatured && (
          <span className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-xs font-extrabold text-white shadow">
            <Star className="h-3 w-3 fill-white" />
            مميز
          </span>
        )}
        {favorite !== undefined && (
          <FavoriteButton
            courseId={course.id}
            initial={favorite}
            className={`absolute right-3 ${discount > 0 ? "top-14" : "top-3"}`}
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="line-clamp-2 text-base font-extrabold text-card-foreground transition-colors group-hover:text-primary">
          {course.name}
        </h3>
        <p className="line-clamp-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <GraduationCap className="h-4 w-4 shrink-0 text-primary" />
          {course.teacher.name}
        </p>

        <div className="grid grid-cols-3 rounded-xl border border-border bg-muted/30 [&>*+*]:border-s [&>*+*]:border-border">
          {stats.map(({ count, icon: Icon, label }) => (
            <span key={label} className="flex flex-col items-center gap-1 px-1 py-2 text-center">
              <Icon className="h-4 w-4 text-primary" />
              <span className="text-sm font-extrabold leading-none text-card-foreground">{count}</span>
              <span className="text-[11px] leading-none text-muted-foreground">{label}</span>
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
          {isFree ? (
            <span className="inline-flex items-center rounded-full bg-success-50 px-3 py-1 text-sm font-extrabold text-success-strong">
              مجاني
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-extrabold text-primary">{formatPrice(course.price)}</span>
              {course.priceBeforeDiscount && course.priceBeforeDiscount > course.price && (
                <span className="text-xs text-muted-foreground line-through">
                  {formatPrice(course.priceBeforeDiscount)}
                </span>
              )}
            </div>
          )}
        </div>

        <span className="block w-full rounded-xl bg-primary-500 py-2.5 text-center text-sm font-extrabold text-white transition-colors group-hover:bg-primary-600">
          عرض التفاصيل
        </span>
      </div>
    </Link>
  )
}