import { NextResponse, NextRequest } from "next/server"
import {
  ADMISSION_UNAVAILABLE,
  decideAdmission,
  isAdmissionTableMissing,
  readJsonBody,
} from "@/lib/live-classroom/admission-server"

export const dynamic = "force-dynamic"

/**
 * POST /api/live/[id]/admission/reject
 * Body: { userId: string }
 *
 * المعلم المالك أو ADMIN فقط. بعد الرفض: لا توكن ولا انضمام —
 * بوابة التوكن في /api/live/[id]/token ترفض أي حالة غير approved.
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
      decision: "rejected",
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true, ...result.body })
  } catch (error) {
    if (isAdmissionTableMissing(error)) {
      console.error("[ADMISSION_REJECT] live_session_admissions table missing")
      return NextResponse.json(
        { error: ADMISSION_UNAVAILABLE.error },
        { status: ADMISSION_UNAVAILABLE.status }
      )
    }
    console.error("[ADMISSION_REJECT_ERROR]", error)
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 })
  }
}
