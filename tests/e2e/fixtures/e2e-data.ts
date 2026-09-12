// SMART-WB-1B — حدود الوحدات (module boundary) لهويّات الاختبار المتصفحي.
//
// هذا الملف يُحمَّل من داخل Playwright: المواصفات الثلاث تستورد منه `IDS` ومسارات
// حالة التخزين، و`global-setup`/`global-teardown` يستوردان منه كذلك. ولذلك لا يجوز
// أن يستورد عميل Prisma المُولَّد — لا مباشرةً ولا عبر وسيط.
//
// السبب دقيق ويستحق التسجيل: `package.json` ليس `"type": "module"`، فيُصرِّف
// Playwright ملفات `tests/e2e` إلى CommonJS، بينما المُولِّد
// `provider = "prisma-client"` (Prisma 7) يُخرج ESM يستخدم `import.meta.url` في
// `src/generated/prisma/client.ts:16`. النتيجة كانت انهيار التهيئة والتنظيف العام
// قبل أن يُفتح أي متصفح:
//
//   SyntaxError: Cannot use 'import.meta' outside a module
//     at fixtures\e2e-data.ts:16
//
// الحل يقع على حدود الاختبار وحدها: يبقى هنا ما لا يمسّ القاعدة (المعرّفات،
// المسارات، تهشير الرمز)، وينتقل كل ما يمسّها إلى `e2e-seed.mts` الذي يُنفَّذ في
// عملية ابنة بامتداد `.mts` — ESM صريح — عبر tsx الموجود أصلاً في المشروع.
// لا تغيير في نظام وحدات التطبيق، ولا في مُولِّد Prisma، ولا استراتيجية قاعدة
// بيانات ثانية: نفس `DATABASE_URL` ونفس المنطق ونفس المعرّفات.

import { createHash } from "crypto"
import { spawnSync } from "child_process"
import { join } from "path"

export const IDS = {
  teacher: "e2e-wb-teacher",
  teacherUser: "e2e-wb-teacher-user",
  studentUser: "e2e-wb-student-user",
  /** جلسة `scheduled`: تُستخدم لمسارات المعلم وحدها — لا محاولة نشر LiveKit. */
  scheduledSession: "e2e-wb-session-scheduled",
  /** جلسة `live`: لازمة لمسار الطالب (`shouldUseLiveKitViewer` يشترط live). */
  liveSession: "e2e-wb-session-live",
  admission: "e2e-wb-admission",
  teacherAuthSession: "e2e-wb-auth-teacher",
  studentAuthSession: "e2e-wb-auth-student",
} as const

export const AUTH_DIR = "tests/e2e/.auth"
export const TEACHER_STATE = `${AUTH_DIR}/teacher.json`
export const STUDENT_STATE = `${AUTH_DIR}/student.json`

/** كوكي الجلسة — نفس اسم `SESSION_COOKIE` في `src/lib/auth.ts`. */
export const SESSION_COOKIE = "tn_session"

/** نفس تهشير `src/lib/auth.ts` حرفياً: أي اختلاف يعني جلسة لا يقرأها الخادم. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export interface SeedResult {
  teacherToken: string
  studentToken: string
}

/**
 * سابِقة السطر الذي تُعاد به نتيجة البذر من العملية الابنة.
 *
 * لا نفترض أن `stdout` نقيّ: `dotenv/config` يطبع سطر تهيئة، وقد تُضاف تحذيرات
 * أخرى لاحقاً. القراءة بسابِقة صريحة تجعل التحليل غير هشّ.
 */
export const SEED_RESULT_MARKER = "E2E_SEED_RESULT"

/** جذر المستودع محسوباً من موضع هذا الملف — لا اعتماد على `process.cwd()`. */
function repoRoot(): string {
  // `__dirname` مضمون هنا: هذا الملف لا يُحمَّل إلا مُصرَّفاً إلى CommonJS من
  // Playwright، أو عبر tsx الذي يوفّر الشيم نفسه. ويُقرأ داخل الدالة لا في نطاق
  // الوحدة، كي لا يُقيَّم إطلاقاً عند الاستيراد من `e2e-seed.mts` (ESM).
  return join(__dirname, "..", "..", "..")
}

/**
 * تشغيل بذر/تنظيف بيانات E2E في عملية ابنة ESM.
 *
 * `spawnSync` بلا صدفة (shell) ولا `npx`: التنفيذ المباشر بـ `process.execPath`
 * يتجنّب `npx.cmd` واقتباس المسارات على Windows. و`--import tsx` يستخدم tsx
 * المثبَّت في المشروع نفسه.
 *
 * `stdio` للمخرج القياسي `pipe` لا `inherit` عن قصد: سطر النتيجة يحمل رمزَي جلسة
 * صالحين، فلا يجوز أن يتسرّبا إلى سجلّ التشغيل. الخطأ يُعاد من `stderr` وحده
 * وهو لا يحمل رموزاً.
 */
export function runSeedCli(command: "seed"): SeedResult
export function runSeedCli(command: "cleanup"): null
export function runSeedCli(command: "seed" | "cleanup"): SeedResult | null {
  const root = repoRoot()
  const script = join(root, "tests", "e2e", "fixtures", "e2e-seed.mts")

  const child = spawnSync(process.execPath, ["--import", "tsx", script, command], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180_000,
  })

  if (child.error) throw child.error
  if (child.status !== 0) {
    throw new Error(
      `فشل \`${command}\` في e2e-seed.mts (رمز الخروج ${child.status}):\n` +
        `${(child.stderr || "").trim()}`
    )
  }

  if (command === "cleanup") return null

  const line = (child.stdout || "")
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(SEED_RESULT_MARKER))
  if (!line) {
    throw new Error(
      `بذر E2E لم يُعِد سطر النتيجة (${SEED_RESULT_MARKER}) — راجع stderr:\n` +
        `${(child.stderr || "").trim()}`
    )
  }

  const parsed = JSON.parse(line.slice(SEED_RESULT_MARKER.length).trim()) as SeedResult
  if (!parsed.teacherToken || !parsed.studentToken) {
    throw new Error("بذر E2E أعاد نتيجة ناقصة: رمز جلسة مفقود")
  }
  return parsed
}
