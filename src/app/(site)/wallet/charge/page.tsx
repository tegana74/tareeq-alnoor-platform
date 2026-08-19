import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { WalletChargeForm } from "./charge-form"

export const metadata: Metadata = { title: "شحن المحفظة" }

export default async function WalletChargePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const settings = await prisma.setting.findMany({
    where: { key: { in: ["payment.vodafone", "payment.instapay"] } },
  })
  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="hover:text-amber-600">
          الرئيسية
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <Link href="/wallet" className="hover:text-amber-600">
          المحفظة
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-bold text-navy">شحن المحفظة</span>
      </nav>

      <div className="mb-6 rounded-2xl bg-mint-50 p-4 text-sm leading-7 text-mint-dark">
        💡 ادفع مبلغ الشحن عبر فودافون كاش أو انستاباي ثم أرسل إثبات الدفع، وسيتم إضافة الرصيد إلى
        محفظتك فور تأكيد الأدمن — ثم ادفع ثمن الكورسات من محفظتك مباشرة.
      </div>

      <WalletChargeForm
        vodafone={settingsMap["payment.vodafone"] ?? "01021416244"}
        instapay={settingsMap["payment.instapay"] ?? "01116544383"}
      />
    </div>
  )
}
