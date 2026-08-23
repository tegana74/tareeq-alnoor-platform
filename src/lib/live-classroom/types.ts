// Live Classroom — Foundation types (Phase 1)
// لا بث حقيقي هنا؛ هذه العقود التي ستُستخدم في مراحل لاحقة (LiveKit/WebRTC).

export const CLASSROOM_STATUSES = ["active", "archived"] as const
export type ClassroomStatus = (typeof CLASSROOM_STATUSES)[number]

export const LIVE_SESSION_STATUSES = [
  "scheduled",
  "waiting",
  "live",
  "ended",
  "recording",
  "archived",
  "cancelled",
] as const
export type LiveSessionStatus = (typeof LIVE_SESSION_STATUSES)[number]

/** انتقالات الحالة المسموحة للجلسة — تُفعَّل منطقيًا في مرحلة محرك البث */
export const SESSION_STATUS_TRANSITIONS: Record<LiveSessionStatus, readonly LiveSessionStatus[]> = {
  scheduled: ["waiting", "live", "cancelled", "archived"],
  waiting: ["live", "cancelled"],
  live: ["ended", "recording"],
  recording: ["ended"],
  ended: ["archived"],
  archived: [],
  cancelled: [],
}

export function canTransitionSessionStatus(
  from: LiveSessionStatus,
  to: LiveSessionStatus
): boolean {
  return SESSION_STATUS_TRANSITIONS[from].includes(to)
}

/** هل يستطيع هذا المستخدم إدارة القاعة؟ (نفس نظام الأدوار الحالي — لا نظام جديد) */
export function canManageClassroom(
  user: { role: string; teacherId: string | null } | null,
  classroom: { teacherId: string }
): boolean {
  if (!user) return false
  if (user.role === "ADMIN") return true
  if (user.role === "TEACHER") return user.teacherId === classroom.teacherId
  return false
}
