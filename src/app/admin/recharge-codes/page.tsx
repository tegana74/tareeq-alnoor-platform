import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { formatDateTime, formatPrice } from "@/lib/utils"
import { GenerateCodesForm } from "./recharge-form"

export const metadata: Metadata = { title: "أكواد الشحن | لوحة الإدارة" }

export default async function AdminRechargeCodesPage() {
  const codes = await prisma.insertCode.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { usages: { include: { user: true }, take: 1 } },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-navy">أكواد الشحن</h1>
        <p className="text-sm text-slate-500">أكواد يشتريها الطلاب من منافذ البيع ويضيفون قيمتها للمحفظة</p>
      </div>

      <GenerateCodesForm />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-right text-xs text-slate-400">
                <th className="px-5 py-3">الكود</th>
                <th className="px-5 py-3">القيمة</th>
                <th className="px-5 py-3">المنفذ</th>
                <th className="px-5 py-3">الحالة</th>
                <th className="px-5 py-3">المستخدم</th>
                <th className="px-5 py-3">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {codes.map((c) => {
                const usage = c.usages[0]
                return (
                  <tr key={c.id}>
                    <td className="px-5 py-3 font-mono font-black text-navy" dir="ltr">
                      {c.code}
                    </td>
                    <td className="px-5 py-3 font-bold text-navy">{formatPrice(c.value)}</td>
                    <td className="px-5 py-3 text-slate-500">{c.center ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          c.isUsed ? "bg-slate-100 text-slate-500" : "bg-mint-50 text-mint-dark"
                        }`}
                      >
                        {c.isUsed ? "مستخدم" : "متاح"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {usage ? `${usage.user.firstName} ${usage.user.lastName}` : "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">
                      {c.isUsed && usage ? formatDateTime(usage.createdAt) : formatDateTime(c.createdAt)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {codes.length === 0 && <p className="p-8 text-center text-sm text-slate-400">لا توجد أكواد بعد</p>}
      </div>
    </div>
  )
}
