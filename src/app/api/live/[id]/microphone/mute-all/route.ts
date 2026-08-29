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
  describeMuteAllPartialFailure,
  MIC_MUTE_ALL_LIMIT,
  MIC_RATE_LIMITED,
  MIC_ROOM_UNREACHABLE,
  MICROPHONE_REFUSAL_RESPONSES,
  selectMuteAllTargets,
} from "@/lib/live-classroom/microphone-permissions"
import {
  listRoomParticipants,
  revokeParticipantMicrophone,
} from "@/lib/live-classroom/livekit-admin"
import { checkRateLimit } from "@/lib/live-classroom/rate-limit"

export const dynamic = "force-dynamic"

/**
 * POST /api/live/[id]/microphone/mute-all — LIVE-9E
 *
 * سحب صلاحية الميكروفون من كل طالب متصل يملكها. المعلم المالك أو الأدمن حصراً.
 *
 * «كتم» هنا يعني سحب الصلاحية لا mute المسار: سحب canPublish يجعل خادم
 * LiveKit يُلغي نشر المسار بنفسه، فلا يستطيع الطالب إعادة تشغيله من العميل.
 * كتم المسار وحده كان سيبقي الصلاحية قائمة فيُعاد الإرسال بضغطة زر.
 *
 * الأهداف تُشتق من تقاطع سجل دخول هذه الجلسة مع حضور LiveKit، فلا يمكن أن
 * يشمل النداء المعلم نفسه: هوية المعلم لا سجل دخول لها.
 *
 * تعذّر الوصول إلى LiveKit يُفشل الطلب صراحة (503): لا يجوز إبلاغ المعلم بأن
 * الجميع كُتم بينما لم يُطبَّق شيء.
 */
export async function POST(
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
      select: { id: true, teacherId: true, url: true },
    })
    if (!session) {
      return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
    }

    if (!canManageAdmission(user, session)) {
      return NextResponse.json(
        { error: "غير مصرح لك بإدارة المشاركين في هذه الجلسة" },
        { status: 403 }
      )
    }

    if (
      !checkRateLimit(
        `mic_mute_all_${user.id}`,
        MIC_MUTE_ALL_LIMIT.max,
        MIC_MUTE_ALL_LIMIT.windowMs
      )
    ) {
      return NextResponse.json(
        { error: MIC_RATE_LIMITED.error },
        { status: MIC_RATE_LIMITED.status }
      )
    }

    // الجلسات الخارجية (YouTube/Zoom/Meet) لا غرفة LiveKit لها
    if (!isAdmissionManagedSession(session.url)) {
      const refusal = MICROPHONE_REFUSAL_RESPONSES["not-managed"]
      return NextResponse.json(
        { error: refusal.error },
        { status: refusal.status }
      )
    }

    let admissions
    try {
      admissions = await readRosterAdmissions(session.id)
    } catch (error) {
      if (isAdmissionTableMissing(error)) {
        console.error("[LIVE_MIC_MUTE_ALL] live_session_admissions table missing")
        return NextResponse.json(
          { error: ADMISSION_UNAVAILABLE.error },
          { status: ADMISSION_UNAVAILABLE.status }
        )
      }
      throw error
    }

    let room
    try {
      room = await listRoomParticipants(session.id)
    } catch {
      console.error("[LIVE_MIC_MUTE_ALL] listParticipants unavailable")
      return NextResponse.json(
        { error: MIC_ROOM_UNREACHABLE.error },
        { status: MIC_ROOM_UNREACHABLE.status }
      )
    }

    const targets = selectMuteAllTargets({
      rosterUserIds: admissions.map((row) => row.userId),
      room,
    })

    const results = await Promise.all(
      targets.map((identity) => revokeParticipantMicrophone(session.id, identity))
    )
    const revoked = results.filter((r) => r.applied).length
    const failed = results.length - revoked

    return NextResponse.json({
      ok: true,
      revoked,
      failed,
      ...(failed > 0 ? { warning: describeMuteAllPartialFailure(failed) } : {}),
    })
  } catch (error) {
    console.error("[LIVE_MIC_MUTE_ALL_ERROR]", error)
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 })
  }
}
