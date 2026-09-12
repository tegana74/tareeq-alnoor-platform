// SMART-WB-1B — بيانات الاختبار المتصفحي: الجانب الذي يمسّ القاعدة.
//
// امتداد `.mts` مقصود: يجعل الملف ESM صريحاً بصرف النظر عن غياب
// `"type": "module"` في `package.json`، فيُحمَّل `src/generated/prisma/client.ts`
// (ESM يستخدم `import.meta.url`) بلا خطأ صياغي. الملف لا يُستورد من داخل
// Playwright إطلاقاً — يُنفَّذ في عملية ابنة عبر `runSeedCli` في `e2e-data.ts`،
// وهو خارج `testMatch` (`*.spec.ts`) فلا يمرّ بمُصرِّف Playwright.
//
// المبدأ الحاكم لم يتغيّر: لا نظام مصادقة موازٍ ولا هوية عميل مزيّفة. نُنشئ
// مستخدمين حقيقيين وصفوفاً حقيقية في جدول `sessions` برمز مُهشَّم بنفس دالة
// التطبيق (`hashSessionToken` = sha256)، ثم يُوضع الرمز الخام في كوكي `tn_session`.
// الخادم يحلّ الهوية بعدها عبر `getCurrentUser()` كما يفعل مع أي متصفح — فالصلاحيات
// تُفرض على الخادم بلا تخفيف، وما تفعله التهيئة هو ما يفعله تسجيل الدخول تماماً.
//
// كل المعرّفات مُسبَّقة بـ `e2e-wb-` كي يكون الحذف في التنظيف مُحدَّداً ولا يلمس
// بيانات أخرى. كلمات المرور عشوائية لكل تشغيل ولا تُستخدم في أي مسار — لا يوجد
// اعتماد مكتوب في الشيفرة.

import "dotenv/config"
import { randomBytes, randomUUID } from "crypto"
import bcrypt from "bcryptjs"
import { PrismaClient } from "../../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import {
  IDS,
  SEED_RESULT_MARKER,
  hashSessionToken,
  type SeedResult,
} from "./e2e-data"

export function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL غير مضبوط — لا يمكن تهيئة بيانات E2E")
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

export async function seedE2EData(prisma: PrismaClient): Promise<SeedResult> {
  // تنظيف مسبق: تشغيل سابق انقطع قبل التنظيف لا يجب أن يُفسد هذا التشغيل.
  await cleanupE2EData(prisma)

  const password = await bcrypt.hash(randomBytes(24).toString("hex"), 10)

  await prisma.teacher.create({
    data: { id: IDS.teacher, name: "معلم اختبار السبورة", isActive: true },
  })

  await prisma.user.create({
    data: {
      id: IDS.teacherUser,
      phone: "01099000001",
      password,
      firstName: "معلم",
      lastName: "السبورة",
      role: "TEACHER",
      teacherId: IDS.teacher,
    },
  })

  await prisma.user.create({
    data: {
      id: IDS.studentUser,
      phone: "01099000002",
      password,
      firstName: "طالب",
      lastName: "السبورة",
      role: "STUDENT",
    },
  })

  // جلسات مجانية بلا كورس: الطالب يمرّ على `checkStudentSessionAccess` بلا حجز،
  // فتبقى بوابة الدخول (admission) هي الفارق الوحيد — وهو ما نريد اختباره.
  const base = {
    teacherId: IDS.teacher,
    courseId: null,
    url: null,
    isFree: true,
    price: 0,
    durationMinutes: 60,
    startAt: new Date(),
  }

  await prisma.liveSession.create({
    data: {
      ...base,
      id: IDS.scheduledSession,
      title: "جلسة اختبار السبورة — مجدولة",
      status: "scheduled",
    },
  })

  await prisma.liveSession.create({
    data: {
      ...base,
      id: IDS.liveSession,
      title: "جلسة اختبار السبورة — مباشرة",
      status: "live",
    },
  })

  // الطالب مقبول مسبقاً: بوابة الدخول ليست موضوع هذا الطور (اختُبرت في LIVE-9B).
  await prisma.liveSessionAdmission.create({
    data: {
      id: IDS.admission,
      sessionId: IDS.liveSession,
      userId: IDS.studentUser,
      status: "approved",
      decidedAt: new Date(),
      decidedBy: IDS.teacherUser,
    },
  })

  const teacherToken = randomUUID() + randomBytes(24).toString("hex")
  const studentToken = randomUUID() + randomBytes(24).toString("hex")
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000)

  await prisma.session.createMany({
    data: [
      {
        id: IDS.teacherAuthSession,
        token: hashSessionToken(teacherToken),
        userId: IDS.teacherUser,
        expiresAt,
      },
      {
        id: IDS.studentAuthSession,
        token: hashSessionToken(studentToken),
        userId: IDS.studentUser,
        expiresAt,
      },
    ],
  })

  return { teacherToken, studentToken }
}

/** حذف مُحدَّد بالمعرّفات. السبورة تسقط مع الجلسة (onDelete: Cascade). */
export async function cleanupE2EData(prisma: PrismaClient): Promise<void> {
  await prisma.session.deleteMany({
    where: { id: { in: [IDS.teacherAuthSession, IDS.studentAuthSession] } },
  })
  await prisma.liveSession.deleteMany({
    where: { id: { in: [IDS.scheduledSession, IDS.liveSession] } },
  })
  await prisma.user.deleteMany({
    where: { id: { in: [IDS.teacherUser, IDS.studentUser] } },
  })
  await prisma.teacher.deleteMany({ where: { id: IDS.teacher } })
}

// ————— واجهة سطر الأوامر —————
// `seed` يطبع سطر النتيجة بسابِقة صريحة (الأب يقرأه من أنبوب لا من سجلّ).
// `cleanup` لا يطبع شيئاً. أي أمر آخر خطأ صريح لا صمت.

const command = process.argv[2]
const prisma = createPrisma()
try {
  if (command === "seed") {
    const result = await seedE2EData(prisma)
    console.log(`${SEED_RESULT_MARKER} ${JSON.stringify(result)}`)
  } else if (command === "cleanup") {
    await cleanupE2EData(prisma)
  } else {
    throw new Error(`أمر غير معروف: ${String(command)} — المتوقع \`seed\` أو \`cleanup\``)
  }
} finally {
  await prisma.$disconnect()
}
