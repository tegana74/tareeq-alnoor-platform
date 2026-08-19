import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { formatDateTime, formatPrice } from "@/lib/utils"
import { resolveFileUrl } from "@/lib/resolve-file-url"
import { ReviewButtons } from "./review-buttons"

export const metadata: Metadata = { title: "الدفعات | لوحة الإدارة" }

const methodLabels: Record<string, string> = {
  VODAFONE_CASH: "فودافون كاش",
  INSTAPAY: "انستاباي",
  WALLET: "المحفظة",
  CODE: "كود شحن",
}

export default async function AdminPaymentsPage() {
  const invoices = await prisma.invoice.findMany({
    include: {
      user: { select: { firstName: true, lastName: true, phone: true } },
      course: { select: { name: true } },
      paymentProof: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  const pending = invoices.filter((i) => i.status === "PENDING")
  const reviewed = invoices.filter((i) => i.status !== "PENDING")

  const statusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">قيد المراجعة</span>
      case "PAID":
        return <span className="rounded-full bg-mint-50 px-3 py-1 text-xs font-bold text-mint-dark">تم التأكيد</span>
      case "REJECTED":
        return <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600">مرفوض</span>
      default:
        return <span>{status}</span>
    }
  }

  const InvoiceCard = ({ inv }: { inv: (typeof invoices)[number] }) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-black text-navy">
            {inv.course ? `اشتراك في ${inv.course.name}` : "شحن محفظة"}
          </p>
          <p className="text-sm text-slate-500">
            {inv.user.firstName} {inv.user.lastName} · {inv.user.phone}
          </p>
        </div>
        <div className="text-left">
          <p className="text-xl font-black text-amber-600">{formatPrice(inv.amount)}</p>
          <p className="text-xs text-slate-400">{methodLabels[inv.method] ?? inv.method}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 sm:grid-cols-2">
        <p><span className="font-bold text-slate-500">المرسل:</span> {inv.senderName ?? "—"}</p>
        <p><span className="font-bold text-slate-500">المرجع:</span> {inv.reference ?? "—"}</p>
        <p><span className="font-bold text-slate-500">التاريخ:</span> {formatDateTime(inv.createdAt)}</p>
        {inv.notes && <p className="sm:col-span-2"><span className="font-bold text-slate-500">ملاحظات:</span> {inv.notes}</p>}
      </div>

      {inv.proofImage && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-bold text-slate-500">إثبات الدفع:</p>
          <a
            href={resolveFileUrl(inv.proofImage)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-royal transition-colors hover:bg-royal-50"
          >
            {inv.proofImage.toLowerCase().includes(".pdf") ? "📄" : "🖼️"}
            عرض إثبات الدفع
          </a>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        {statusBadge(inv.status)}
        {inv.status === "PENDING" ? (
          <ReviewButtons invoiceId={inv.id} />
        ) : inv.status === "REJECTED" && inv.rejectedReason ? (
          <p className="text-xs font-bold text-rose-600">{inv.rejectedReason}</p>
        ) : null}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-navy">مراجعة الدفعات</h1>
        <p className="text-sm text-slate-500">تأكد من إثباتات الدفع ثم فعّل الاشتراكات أو شحن المحافظ</p>
      </div>

      {pending.length > 0 && (
        <section>
          <h2 className="mb-3 font-black text-amber-700">بانتظار المراجعة ({pending.length})</h2>
          <div className="grid gap-4">
            {pending.map((inv) => (
              <InvoiceCard key={inv.id} inv={inv} />
            ))}
          </div>
        </section>
      )}

      {reviewed.length > 0 && (
        <section>
          <h2 className="mb-3 font-black text-navy">الدفعات السابقة</h2>
          <div className="grid gap-4">
            {reviewed.map((inv) => (
              <InvoiceCard key={inv.id} inv={inv} />
            ))}
          </div>
        </section>
      )}

      {invoices.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          لا توجد طلبات دفع بعد
        </p>
      )}
    </div>
  )
}
