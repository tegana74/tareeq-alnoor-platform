export default function OfflinePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-black text-amber-500">📡</p>
      <h1 className="mt-4 text-2xl font-black text-navy">لا يوجد اتصال بالإنترنت</h1>
      <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
        يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.
      </p>
    </div>
  )
}
