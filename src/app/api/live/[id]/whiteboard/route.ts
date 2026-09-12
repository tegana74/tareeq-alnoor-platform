import { NextResponse, type NextRequest } from "next/server"
import { resolveWhiteboardAccess } from "@/lib/live-classroom/whiteboard-access"
import {
  ensureBoard,
  isWhiteboardTableMissing,
  readWhiteboardState,
} from "@/lib/live-classroom/whiteboard-server"
import { checkRateLimit } from "@/lib/live-classroom/rate-limit"

export const dynamic = "force-dynamic"

/** جداول السبورة غير مهيأة — fail-closed بلا تفاصيل داخلية. */
const WHITEBOARD_UNAVAILABLE = {
  status: 503,
  error: "السبورة غير مهيأة بعد. تواصل مع الإدارة.",
} as const

/**
 * GET /api/live/[id]/whiteboard — قراءة حالة السبورة (SMART-WB-1B)
 *
 * المسار الذي يعتمد عليه كل استعادة: عند الدخول، وبعد انقطاع القناة، وعند كل
 * حدث لا يمكن تطبيقه محلياً. لا يُنشئ شيئاً — الطالب لا يجب أن يُنشئ سبورة
 * بمجرد فتح الصفحة قبل المعلم.
 *
 * `board: null` ليست خطأ: الجلسة قد لا تكون لها سبورة بعد. الواجهة تعرض حالة
 * فارغة ولا تُظهر رسالة خطأ.
 *
 * `pageId` اختياري: بدونه تُعاد الصفحة المعروضة كما يعرضها المعلم الآن.
 * أي معرّف لا ينتمي إلى هذه السبورة يتجاهله `readWhiteboardState` ويعود إلى
 * الصفحة المعروضة — لا يمكن قراءة صفحة سبورة أخرى من هنا.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const access = await resolveWhiteboardAccess(id, "read")
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    if (!checkRateLimit(`wb_read_${access.actor.user.id}`, 40, 10_000)) {
      return NextResponse.json(
        { error: "طلبات كثيرة جداً. انتظر لحظة." },
        { status: 429 }
      )
    }

    const pageId = request.nextUrl.searchParams.get("pageId") ?? undefined

    let state
    try {
      state = await readWhiteboardState(id, pageId)
    } catch (error) {
      if (isWhiteboardTableMissing(error)) {
        console.error("[LIVE_WHITEBOARD] whiteboard tables missing")
        return NextResponse.json(
          { error: WHITEBOARD_UNAVAILABLE.error },
          { status: WHITEBOARD_UNAVAILABLE.status }
        )
      }
      throw error
    }

    if (!state) {
      return NextResponse.json({ board: null, canWrite: access.actor.canWrite })
    }

    return NextResponse.json({ ...state, canWrite: access.actor.canWrite })
  } catch (error) {
    console.error("[LIVE_WHITEBOARD_GET_ERROR]", error)
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 })
  }
}

/**
 * POST /api/live/[id]/whiteboard — تهيئة سبورة الجلسة (SMART-WB-1B)
 *
 * يمرّ على `ensureBoard` القائم بلا أي تعديل: idempotent تحت التزامن (تبوين
 * المعلم أو جهازان) بفضل القيد الفريد على `sessionId` ومعالجة P2002 داخله.
 * لا منطق إنشاء سبورة في المتصفح، ولا تكرار له هنا.
 *
 * الكتابة فقط: الطالب لا يُهيّئ سبورة، ولا يُهيّئها معلم لجلسة منتهية.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const access = await resolveWhiteboardAccess(id, "write")
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    if (!checkRateLimit(`wb_init_${access.actor.user.id}`, 10, 10_000)) {
      return NextResponse.json(
        { error: "طلبات كثيرة جداً. انتظر لحظة." },
        { status: 429 }
      )
    }

    try {
      await ensureBoard({ sessionId: id, actorUserId: access.actor.user.id })
      const state = await readWhiteboardState(id)
      return NextResponse.json({ ...state, canWrite: true })
    } catch (error) {
      if (isWhiteboardTableMissing(error)) {
        console.error("[LIVE_WHITEBOARD] whiteboard tables missing")
        return NextResponse.json(
          { error: WHITEBOARD_UNAVAILABLE.error },
          { status: WHITEBOARD_UNAVAILABLE.status }
        )
      }
      throw error
    }
  } catch (error) {
    console.error("[LIVE_WHITEBOARD_POST_ERROR]", error)
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 })
  }
}
