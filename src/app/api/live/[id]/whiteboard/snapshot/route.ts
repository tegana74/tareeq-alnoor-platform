import { NextResponse, type NextRequest } from "next/server"
import { readJsonBody } from "@/lib/live-classroom/admission-server"
import { checkRateLimit } from "@/lib/live-classroom/rate-limit"
import { resolveWhiteboardAccess } from "@/lib/live-classroom/whiteboard-access"
import {
  byteSizeOf,
  resolveRevision,
  WHITEBOARD_CONFLICT,
  WHITEBOARD_RATE_LIMITED,
  WHITEBOARD_SNAPSHOT_MAX_BYTES,
  WHITEBOARD_TOO_LARGE,
  WHITEBOARD_WRITE_LIMIT,
  WhiteboardSaveRequestSchema,
} from "@/lib/live-classroom/whiteboard"
import {
  appendSnapshot,
  isWhiteboardRevisionConflict,
  isWhiteboardServerError,
  isWhiteboardTableMissing,
  readBoardBySession,
  readPageRevision,
} from "@/lib/live-classroom/whiteboard-server"
import {
  broadcastWhiteboardEvent,
  buildPatchEvent,
} from "@/lib/live-classroom/whiteboard-events"

export const dynamic = "force-dynamic"

/**
 * POST /api/live/[id]/whiteboard/snapshot — تثبيت حالة صفحة (SMART-WB-1B)
 *
 * المسار الوحيد الذي يكتب على السبورة. الترتيب مقصود ولا يُعاد تركيبه:
 *
 *   صلاحية ← حدّ معدّل ← تحقق من الحمولة ← حكم المراجعة ← حفظ ← بثّ
 *
 * الحفظ قبل البثّ: القناة بلا ذاكرة، فحدث يُبثّ قبل الحفظ قد يعرض على الطلاب
 * حالة لا وجود لها على الخادم. وفشل البثّ بعد الحفظ لا يُبطل الحفظ — العميل
 * يستعيد من REST.
 *
 * لا يُقرأ من الجسم أي هوية أو دور: `WhiteboardSaveRequestSchema` لا يحمل
 * userId ولا role أصلاً، و`senderId` يُكتب من الجلسة المصادَق عليها.
 *
 * `sizeBytes` تبقى محسوبة في `appendSnapshot` على الخادم — لا تُقرأ من العميل.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const access = await resolveWhiteboardAccess(id, "write")
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    const userId = access.actor.user.id
    if (
      !checkRateLimit(
        `wb_write_${userId}`,
        WHITEBOARD_WRITE_LIMIT.max,
        WHITEBOARD_WRITE_LIMIT.windowMs
      )
    ) {
      return NextResponse.json(
        { error: WHITEBOARD_RATE_LIMITED.error },
        { status: WHITEBOARD_RATE_LIMITED.status }
      )
    }

    const body = await readJsonBody(request)
    const parsed = WhiteboardSaveRequestSchema.safeParse(body)
    if (!parsed.success) {
      // تجاوز الحجم يُفرَد عن الحمولة المشوَّهة: الأول يحتاج من المعلم إجراءً
      // (حذف عناصر أو صفحة جديدة)، والثاني خلل في العميل.
      if (byteSizeOf(body.elements) > WHITEBOARD_SNAPSHOT_MAX_BYTES) {
        return NextResponse.json(
          { error: WHITEBOARD_TOO_LARGE.error },
          { status: WHITEBOARD_TOO_LARGE.status }
        )
      }
      return NextResponse.json({ error: "حمولة غير صالحة" }, { status: 400 })
    }

    const board = await readBoardBySession(id)
    if (!board) {
      return NextResponse.json({ error: "السبورة غير مهيأة بعد" }, { status: 404 })
    }
    if (board.status !== "active") {
      return NextResponse.json(
        { error: "السبورة مؤرشفة — لا يمكن التعديل عليها" },
        { status: 409 }
      )
    }

    // المراجعة تُقرأ من الخادم ويُحكم عليها قبل الكتابة: عميل متأخّر لا يطمس
    // عملاً أحدث، وعميل يدّعي مراجعة أعلى يُرفض بدل أن يُقفز به العدّاد.
    const serverRevision = await readPageRevision(parsed.data.pageId)
    const verdict = resolveRevision({
      baseRevision: parsed.data.baseRevision,
      serverRevision,
    })
    // الفحص على `kind` مباشرة كي يُضيّق TypeScript النوع؛ الحكم نفسه هو
    // `resolveRevision` القائم بلا تغيير في دلالاته.
    if (verdict.kind !== "accept") {
      if (verdict.kind === "ahead") {
        console.error("[LIVE_WHITEBOARD] client revision ahead of server", {
          pageId: parsed.data.pageId,
          serverRevision,
        })
      }
      return NextResponse.json(
        { error: WHITEBOARD_CONFLICT.error, serverRevision },
        { status: WHITEBOARD_CONFLICT.status }
      )
    }

    const snapshot = await appendSnapshot({
      boardId: board.id,
      pageId: parsed.data.pageId,
      revision: verdict.nextRevision,
      elements: parsed.data.elements,
      actorUserId: userId,
    })

    // البثّ بعد الحفظ. الحمولة الثقيلة تصبح WB_SNAPSHOT_REQUIRED تلقائياً.
    await broadcastWhiteboardEvent(
      buildPatchEvent(
        { sessionId: id, boardId: board.id, senderId: userId },
        {
          pageId: snapshot.pageId,
          revision: snapshot.revision,
          elements: snapshot.elements,
        }
      )
    )

    return NextResponse.json({
      ok: true,
      pageId: snapshot.pageId,
      revision: snapshot.revision,
      sizeBytes: snapshot.sizeBytes,
    })
  } catch (error) {
    // الصفحة ليست من هذه السبورة — يُصنَّف بالرمز لا بنص الرسالة.
    if (isWhiteboardServerError(error) && error.code === "PAGE_NOT_IN_BOARD") {
      return NextResponse.json({ error: "الصفحة غير موجودة" }, { status: 404 })
    }
    // تسابق على نفس المراجعة بعد الحكم — الحاجز الأخير في قاعدة البيانات.
    if (isWhiteboardRevisionConflict(error)) {
      return NextResponse.json(
        { error: WHITEBOARD_CONFLICT.error },
        { status: WHITEBOARD_CONFLICT.status }
      )
    }
    if (isWhiteboardTableMissing(error)) {
      console.error("[LIVE_WHITEBOARD] whiteboard tables missing")
      return NextResponse.json(
        { error: "السبورة غير مهيأة بعد. تواصل مع الإدارة." },
        { status: 503 }
      )
    }
    console.error("[LIVE_WHITEBOARD_SNAPSHOT_ERROR]", error)
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 })
  }
}
