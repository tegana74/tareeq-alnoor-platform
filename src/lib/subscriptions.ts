import { prisma } from "@/lib/prisma"

export async function isSubscribed(userId: string, courseId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { userId_courseId: { userId, courseId } },
  })
  if (!sub) return false
  if (sub.expiresAt && sub.expiresAt < new Date()) return false
  return sub.status === "active"
}

/**
 * هل يمكن لهذا المستخدم الوصول لمحتوى الكورس؟
 * - الأدمن: نعم دائماً
 * - المدرس: نعم إذا كان يملك الكورس
 * - غيره: عبر الاشتراك
 */
export async function canAccessCourse(
  user: { id: string; role: string; teacherId: string | null } | null,
  courseId: string
) {
  if (!user) return false
  if (user.role === "ADMIN") return true
  if (user.role === "TEACHER" && user.teacherId) {
    const owns = await prisma.course.findFirst({
      where: { id: courseId, teacherId: user.teacherId },
      select: { id: true },
    })
    if (owns) return true
  }
  return isSubscribed(user.id, courseId)
}

export async function getUserSubscriptions(userId: string) {
  return prisma.subscription.findMany({
    where: { userId, status: "active", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    include: { course: { include: { teacher: true, subject: true } } },
    orderBy: { createdAt: "desc" },
  })
}
