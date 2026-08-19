import Link from "next/link"
import { BookOpen, FileText, GraduationCap, PlayCircle, Star } from "lucide-react"
import { formatPrice } from "@/lib/utils"
import { classNames } from "@/lib/utils"
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

  return (
    <Link
      href={`/courses/${course.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:border-amber-300 hover:shadow-xl hover:shadow-amber-500/10"
    >
      <div
        className="relative flex h-32 items-center justify-center overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${course.subject.color ?? "#f59e0b"}22, #ffffff)`,
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
        <h3 className="line-clamp-2 text-base font-extrabold text-navy group-hover:text-amber-600 transition-colors">
          {course.name}
        </h3>
        <p className="line-clamp-1 flex items-center gap-1.5 text-sm text-slate-500">
          <GraduationCap className="h-4 w-4 shrink-0 text-amber-500" />
          {course.teacher.name}
        </p>

        <div className="mt-auto flex items-center gap-3 text-xs text-slate-500">
          {videos > 0 && (
            <span className="flex items-center gap-1">
              <PlayCircle className="h-4 w-4" /> {videos}
            </span>
          )}
          {books > 0 && (
            <span className="flex items-center gap-1">
              <BookOpen className="h-4 w-4" /> {books}
            </span>
          )}
          {exams > 0 && (
            <span className="flex items-center gap-1">
              <FileText className="h-4 w-4" /> {exams}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold text-amber-600">
              {formatPrice(course.price)}
            </span>
            {course.priceBeforeDiscount && course.priceBeforeDiscount > course.price && (
              <span className="text-sm text-slate-400 line-through">
                {formatPrice(course.priceBeforeDiscount)}
              </span>
            )}
          </div>
          <span
            className={classNames(
              "rounded-lg px-3 py-1.5 text-xs font-bold",
              "bg-amber-100 text-amber-700 group-hover:bg-amber-500 group-hover:text-white transition-colors"
            )}
          >
            التفاصيل
          </span>
        </div>
      </div>
    </Link>
  )
}
