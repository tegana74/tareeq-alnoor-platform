"use client"

// SMART-WB-1B — غلاف Excalidraw (يُحمَّل ديناميكياً من `whiteboard-panel.tsx` فقط).
//
// هذا الملف هو الموضع الوحيد الذي يُستورد فيه `@excalidraw/excalidraw`. سبب
// عزله: المكتبة تعتمد `window` و`document` عند التحميل، فوجودها في وحدة يشملها
// الـ server bundle يكسر التصيير على الخادم. الاستيراد الوحيد إليه يمرّ عبر
// `next/dynamic({ ssr: false })`، فلا يدخل حزمة الخادم أصلاً.
//
// قواعد لا تُخالَف هنا:
//   1) لا شيء أمني: `readOnly` عرضٌ لقرار الخادم لا مصدره. الطالب يُمنع على
//      الخادم في `resolveWhiteboardAccess`، فتعطيل التحرير هنا واجهة لا حماية.
//   2) لا كتابة إلى الشبكة: `onElementsChange` يُرفع إلى `useWhiteboard` وهو من
//      يملك التثبيت (debounce + سقوف Phase 1A). لا fetch في هذا الملف.
//   3) العناصر حمولة معتمة: لا نُعيد تعريف مخطط Excalidraw ولا نُصلح عناصره.

import { useCallback, useEffect, useRef, useState } from "react"
import {
  CaptureUpdateAction,
  Excalidraw,
  getSceneVersion,
} from "@excalidraw/excalidraw"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import "@excalidraw/excalidraw/index.css"
import type { WhiteboardElement } from "@/lib/live-classroom/whiteboard"

/**
 * عناصر Excalidraw كما تعبر الحدّ بين المكتبة وطبقتنا.
 *
 * `WhiteboardElement` عقد سطحي مقصود (معرّف + نوع + passthrough) لأن إعادة
 * تعريف مخطط المكتبة كاملاً يكسر السبورات المحفوظة مع كل ترقية. المكتبة تطلب
 * نوعها الخاص، فالتحويل يقع في هذين المُحوِّلين وحدهما — لا `any` منتشرة.
 */
type ExcalidrawElements = Parameters<
  NonNullable<Parameters<typeof Excalidraw>[0]["onChange"]>
>[0]

function toLibraryElements(elements: readonly WhiteboardElement[]): ExcalidrawElements {
  return elements as unknown as ExcalidrawElements
}

function toWhiteboardElements(elements: ExcalidrawElements): WhiteboardElement[] {
  return elements as unknown as WhiteboardElement[]
}

export interface WhiteboardCanvasProps {
  /** حالة الصفحة كما ثبّتها الخادم. */
  elements: readonly WhiteboardElement[]
  /** مراجعة هذه الحالة — تتغيّر مع كل تثبيت، محلياً أو من كاتب آخر. */
  revision: number
  /** قرار الخادم: هل يحرّر هذا الفاعل؟ */
  readOnly: boolean
  /** تعديل محلي على العناصر — يُرفع كما هو بلا حفظ ولا بثّ. */
  onElementsChange: (elements: WhiteboardElement[]) => void
}

export function WhiteboardCanvas({
  elements,
  revision,
  readOnly,
  onElementsChange,
}: WhiteboardCanvasProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  /** آخر مراجعة طُبّقت على المشهد — يمنع إعادة تطبيق نفس الحالة. */
  const appliedRevisionRef = useRef(revision)
  /**
   * أول عناصر مُرِّرت — `initialData` تُقرأ مرة واحدة عند التركيب.
   *
   * حالة لا ref: القيمة تُقرأ أثناء التصيير، وحالة بمُهيِّئ تُحسب مرة واحدة ولا
   * تُحدَّث بعدها (لا setter). تغيّر الصفحة يُعيد التركيب بالمفتاح في اللوحة.
   */
  const [initialElements] = useState(() => elements)

  /**
   * تعديل محلي.
   *
   * `onChange` تنطلق أيضاً على تغييرات لا تمسّ العناصر (تمرير، تحديد، تكبير).
   * `getSceneVersion` يتغيّر مع العناصر وحدها، فمقارنته تمنع سيلاً من الكتابات
   * على تحريك المؤشر — وهو ما يستهلك سقف معدّل الكتابة بلا أي تعديل حقيقي.
   */
  const sceneVersionRef = useRef(getSceneVersion(toLibraryElements(elements)))

  const handleChange = useCallback(
    (next: ExcalidrawElements) => {
      if (readOnly) return
      const version = getSceneVersion(next)
      if (version === sceneVersionRef.current) return
      sceneVersionRef.current = version
      onElementsChange(toWhiteboardElements(next))
    },
    [readOnly, onElementsChange]
  )

  /**
   * تطبيق حالة وصلت من الخادم (بثّ كاتب آخر، أو استعادة بعد انقطاع).
   *
   * الشرط على المراجعة لا على العناصر: الكاتب نفسه تتقدّم مراجعته من ردّ الحفظ
   * بنفس العناصر التي أرسلها، فمقارنة `getSceneVersion` تُسقط ذلك الصدى ولا
   * يُعاد بناء مشهده أثناء الرسم. `captureUpdate: NEVER` كي لا تُسجَّل الحالة
   * القادمة من غيرنا في تاريخ التراجع المحلي.
   */
  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    if (revision === appliedRevisionRef.current) return
    appliedRevisionRef.current = revision

    const incoming = toLibraryElements(elements)
    const incomingVersion = getSceneVersion(incoming)
    if (incomingVersion === sceneVersionRef.current) return

    sceneVersionRef.current = incomingVersion
    api.updateScene({
      elements: incoming,
      captureUpdate: CaptureUpdateAction.NEVER,
    })
  }, [revision, elements])

  return (
    <div
      className="h-[60vh] min-h-[380px] w-full overflow-hidden rounded-xl border border-slate-200 bg-white"
      data-testid="whiteboard-canvas"
      data-readonly={readOnly ? "true" : "false"}
    >
      <Excalidraw
        excalidrawAPI={(api) => {
          apiRef.current = api
        }}
        initialData={{
          elements: toLibraryElements(initialElements),
          scrollToContent: true,
        }}
        onChange={handleChange}
        viewModeEnabled={readOnly}
        // عربية الواجهة — نفس لغة بقية القاعة. الاتجاه تديره المكتبة من اللغة.
        langCode="ar-SA"
        // لا حوار Mermaid/«نص إلى مخطط»: خارج نطاق هذا الطور، وتحميله يجرّ شجرة
        // أثقل بلا مقابل.
        aiEnabled={false}
      />
    </div>
  )
}
