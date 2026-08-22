import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-black text-amber-500">404</p>
      <h1 className="mt-4 text-2xl font-black text-navy">الصفحة غير موجودة</h1>
      <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
        عذراً، الصفحة التي تبحث عنها غير موجودة أو تم نقلها إلى مكان آخر.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-2xl bg-mint px-6 py-3 text-sm font-black text-white hover:opacity-80"
      >
        العودة للرئيسية
      </Link>
    </div>
  )
}
