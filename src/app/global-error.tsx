"use client"

export default function GlobalError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-black text-rose-500">!</p>
      <h1 className="mt-4 text-2xl font-black text-navy">حدث خطأ غير متوقع</h1>
      <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
        نعتذر عن هذا الخطأ. يرجى المحاولة مرة أخرى.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-2xl bg-mint px-6 py-3 text-sm font-black text-white hover:opacity-80"
      >
        إعادة المحاولة
      </button>
    </div>
  )
}
