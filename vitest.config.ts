import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    // SMART-WB-1B — مواصفات Playwright تعيش في tests/e2e وتحتاج متصفحاً حقيقياً.
    // vitest يجمع `*.spec.ts` افتراضياً، فاستثناؤها هنا يمنع تشغيلها بلا متصفح.
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
  },
})
