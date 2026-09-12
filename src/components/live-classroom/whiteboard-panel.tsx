"use client"

// SMART-WB-1B — لوحة السبورة داخل القاعة المباشرة.
//
// نقطة الدخول الوحيدة إلى السبورة: تُركّب في `live-room-client.tsx` للمعلم/الأدمن
// وداخل بوابة الدخول للطالب. لا مسار خاص بالسبورة ولا صفحة منفصلة — الجلسة
// واحدة، ومعرّفها هو معرّف الغرفة نفسه المستخدم في كل مسارات القاعة.
//
// حدود المسؤولية:
//   - الحالة والشبكة والقناة: `useWhiteboard` (طبقة قائمة، لا تُكرَّر هنا).
//   - الصلاحية: الخادم. `canWrite` القادم من المسار عرضٌ لقراره لا مصدره.
//   - Excalidraw: يُحمَّل ديناميكياً بلا SSR — هذا هو الاستيراد الوحيد إليه.

import dynamic from "next/dynamic"
import { useState } from "react"
import type { Room } from "livekit-client"
import { AlertCircle, Loader2, Plus, PencilRuler, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWhiteboard } from "@/lib/live-classroom/use-whiteboard"
import { canAddPage, canRemovePage } from "@/lib/live-classroom/whiteboard"

/**
 * Excalidraw خارج حزمة الخادم تماماً.
 *
 * المكتبة تلمس `window` عند التحميل، و`ssr: false` يمنع تصييرها على الخادم؛
 * كونها في وحدة منفصلة تُستورد هنا بـ import() يمنع أيضاً دخول شيء من شجرتها
 * إلى الحزمة المشتركة. `loading` يحفظ ارتفاع المنطقة فلا تقفز الصفحة.
 */
const WhiteboardCanvas = dynamic(
  () => import("./whiteboard-canvas").then((mod) => mod.WhiteboardCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[60vh] min-h-[380px] w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    ),
  }
)

export interface WhiteboardPanelProps {
  sessionId: string
  /** هوية المستخدم من الجلسة المصادَق عليها على الخادم (لتمييز صدى كتابتنا). */
  userId: string
  /** غرفة LiveKit القائمة؛ null يعني «لا قناة الآن» فتُستخدم الاستعادة بالاستعلام. */
  room: Room | null
  /**
   * هل يُتوقَّع من هذا الفاعل أن يُدير السبورة؟ للعرض المبدئي فقط: زر التهيئة
   * ونصوص الحالة الفارغة. الكتابة نفسها يقرّرها الخادم عبر `canWrite`.
   */
  canManage: boolean
}

export function WhiteboardPanel({
  sessionId,
  userId,
  room,
  canManage,
}: WhiteboardPanelProps) {
  const [open, setOpen] = useState(false)
  const board = useWhiteboard({ sessionId, userId, room, enabled: open })

  const pages = board.board?.pages ?? []
  const activePageId = board.board?.activePageId ?? null
  const activeIndex = pages.findIndex((page) => page.id === activePageId)

  return (
    <section className="mb-6 rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-black text-navy">
          <PencilRuler className="h-4.5 w-4.5 text-amber-600" />
          السبورة الذكية
        </h3>
        {/* `Button` المشترك لا يمرّر سمات ARIA — النص المرئي هو الاسم المتاح،
            وهو يتغيّر بين «فتح» و«إغلاق» فلا حاجة لـ aria-label مكرّر. */}
        <Button
          variant={open ? "outline" : "primary"}
          size="sm"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (
            <>
              <X className="h-4 w-4" />
              إغلاق السبورة
            </>
          ) : (
            "فتح السبورة"
          )}
        </Button>
      </div>

      {!open && (
        <p className="mt-2 text-xs font-bold text-slate-400">
          {canManage
            ? "افتح السبورة للشرح والرسم أمام الطلاب."
            : "افتح السبورة لمتابعة ما يشرحه المعلم."}
        </p>
      )}

      {open && (
        <div className="mt-4">
          {/* رسالة خطأ للمستخدم بلا أي تفصيل داخلي — نصوص المسارات جاهزة لذلك */}
          {board.error && (
            <p
              className="mb-3 flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-bold text-rose-600"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {board.error}
            </p>
          )}

          {board.status === "loading" && (
            <div className="flex h-[60vh] min-h-[380px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          )}

          {/* لا سبورة لهذه الجلسة بعد. الطالب لا يُنشئها — المسار يرفضه أصلاً. */}
          {board.status === "empty" && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
              <PencilRuler className="mx-auto mb-3 h-10 w-10 text-slate-400" />
              {canManage ? (
                <>
                  <p className="mb-4 text-sm font-bold text-slate-600">
                    لم تُهيَّأ سبورة لهذه الجلسة بعد.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void board.initBoard()}
                  >
                    تهيئة السبورة
                  </Button>
                </>
              ) : (
                <p className="text-sm font-bold text-slate-500">
                  لم يفتح المعلم السبورة بعد.
                </p>
              )}
            </div>
          )}

          {board.status === "ready" && board.board && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {/* شريط الصفحات — التنقل للجميع؟ لا: نقل العرض قرار المعلم،
                    والمسار يرفض الطالب. الأزرار تُعطَّل بحسب قرار الخادم. */}
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="tablist"
                  aria-label="صفحات السبورة"
                >
                  {pages.map((page, index) => (
                    <button
                      key={page.id}
                      type="button"
                      role="tab"
                      aria-selected={page.id === activePageId}
                      disabled={!board.canWrite || page.id === activePageId}
                      onClick={() => void board.selectPage(page.id)}
                      className={`h-8 min-w-8 rounded-lg px-2 text-xs font-black transition-colors ${
                        page.id === activePageId
                          ? "bg-navy text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:hover:bg-slate-100"
                      }`}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>

                {board.canWrite && !board.board.closed && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void board.createPage()}
                      disabled={!canAddPage(pages)}
                    >
                      <Plus className="h-4 w-4" />
                      صفحة جديدة
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (activePageId) void board.removePage(activePageId)
                      }}
                      disabled={!activePageId || !canRemovePage(pages)}
                      className="text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                      حذف الصفحة
                    </Button>
                  </div>
                )}

                <span className="ms-auto text-[11px] font-bold text-slate-400">
                  {activeIndex >= 0
                    ? `صفحة ${activeIndex + 1} من ${pages.length}`
                    : `${pages.length} صفحة`}
                  {board.dirty && board.canWrite ? " — جارٍ الحفظ..." : ""}
                </span>
              </div>

              {board.board.closed && (
                <p className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-500">
                  السبورة مؤرشفة — للقراءة فقط.
                </p>
              )}

              {activePageId ? (
                <WhiteboardCanvas
                  // إعادة تركيب عند تغيّر الصفحة: `initialData` تُقرأ مرة واحدة،
                  // فبدون المفتاح تبقى عناصر الصفحة السابقة على المشهد.
                  key={activePageId}
                  elements={board.board.elements}
                  revision={board.board.revision}
                  readOnly={!board.canWrite || board.board.closed}
                  onElementsChange={board.pushElements}
                />
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
                  لا صفحات في هذه السبورة.
                </div>
              )}
            </>
          )}

          {board.status === "error" && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
              <Button variant="outline" size="sm" onClick={() => void board.reload()}>
                إعادة المحاولة
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
