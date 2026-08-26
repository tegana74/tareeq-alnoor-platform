import { NextResponse, NextRequest } from "next/server"
import {
  ADMISSION_UNAVAILABLE,
  decideAdmission,
  isAdmissionTableMissing,
  readJsonBody,
} from "@/lib/live-classroom/admission-server"

export const dynamic = "force-dynamic"

/**
 * POST /api/live/[id]/admission/approve
 * Body: { userId: string }
 *
 * المعلم المالك أو ADMIN فقط. بعد الموافقة يصبح الطالب مؤهلاً لتوكن Subscriber
 * (مشاهد فقط) عند طلبه من /api/live/[id]/token.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params
    const body = await readJsonBody(request)

    const result = await decideAdmission({
      sessionId: id,
      targetUserId: body.userId,
      decision: "approved",
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true, ...result.body })
  } catch (error) {
    if (isAdmissionTableMissing(error)) {
      console.error("[ADMISSION_APPROVE] live_session_admissions table missing")
      return NextResponse.json(
        { error: ADMISSION_UNAVAILABLE.error },
        { status: ADMISSION_UNAVAILABLE.status }
      )
    }
    console.error("[ADMISSION_APPROVE_ERROR]", error)
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 })
  }
}
