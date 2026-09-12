// SMART-WB-1B — بوابة صلاحيات السبورة لمسارات REST.
//
// لا نموذج صلاحيات جديد: هذا الملف يُركّب البوابات القائمة فقط —
//   canWriteWhiteboard   (نفس سلّم canManageAdmission: أدمن أو معلم الجلسة المالك)
//   checkStudentSessionAccess (وصول الكورس + الحجز)
//   checkAttendanceAdmission  (موافقة الدخول لجلسات LiveKit)
//
// الهوية تُقرأ من الجلسة المصادَق عليها حصراً (`getCurrentUser`)؛ لا يُقرأ من
// جسم الطلب أي userId أو role أو ملكية. الغرض من التركيب هنا أن كل مسارات
// السبورة الأربعة تمرّ على نفس القرار، فلا يتباعد مسار عن آخر.

import { prisma } from "@/lib/prisma"
import { getCurrentUser, type CurrentUser } from "@/lib/auth"
import {
  checkAttendanceAdmission,
  checkStudentSessionAccess,
  type AccessDenial,
} from "./admission-server"
import {
  canReadWhiteboard,
  canWriteWhiteboard,
  isWhiteboardWritableStatus,
  WHITEBOARD_FORBIDDEN,
} from "./whiteboard"
import type { LiveSessionStatus } from "./types"

/** الجلسة كما تحتاجها بوابة السبورة — لا أعمدة زائدة. */
export type WhiteboardSession = {
  id: string
  teacherId: string
  url: string | null
  status: LiveSessionStatus
}

export type WhiteboardActor = {
  user: CurrentUser
  session: WhiteboardSession
  /** هل يكتب هذا الفاعل على هذه السبورة الآن؟ (الدور + حالة الجلسة معاً) */
  canWrite: boolean
}

export type WhiteboardAccess = { ok: true; actor: WhiteboardActor } | AccessDenial

const SESSION_SELECT = {
  id: true,
  teacherId: true,
  url: true,
  status: true,
  isFree: true,
  courseId: true,
  price: true,
} as const

/**
 * بوابة القراءة — الحد الأدنى لأي مسار سبورة، بما فيها مسارات الكتابة.
 *
 * `mode: "write"` تشدّد بعدها: تُرفض إن لم يكن الفاعل معلماً مالكاً/أدمن، أو إن
 * كانت حالة الجلسة لا تسمح بالكتابة (`ended/archived/cancelled`) — فمعلم مالك
 * لجلسة منتهية يقرأ ولا يكتب.
 *
 * لا يُنشأ هنا أي سجل ولا تُلمس السبورة: القرار فقط.
 */
export async function resolveWhiteboardAccess(
  sessionId: string,
  mode: "read" | "write"
): Promise<WhiteboardAccess> {
  const user = await getCurrentUser()
  if (!user) {
    return { ok: false, status: 401, error: "يجب تسجيل الدخول" }
  }

  const row = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    select: {
      ...SESSION_SELECT,
      bookings: { where: { userId: user.id }, select: { status: true } },
    },
  })
  if (!row) {
    return { ok: false, status: 404, error: "الجلسة غير موجودة" }
  }

  const session: WhiteboardSession = {
    id: row.id,
    teacherId: row.teacherId,
    url: row.url,
    status: (row.status || "scheduled") as LiveSessionStatus,
  }

  // جلسة ملغاة لا سبورة لها إطلاقاً — لا قراءة ولا كتابة، لأي دور.
  if (!canReadWhiteboard(session.status)) {
    return { ok: false, status: 403, error: "لا سبورة لجلسة ملغاة" }
  }

  const isManager = canWriteWhiteboard(user, session)

  // الطالب يمرّ على نفس سلّم مشاهدة الجلسة، بلا تخفيف ولا نظام موازٍ.
  if (!isManager) {
    const access = await checkStudentSessionAccess(user, {
      isFree: row.isFree,
      courseId: row.courseId,
      price: row.price,
      bookings: row.bookings,
    })
    if (!access.ok) return access

    const admitted = await checkAttendanceAdmission(user, session)
    if (!admitted.ok) return admitted
  }

  // الكتابة = الدور يسمح + حالة الجلسة تسمح. الشرطان مستقلان بقصد.
  const canWrite = isManager && isWhiteboardWritableStatus(session.status)

  if (mode === "write" && !canWrite) {
    return { ok: false, ...WHITEBOARD_FORBIDDEN }
  }

  return { ok: true, actor: { user, session, canWrite } }
}
