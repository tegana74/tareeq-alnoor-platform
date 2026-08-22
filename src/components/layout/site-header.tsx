import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { SiteHeaderClient, type HeaderRole } from "./site-header-client"

export async function SiteHeader() {
  const user = await getCurrentUser()
  const unread = user
    ? await prisma.notification.count({ where: { userId: user.id, isRead: false } })
    : 0

  const role: HeaderRole | null =
    user?.role === "STUDENT" ||
    user?.role === "TEACHER" ||
    user?.role === "PARENT" ||
    user?.role === "ADMIN"
      ? user.role
      : null

  return <SiteHeaderClient role={role} unread={unread} />
}
