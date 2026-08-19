import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Heart } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { CourseCard } from "@/components/ui/course-card"

export const metadata: Metadata = { title: "المفضلة" }

export default async function FavoritesPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (user.role !== "STUDENT") return null

  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    include: {
      course: {
        include: {
          teacher: true,
          subject: true,
          sections: { include: { _count: { select: { videos: true, books: true, exams: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const cards = favorites.map((f) => {
    const c = f.course
    const _count = c.sections.reduce(
      (acc, s) => {
        acc.videos += s._count.videos
        acc.books += s._count.books
        acc.exams += s._count.exams
        return acc
      },
      { sections: c.sections.length, videos: 0, books: 0, exams: 0 }
    )
    const { sections: _sections, ...rest } = c
    return {
      ...rest,
      _count,
      price: Number(c.price),
      priceBeforeDiscount: c.priceBeforeDiscount ? Number(c.priceBeforeDiscount) : null,
    }
  })

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-2xl font-black text-navy">كورساتي المفضلة</h1>
      <p className="mb-8 text-sm text-slate-500">احفظ الكورسات التي تهمك لتعود إليها بسرعة</p>

      {cards.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
          <Heart className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-bold text-slate-500">لا توجد كورسات مفضلة بعد</p>
          <Link href="/courses" className="mt-2 inline-block text-sm font-black text-amber-600 hover:underline">
            تصفّح الكورسات
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <CourseCard key={c.id} course={c} favorite />
          ))}
        </div>
      )}
    </div>
  )
}
