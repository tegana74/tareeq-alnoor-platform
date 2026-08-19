import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { formatDateTime } from "@/lib/utils"
import { AppealAdminRow } from "./appeal-row"

export const metadata: Metadata = { title: "التظلمات | لوحة الإدارة" }

export default async function AdminAppealsPage() {
  const appeals = await prisma.appeal.findMany({
    include: {
      user: { select: { firstName: true, lastName: true, phone: true } },
      attempt: {
        include: {
          exam: { include: { section: { include: { course: { include: { teacher: true } } } } } },
          answers: { include: { question: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  })

  const pending = appeals.filter((a) => a.status === "pending").length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-navy">التظلمات ({appeals.length})</h1>
        <p className="text-sm text-slate-500">{pending} تظلم بانتظار المراجعة</p>
      </div>

      {appeals.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          لا توجد تظلمات
        </div>
      ) : (
        <div className="space-y-4">
          {appeals.map((a) => (
            <AppealAdminRow key={a.id} appeal={a} />
          ))}
        </div>
      )}
    </div>
  )
}
