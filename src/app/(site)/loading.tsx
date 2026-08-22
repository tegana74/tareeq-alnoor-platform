export default function SiteLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
        <p className="text-sm font-medium text-slate-400">جارٍ التحميل...</p>
      </div>
    </div>
  )
}
