import { prisma } from "@/lib/prisma"

/**
 * LiveClassroomService — Phase 1 (Foundation)
 * عمليات القاعات فقط (قراءة/نطاق صلاحيات). إدارة الجلسات الحية نفسها
 * تبقى على نظام /live الحالي حتى مرحلة محرك البث.
 * لا LiveKit. لا WebRTC. لا تسجيل. لا سبورة.
 */

export interface ClassroomListItem {
  id: string
  teacherId: string
  title: string
  description: string | null
  status: string
  teacherName: string
  courseName: string | null
  upcomingCount: number
}

function toItem(c: {
  id: string
  teacherId: string
  title: string
  description: string | null
  status: string
  teacher: { name: string }
  course: { name: string } | null
  _count?: { sessions: number }
}): ClassroomListItem {
  return {
    id: c.id,
    teacherId: c.teacherId,
    title: c.title,
    description: c.description,
    status: c.status,
    teacherName: c.teacher.name,
    courseName: c.course?.name ?? null,
    upcomingCount: c._count?.sessions ?? 0,
  }
}

/** قاعات معلم محدد — للوحة المعلم */
export async function listTeacherClassrooms(teacherId: string): Promise<ClassroomListItem[]> {
  const classrooms = await prisma.classroom.findMany({
    where: { teacherId, status: "active" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      teacherId: true,
      title: true,
      description: true,
      status: true,
      teacher: { select: { name: true } },
      course: { select: { name: true } },
      _count: {
        select: {
          sessions: { where: { startAt: { gt: new Date() }, status: { not: "cancelled" } } },
        },
      },
    },
  })
  return classrooms.map(toItem)
}
/**
 * القاعات المرئية للطالب — مبدأ الوصول:
 * Authenticated → Role(STUDENT) → Membership:
 *   قاعة مرتبطة بكورس مشترك فيه، أو قاعة فيها جلسة حجزها الطالب.
 * ثلاث دفعات فقط، بلا N+1.
 */
export async function listStudentClassrooms(userId: string): Promise<ClassroomListItem[]> {
  const [subCourseIds, bookedSessionClassroomIds] = await Promise.all([
    prisma.subscription.findMany({
      where: { userId, status: "active", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { courseId: true },
    }),
    prisma.sessionBooking.findMany({
      where: { userId, status: "booked", session: { classroomId: { not: null } } },
      select: { session: { select: { classroomId: true } } },
    }),
  ])

  const subscribedIds = subCourseIds.map((s) => s.courseId)
  const bookedRoomIds = bookedSessionClassroomIds
    .map((b) => b.session.classroomId)
    .filter((id): id is string => Boolean(id))

  const orConditions: Record<string, unknown>[] = []
  if (subscribedIds.length > 0) orConditions.push({ courseId: { in: subscribedIds } })
  if (bookedRoomIds.length > 0) orConditions.push({ id: { in: bookedRoomIds } })
  if (orConditions.length === 0) return []

  const classrooms = await prisma.classroom.findMany({
    where: { status: "active", OR: orConditions },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      teacherId: true,
      title: true,
      description: true,
      status: true,
      teacher: { select: { name: true } },
      course: { select: { name: true } },
      _count: {
        select: {
          sessions: { where: { startAt: { gt: new Date() }, status: { not: "cancelled" } } },
        },
      },
    },
  })

  return classrooms.map(toItem)
}

/** فحص وصول الطالب إلى قاعة محددة (Membership) */
export async function canStudentAccessClassroom(
  userId: string,
  classroomId: string
): Promise<boolean> {
  const classroom = await prisma.classroom.findUnique({
    where: { id: classroomId },
    select: { courseId: true },
  })
  if (!classroom) return false

  if (classroom.courseId) {
    const sub = await prisma.subscription.findFirst({
      where: {
        userId,
        courseId: classroom.courseId,
        status: "active",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    })
    if (sub) return true
  }

  const booking = await prisma.sessionBooking.findFirst({
    where: { userId, status: "booked", session: { classroomId } },
    select: { id: true },
  })
  return Boolean(booking)
}

/** تفاصيل قاعة للمستدعي مع فحص الدور/الملكية/العضوية — null عند الرفض */
export async function getClassroomForUser(
  classroomId: string,
  user: { id: string; role: string; teacherId: string | null }
): Promise<(ClassroomListItem & { sessions: { id: string; title: string; startAt: Date; status: string }[] }) | null> {
  const classroom = await prisma.classroom.findUnique({
    where: { id: classroomId },
    select: {
      id: true,
      teacherId: true,
      title: true,
      description: true,
      status: true,
      teacher: { select: { name: true } },
      course: { select: { name: true } },
      sessions: {
        orderBy: { startAt: "asc" },
        take: 20,
        select: { id: true, title: true, startAt: true, status: true },
      },
      _count: {
        select: {
          sessions: { where: { startAt: { gt: new Date() }, status: { not: "cancelled" } } },
        },
      },
    },
  })
  if (!classroom || classroom.status !== "active") return null

  if (user.role === "ADMIN") return toItem(classroom) as never
  if (user.role === "TEACHER") {
    if (user.teacherId !== classroom.teacherId) return null
    return toItem(classroom) as never
  }
  if (user.role === "STUDENT") {
    const allowed = await canStudentAccessClassroom(user.id, classroomId)
    if (!allowed) return null
    return toItem(classroom) as never
  }
  return null
}

/** الحصص القادمة لمعلم (للوحة المعلم) */
export async function listUpcomingSessionsForTeacher(
  teacherId: string
): Promise<{ id: string; title: string; startLabel: string }[]> {
  const sessions = await prisma.liveSession.findMany({
    where: { teacherId, startAt: { gt: new Date() }, status: { not: "cancelled" } },
    orderBy: { startAt: "asc" },
    take: 5,
    select: { id: true, title: true, startAt: true },
  })
  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    startLabel: new Intl.DateTimeFormat("ar-EG", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(s.startAt),
  }))
}