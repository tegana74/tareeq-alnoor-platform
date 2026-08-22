import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft, FileWarning } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { formatDateTime } from "@/lib/utils"
import { ExemptionForm } from "@/components/exemption-form"

export const metadata: Metadata = { title: "طلبات الإعفاء" }

export default async function ExemptionsPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== "STUDENT") redirect("/login")

  const requests = await prisma.exemptionRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  })

  const badge = (s: string) =>
    s === "approved" ? "bg-mint-50 text-mint-dark" : s === "rejected" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700"
  const text = (s: string) => (s === "approved" ? "مقبول" : s === "rejected" ? "مرفوض" : "قيد المراجعة")

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="hover:text-amber-600">
          الرئيسية
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-bold text-navy">طلبات الإعفاء</span>
      </nav>

      <h1 className="mb-2 flex items-center gap-2 text-2xl font-black text-navy">
        <FileWarning className="h-7 w-7 text-amber-500" />
        طلبات الإعفاء
      </h1>
      <p className="mb-8 text-sm text-slate-500">
        استخدم هذه الصفحة لطلب إعفاء من موعد أو ظرف خاص، وسيراجعه فريق الإدارة.
      </p>

      <div className="mb-8 rounded-3xl border border-slate-200 bg-white p-6">
        <h2 className="mb-5 font-black text-navy">طلب جديد</h2>
        <ExemptionForm />
      </div>

      <h2 className="mb-3 font-black text-navy">طلباتك السابقة</h2>
      {requests.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          لا توجد طلبات سابقة
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-black text-navy">{r.reason}</p>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${badge(r.status)}`}>{text(r.status)}</span>
              </div>
              {r.details && <p className="text-sm text-slate-600">{r.details}</p>}
              <p className="mt-2 text-xs text-slate-400">
                {formatDateTime(r.createdAt)}
                {r.reviewedAt && <span className="ms-2">· تمت المراجعة {formatDateTime(r.reviewedAt)}</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
