import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import {
  canManageAdmission,
  isAdmissionManagedSession,
} from "@/lib/live-classroom/admission"
import {
  ADMISSION_UNAVAILABLE,
  isAdmissionTableMissing,
  readRosterAdmissions,
} from "@/lib/live-classroom/admission-server"
import {
  countConnected,
  mergeRoster,
  type RoomParticipantSnapshot,
} from "@/lib/live-classroom/participants"
import { listRoomParticipants } from "@/lib/live-classroom/livekit-admin"

export const dynamic = "force-dynamic"

/**
 * GET /api/live/[id]/participants — LIVE-9C
 *
 * قائمة المشاركين للمعلم المالك/الأدمن حصراً. لا يرى الطالب هذا المسار إطلاقاً
 * (403 قبل أي قراءة للقائمة) فلا تتسرب أسماء الطلاب الآخرين.
 *
 * الدمج بين مصدرين:
 *   - live_session_admissions → من يُسمح له بالدخول + الاسم من جدول User
 *   - LiveKit listParticipants → من هو متصل الآن (identity = user.id)
 *
 * تعذّر الوصول إلى LiveKit لا يُفشل الطلب: تُرجع القائمة بحالة presence
 * "unknown" و roomReachable: false، لأن المعلم يحتاج القائمة ليطرد أحدهم
 * ومسار الطرد لا يعتمد على listParticipants.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }

    const { id } = await context.params
    const session = await prisma.liveSession.findUnique({
      where: { id },
      select: { id: true, teacherId: true, url: true, status: true },
    })
    if (!session) {
      return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
    }

    // الأدمن أو المعلم المالك فقط — يُتحقق مقابل session.teacherId من قاعدة البيانات
    if (!canManageAdmission(user, session)) {
      return NextResponse.json(
        { error: "غير مصرح لك بإدارة المشاركين في هذه الجلسة" },
        { status: 403 }
      )
    }

    // الجلسات الخارجية (YouTube/Zoom/Meet) لا غرفة LiveKit لها — لا تغيير في سلوكها
    if (!isAdmissionManagedSession(session.url)) {
      return NextResponse.json({
        managed: false,
        roomReachable: false,
        participants: [],
        connectedCount: 0,
      })
    }

    let admissions
    try {
      admissions = await readRosterAdmissions(session.id)
    } catch (error) {
      if (isAdmissionTableMissing(error)) {
        console.error(
          "[LIVE_PARTICIPANTS] live_session_admissions table missing"
        )
        return NextResponse.json(
          { error: ADMISSION_UNAVAILABLE.error },
          { status: ADMISSION_UNAVAILABLE.status }
        )
      }
      throw error
    }

    // room = null يعني تعذّر الوصول، وليس «غرفة فارغة»
    let room: RoomParticipantSnapshot[] | null = null
    try {
      room = await listRoomParticipants(session.id)
    } catch {
      // لا تُمرَّر تفاصيل الـ SDK إلى العميل ولا إلى السجل
      console.error("[LIVE_PARTICIPANTS] listParticipants unavailable")
      room = null
    }

    const participants = mergeRoster({ admissions, room })

    return NextResponse.json({
      managed: true,
      roomReachable: room !== null,
      participants,
      connectedCount: countConnected(participants),
    })
  } catch (error) {
    console.error("[LIVE_PARTICIPANTS_ERROR]", error)
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 })
  }
}
