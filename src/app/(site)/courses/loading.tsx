import { Skeleton, SkeletonCard } from "@/components/ui/skeleton"

export default function CoursesLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6" aria-busy="true">
      <Skeleton className="mb-2 h-9 w-40" rounded="lg" />
      <Skeleton className="h-5 w-96 max-w-full" />

      {/* شريط البحث */}
      <div className="mt-8 mb-4">
        <Skeleton className="h-13 w-full" rounded="xl" />
      </div>

      {/* زر فلاتر الموبايل (يظهر فقط على الشاشات الصغيرة بصريًا في الصفحة الفعلية) */}
      <div className="mb-6 lg:hidden">
        <Skeleton className="h-12 w-full max-w-xs" rounded="xl" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* عمود الفلاتر - سطح المكتب */}
        <div className="hidden space-y-5 lg:block" aria-hidden="true">
          {[3, 4, 2].map((rows, gi) => (
            <div key={gi} className="rounded-2xl border border-border bg-card p-5">
              <Skeleton className="mb-4 h-4 w-24" />
              <div className="space-y-2.5">
                {Array.from({ length: rows }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" rounded="lg" />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* شبكة الكورسات */}
        <div>
          <Skeleton className="mb-5 h-4 w-32" />
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
