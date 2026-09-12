import { NextResponse, type NextRequest } from "next/server"
import { readJsonBody } from "@/lib/live-classroom/admission-server"
import { checkRateLimit } from "@/lib/live-classroom/rate-limit"
import { resolveWhiteboardAccess } from "@/lib/live-classroom/whiteboard-access"
import {
  canAddPage,
  canRemovePage,
  resolveActivePageAfterRemoval,
  WHITEBOARD_MAX_PAGES,
  WHITEBOARD_RATE_LIMITED,
  WHITEBOARD_WRITE_LIMIT,
  WhiteboardCreatePageSchema,
} from "@/lib/live-classroom/whiteboard"
import {
  createPage,
  isWhiteboardServerError,
  isWhiteboardTableMissing,
  readBoardBySession,
  readPages,
  removePage,
} from "@/lib/live-classroom/whiteboard-server"
import {
  broadcastWhiteboardEvent,
  buildActivePageEvent,
  buildPagesChangedEvent,
} from "@/lib/live-classroom/whiteboard-events"

export const dynamic = "force-dynamic"

/** بوابة مشتركة للمسارين: صلاحية كتابة + حدّ معدّل + سبورة قائمة. */
async function resolveWritableBoard(sessionId: string) {
  const access = await resolveWhiteboardAccess(sessionId, "write")
  if (!access.ok) {
    return { ok: false as const, response: denial(access.status, access.error) }
  }

  const userId = access.actor.user.id
  if (
    !checkRateLimit(
      `wb_pages_${userId}`,
      WHITEBOARD_WRITE_LIMIT.max,
      WHITEBOARD_WRITE_LIMIT.windowMs
    )
  ) {
    return {
      ok: false as const,
      response: denial(WHITEBOARD_RATE_LIMITED.status, WHITEBOARD_RATE_LIMITED.error),
    }
  }

  const board = await readBoardBySession(sessionId)
  if (!board) {
    return { ok: false as const, response: denial(404, "السبورة غير مهيأة بعد") }
  }
  if (board.status !== "active") {
    return {
      ok: false as const,
      response: denial(409, "السبورة مؤرشفة — لا يمكن التعديل عليها"),
    }
  }

  return { ok: true as const, board, userId }
}

function denial(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}

/** أخطاء الطبقة السفلى تُترجَم بالرمز لا بنص الرسالة. */
function handleFailure(error: unknown, tag: string) {
  if (isWhiteboardServerError(error) && error.code === "PAGE_NOT_IN_BOARD") {
    return denial(404, "الصفحة غير موجودة")
  }
  if (isWhiteboardTableMissing(error)) {
    console.error("[LIVE_WHITEBOARD] whiteboard tables missing")
    return denial(503, "السبورة غير مهيأة بعد. تواصل مع الإدارة.")
  }
  console.error(tag, error)
  return denial(500, "حدث خطأ غير متوقع")
}

/**
 * POST /api/live/[id]/whiteboard/pages — صفحة جديدة (SMART-WB-1B)
 *
 * الترقيم يُحسب في `createPage` داخل معاملة (عدد الصفحات الحالي) — لا يُقرأ من
 * العميل رقم ولا موضع. حدّ الصفحات يُفحص على الخادم قبل الإنشاء.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const gate = await resolveWritableBoard(id)
    if (!gate.ok) return gate.response

    const parsed = WhiteboardCreatePageSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return denial(400, "عنوان الصفحة غير صالح")
    }

    const pages = await readPages(gate.board.id)
    if (!canAddPage(pages)) {
      return denial(409, `لا يمكن تجاوز ${WHITEBOARD_MAX_PAGES} صفحة في السبورة`)
    }

    const page = await createPage({ boardId: gate.board.id, title: parsed.data.title })
    const updated = await readPages(gate.board.id)

    await broadcastWhiteboardEvent(
      buildPagesChangedEvent(
        { sessionId: id, boardId: gate.board.id, senderId: gate.userId },
        updated
      )
    )

    return NextResponse.json({ ok: true, page, pages: updated })
  } catch (error) {
    return handleFailure(error, "[LIVE_WHITEBOARD_PAGES_POST_ERROR]")
  }
}

/**
 * DELETE /api/live/[id]/whiteboard/pages?pageId=… — حذف صفحة (SMART-WB-1B)
 *
 * الانتماء لا يُستنتج في العميل: `removePage` المُصلَّب يحذف بقيد
 * (id, boardId) معاً ويرمي `PAGE_NOT_IN_BOARD` إن لم يطابق شيئاً — قبل أي
 * إعادة ترقيم. هذا السلوك يُستهلك كما هو ولا يُلتَف عليه.
 *
 * الصفحة المعروضة تُنقل فقط إن كانت هي المحذوفة؛ حذف صفحة أخرى لا يزحزح ما
 * يراه الطلاب.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const gate = await resolveWritableBoard(id)
    if (!gate.ok) return gate.response

    const pageId = request.nextUrl.searchParams.get("pageId")
    if (!pageId) {
      return denial(400, "معرّف الصفحة مطلوب")
    }

    const pages = await readPages(gate.board.id)
    if (!canRemovePage(pages)) {
      return denial(409, "لا يمكن حذف الصفحة الوحيدة في السبورة")
    }

    const nextActivePageId =
      gate.board.activePageId === pageId
        ? resolveActivePageAfterRemoval(pages, pageId)
        : gate.board.activePageId

    const remaining = await removePage({
      boardId: gate.board.id,
      pageId,
      nextActivePageId,
    })

    await broadcastWhiteboardEvent(
      buildPagesChangedEvent(
        { sessionId: id, boardId: gate.board.id, senderId: gate.userId },
        remaining
      )
    )
    if (nextActivePageId && nextActivePageId !== gate.board.activePageId) {
      await broadcastWhiteboardEvent(
        buildActivePageEvent(
          { sessionId: id, boardId: gate.board.id, senderId: gate.userId },
          nextActivePageId
        )
      )
    }

    return NextResponse.json({
      ok: true,
      pages: remaining,
      activePageId: nextActivePageId,
    })
  } catch (error) {
    return handleFailure(error, "[LIVE_WHITEBOARD_PAGES_DELETE_ERROR]")
  }
}
