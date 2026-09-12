// SMART-WB-1B — تنظيف بعد الاختبارات: لا تبقى في القاعدة صفوف اختبار ولا جلسات
// مصادقة صالحة. ملفات حالة التخزين تُحذف أيضاً لأنها تحمل رمزاً حقيقياً.
//
// التنظيف يجري في عملية ابنة (`runSeedCli`) لنفس سبب التهيئة — انظر `e2e-data.ts`.
//
// `finally` حول حذف `.auth` مقصود: لو فشل تنظيف القاعدة، فبقاء ملف يحمل رمز جلسة
// صالحاً على القرص خطأ أسوأ من فقدان رسالة الفشل — والرسالة تُرفع كما هي بعده.

import { rmSync } from "fs"
import { AUTH_DIR, runSeedCli } from "./e2e-data"

export default async function globalTeardown() {
  try {
    runSeedCli("cleanup")
  } finally {
    rmSync(AUTH_DIR, { recursive: true, force: true })
  }
}
