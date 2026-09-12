// SMART-WB-1B — إعداد Playwright للتحقق المتصفحي من السبورة الذكية.
//
// نطاق مقصود ضيّق: هذا الملف لا يخدم إلا `tests/e2e`. اختبارات vitest تبقى كما
// هي (وقد استُثنيت `tests/e2e` من جمعها في `vitest.config.ts`) — لا طبقة اختبار
// موازية ولا تكرار.
//
// قرارات تحتاج تفسيراً:
//   - `workers: 1` و`fullyParallel: false`: كل المواصفات تتشارك جلسة بثّ واحدة
//     وسبورة واحدة في قاعدة بيانات حقيقية. التوازي هنا يعني تعارضاً في المراجعات
//     لا خطأً في التطبيق.
//   - `webServer` يشغّل `next dev`: البناء الإنتاجي ليس شرطاً للمسار المتصفحي،
//     و`reuseExistingServer` يسمح بإعادة التشغيل السريع محلياً.
//   - أذونات الوسائط مُزيّفة بأعلام Chromium: صفحة القاعة قد تطلب كاميرا/ميكروفون
//     عند حالة `live`، وحوار الإذن يعلّق الاختبار بلا علاقة بالسبورة.
//   - مهل سخية: أول تحميل في وضع dev يُصرّف Excalidraw كاملاً.

import "dotenv/config"
import { defineConfig, devices } from "@playwright/test"

const PORT = Number(process.env.E2E_PORT || 3117)

/**
 * `localhost` لا `127.0.0.1` — وهذا ليس تفضيلاً في الشكل.
 *
 * خادم التطوير في Next 16 يقارن أصل الطلب بالأصل الذي هُيّئ عليه، ويرفض ما لا
 * يطابقه. الخادم يُهيَّأ على `localhost`، فزيارة `127.0.0.1` تجعله يحجب أجزاء
 * JavaScript الخاصة به (`/_next/static/chunks/...`): تصل صفحة HTML من الخادم،
 * ثم لا يُرَكَّب تطبيق React إطلاقاً. النتيجة اختبارات تفشل على «لا canvas» بينما
 * التطبيق سليم تماماً.
 *
 * الإصلاح عند حدود أداة الاختبار وحدها: نزور الأصل نفسه الذي يعرفه الخادم. لا
 * `allowedDevOrigins` في `next.config.ts` — ذلك يوسّع ما يقبله خادم التطوير في
 * كل تشغيل لأجل عيب في الاختبار، وهو تخفيف حقيقي في غير موضعه.
 */
export const E2E_BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 150_000,
  expect: { timeout: 25_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/fixtures/global-setup.ts",
  globalTeardown: "./tests/e2e/fixtures/global-teardown.ts",
  use: {
    baseURL: E2E_BASE_URL,
    locale: "ar-EG",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    },
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } },
      testIgnore: /whiteboard-touch\.spec\.ts/,
    },
    {
      // لمسٌ حقيقي بمقاس هاتف — لا محاكاة مؤشر.
      name: "mobile",
      use: { ...devices["Pixel 5"] },
      testMatch: /whiteboard-touch\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: true,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
})
