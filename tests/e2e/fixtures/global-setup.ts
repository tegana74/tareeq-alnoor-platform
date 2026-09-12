// SMART-WB-1B — تهيئة عامة قبل أي متصفح: بيانات حقيقية + كوكي جلسة حقيقي.
//
// البذر يجري في عملية ابنة (`runSeedCli`) لا في هذه العملية: Playwright يُصرِّف هذا
// الملف إلى CommonJS، وعميل Prisma المُولَّد ESM — التفصيل الكامل في `e2e-data.ts`.
//
// حالة التخزين تُكتب إلى `tests/e2e/.auth` (مستثنى من git): تحتوي رمز جلسة صالحاً،
// فلا يجوز أن يدخل المستودع.

import { mkdirSync, writeFileSync } from "fs"
import type { FullConfig } from "@playwright/test"
import {
  AUTH_DIR,
  SESSION_COOKIE,
  STUDENT_STATE,
  TEACHER_STATE,
  runSeedCli,
} from "./e2e-data"

function storageState(token: string, host: string) {
  return {
    cookies: [
      {
        name: SESSION_COOKIE,
        value: token,
        domain: host,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 6 * 60 * 60,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  }
}

/**
 * أصل الكوكي = `baseURL` المُحلّ من الإعداد نفسه، لا سلسلة موازية.
 *
 * الكوكي مربوط بالمضيف: `domain: "127.0.0.1"` لا يُرسَل إلى `localhost` والعكس.
 * فلو اختلف ما يُبنى هنا عمّا يزوره المتصفح، دخل المتصفح مجهولاً وفشل كل مسار
 * على «الجلسة منتهية» بلا علاقة بالسبورة. القراءة من `FullConfig` تجعل الاختلاف
 * مستحيلاً بنيوياً بدل أن تكون مطابقتُه اتفاقاً يُصان يدوياً.
 */
function cookieHost(config: FullConfig): string {
  const baseURL = config.projects.map((project) => project.use?.baseURL).find(Boolean)
  if (!baseURL) {
    throw new Error("لا `baseURL` في إعداد Playwright — لا يمكن تحديد أصل كوكي الجلسة")
  }
  return new URL(baseURL).hostname
}

export default async function globalSetup(config: FullConfig) {
  const { teacherToken, studentToken } = runSeedCli("seed")
  const host = cookieHost(config)

  mkdirSync(AUTH_DIR, { recursive: true })
  writeFileSync(TEACHER_STATE, JSON.stringify(storageState(teacherToken, host)))
  writeFileSync(STUDENT_STATE, JSON.stringify(storageState(studentToken, host)))
}
