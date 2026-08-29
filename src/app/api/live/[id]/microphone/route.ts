import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canManageAdmission } from "@/lib/live-classroom/admission"
import {
  ADMISSION_UNAVAILABLE,
  isAdmissionTableMissing,
  readJsonBody,
  readModerationTarget,
} from "@/lib/live-classroom/admission-server"
import {
  canModerateMicrophoneTarget,
  describeMicNotApplied,
  MIC_GRANT_REVOKE_LIMIT,
  MIC_INVALID_ACTION,
  MIC_RATE_LIMITED,
  MICROPHONE_REFUSAL_RESPONSES,
  toMicrophoneAction,
} from "@/lib/live-classroom/microphone-permissions"
import {
  grantParticipantMicrophone,
  revokeParticipantMicrophone,
} from "@/lib/live-classroom/livekit-admin"
import { checkRateLimit } from "@/lib/live-classroom/rate-limit"

export const dynamic = "force-dynamic"

/**
 * POST /api/live/[id]/microphone — LIVE-9E
 *
 * منح/سحب صلاحية الميكروفون لطالب واحد. المعلم المالك أو الأدمن حصراً.
 *
 * الـ enforcement الحقيقي هو updateParticipant في LiveKit — لا شيء آخر:
 * لا DataChannel ولا حالة React ولا عمود في قاعدة البيانات. الطالب لا يستطيع
 * النشر إلا إذا سمح له خادم الوسائط نفسه، فحتى عميل معدَّل لا يتجاوز ذلك.
 *
 * الصلاحية الممنوحة تُقيَّد بالميكروفون وحده (canPublishSources = [MICROPHONE]):
 * الكاميرا ومشاركة الشاشة ونشر البيانات تبقى محجوبة كما في LIVE-8C/9D.
 *
 * لا تُخزَّن حالة الميكروفون في أي مكان بقصد:
 *   - منح لطالب غير متصل لا يُحفظ ولا يُؤجَّل (يُبلَّغ المعلم بتحذير).
 *   - إعادة الاتصال تعود إلى المنع الافتراضي، لأن التوكن نفسه يصدر بـ
 *     canPublish: false من token/route.ts فلا يورَّث أي منح سابق.
 *
 * دلالات القبول/الطرد لا تتغير: الطالب المطرود أو غير المقبول لا يُمنح إطلاقاً،
 * والمنح ليس بديلاً عن الموافقة على الدخول.
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
    // الطالب لا يصل إلى ما بعد هذا السطر، فلا يمنح نفسه الميكروفون.
    if (!canManageAdmission(user, session)) {
      return NextResponse.json(
        { error: "غير مصرح لك بإدارة المشاركين في هذه الجلسة" },
        { status: 403 }
      )
    }

    // حد معدّل بعد التحقق من الصلاحية: لا يستهلك مجهول الهوية حصة المعلم
    if (
      !checkRateLimit(
        `mic_${user.id}`,
        MIC_GRANT_REVOKE_LIMIT.max,
        MIC_GRANT_REVOKE_LIMIT.windowMs
      )
    ) {
      return NextResponse.json(
        { error: MIC_RATE_LIMITED.error },
        { status: MIC_RATE_LIMITED.status }
      )
    }

    const body = await readJsonBody(request)
    const action = toMicrophoneAction(body.action)
    if (!action) {
      return NextResponse.json(
        { error: MIC_INVALID_ACTION.error },
        { status: MIC_INVALID_ACTION.status }
      )
    }

    const targetUserId = body.userId
    if (typeof targetUserId !== "string" || targetUserId.length === 0) {
      const refusal = MICROPHONE_REFUSAL_RESPONSES["invalid-target"]
      return NextResponse.json(
        { error: refusal.error },
        { status: refusal.status }
      )
    }

    let target
    try {
      target = await readModerationTarget(session.id, targetUserId)
    } catch (error) {
      if (isAdmissionTableMissing(error)) {
        console.error("[LIVE_MIC] live_session_admissions table missing")
        return NextResponse.json(
          { error: ADMISSION_UNAVAILABLE.error },
          { status: ADMISSION_UNAVAILABLE.status }
        )
      }
      throw error
    }

    const permission = canModerateMicrophoneTarget({
      sessionUrl: session.url,
      targetUserId,
      // الدور من جدول User، لا من العميل
      targetRole: target.user?.role ?? null,
      targetIsManager: target.user
        ? canManageAdmission(target.user, session)
        : false,
      hasAdmissionRecord: target.exists,
      admission: target.status,
    })

    if (!permission.ok) {
      const refusal = MICROPHONE_REFUSAL_RESPONSES[permission.reason]
      return NextResponse.json(
        { error: refusal.error },
        { status: refusal.status }
      )
    }

    const result =
      action === "grant"
        ? await grantParticipantMicrophone(session.id, targetUserId)
        : await revokeParticipantMicrophone(session.id, targetUserId)

    return NextResponse.json({
      ok: true,
      userId: targetUserId,
      action,
      applied: result.applied,
      micGranted: resolveMicGranted(action, result),
      ...(result.applied || !result.reason
        ? {}
        : { warning: describeMicNotApplied(result.reason) }),
    })
  } catch (error) {
    console.error("[LIVE_MIC_ERROR]", error)
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 })
  }
}

/**
 * الحالة التي يُسمح بإعلانها للمعلم بعد العملية — LIVE-9F.
 *
 * لا يُعلَن إلا ما نملك دليلاً عليه:
 *   - applied: النداء نجح، فالحالة هي الإجراء نفسه.
 *   - not_connected: الطالب ليس في الغرفة، فلا صلاحية نشر قائمة له إطلاقاً
 *     (التوكن يصدر بـ canPublish: false) — false مُثبَتة لا تخمين.
 *   - rpc_failed: لا نعرف شيئاً. النداء قد يكون وصل ثم انقطع الرد، فسحبٌ فاشل
 *     ظاهرياً قد يكون طُبِّق، ومنحٌ فاشل ظاهرياً قد يكون طُبِّق كذلك. كان
 *     LIVE-9E يُعيد false هنا فيؤكد للمعلم أن الميكروفون مسحوب دون دليل.
 *     null = غير معروفة، واللوحة تُعيد قراءة الحالة من LiveKit فوراً.
 */
function resolveMicGranted(
  action: "grant" | "revoke",
  result: { applied: boolean; reason?: "not_connected" | "rpc_failed" }
): boolean | null {
  if (result.applied) return action === "grant"
  if (result.reason === "not_connected") return false
  return null
}
