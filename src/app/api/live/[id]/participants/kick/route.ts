import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canManageAdmission } from "@/lib/live-classroom/admission"
import {
  ADMISSION_UNAVAILABLE,
  isAdmissionTableMissing,
  markKicked,
  readJsonBody,
  readKickTarget,
} from "@/lib/live-classroom/admission-server"
import {
  canKickParticipant,
  describeRemoveFailure,
  KICK_REFUSAL_RESPONSES,
} from "@/lib/live-classroom/participants"
import { removeRoomParticipant } from "@/lib/live-classroom/livekit-admin"

export const dynamic = "force-dynamic"

/**
 * POST /api/live/[id]/participants/kick — LIVE-9C
 *
 * إخراج طالب من الجلسة. server-authorized بالكامل: المعلم المالك أو الأدمن فقط،
 * والهوية المستهدَفة تُقيَّد بسجل دخول ينتمي إلى جلسة الـ URL نفسها.
 *
 * الترتيب مقصود ولا يجوز عكسه:
 *   1) حالة "kicked" في قاعدة البيانات — الحاجز الدائم: لا توكن جديد بعدها،
 *      فلا يعود الطالب بإعادة تحميل الصفحة ولا بطلب دخول جديد.
 *   2) removeParticipant من LiveKit — الأثر الفوري، مع revokeTokenTs لإبطال
 *      التوكنات القديمة.
 *
 * لو انعكس الترتيب لأمكن للطالب إعادة الاتصال في الفجوة بين الإزالة والكتابة.
 * وإن فشلت الخطوة 2 لا نُلغي الخطوة 1: الحظر قائم، ويُبلَّغ المعلم بتحذير.
 */
export async function POST(
  request: NextRequest,
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

    // الأدمن أو المعلم المالك فقط — يُتحقق مقابل session.teacherId من قاعدة البيانات.
    // الطالب لا يصل إلى ما بعد هذا السطر إطلاقاً، فلا يستطيع إخراج نفسه ولا غيره.
    if (!canManageAdmission(user, session)) {
      return NextResponse.json(
        { error: "غير مصرح لك بإدارة المشاركين في هذه الجلسة" },
        { status: 403 }
      )
    }

    const body = await readJsonBody(request)
    const targetUserId = body.userId

    // تضييق النوع قبل أي استعلام؛ الرسالة نفسها المستخدمة في طبقة السياسة
    if (typeof targetUserId !== "string" || targetUserId.length === 0) {
      const refusal = KICK_REFUSAL_RESPONSES["invalid-target"]
      return NextResponse.json(
        { error: refusal.error },
        { status: refusal.status }
      )
    }

    let target
    try {
      target = await readKickTarget(session.id, targetUserId)
    } catch (error) {
      if (isAdmissionTableMissing(error)) {
        console.error("[LIVE_KICK] live_session_admissions table missing")
        return NextResponse.json(
          { error: ADMISSION_UNAVAILABLE.error },
          { status: ADMISSION_UNAVAILABLE.status }
        )
      }
      throw error
    }

    const permission = canKickParticipant({
      actorUserId: user.id,
      targetUserId,
      sessionUrl: session.url,
      // الدور من جدول User، لا من العميل
      targetIsManager: target.user
        ? canManageAdmission(target.user, session)
        : false,
      hasAdmissionRecord: target.exists,
    })

    if (!permission.ok) {
      const refusal = KICK_REFUSAL_RESPONSES[permission.reason]
      return NextResponse.json(
        { error: refusal.error },
        { status: refusal.status }
      )
    }

    // ─── 1) الحظر الدائم أولاً ───────────────────────────────────
    let outcome
    try {
      outcome = await markKicked({
        sessionId: session.id,
        targetUserId,
        actorUserId: user.id,
      })
    } catch (error) {
      if (isAdmissionTableMissing(error)) {
        console.error("[LIVE_KICK] live_session_admissions table missing")
        return NextResponse.json(
          { error: ADMISSION_UNAVAILABLE.error },
          { status: ADMISSION_UNAVAILABLE.status }
        )
      }
      throw error
    }

    // ─── 2) الإخراج الفوري من الغرفة ─────────────────────────────
    // لا يُرمى خطأ من هنا: الحظر نجح بالفعل، والفشل يُبلَّغ كتحذير.
    const { removed } = await removeRoomParticipant(session.id, targetUserId)

    return NextResponse.json({
      ok: true,
      status: outcome.status,
      userId: outcome.userId,
      decidedAt: outcome.decidedAt,
      removed,
      ...(removed ? {} : { warning: describeRemoveFailure() }),
    })
  } catch (error) {
    console.error("[LIVE_KICK_ERROR]", error)
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 })
  }
}
