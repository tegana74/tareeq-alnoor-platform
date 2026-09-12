// SMART-WB-1B — أدوات مشتركة لمواصفات السبورة في المتصفح.
//
// لا منطق تطبيق هنا: مُحدِّدات (selectors) وإجراءات متصفح فقط. سبب وجود الملف أن
// المعلم والطالب واللمس يتقاسمون نفس نقاط الدخول (زر الفتح، حاوية اللوحة، شريط
// الصفحات)، وتكرارها في ثلاث مواصفات يعني أن أي تغيير في الواجهة يكسرها متفرّقة.
//
// حدود مقصودة:
//   - لا تجاوز مصادقة: كل سياق يحمل كوكي جلسة حقيقياً من `global-setup`، والخادم
//     يحلّ الهوية كما يفعل مع أي متصفح.
//   - `ensureBoardViaTeacher` تهيئة اختبار لا اختصار صلاحيات: طلب REST حقيقي
//     بكوكي المعلم، يمرّ على `resolveWhiteboardAccess` كاملاً.

import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test"

/** حاوية اللوحة كما يعرّفها `whiteboard-canvas.tsx` (تحمل `data-readonly`). */
export const CANVAS_BOX = '[data-testid="whiteboard-canvas"]'

/** مساحة الرسم الفعلية لـ Excalidraw — الطبقة التي تستقبل المؤشر/اللمس. */
export const INTERACTIVE_CANVAS = "canvas.excalidraw__canvas.interactive"

/** الطبقة التي تُرسم فيها العناصر المثبَّتة — منها نقرأ البكسل. */
export const STATIC_CANVAS = "canvas.excalidraw__canvas.static"

/** قسم السبورة داخل صفحة القاعة. */
export function panel(page: Page): Locator {
  return page.locator("section").filter({ hasText: "السبورة الذكية" }).first()
}

/** فتح اللوحة (لا تحميل ولا مستمع قبل ذلك — `enabled` في `useWhiteboard`). */
export async function openWhiteboard(page: Page): Promise<Locator> {
  const section = panel(page)
  await expect(section).toBeVisible()
  await section.getByRole("button", { name: "فتح السبورة" }).click()
  return section
}

/** شريط صفحات السبورة. */
export function pageTabs(page: Page): Locator {
  return page.getByRole("tablist", { name: "صفحات السبورة" }).getByRole("tab")
}

/**
 * انتظار تصيير Excalidraw فعلياً — لا مجرد وجود الحاوية.
 *
 * الشرطان معاً مقصودان: الحاوية تُصيَّر من `whiteboard-panel` قبل أن تُحمَّل
 * المكتبة (هناك `loading` placeholder)، والـ canvas وحده لا يُثبت أن تطبيق
 * React الخاص بالمكتبة ركّب فعلاً. القياس على الأبعاد لأن canvas بمقاس صفر
 * يعني تصييراً فاشلاً بلا خطأ ظاهر.
 */
export async function expectExcalidrawRendered(page: Page): Promise<void> {
  await expect(page.locator(CANVAS_BOX)).toBeVisible()
  const canvas = page.locator(STATIC_CANVAS).first()
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  expect(box, "canvas Excalidraw بلا أبعاد ⇒ لم يُصيَّر").not.toBeNull()
  expect(box!.width).toBeGreaterThan(100)
  expect(box!.height).toBeGreaterThan(100)
}

/**
 * عدد البكسلات غير البيضاء في الطبقة الثابتة.
 *
 * دليل تصيير حقيقي لا DOM: العناصر المثبَّتة تُرسم على هذا canvas، فصفر حبر بعد
 * رسم يعني أن المكتبة لم ترسم شيئاً. أخذ عيّنة كل 4 بكسلات يكفي لفرق كبير
 * (مستطيل) ويُبقي القراءة سريعة.
 */
