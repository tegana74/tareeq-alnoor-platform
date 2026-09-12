// SMART-WB-1B — مسار الطالب في متصفح حقيقي: قراءة فقط، بلا نقل ثانٍ.
//
// الجلسة هنا `live` لأن مسار الطالب في `live-room-client` لا يُركَّب إلا في هذه
// الحالة، وطلب دخوله مقبول مسبقاً في التهيئة (البوابة اختُبرت في LIVE-9B).
//
// التهيئة تُرسم بمتصفح المعلم لا بحمولة مُلفَّقة: عنصر Excalidraw حقيقي هو ما
// يُثبت أن الطالب يرى رسم المعلم فعلاً، وأي كائن نصنعه بأيدينا يُثبت أقل من ذلك.

import { test, expect, type Browser } from "@playwright/test"
import { IDS, STUDENT_STATE, TEACHER_STATE } from "./fixtures/e2e-data"
import {
  CANVAS_BOX,
  countInk,
  drawRectangleWithMouse,
  expectExcalidrawRendered,
  livekitSockets,
  openWhiteboard,
  pageTabs,
  panel,
  readBoardState,
  selectRectangleTool,
  trackWebSockets,
} from "./fixtures/whiteboard-helpers"

test.use({ storageState: STUDENT_STATE })

const ROOM = `/live/${IDS.liveSession}`

/** رسم المعلم مرة واحدة قبل مواصفات الطالب — بمتصفحه وبواجهته، لا بحمولة مصنوعة. */
async function seedTeacherDrawing(browser: Browser): Promise<void> {
  const context = await browser.newContext({ storageState: TEACHER_STATE })
  const page = await context.newPage()
  try {
    await page.goto(ROOM)
    await openWhiteboard(page)
    const initButton = panel(page).getByRole("button", { name: "تهيئة السبورة" })
    await expect(panel(page).locator(CANVAS_BOX).or(initButton)).toBeVisible({
      timeout: 40_000,
    })
    if (await initButton.isVisible()) await initButton.click()
    await expectExcalidrawRendered(page)

    if ((await countInk(page)) > 50) return

    const saved = page.waitForResponse(
      (response) =>
        response.url().includes("/whiteboard/snapshot") &&
        response.request().method() === "POST"
    )
    await selectRectangleTool(page)
    await drawRectangleWithMouse(page)
    expect((await saved).status(), "تهيئة رسم المعلم فشلت").toBe(200)
  } finally {
    await context.close()
  }
}

test.beforeAll(async ({ browser }) => {
  await seedTeacherDrawing(browser)
})

