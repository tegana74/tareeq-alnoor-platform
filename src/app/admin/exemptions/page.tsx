import type { Metadata } from "next"
import { FileWarning } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { formatDateTime } from "@/lib/utils"
import { resolveExemptionAction } from "@/app/actions/exemptions"

export const metadata: Metadata = { title: "طلبات الإعفاء | لوحة الإدارة" }

export default async function AdminExemptionsPage() {
  const requests = await prisma.exemptionRequest.findMany({
    include: { user: { select: { firstName: true, lastName: true, phone: true } } },
    orderBy: { createdAt: "desc" },
  })

  const pending = requests.filter((r) => r.status === "pending")

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100">
          <FileWarning className="h-6 w-6 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-black text-navy">طلبات الإعفاء</h1>
          <p className="text-sm text-slate-500">{pending.length} طلب قيد المراجعة</p>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          لا توجد طلبات إعفاء
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="font-black text-navy">
                  {r.user.firstName} {r.user.lastName}
                  <span className="mr-2 text-sm font-bold text-slate-500" dir="ltr">({r.user.phone})</span>
                </p>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ${
                    r.status === "approved"
                      ? "bg-mint-50 text-mint-dark"
                      : r.status === "rejected"
                        ? "bg-rose-50 text-rose-600"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {r.status === "approved" ? "مقبول" : r.status === "rejected" ? "مرفوض" : "قيد المراجعة"}
                </span>
              </div>
              <p className="font-bold text-slate-800">{r.reason}</p>
              {r.details && <p className="mt-1 text-sm text-slate-600">{r.details}</p>}
              <p className="mt-2 text-xs text-slate-400">
                {formatDateTime(r.createdAt)}
                {r.reviewedAt && <span className="mr-2">· مراجعة {formatDateTime(r.reviewedAt)}</span>}
              </p>

              {r.status === "pending" && (
                <form action={resolveExemptionAction} className="mt-4 flex items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    type="submit"
                    name="status"
                    value="approved"
                    className="rounded-full bg-mint-500 px-4 py-1.5 text-sm font-black text-white hover:bg-mint-600"
                  >
                    قبول
                  </button>
                  <button
                    type="submit"
                    name="status"
                    value="rejected"
                    className="rounded-full bg-rose-500 px-4 py-1.5 text-sm font-black text-white hover:bg-rose-600"
                  >
                    رفض
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