export async function countInk(page: Page): Promise<number> {
  return page.locator(STATIC_CANVAS).first().evaluate((node) => {
    const canvas = node as HTMLCanvasElement
    const context = canvas.getContext("2d")
    if (!context) return -1
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let ink = 0
    for (let index = 0; index < data.length; index += 16) {
      const alpha = data[index + 3]
      if (alpha === 0) continue
      if (data[index] < 240 || data[index + 1] < 240 || data[index + 2] < 240) ink += 1
    }
    return ink
  })
}

/** إحداثيات مركز الطبقة التفاعلية — نقطة بدء آمنة بعيدة عن أشرطة الأدوات. */
export async function canvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator(INTERACTIVE_CANVAS).first().boundingBox()
  if (!box) throw new Error("لا أبعاد للطبقة التفاعلية")
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** اختيار أداة المستطيل من شريط أدوات المكتبة (يظهر في وضع التحرير فقط). */
export async function selectRectangleTool(page: Page): Promise<void> {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
}

/** رسم مستطيل بالمؤشر — سحب حقيقي لا نداء API. */
export async function drawRectangleWithMouse(page: Page): Promise<void> {
  const center = await canvasCenter(page)
  await page.mouse.move(center.x - 120, center.y - 70)
  await page.mouse.down()
  await page.mouse.move(center.x - 40, center.y - 10, { steps: 8 })
  await page.mouse.move(center.x + 60, center.y + 60, { steps: 8 })
  await page.mouse.up()
}

/**
 * تهيئة سبورة الجلسة بكوكي المعلم عبر REST.
 *
 * تُستخدم في مواصفة الطالب فقط: الطالب لا يُنشئ سبورة (والمسار يرفضه)، فبدون
 * تهيئة مسبقة تكون الحالة «فارغة» ولا شيء ليُقرأ. المعلم يُهيّئها في مواصفته
 * عبر الواجهة، وهنا عبر المسار كي لا تتعلّق مواصفة بترتيب تنفيذ أخرى.
 */
export async function ensureBoardViaTeacher(
  api: APIRequestContext,
  sessionId: string
): Promise<{ activePageId: string; revision: number }> {
  const response = await api.post(`/api/live/${sessionId}/whiteboard`)
  expect(
    response.ok(),
    `تهيئة السبورة فشلت: ${response.status()} ${await response.text()}`
  ).toBeTruthy()
  const payload = await response.json()
  return { activePageId: payload.activePageId, revision: payload.revision ?? 0 }
}

/** قراءة حالة السبورة بكوكي معطى — للتأكد من أثر (أو انعدام أثر) على الخادم. */
export async function readBoardState(
  api: APIRequestContext,
  sessionId: string
): Promise<{ status: number; revision: number; elements: unknown[]; pages: unknown[]; canWrite: boolean }> {
  const response = await api.get(`/api/live/${sessionId}/whiteboard`)
  const payload = await response.json().catch(() => ({}))
  return {
    status: response.status(),
    revision: payload.revision ?? 0,
    elements: payload.elements ?? [],
    pages: payload.pages ?? [],
    canWrite: Boolean(payload.canWrite),
  }
}

/**
 * تسجيل كل WebSocket يُفتح في الصفحة قبل أي تنقّل.
 *
 * الغرض: إثبات سلوكي — لا فحص شيفرة — أن فتح السبورة لا يفتح نقلاً ثانياً.
 * التغليف يقع في `addInitScript` كي يسبق أي كود تطبيق، والقائمة تُقرأ من
 * `window` بعد كل خطوة.
 */
export async function trackWebSockets(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const urls: string[] = []
    ;(window as unknown as { __wsUrls: string[] }).__wsUrls = urls
    const Native = window.WebSocket
    class Tracked extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        urls.push(String(url))
        super(url, protocols)
      }
    }
    window.WebSocket = Tracked as unknown as typeof WebSocket
  })
  return async () =>
    page.evaluate(() => (window as unknown as { __wsUrls?: string[] }).__wsUrls ?? [])
}

/** WebSockets التي تخصّ نقل LiveKit (لا HMR في وضع dev). */
export function livekitSockets(urls: readonly string[]): string[] {
  return urls.filter(
    (url) => /livekit/i.test(url) || /\/rtc(\?|$)/.test(url)
  )
}
