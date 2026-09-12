// SMART-WB-1B — لمس حقيقي بمقاس هاتف (مشروع `mobile` في الإعداد وحده).
//
// لمسٌ لا مؤشر: `page.mouse` يُصدر أحداث pointerType=mouse حتى على جهاز بلمس،
// فلا يُثبت شيئاً عن الرسم بالإصبع. لذلك تُرسَل أحداث اللمس عبر CDP
// (`Input.dispatchTouchEvent`) — وهي نفس الأحداث التي يُنتجها إصبع حقيقي.

import { test, expect } from "@playwright/test"
import { IDS, TEACHER_STATE } from "./fixtures/e2e-data"
import {
  CANVAS_BOX,
  INTERACTIVE_CANVAS,
  countInk,
  expectExcalidrawRendered,
  openWhiteboard,
  panel,
} from "./fixtures/whiteboard-helpers"

test.use({ storageState: TEACHER_STATE })

test("اللمس: المعلم يرسم بإصبعه على هاتف", async ({ page, context }) => {
  await page.goto(`/live/${IDS.scheduledSession}`)
  await openWhiteboard(page)

  const initButton = panel(page).getByRole("button", { name: "تهيئة السبورة" })
  await expect(panel(page).locator(CANVAS_BOX).or(initButton)).toBeVisible({
    timeout: 40_000,
  })
  if (await initButton.isVisible()) await initButton.click()
  await expectExcalidrawRendered(page)

  // اللوحة لا تتجاوز عرض الشاشة على الهاتف
  const viewport = page.viewportSize()
  const box = await page.locator(CANVAS_BOX).boundingBox()
  expect(box!.width).toBeLessThanOrEqual((viewport?.width ?? 0) + 1)

  await page.locator('[data-testid="toolbar-rectangle"]').tap()

  const canvas = await page.locator(INTERACTIVE_CANVAS).first().boundingBox()
  if (!canvas) throw new Error("لا أبعاد للطبقة التفاعلية")
  const startX = canvas.x + canvas.width * 0.25
  const startY = canvas.y + canvas.height * 0.3
  const endX = canvas.x + canvas.width * 0.7
  const endY = canvas.y + canvas.height * 0.7

  const inkBefore = await countInk(page)
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("/whiteboard/snapshot") &&
      response.request().method() === "POST"
  )

  const cdp = await context.newCDPSession(page)
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startX, y: startY }],
  })
  for (let step = 1; step <= 6; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: startX + ((endX - startX) * step) / 6,
          y: startY + ((endY - startY) * step) / 6,
        },
      ],
    })
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })

  expect((await saved).status(), "الرسم باللمس لم يُثبَّت").toBe(200)
  await expect
    .poll(() => countInk(page), { timeout: 15_000 })
    .toBeGreaterThan(inkBefore + 50)
})
