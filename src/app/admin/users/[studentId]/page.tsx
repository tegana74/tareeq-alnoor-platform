import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft, BookOpen, Calendar, CreditCard, Phone, Lock, User } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { formatDate, formatPrice } from "@/lib/utils"

export const metadata: Metadata = { title: "بيانات الطالب | لوحة الإدارة" }

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    include: {
      year: true,
      department: true,
      subscriptions: {
        include: {
          course: { select: { name: true, price: true, subject: { select: { name: true, icon: true } } } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!student || student.role !== "STUDENT") notFound()

  return (
    <div className="space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-amber-600"
      >
        <ChevronLeft className="h-4 w-4" />
        الطلاب
      </Link>

      {/* بيانات الطالب */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-royal-50 text-2xl font-black text-royal">
            {student.firstName[0]}
          </span>
          <div>
            <h1 className="text-2xl font-black text-navy">
              {student.firstName} {student.middleName} {student.lastName}
            </h1>
            <span
              className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold ${
                student.isBlocked ? "bg-rose-50 text-rose-600" : "bg-mint-50 text-mint-dark"
              }`}
            >
              {student.isBlocked ? "محظور" : "نشط"}
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
            <Phone className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xs text-slate-400">رقم التليفون</p>
              <p className="font-bold text-navy" dir="ltr">{student.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
            <Lock className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xs text-slate-400">كلمة السر</p>
              <p className="font-bold text-navy">••••••••</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
            <User className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xs text-slate-400">المرحلة الدراسية</p>
              <p className="font-bold text-navy">{student.year?.name ?? "غير محدد"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
            <Calendar className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xs text-slate-400">تاريخ التسجيل</p>
              <p className="font-bold text-navy">{formatDate(student.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
            <CreditCard className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xs text-slate-400">المحفظة</p>
              <p className="font-black text-navy">{formatPrice(student.walletBalance)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
            <span className="text-lg">⭐</span>
            <div>
              <p className="text-xs text-slate-400">النقاط</p>
              <p className="font-black text-navy">{student.points}</p>
            </div>
          </div>
        </div>
      </div>

      {/* الاشتراكات */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-black text-navy">
          <BookOpen className="mb-1 inline-block h-5 w-5 text-amber-500" />
          {" "}الكورسات المشترك فيها ({student.subscriptions.length})
        </h2>
        {student.subscriptions.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">لم يشترك في أي كورس بعد</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-black text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-right">الكورس</th>
                  <th className="px-4 py-2 text-right">السعر</th>
                  <th className="px-4 py-2 text-right">الحالة</th>
                  <th className="px-4 py-2 text-right">تاريخ الاشتراك</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {student.subscriptions.map((sub) => (
                  <tr key={sub.id}>
                    <td className="px-4 py-3">
                      <span className="font-bold text-navy">
                        {sub.course.subject?.icon} {sub.course.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-black text-amber-600">{formatPrice(Number(sub.price))}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          sub.status === "active"
                            ? "bg-mint-50 text-mint-dark"
                            : sub.status === "expired"
                              ? "bg-slate-100 text-slate-500"
                              : "bg-rose-50 text-rose-600"
                        }`}
                      >
                        {sub.status === "active" ? "نشط" : sub.status === "expired" ? "منتهي" : "ملغي"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(sub.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
