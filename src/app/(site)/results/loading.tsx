import { Card } from "@/components/ui/card"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"

export default function ResultsLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6" aria-busy="true">
      <Skeleton className="h-9 w-48" rounded="lg" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-6">
            <Skeleton className="mb-4 h-6 w-24" />
            <Skeleton className="h-10 w-32" />
          </Card>
        ))}
      </div>
      <Card className="p-6">
        <Skeleton className="mb-4 h-6 w-40" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" rounded="lg" />
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <Skeleton className="mb-4 h-6 w-36" />
        <SkeletonText lines={5} />
      </Card>
    </div>
  )
}
