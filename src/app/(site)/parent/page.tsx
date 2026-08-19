import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Award, BookOpenCheck, ChevronLeft, Coins, Sparkles, UserRound, UsersRound, Wallet } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { AddChildForm } from "./add-child-form"

export const metadata: Metadata = { title: "لوحة ولي الأمر" }

export default async function ParentDashboardPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== "PARENT") redirect("/login")

  const links = await prisma.parentChildLink.findMany({
    where: { parentId: user.id },
    include: {
      child: {
        include: {
          year: true,
          department: true,
          subscriptions: { where: { status: "active" } },
          examAttempts: {
            where: { status: "graded" },
            select: { score: true, totalScore: true, createdAt: true, exam: { select: { title: true } } },
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  const childStats = (child: (typeof links)[number]["child"]) => {
    const attempts = child.examAttempts
    const totalPct = attempts.reduce((sum, a) => sum + (Number(a.totalScore) > 0 ? (Number(a.score) / Number(a.totalScore)) * 100 : 0), 0)
    const avg = attempts.length ? Math.round(totalPct / attempts.length) : null
    return { attempts, avg }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="hover:text-amber-600">
          الرئيسية
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-bold text-navy">لوحة ولي الأمر</span>
      </nav>

      <h1 className="mb-2 flex items-center gap-2 text-2xl font-black text-navy">
        <UsersRound className="h-7 w-7 text-amber-500" />
        لوحة ولي الأمر
      </h1>
      <p className="mb-8 text-sm text-slate-500">
        تابع تقدم أبنائك في المذاكرة والامتحانات والنقاط، واربط حساباتهم برقم هاتفهم وكود التحقق.
      </p>

      {links.length === 0 ? (
        <div className="mb-8 rounded-3xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
          <UserRound className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="font-black text-navy">لا يوجد أبناء مربوطون بعد</p>
          <p className="mt-1 text-sm text-slate-400">أضف حساب ابنك من الأسفل برقم هاتفه لبدء المتابعة</p>
        </div>
      ) : (
        <div className="mb-8 grid gap-5 sm:grid-cols-2">
          {links.map(({ child }) => {
            const { attempts, avg } = childStats(child)
            const activeSubs = child.subscriptions.length
            return (
              <div key={child.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-lg font-black text-amber-700">
                      {child.firstName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-black text-navy">{child.firstName} {child.lastName}</p>
                      <p className="text-xs text-slate-400" dir="ltr">
                        {child.phone}
                      </p>
                    </div>
                  </div>
                  <RemoveChildButton childId={child.id} />
                </div>

                <p className="mb-4 text-sm text-slate-500">
                  {child.year ? child.year.name : "بدون مرحلة"}
                  {child.department ? ` • ${child.department.name}` : ""}
                </p>

                <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-mint-50 py-3">
                    <Award className="mx-auto mb-1 h-4 w-4 text-mint-dark" />
                    <p className="text-sm font-black text-navy">{child.points}</p>
                    <p className="text-[10px] text-slate-400">نقطة</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 py-3">
                    <BookOpenCheck className="mx-auto mb-1 h-4 w-4 text-amber-600" />
                    <p className="text-sm font-black text-navy">{avg === null ? "—" : `${avg}%`}</p>
                    <p className="text-[10px] text-slate-400">متوسط الدرجات</p>
                  </div>
                  <div className="rounded-2xl bg-sky-50 py-3">
                    <Coins className="mx-auto mb-1 h-4 w-4 text-sky-600" />
                    <p className="text-sm font-black text-navy">{activeSubs}</p>
                    <p className="text-[10px] text-slate-400">اشتراك نشط</p>
                  </div>
                </div>

                {attempts.length > 0 && (
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="mb-2 text-xs font-black text-navy">آخر الاختبارات</p>
                    <div className="space-y-1.5">
                      {attempts.map((a) => (
                        <div key={a.createdAt.toISOString()} className="flex items-center justify-between text-xs">
                          <span className="truncate text-slate-600">{a.exam.title}</span>
                          <span className={`font-black ${Number(a.score) >= Number(a.totalScore) * 0.5 ? "text-mint-dark" : "text-rose-500"}`}>
                            {Number(a.score)}/{Number(a.totalScore)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Wallet className="h-3.5 w-3.5" />
                    المحفظة: {Number(child.walletBalance).toFixed(0)} ج.م
                  </span>
                  <Link href={`/profile`} className="font-bold text-amber-600 hover:underline">
                    عرض الحساب
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 flex items-center gap-2 font-black text-navy">
          <Sparkles className="h-5 w-5 text-amber-500" />
          إضافة ابن
        </h2>
        <p className="mb-5 text-sm text-slate-500">
          أدخل رقم هاتف ابنك، ثم كود التحقق المرسل إلى هاتفه للربط. يجب أن يكون الابن مسجلاً بحساب طالب.
        </p>
        <AddChildForm />
      </div>
    </div>
  )
}

function RemoveChildButton({ childId }: { childId: string }) {
  return (
    <form
      action={async (formData: FormData) => {
        "use server"
        const { removeChildLinkAction } = await import("@/app/actions/parent")
        await removeChildLinkAction(null, formData)
      }}
    >
      <input type="hidden" name="childId" value={childId} />
      <button
        type="submit"
        className="rounded-full px-3 py-1 text-xs font-black text-rose-500 hover:bg-rose-50"
      >
        إلغاء الربط
      </button>
    </form>
  )
}
