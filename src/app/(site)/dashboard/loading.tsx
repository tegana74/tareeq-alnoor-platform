import { Card } from "@/components/ui/card"
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6" aria-busy="true">
      {/* Welcome */}
      <Skeleton className="h-9 w-56" rounded="lg" />
      <Skeleton className="mt-3 h-5 w-44" />

      {/* Today's task */}
      <Card className="mt-8 p-6">
        <Skeleton className="mb-3 h-4 w-36" />
        <Skeleton className="mb-2 h-6 w-3/4" />
        <Skeleton className="h-4 w-40" />
        <div className="mt-5 flex items-center justify-between gap-4">
          <Skeleton className="h-2.5 flex-1" rounded="full" />
          <Skeleton className="h-11 w-32" rounded="xl" />
        </div>
      </Card>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="space-y-10">
          {/* My courses */}
          <section>
            <Skeleton className="mb-5 h-6 w-24" />
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <Card key={i} className="space-y-3 p-5">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-2 w-full" rounded="full" />
                  <div className="flex justify-between pt-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-9 w-20" rounded="lg" />
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {/* Results */}
          <section>
            <Skeleton className="mb-5 h-6 w-28" />
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Card key={i} className="flex items-center justify-between p-4">
                  <div className="min-w-0 flex-1">
                    <Skeleton className="mb-2 h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-7 w-14 rounded-full" />
                </Card>
              ))}
            </div>
          </section>
        </div>

        {/* Right rail */}
        <aside className="space-y-8">
          {[0, 1].map((i) => (
            <section key={i}>
              <Skeleton className="mb-4 h-5 w-32" />
              <Card className="space-y-3 p-4">
                <SkeletonCard className="border-0 p-0 shadow-none" />
              </Card>
            </section>
          ))}
          <Card className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </Card>
        </aside>
      </div>
    </div>
  )
}
