import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { BadgeCheck, ChevronLeft, Wallet } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { isSubscribed } from "@/lib/subscriptions"
import { formatPrice } from "@/lib/utils"
import { PAYMENT } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { PaymentForm } from "./payment-form"
import { WalletPayButton } from "./wallet-pay-button"

interface SubscribePageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: SubscribePageProps): Promise<Metadata> {
  const { id } = await params
  const course = await prisma.course.findUnique({ where: { id } })
  return { title: `اشترك في ${course?.name ?? ""}` }
}

export default async function SubscribePage({ params }: SubscribePageProps) {
  const { id: courseId } = await params
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const [course, settings, paymentInvoices] = await Promise.all([
    prisma.course.findUnique({
      where: { id: courseId },
      include: { teacher: true },
    }),
    prisma.setting.findMany({ where: { key: { in: ["payment.vodafone", "payment.instapay"] } } }),
    prisma.invoice.findMany({
      where: { userId: user.id, courseId, type: "SUBSCRIBE" },
      orderBy: { createdAt: "desc" },
    }),
  ])

  if (!course) notFound()

  const subscribed = await isSubscribed(user.id, courseId)
  if (subscribed) redirect(`/courses/${courseId}/sections`)

  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))
  const pendingInvoice = paymentInvoices.find((i) => i.status === "PENDING")
  const walletBalance = Number(user.walletBalance)
  const coursePrice = Number(course.price)

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/courses" className="hover:text-amber-600">
          الكورسات
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <Link href={`/courses/${courseId}`} className="hover:text-amber-600">
          {course.name}
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-bold text-navy">الاشتراك</span>
      </nav>

      <div className="mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-l from-navy to-royal p-6 text-white">
          <h1 className="text-2xl font-black">اشترك في {course.name}</h1>
          <p className="mt-1 text-sm text-slate-300">بواسطة الأستاذ {course.teacher.name}</p>
          <div className="mt-4 flex items-end gap-2">
            <span className="text-4xl font-black text-amber-400">{formatPrice(Number(course.price))}</span>
            <span className="pb-1 text-sm text-slate-300">جنيه مصري</span>
          </div>
        </div>

        <div className="space-y-3 p-6">
          <h2 className="font-black text-navy">ماذا تحصل عليه؟</h2>
          {[
            "مشاهدة جميع المحاضرات المسجلة على مدار العام",
            "الكتب والملفات والملازم الخاصة بالكورس",
            "الامتحانات والواجبات مع التصحيح الآلي",
            "متابعة نسبة إنجازك وتقدمك الدراسي",
            "نقاط وتحديات لتحفيزك على المذاكرة",
          ].map((feature) => (
            <div key={feature} className="flex items-center gap-3 text-sm font-bold text-slate-700">
              <BadgeCheck className="h-5 w-5 shrink-0 text-mint" />
              {feature}
            </div>
          ))}
        </div>
      </div>

      {pendingInvoice ? (
        <div className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-6 text-center">
          <p className="text-lg font-black text-amber-800">⏳ طلبك قيد المراجعة</p>
          <p className="mt-1 text-sm text-amber-700">
            أرسلت طلب دفع بتاريخ {pendingInvoice.createdAt.toLocaleDateString("ar-EG")} بقيمة{" "}
            {formatPrice(pendingInvoice.amount)} وسيتم تفعيل الاشتراك فور تأكيد الأدمن.
          </p>
          <p className="mt-2 text-sm font-bold text-amber-700">
            تابع حالة طلباتك من صفحة فواتيري.
          </p>
        </div>
      ) : (
        <PaymentForm
          courseId={courseId}
          courseName={course.name}
          price={coursePrice}
          vodafone={settingsMap["payment.vodafone"] ?? PAYMENT.vodafoneCash}
          instapay={settingsMap["payment.instapay"] ?? PAYMENT.instaPay}
          walletBalance={walletBalance}
        />
      )}

      {walletBalance > 0 && !pendingInvoice && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-mint-200 bg-mint-50 p-4">
          <div className="flex items-center gap-3">
            <Wallet className="h-6 w-6 text-mint-dark" />
            <div>
              <p className="font-black text-navy">رصيد محفظتك: {formatPrice(walletBalance)}</p>
              <p className="text-xs text-slate-500">
                {walletBalance >= coursePrice ? "يمكنك الدفع من المحفظة مباشرة" : "رصيدك لا يكفي — اشحن محفظتك"}
              </p>
            </div>
          </div>
          {walletBalance >= coursePrice ? (
            <WalletPayButton courseId={courseId} price={coursePrice} />
          ) : (
            <Button href="/wallet/charge" variant="outline">
              شحن المحفظة
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
