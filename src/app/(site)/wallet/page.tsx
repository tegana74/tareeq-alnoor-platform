import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, Clock, Wallet as WalletIcon } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { formatDateTime, formatPrice } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { classNames } from "@/lib/utils"
import { RedeemCodeForm } from "./redeem-code-form"

export const metadata: Metadata = { title: "المحفظة وفواتيري" }

export default async function WalletPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const [invoices, transactions] = await Promise.all([
    prisma.invoice.findMany({
      where: { userId: user.id },
      include: { course: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.walletTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ])

  const statusLabels: Record<string, { text: string; cls: string }> = {
    PENDING: { text: "قيد المراجعة", cls: "bg-amber-50 text-amber-700" },
    PAID: { text: "تم الدفع", cls: "bg-mint-50 text-mint-dark" },
    REJECTED: { text: "مرفوض", cls: "bg-rose-50 text-rose-600" },
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="hover:text-amber-600">
          الرئيسية
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-bold text-navy">المحفظة</span>
      </nav>

      <div className="mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-l from-royal to-navy p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
                <WalletIcon className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm text-slate-300">رصيد المحفظة</p>
                <p className="text-3xl font-black">{formatPrice(user.walletBalance)}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <RedeemCodeForm />
              <Button href="/wallet/charge" variant="primary">
                شحن المحفظة
              </Button>
            </div>
          </div>
        </div>
      </div>

      <h2 className="mb-4 text-lg font-black text-navy">حركة المحفظة</h2>
      {transactions.length === 0 ? (
        <p className="mb-8 rounded-2xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-400">
          لا توجد حركات بعد
        </p>
      ) : (
        <div className="mb-8 divide-y divide-slate-50 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {transactions.map((t) => {
            const isCredit = Number(t.amount) >= 0
            return (
              <div key={t.id} className="flex items-center gap-4 px-5 py-4">
                <span
                  className={classNames(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    isCredit ? "bg-mint-50 text-mint-dark" : "bg-rose-50 text-rose-600"
                  )}
                >
                  {isCredit ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                </span>
                <div className="flex-1">
                  <p className="font-bold text-navy">{t.description ?? t.type}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(t.createdAt)}</p>
                </div>
                <p className={classNames("font-black", isCredit ? "text-mint-dark" : "text-rose-600")}>
                  {isCredit ? "+" : "−"}{formatPrice(Math.abs(Number(t.amount)))}
                </p>
              </div>
            )
          })}
        </div>
      )}

      <h2 className="mb-4 text-lg font-black text-navy">فواتيري</h2>
      {invoices.length === 0 ? (
        <p className="rounded-2xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-400">
          لا توجد فواتير بعد — اشترك في كورس من <Link className="font-bold text-amber-600" href="/courses">هنا</Link>
        </p>
      ) : (
        <div className="divide-y divide-slate-50 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {invoices.map((inv) => {
            const status = statusLabels[inv.status] ?? { text: inv.status, cls: "bg-slate-100 text-slate-600" }
            const isSubscribe = inv.type === "SUBSCRIBE"
            return (
              <div key={inv.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span
                  className={classNames(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black",
                    isSubscribe ? "bg-amber-50 text-amber-600" : "bg-violet-50 text-violet-600"
                  )}
                >
                  {isSubscribe ? "📚" : "💰"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-navy">
                    {isSubscribe ? `اشتراك في ${inv.course?.name ?? "كورس"}` : "شحن المحفظة"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(inv.createdAt)} · مرجع: {inv.reference ?? "—"}
                  </p>
                  {inv.status === "REJECTED" && inv.rejectedReason && (
                    <p className="mt-0.5 text-xs font-bold text-rose-600">السبب: {inv.rejectedReason}</p>
                  )}
                </div>
                <span className={classNames("rounded-full px-3 py-1 text-xs font-bold", status.cls)}>
                  {status.text}
                </span>
                <p className="font-black text-navy">{formatPrice(inv.amount)}</p>
                {inv.status === "PENDING" && (
                  <span className="flex items-center gap-1 text-xs font-bold text-amber-600">
                    <Clock className="h-3.5 w-3.5" />
                    بانتظار التأكيد
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
