import { Skeleton, SkeletonCard } from "@/components/ui/skeleton"

export default function CoursesLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6" aria-busy="true">
      <Skeleton className="mb-2 h-9 w-56" rounded="lg" />
      <Skeleton className="mb-8 h-5 w-80" />
      <div className="mb-6 flex flex-wrap gap-3">
        <Skeleton className="h-12 w-full sm:w-72" rounded="xl" />
        <Skeleton className="h-12 w-40" rounded="xl" />
        <Skeleton className="h-12 w-40" rounded="xl" />
        <Skeleton className="h-12 w-40" rounded="xl" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}