test("الطالب: يرى سبورة المعلم للقراءة فقط ولا يستطيع تعديلها", async ({
  page,
  request,
}) => {
  await page.goto(ROOM)

  await test.step("اللوحة ظاهرة بعد قبول الدخول", async () => {
    await expect(panel(page)).toBeVisible({ timeout: 40_000 })
    await openWhiteboard(page)
    await expectExcalidrawRendered(page)
  })

  await test.step("المشهد الحالي هو ما رسمه المعلم", async () => {
    await expect.poll(() => countInk(page), { timeout: 20_000 }).toBeGreaterThan(50)
  })

  await test.step("اللوحة للقراءة فقط: لا شريط أدوات ولا أزرار صفحات", async () => {
    await expect(page.locator(CANVAS_BOX)).toHaveAttribute("data-readonly", "true")
    await expect(page.locator('[data-testid="toolbar-rectangle"]')).toHaveCount(0)
    await expect(panel(page).getByRole("button", { name: "صفحة جديدة" })).toHaveCount(0)
    await expect(panel(page).getByRole("button", { name: "حذف الصفحة" })).toHaveCount(0)
    for (const tab of await pageTabs(page).all()) {
      await expect(tab).toBeDisabled()
    }
  })

  await test.step("محاولة تحرير فعلية لا تُغيّر شيئاً", async () => {
    const inkBefore = await countInk(page)
    const before = await readBoardState(request, IDS.liveSession)

    const writes: string[] = []
    page.on("request", (candidate) => {
      if (
        candidate.method() !== "GET" &&
        candidate.url().includes(`/api/live/${IDS.liveSession}/whiteboard`)
      ) {
        writes.push(`${candidate.method()} ${candidate.url()}`)
      }
    })

    // نفس ما يفعله المعلم بالضبط: اختصار أداة المستطيل ثم سحب على المشهد
    await page.locator(CANVAS_BOX).click({ position: { x: 20, y: 20 } })
    await page.keyboard.press("r")
    await drawRectangleWithMouse(page)
    // أطول من debounce التثبيت (1500ms) كي تظهر أي كتابة لو حدثت
    await page.waitForTimeout(4000)

    expect(writes, "الطالب أرسل كتابة إلى مسار السبورة").toEqual([])
    expect(await countInk(page)).toBeLessThan(inkBefore + 50)

    const after = await readBoardState(request, IDS.liveSession)
    expect(after.revision).toBe(before.revision)
    expect(after.canWrite).toBe(false)
  })

  await test.step("الخادم يرفض كتابة الطالب حتى لو أرسلها مباشرة", async () => {
    const state = await readBoardState(request, IDS.liveSession)
    const pageId = (state.pages[0] as { id: string }).id
    const response = await request.post(`/api/live/${IDS.liveSession}/whiteboard/snapshot`, {
      data: { pageId, baseRevision: state.revision, elements: [] },
    })
    expect(response.status()).toBe(403)
    // ولا شيء تغيّر على الخادم بعد الرفض
    expect((await readBoardState(request, IDS.liveSession)).revision).toBe(state.revision)
  })
})

test("الطالب: السبورة لا تفتح اتصال LiveKit ثانياً", async ({ page }) => {
  const readSockets = await trackWebSockets(page)
  await page.goto(ROOM)
  // المشاهد يملك دورة حياة الغرفة؛ ننتظر استقراره قبل القياس
  await expect(panel(page)).toBeVisible({ timeout: 40_000 })
  await page.waitForTimeout(3000)

  const before = await readSockets()
  const livekitBefore = livekitSockets(before)

  await openWhiteboard(page)
  await expectExcalidrawRendered(page)
  // القناة تُشترك عند الفتح إن وُجدت غرفة؛ نمنح الوقت لأي اتصال كان سيُفتح
  await page.waitForTimeout(5000)

  const after = await readSockets()
  const livekitAfter = livekitSockets(after)

  expect(
    livekitAfter.length,
    `السبورة أضافت نقلاً: ${livekitAfter.slice(livekitBefore.length).join(", ")}`
  ).toBe(livekitBefore.length)
  // أي اتصال LiveKit موجود هو اتصال المشاهد الواحد لا اثنان
  expect(livekitAfter.length).toBeLessThanOrEqual(1)
})

test("الطالب: يستعيد تغييرات المعلم بلا قناة", async ({ page, browser }) => {
  await page.goto(ROOM)
  await openWhiteboard(page)
  await expectExcalidrawRendered(page)

  const tabsBefore = await pageTabs(page).count()

  // المعلم يضيف صفحة من متصفحه — تغيير حقيقي على الخادم
  const context = await browser.newContext({ storageState: TEACHER_STATE })
  const teacherPage = await context.newPage()
  try {
    await teacherPage.goto(`/live/${IDS.liveSession}`)
    await openWhiteboard(teacherPage)
    await expectExcalidrawRendered(teacherPage)
    await panel(teacherPage).getByRole("button", { name: "صفحة جديدة" }).click()
    await expect(pageTabs(teacherPage)).toHaveCount(tabsBefore + 1)
  } finally {
    await context.close()
  }

  // الاستعادة بالاستعلام (WHITEBOARD_RECOVERY_POLL_MS) تُحدّث مشهد الطالب وحدها
  await expect(pageTabs(page)).toHaveCount(tabsBefore + 1, { timeout: 30_000 })
  await expect(page.locator(CANVAS_BOX)).toBeVisible()
})
