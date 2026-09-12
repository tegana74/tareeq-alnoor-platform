// SMART-WB-1B — المسار الحرج للمعلم في متصفح حقيقي.
//
// لماذا الجلسة المجدولة لا المباشرة: `isWhiteboardWritableStatus` يسمح بالكتابة في
// `scheduled`، والقاعة لا تطلب بثّ LiveKit في هذه الحالة — فما يُختبر هنا هو
// السبورة وحدها بلا تعليق على توفّر وسيط بثّ.
//
// كل تأكيد هنا سلوك مرصود في المتصفح: تصيير المكتبة يُقاس ببكسل مرسوم لا بوجود
// عقدة DOM، والحفظ يُقاس بردّ المسار لا بحالة React.

import { test, expect } from "@playwright/test"
import { IDS, TEACHER_STATE } from "./fixtures/e2e-data"
import {
  CANVAS_BOX,
  countInk,
  drawRectangleWithMouse,
  expectExcalidrawRendered,
  openWhiteboard,
  pageTabs,
  panel,
  selectRectangleTool,
} from "./fixtures/whiteboard-helpers"

test.use({ storageState: TEACHER_STATE })

const ROOM = `/live/${IDS.scheduledSession}`

/** تهيئة السبورة إن لم تكن مهيَّأة — الحالة الفارغة مشروعة عند أول تشغيل. */
async function ensureReady(page: import("@playwright/test").Page) {
  const section = panel(page)
  const initButton = section.getByRole("button", { name: "تهيئة السبورة" })
  await expect(
    section.locator(CANVAS_BOX).or(initButton),
    "لا لوحة ولا زر تهيئة — راجع رسالة الخطأ في اللوحة"
  ).toBeVisible({ timeout: 40_000 })
  if (await initButton.isVisible()) await initButton.click()
  await expectExcalidrawRendered(page)
}

test("المعلم: فتح السبورة، رسم، إنشاء صفحة، تبديلها، حذفها", async ({ page }) => {
  await page.goto(ROOM)

  await test.step("القاعة ولوحة السبورة ظاهرتان", async () => {
    await expect(page.getByRole("heading", { name: /جلسة اختبار السبورة/ })).toBeVisible()
    await expect(panel(page)).toBeVisible()
  })

  await test.step("فتح السبورة وتصيير Excalidraw فعلياً", async () => {
    await openWhiteboard(page)
    await ensureReady(page)
    // شريط الأدوات دليل إضافي على تركيب تطبيق المكتبة لا الحاوية وحدها
    await expect(page.locator('[data-testid="toolbar-rectangle"]')).toBeVisible()
    await expect(page.locator(CANVAS_BOX)).toHaveAttribute("data-readonly", "false")
  })

  await test.step("رسم مستطيل يُثبَّت على الخادم", async () => {
    const inkBefore = await countInk(page)
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes("/whiteboard/snapshot") &&
        response.request().method() === "POST"
    )
    await selectRectangleTool(page)
    await drawRectangleWithMouse(page)

    const response = await saved
    expect(response.status(), await response.text()).toBe(200)
    const payload = await response.json()
    expect(payload.revision).toBeGreaterThan(0)

    // حبر فعلي على الطبقة الثابتة ⇒ المكتبة رسمت العنصر لا مجرّد استقبلت الحدث
    await expect
      .poll(() => countInk(page), { timeout: 15_000 })
      .toBeGreaterThan(inkBefore + 50)
  })

  await test.step("إنشاء صفحة جديدة", async () => {
    await expect(pageTabs(page)).toHaveCount(1)
    await panel(page).getByRole("button", { name: "صفحة جديدة" }).click()
    await expect(pageTabs(page)).toHaveCount(2)
    await expect(panel(page)).toContainText("صفحة 1 من 2")
  })

  await test.step("التبديل إلى الصفحة الجديدة", async () => {
    await pageTabs(page).nth(1).click()
    await expect(pageTabs(page).nth(1)).toHaveAttribute("aria-selected", "true")
    await expect(panel(page)).toContainText("صفحة 2 من 2")
    await expectExcalidrawRendered(page)
    // صفحة جديدة فارغة: لا عناصر الصفحة الأولى على مشهدها
    await expect.poll(() => countInk(page), { timeout: 15_000 }).toBeLessThan(50)
  })

  await test.step("حذف الصفحة المعروضة والواجهة تبقى سليمة", async () => {
    await panel(page).getByRole("button", { name: "حذف الصفحة" }).click()
    await expect(pageTabs(page)).toHaveCount(1)
    await expect(panel(page)).toContainText("صفحة 1 من 1")
    await expect(page.locator(CANVAS_BOX)).toBeVisible()
    await expect(panel(page).getByRole("alert")).toHaveCount(0)
    // الصفحة الأخيرة لا تُحذف — `canRemovePage`
    await expect(
      panel(page).getByRole("button", { name: "حذف الصفحة" })
    ).toBeDisabled()
    // العودة إلى الصفحة الأولى تُعيد رسمها المحفوظ
    await expect.poll(() => countInk(page), { timeout: 15_000 }).toBeGreaterThan(50)
  })
})

test("المعلم: الرسم يبقى بعد إعادة تحميل الصفحة", async ({ page }) => {
  await page.goto(ROOM)
  await openWhiteboard(page)
  await ensureReady(page)

  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("/whiteboard/snapshot") &&
      response.request().method() === "POST"
  )
  await selectRectangleTool(page)
  await drawRectangleWithMouse(page)
  expect((await saved).status()).toBe(200)
  await expect.poll(() => countInk(page), { timeout: 15_000 }).toBeGreaterThan(50)

  await page.reload()
  await openWhiteboard(page)
  await expectExcalidrawRendered(page)
  // الاستعادة من الخادم لا من ذاكرة المتصفح: الصفحة أُعيد تحميلها كاملة
  await expect.poll(() => countInk(page), { timeout: 20_000 }).toBeGreaterThan(50)
})

test("المعلم: العربية والاتجاه من اليمين إلى اليسار", async ({ page }) => {
  await page.goto(ROOM)
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")

  await openWhiteboard(page)
  await ensureReady(page)

  // الاتجاه المحسوب داخل اللوحة نفسها — لا وراثة مزعومة من الجذر
  const direction = await panel(page).evaluate(
    (node) => getComputedStyle(node).direction
  )
  expect(direction).toBe("rtl")

  await expect(panel(page).getByText("السبورة الذكية")).toBeVisible()
  await expect(panel(page)).toContainText("صفحة 1 من")
  // نصوص المكتبة بالعربية (langCode="ar-SA")
  await expect(page.locator('[data-testid="toolbar-rectangle"]')).toHaveAttribute(
    "title",
    /مستطيل/
  )
})
