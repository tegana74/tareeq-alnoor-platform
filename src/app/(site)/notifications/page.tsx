import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Bell, BellRing } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { formatDateTime } from "@/lib/utils"
import { MarkAllRead } from "./mark-all-read"

export const metadata: Metadata = { title: "الإشعارات" }

export default async function NotificationsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  })
  const unreadCount = notifications.filter((n) => !n.isRead).length

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-navy">
            <BellRing className="h-6 w-6 text-amber-500" />
            الإشعارات
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {unreadCount > 0 ? `${unreadCount} إشعار غير مقروء` : "لا توجد إشعارات جديدة"}
          </p>
        </div>
        {unreadCount > 0 && <MarkAllRead />}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
          <Bell className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-bold text-slate-500">لا توجد إشعارات بعد</p>
          <p className="mt-1 text-xs text-slate-400">ستصلك الإشعارات عند جدولة بث جديد، أو رد على منشورك، أو تصحيح إجابتك</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Link
              key={n.id}
              href={n.link ?? "/notifications"}
              className={`block rounded-2xl border p-4 transition-colors ${
                n.isRead
                  ? "border-slate-200 bg-white"
                  : "border-amber-300 bg-amber-50 hover:border-amber-400"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-sm font-black ${n.isRead ? "text-navy" : "text-amber-800"}`}>{n.title}</p>
                  {n.body && <p className="mt-1 text-xs leading-6 text-slate-500">{n.body}</p>}
                  <p className="mt-2 text-[11px] font-bold text-slate-400">{formatDateTime(n.createdAt)}</p>
                </div>
                {!n.isRead && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
