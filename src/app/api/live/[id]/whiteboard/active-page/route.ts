import { NextResponse, type NextRequest } from "next/server"
import { readJsonBody } from "@/lib/live-classroom/admission-server"
import { checkRateLimit } from "@/lib/live-classroom/rate-limit"
import { resolveWhiteboardAccess } from "@/lib/live-classroom/whiteboard-access"
import {
  WHITEBOARD_RATE_LIMITED,
  WHITEBOARD_WRITE_LIMIT,
  WhiteboardSetActivePageSchema,
} from "@/lib/live-classroom/whiteboard"
import {
  isWhiteboardTableMissing,
  readBoardBySession,
  setActivePage,
} from "@/lib/live-classroom/whiteboard-server"
import {
  broadcastWhiteboardEvent,
  buildActivePageEvent,
} from "@/lib/live-classroom/whiteboard-events"

export const dynamic = "force-dynamic"

/**
 * POST /api/live/[id]/whiteboard/active-page — نقل العرض إلى صفحة (SMART-WB-1B)
 *
 * الصفحة المعروضة يقرّرها المعلم فقط؛ الطالب يتابع ولا ينقل. الانتماء يُفحص في
 * `setActivePage` على الخادم (count على (id, boardId)) فلا يمكن تعيين صفحة من
 * سبورة أخرى — تُعاد false فيردّ المسار 404 بلا تفاصيل.
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
        `wb_active_${userId}`,
        WHITEBOARD_WRITE_LIMIT.max,
        WHITEBOARD_WRITE_LIMIT.windowMs
      )
    ) {
      return NextResponse.json(
        { error: WHITEBOARD_RATE_LIMITED.error },
        { status: WHITEBOARD_RATE_LIMITED.status }
      )
    }

    const parsed = WhiteboardSetActivePageSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return NextResponse.json({ error: "معرّف الصفحة مطلوب" }, { status: 400 })
    }

    const board = await readBoardBySession(id)
    if (!board) {
      return NextResponse.json({ error: "السبورة غير مهيأة بعد" }, { status: 404 })
    }

    const moved = await setActivePage({ boardId: board.id, pageId: parsed.data.pageId })
    if (!moved) {
      return NextResponse.json({ error: "الصفحة غير موجودة" }, { status: 404 })
    }

    await broadcastWhiteboardEvent(
      buildActivePageEvent(
        { sessionId: id, boardId: board.id, senderId: userId },
        parsed.data.pageId
      )
    )

    return NextResponse.json({ ok: true, activePageId: parsed.data.pageId })
  } catch (error) {
    if (isWhiteboardTableMissing(error)) {
      console.error("[LIVE_WHITEBOARD] whiteboard tables missing")
      return NextResponse.json(
        { error: "السبورة غير مهيأة بعد. تواصل مع الإدارة." },
        { status: 503 }
      )
    }
    console.error("[LIVE_WHITEBOARD_ACTIVE_PAGE_ERROR]", error)
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 })
  }
}
