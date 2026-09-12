# SMART WHITEBOARD — PHASE 1B — LIVE CLASSROOM INTEGRATION FOUNDATION

**التاريخ:** 2026-08-29 — محدَّث 2026-09-02 (محاولة Browser E2E)
**الحالة النهائية:** `BLOCKED` على Browser E2E — التنفيذ مكتمل ومُتحقَّق منه بالاختبارات، وharness Playwright صار موجوداً ويُقلَع فعلاً، لكن الحزمة تتوقّف **قبل أي متصفح**: قاعدة Neon ترفض بيانات الاعتماد الموجودة في `.env` (`28P01 password authentication failed`). لا يُعلن الطور مكتملاً قبل مرور المسار الحرج في المتصفح.

---

## 1. السبب الجذري / نطاق الطور

الطور 1A أنتج طبقة سبورة كاملة على الخادم (schema + migration + منطق خالص + طبقة وصول + مسارات) لكنها لم تكن موصولة بقاعة البث. الفجوات التي أُغلقت في هذه الجلسة:

1. `currentUserId` لم يكن يُمرَّر من مكوّن الخادم إلى `LiveRoomClient` (خطأ TypeScript وحيد في الشجرة).
2. لا تكامل من جهة الطالب — لوحة السبورة كانت مركّبة للمعلم فقط، ومشاهد الطالب لا يُخرج غرفة LiveKit التي يملكها.
3. لا اختبارات على مستوى المسارات (البوابة، تصنيف الأخطاء بالرمز، البثّ).
4. لا تقرير.

---

## 2. الملفات التي تغيّرت (هذه الجلسة)

| الملف | التغيير |
| --- | --- |
| `src/app/(site)/live/[id]/page.tsx` | تمرير `currentUserId={user.id}` — الهوية من الجلسة على الخادم. |
| `src/app/(site)/live/[id]/live-room-client.tsx` | حالة `studentRoom` + `handleStudentRoom` (مرجع ثابت)، وتركيب `WhiteboardPanel` للطالب داخل `AdmissionGate` بـ `canManage={false}`. |
| `src/app/(site)/live/[id]/student-live-viewer.tsx` | خاصية `onRoom?: (room: Room \| null) => void` تُبلّغ الغرفة القائمة إلى الأعلى (عند الاتصال، و`null` عند القطع/التفكيك) عبر ref يُزامن داخل `useEffect`. |
| `src/components/live-classroom/whiteboard-canvas.tsx` | `initialData` تُقرأ من حالة بمُهيِّئ (`useState(() => elements)`) بدل ref — إصلاح `react-hooks/refs`. |
| `tests/whiteboard-routes.test.ts` | **جديد** — 27 اختبار تكامل على مستوى المسارات. |

**موجود من طور 1A/1B WIP ولم يُعدّل في هذه الجلسة** (قرأته فقط): `whiteboard-panel.tsx`, `use-whiteboard.ts`, `whiteboard{,-server,-access,-events,-client}.ts`, مسارات `src/app/api/live/[id]/whiteboard/**`, `tests/whiteboard-policy.test.ts`, `tests/whiteboard-server.test.ts`, `prisma/schema.prisma`, `prisma/migrations/20260829_smart_whiteboard_foundation/`.

### 2.1 جلسة 2026-09-02 — تغييران في الـ harness وحده

| الملف | التغيير |
| --- | --- |
| `playwright.config.ts` | `E2E_BASE_URL` من `http://127.0.0.1:${PORT}` إلى `http://localhost:${PORT}`، مع تفسير السبب في تعليق. |
| `tests/e2e/fixtures/global-setup.ts` | أصل كوكي الجلسة يُشتقّ من الإعداد المُحلّ نفسه (`config.projects[].use.baseURL` عبر `cookieHost(config)`) بدل بناء سلسلة موازية من `process.env` — فلا يمكن بنيوياً أن يختلف أصل الكوكي عن الأصل الذي يزوره المتصفح. |

لا شيء غير هذين الملفين: لا شيفرة تطبيق، ولا `next.config.ts` (ولا `allowedDevOrigins`)، ولا `.env`، ولا مخطط، ولا migration، ولا إعادة تركيب لـ `@playwright/test`، ولا commit/push، ولا إضعاف أو حذف لأي تأكيد في اختبارات E2E.

---

## 3. المسارات/المكوّنات/الخِدَم

**المسارات** (كلها `dynamic = "force-dynamic"`، وكلها موجودة من قبل هذه الجلسة):
- `GET /api/live/[id]/whiteboard` — قراءة الحالة (`board: null` = فارغة لا خطأ).
- `POST /api/live/[id]/whiteboard` — تهيئة عبر `ensureBoard` (idempotent).
- `POST|DELETE /api/live/[id]/whiteboard/pages` — إنشاء/حذف صفحة.
- `POST /api/live/[id]/whiteboard/active-page` — نقل الصفحة المعروضة.
- `POST /api/live/[id]/whiteboard/snapshot` — تثبيت الحالة.

**المكوّنات:** `WhiteboardPanel` (نقطة الدخول الوحيدة) → `WhiteboardCanvas` (الموضع الوحيد الذي يستورد Excalidraw).
**الخطّاف:** `useWhiteboard` — يملك الشبكة كلها (لا fetch في الكانفاس).
**الخِدَم:** `resolveWhiteboardAccess`, `whiteboard-server` (`ensureBoard`/`readWhiteboardState`/`appendSnapshot`/…), `whiteboard-events` + `broadcastData` القائمة.

---

## 4. طريقة دمج Excalidraw

النسخة **0.18.1 بلا تغيير**. الاستيراد محصور في `whiteboard-canvas.tsx`، ويُحمَّل حصراً عبر
`dynamic(() => import("./whiteboard-canvas")…, { ssr: false })` من اللوحة — فلا يدخل حزمة الخادم (المكتبة تلمس `window` عند التحميل).
`langCode="ar-SA"` للعربية والاتجاه، `viewModeEnabled={readOnly}` للقراءة فقط، `aiEnabled={false}` فلا حوار Mermaid. اللمس ومتعدد اللمس يبقى سلوك المكتبة الأصلي — لا تدخّل. `getSceneVersion` يمنع سيل الكتابات على التمرير/التحديد، و`CaptureUpdateAction.NEVER` يمنع دخول حالة الآخرين في تاريخ التراجع المحلي.

---

## 5. الصلاحيات: معلم/طالب

القرار كله على الخادم في `resolveWhiteboardAccess(sessionId, mode)` — لا نموذج صلاحيات جديد:
- 401 بلا جلسة، 404 جلسة غير موجودة، 403 جلسة ملغاة.
- الطالب يمرّ على `checkStudentSessionAccess` + `checkAttendanceAdmission` (طالب في الانتظار لا يقرأ السبورة إطلاقاً).
- `canWrite = isManager && isWhiteboardWritableStatus(status)` — الأدمن ومعلم الجلسة فقط، ومعلم آخر يُرفض.
- جلسة منتهية: المالك يقرأ ولا يكتب.
- `readOnly` في الواجهة عرضٌ لقرار الخادم لا مصدره.

---

## 6. LiveKit / DataChannel

لا نقل ثانٍ: المعلم يستعمل غرفته القائمة، والطالب يستعمل نفس الغرفة التي يملكها `StudentLiveViewer` ويُبلّغها إلى الأعلى عبر `onRoom` (لا اتصال إضافي). البثّ من الخادم فقط (`broadcastData`) — الطالب لا يملك `canPublishData` أصلاً، وكل فعل طالبي يمرّ REST.
`senderId` يُؤخذ من الجلسة الموثّقة حصراً؛ أي هوية في الجسم تُتجاهل (مُختبَر). الحمولة الأكبر من سقف القناة تُحوَّل إلى `WB_SNAPSHOT_REQUIRED` بلا عناصر، والعميل يستعيد بـ GET. الأحداث تُصفّى بـ `parseWhiteboardEvent` ثم `reduceWhiteboardEvent` (تطبيق/استعادة/تجاهل صدى الذات)، واستقصاء استعادة دوري فقط عند `!room && !canWrite`. فشل البثّ لا يُبطل حفظاً نجح (مُختبَر).

---

## 7. مسار حفظ الـ snapshot

`use-whiteboard` يثبّت بـ debounce + `MAX_INTERVAL` (بلا تغيير للسقوف) → `POST /snapshot`:
وصول → حدّ معدّل (`WHITEBOARD_WRITE_LIMIT = 30/3s` كما هو) → zod → سقف 2 MiB (413) → `readPageRevision` + `resolveRevision` (409 مع `serverRevision`، والعميل يعيد القراءة ولا يعيد الإرسال) → `appendSnapshot` (يفحص انتماء الصفحة ويحسب `sizeBytes` بنفسه — لا يُمرَّر من العميل) → بثّ.
قيد `(pageId, revision)` الفريد هو الحاجز الأخير: P2002 ⇒ 409. `PAGE_NOT_IN_BOARD` ⇒ 404، و`P2021` ⇒ 503 fail-closed. التصنيف **بالرمز لا بنص الرسالة**، والرسائل للمستخدم بلا تفاصيل داخلية (مُختبَر أنّ نصّ الخطأ لا يحمل `b1` ولا "table").

---

## 8. اختبارات الوحدة/التكامل

```
npx vitest run tests/whiteboard-routes.test.ts tests/whiteboard-policy.test.ts tests/whiteboard-server.test.ts --no-file-parallelism
→ Test Files 3 passed (3) | Tests 91 passed (91)
```
منها 27 اختباراً جديداً في `tests/whiteboard-routes.test.ts`: البوابة (401/404/403 للانتظار/403 لمعلم آخر/403 على المسارات الأربعة للطالب/جلسة ملغاة/جلسة منتهية/503 على P2021)، الحفظ (هوية من الجلسة، `sizeBytes` من الخادم، 409 للمتأخّر، 409 لـ P2002، 413 للحمولة الثقيلة، `WB_SNAPSHOT_REQUIRED`، فشل بثّ لا يُبطل الحفظ)، الصفحات (سقف 50 ⇒ 409، بثّ القائمة، 400 بلا معرّف، 409 للصفحة الوحيدة، انتقال العرض عند حذف المعروضة وعدم زحزحته عند غيرها، 404 لـ `PAGE_NOT_IN_BOARD`، 404 لصفحة أجنبية في `active-page`، 409 لسبورة مؤرشفة).

اختبارات القاعة المتأثّرة (8 ملفات): كلها ناجحة في المستودع الفعلي.

**الحزمة الكاملة:**
```
npx vitest run --no-file-parallelism
→ Test Files 4 failed | 96 passed (100)
→ Tests      4 failed | 1374 passed (1378)
```
الأربعة الفاشلة كلها داخل `.kilo/worktrees/hypnotic-yarrow` و`.kilo/worktrees/quixotic-bellflower` (`live-admission` 18/19 تعيد 429 بدل 400، و`live-room-participants` يفشل في التحصيل) — خارج النطاق بأمر صريح، ولم تُمسّ ولم تُضعَّف. الأساس قبل هذه الجلسة كان 1347 ناجحاً/4 فاشلة؛ الفارق +27 هو الاختبارات الجديدة وحدها.

**إعادة التشغيل في 2026-09-02** بعد تغييرَي الـ harness، مع استثناء نسخ المستودع البائتة من الـ glob على سطر الأوامر (بلا تعديل `vitest.config.ts`):

```
npx vitest run --no-file-parallelism \
  --exclude "**/node_modules/**" --exclude "**/dist/**" \
  --exclude "tests/e2e/**" --exclude ".kilo/**"
→ Test Files  36 passed (36)
→ Tests      612 passed (612)   | exit 0
```
أي أن اختبارات المستودع الفعلية كلها ناجحة؛ الفاشلة الأربعة السابقة تنتمي كلها إلى `.kilo/worktrees/*` وقد استُثنيت بالإقصاء لا بالإضعاف. (`tests/e2e/**` مُستثنى أصلاً في `vitest.config.ts` كي لا يجمع vitest مواصفات Playwright.)

---

## 9. TypeScript

```
npx tsc --noEmit → نظيف (بلا مخرجات)
```
أُعيد التشغيل في 2026-09-02 بعد تغييرَي الـ harness (يشمل `playwright.config.ts` و`tests/e2e/**` لأنهما داخل `tsconfig`): نظيف، رمز الخروج 0.

## 10. ESLint

```
npx eslint <الملفات المتغيّرة> → 0 errors, 0 warnings
npx eslint src                 → 0 errors, 31 warnings (كلها سابقة وغير متعلّقة بالطور،
                                  منها ParticipantInfo_State / ServerError في data-channel.ts)
```
إعادة التشغيل في 2026-09-02: `npx eslint playwright.config.ts src` → رمز الخروج 0، **0 errors / 31 warnings** (نفس التحذيرات السابقة، لا جديد).

`tests/e2e/fixtures/global-setup.ts` **لا يمكن فحصه**: `eslint.config.mjs` يُقصي `tests/**` كلياً عبر `globalIgnores` (قرار سابق لهذا الطور). تمريره صريحاً يُخرج خطأ الأداة `all of the files matching the glob pattern "tests/e2e" are ignored`. لم أوسّع إعداد ESLint لأجل ملف harness — ذلك خارج النطاق.

---

## 11. Browser E2E

**الحالة: `BLOCKED` — صفر اختبار نُفِّذ (0 passed / 0 failed / 0 skipped).** `npx playwright test` يتوقّف في `globalSetup` **قبل إقلاع أي متصفح**، ورمز الخروج 1.

### 11.1 الـ harness — موجود الآن، ويُقلَع فعلاً

| العنصر | القيمة |
| --- | --- |
| `@playwright/test` | **1.62.1** (مثبَّت قبل هذه الجلسة — لم يُعَد تركيبه) |
| الإعداد | `playwright.config.ts`: `testDir: tests/e2e`, `workers: 1`, `fullyParallel: false`, `retries: 0`, `timeout: 150s`, `expect: 25s`, `locale: ar-EG` |
| المشروعان | `desktop` (Desktop Chrome 1400×900) و`mobile` (Pixel 5 — لمس حقيقي عبر CDP لا محاكاة مؤشر) |
| الخادم | `webServer` → `npm run dev -- -p 3117`، `reuseExistingServer: true` |
| المواصفات | `whiteboard-teacher.spec.ts` (3)، `whiteboard-student.spec.ts` (3)، `whiteboard-touch.spec.ts` (1) — **7 اختبارات مكتوبة، لم يُشغّل منها شيء** |
| البذر | `globalSetup` → `runSeedCli("seed")` في عملية ابنة (حدّ CJS/ESM)، ثم كوكي جلسة حقيقي لكل دور |

### 11.2 إصلاح الأصل المُطبَّق — مُتحقَّق منه مباشرةً رغم الحاجز

الحاجز الذي شُخِّص سابقاً حقيقي، وقد أُثبت عند المصدر وعلى الخادم الحيّ. Next 16.3.0 يقارن `Origin` بقائمة `['**.localhost', 'localhost', ...allowedDevOrigins, hostname]` في `block-cross-site-dev.js`، ويردّ 403 `Unauthorized` على `/_next/*` لما لا يطابق. بخادم `npm run dev -- -p 3117` قائماً، استقصاء `/_next/static/chunks/__origin_probe_not_real.js`:

```
(بلا ترويسة Origin)      → 404 "Not Found"
Origin: http://localhost:3117   → 404 "Not Found"     ← مسموح، فيصل إلى المُوجِّه
Origin: http://127.0.0.1:3117   → 403 "Unauthorized"  ← محجوب قبل المُوجِّه
```

الـ 404 هو الجواب الصحيح لملف غير موجود — أي أن الطلب عبر البوابة. فالانتقال إلى `localhost` يُزيل فئة الـ 403 هذه فعلاً، وبقيت `next.config.ts` بلا `allowedDevOrigins` (توسيع ما يقبله خادم التطوير في كل تشغيل لأجل عيب في أداة الاختبار تخفيفٌ في غير موضعه). **لكن هذا الإصلاح لم يُختبر عبر متصفح حقيقي**، لأن الحاجز التالي يسبقه في الترتيب.

### 11.3 الحاجز الفعلي: قاعدة البيانات ترفض بيانات الاعتماد الموجودة

```
Error: فشل `seed` في e2e-seed.mts (رمز الخروج 1):
PrismaClientKnownRequestError:
Invalid `prisma.session.deleteMany()` invocation in
  D:\hussian\tests\e2e\fixtures\e2e-seed.mts:140:24
Authentication failed against the database server,
the provided database credentials for `(not available)` are not valid
  code: 'P1000'
  cause: { originalCode: '28P01',
           originalMessage: "password authentication failed for user 'neondb_owner'",
           kind: 'AuthenticationFailed' }
  at runSeedCli (tests\e2e\fixtures\e2e-data.ts:98:11)
  at globalSetup (tests\e2e\fixtures\global-setup.ts:54:52)
```

`globalTeardown` فشل بالخطأ نفسه. والحاجز ليس في الـ harness: **خادم التطوير نفسه** فشل بـ P1000 عند تصيير الصفحة الرئيسة (`prisma.course.findMany()` في `src/app/(site)/page.tsx:37`) — أي أن التطبيق نفسه لا يصل إلى القاعدة في هذه البيئة. وأُكِّد استقلالاً باستقصاء `pg` بـ `SELECT 1` (بلا طبع أي سرّ):

```
host=ep-old-breeze-b2k2jozc-pooler.c-6.eu-central-1.aws.neon.tech
db=neondb  user=neondb_owner  password_len=16
params=?sslmode=require&channel_binding=require
→ CONNECT_FAIL code=28P01 password authentication failed for user 'neondb_owner'
```

`.env` هو الملف الوحيد (لا `.env.local`)، ويعرّف `DATABASE_URL` واحداً — لا بديل. وتعديل `.env` **ممنوع صراحة في هذه الجلسة**، فالحاجز خارج ما أملكه: **حاجز بيئة/اعتماد، لا عيب harness ولا عيب تطبيق.**

**ما يلزم لفتحه (بيد المستخدم):** إعادة تعيين/تدوير كلمة مرور `neondb_owner` في Neon وتحديث `DATABASE_URL` في `.env`، ثم إعادة `npx playwright test`. تنبيه يستحق الفحص: إن كان Vercel يستعمل الاعتماد نفسه فقد يكون وصول الإنتاج إلى القاعدة متأثّراً كذلك (**لم أتحقّق** — لا تواصل مع الإنتاج في هذه الجلسة).

**إعادة تحقّق ثانية (2026-09-02، 21:12) بعد إبلاغي بأن الاعتماد صُحِّح — الحاجز قائم كما هو:**
- الحلّ تماماً كما يفعل `prisma.config.ts` (`import "dotenv/config"` ثم `process.env["DATABASE_URL"]`؛ ولا متغيّر بيئة سابق يتقدّم على `.env` لأن الصدفة لا تعرّفه) ⇒ القيمة من `D:\hussian\.env`، والهدف `neondb` على `ep-old-breeze-b2k2jozc-pooler.c-6.eu-central-1.aws.neon.tech` — **نفس الهدف السابق بلا تغيير**.
- `SELECT 1` عبر `pg` ⇒ `28P01 password authentication failed for user 'neondb_owner'`.
- `npx prisma migrate status` (محرّك Prisma نفسه — طبقة اتصال مختلفة، فالسبب ليس `channel_binding` ولا سلوك سائق) ⇒ `P1000`، رمز الخروج 1.
- `.env` **لم يُعدَّل**: آخر تعديل 2026-08-31 18:04:39 +0300، أي قبل تشغيل هذا اليوم الفاشل. ولا مفتاح قاعدة بديل في الملف (`DATABASE_URL` وحده). فالتصحيح — أينما جرى — لم يصل إلى هذا الملف.
- لم تُشغَّل حزمة Playwright في هذه المحاولة (توقّفت عند فشل الاتصال بأمر صريح)، ولم تُنفَّذ أي migration، ولا تواصل مع الإنتاج.

**ملاحظة سلامة مستقلّة عن الاعتماد:** الهدف المُحلّ **ليست** قاعدة `whiteboard-e2e` معزولة، وإنما `neondb` نفسها التي يستعملها التطبيق في التصيير. مدى الكتابة محدود بالتصميم (كل حذف في `cleanupE2EData` مقيَّد بـ `where: { id: { in: [...] } }` على معرّفات `e2e-wb-*` حصراً، ولا حذف غير مقيَّد)، لكن البذر يكتب في قاعدة التطبيق لا في قاعدة اختبار منفصلة. القرار في هذا للمستخدم قبل التشغيل.

### 11.4 المسارات الحرجة — كلها `NOT EXECUTED`

لا أزعم أي نتيجة متصفح. لم يُقلع متصفح، ولم تُصيَّر صفحة، ولم يُركَّب تطبيق React.

| المسار الحرج | المواصفة | النتيجة |
| --- | --- | --- |
| معلم: مصادقة → قاعة → فتح السبورة → تصيير Excalidraw → رسم → إنشاء صفحة → تبديل → حذف → التحقق من الحالة | `whiteboard-teacher.spec.ts` | `NOT EXECUTED` |
| معلم: الرسم يبقى بعد `page.reload()` (إعادة التحميل/الاستعادة) | `whiteboard-teacher.spec.ts` | `NOT EXECUTED` |
| العربية/RTL: `html[dir=rtl]`، اتجاه اللوحة المحسوب، عناوين الأدوات بالعربية | `whiteboard-teacher.spec.ts` | `NOT EXECUTED` |
| طالب: نفس الجلسة → فتح السبورة → رؤية الحالة الحالية → قراءة فقط → محاولة تحرير حقيقية لا تغيّر شيئاً + POST مباشر يردّ 403 | `whiteboard-student.spec.ts` | `NOT EXECUTED` |
| طالب: السبورة لا تفتح اتصال LiveKit ثانياً (عدّ WebSocket ≤ 1، بلا زيادة) | `whiteboard-student.spec.ts` | `NOT EXECUTED` |
| طالب: استعادة صفحة جديدة أنشأها المعلم خلال 30 ثانية (استقصاء الاستعادة) | `whiteboard-student.spec.ts` | `NOT EXECUTED` |
| لمس حقيقي على مقاس هاتف (CDP `Input.dispatchTouchEvent`) | `whiteboard-touch.spec.ts` | `NOT EXECUTED` |

الاختبارات المركّزة على السبورة في المتصفح: `NOT EXECUTED` كذلك — الحاجز في `globalSetup` يسبق أي تصفية للمواصفات.

### 11.5 البذر والتنظيف والمخلّفات

- **البذر معزول بالتصميم:** كل المعرّفات ببادئة `e2e-wb-*` (`e2e-wb-teacher`, `e2e-wb-teacher-user`, `e2e-wb-student-user`, `e2e-wb-session-scheduled`, `e2e-wb-session-live`, `e2e-wb-admission`, `e2e-wb-auth-*`)، ولا يلمس البذر أي بيان آخر.
- **مخلّفات هذا التشغيل: صفر — بالبناء لا بالفحص.** البذر تعطّل على أول عملية حذف له (`session.deleteMany`) قبل أي إدخال، فلم يُكتب صف واحد.
- **مخلّفات تشغيلات أسبق: غير قابلة للتحقّق** ما دامت القاعدة لا تستجيب. لا أزعم أن القاعدة نظيفة، وإنما أن هذه الجلسة لم تُدخل شيئاً.
- **تنظيف محلي مُنجَز:** خادم التطوير أُوقف (PID 14824)، المنفذ 3117 حرّ، سجلّات التشخيص المؤقتة (`dev-probe.log`, `playwright-run.log`) محذوفة، `tests/e2e/.auth` غير موجود، و`git status --porcelain` مطابق لبدء الجلسة (لا تعديل غير مقصود على ملف متعقَّب). `test-results/` و`playwright-report/` موجودان وفارغان من النتائج ومُستثنيان في `.gitignore`.

## 12. التحقق من الإنتاج

**لم يُنفَّذ** — لا commit ولا push ولا نشر في هذه الجلسة (لم يُطلب)، ولا تواصل مع الإنتاج. لا أزعم أي تحقق إنتاجي.

---

## 13. تأكيدات النطاق

- لا تغيير في `prisma/schema.prisma` في هذه الجلسة.
- لا تعديل على أي migration SQL.
- **لم تُنفَّذ أي migration** على أي قاعدة بيانات (ولا `db push` ولا `migrate reset`).
- لا تواصل ولا تغيير في الإنتاج، ولا تغيير في إعداد Neon.
- لا ترقية/تنزيل لأي تبعية (Excalidraw 0.18.1 كما هي).
- سقوف الكتابة والحمولة كما هي (2 MiB، 5000 عنصر، 50 صفحة، 30/3s).
- إصلاحات تصليب الطور 1A الثلاثة سليمة كما هي (سباق `ensureBoard`، نطاق اللوح في `removePage`، فحص انتماء الصفحة في `appendSnapshot`) — واختباراتها تمرّ.
- لا تسجيل، ولا غرف بحث، ولا تحليلات سبورة، ولا تقليم retention، ولا إعادة تصميم للقاعة، ولا تجميل واجهة غير متعلّق.
- فشل `.kilo/worktrees/*` لم يُمسّ.

**تأكيدات جلسة 2026-09-02 خاصةً:** لم يُعَد تركيب `@playwright/test`، ولم تُستأنف تهيئة Playwright من الصفر، ولا تعديل على المخطط أو أي migration، ولا تنفيذ migration، ولا لمس للإنتاج، ولا تعديل على `.env`، ولا تغيير في شيفرة التطبيق (لم يُثبت أي اختبار متصفح عيباً تطبيقياً — إذ لم يُشغّل اختبار متصفح قطّ)، ولا إضعاف/تخطٍّ/حذف لأي تأكيد في E2E، ولا commit ولا push.

## 14. المهارات

| مهارة | الاستخدام |
| --- | --- |
| `playwright` | **غير متاحة كمهارة في أي من الجلستين** — ولا أزعم استخدامها. الـ harness كُتب يدوياً بـ `@playwright/test` 1.62.1 مباشرة، وشُغِّل بـ `npx playwright test`. |
| `frontend-design` / `front:frontend-testing` / `front:frontend-code-review` | غير متاحة في قائمة مهارات هذه الجلسة. المراجعة أُجريت يدوياً على بنية المكوّنات والخطّافات (تبعيات `useEffect`، الـ refs، إعادة التصيير، حدود الأمان). |

---

## 15. مخاطر ومسائل معمارية غير محلولة

1. **لا تغطية متصفح — الخطر الأول ولم ينقص شيئاً منه.** الـ harness صار جاهزاً و7 اختبارات مكتوبة، لكن صفراً منها نُفِّذ: تصيير Excalidraw، اللمس، RTL، القراءة-فقط للطالب، وإعادة الاتصال كلها غير مُتحقَّق منها في متصفح. الحاجز اعتماد قاعدة البيانات (`28P01`) لا نقص في التغطية المكتوبة.
2. **بيئة التطوير معطّلة عن القاعدة** — الاعتماد في `.env` مرفوض (`neondb_owner` / `28P01`)، فلا يعمل `next dev` ولا أي اختبار يلمس القاعدة. يحتاج تدوير كلمة المرور في Neon من المستخدم. وإن كان الإنتاج يستعمل الاعتماد نفسه فقد يكون متأثّراً (غير مُتحقَّق).
3. **غرفة الطالب مرفوعة عبر callback** — `StudentLiveViewer` يبقى مالك دورة الحياة، لكن الاعتماد على توقيت `onRoom` يعني نافذة قصيرة يعمل فيها الطالب باستقصاء الاستعادة بدل القناة. سلوك مقبول (fail-open للقراءة فقط) لكنه يستحق قياساً في المتصفح.
4. **حدّ المعدّل في الذاكرة** — `checkRateLimit` لكل نسخة serverless؛ على عدة نسخ يصبح السقف الفعلي أعلى. مسألة قائمة من قبل هذا الطور.
5. **البثّ ليس مضموناً** (at-most-once): الاعتماد النهائي على المراجعة + الاستعادة بـ GET. مقصود، لكنه يعني أن انقطاعاً طويلاً يظهر كتأخير حتى أول استعادة.
6. **`WhiteboardElement` عقد سطحي** — لا نُعيد تعريف مخطط Excalidraw؛ ترقية المكتبة لاحقاً قد تحتاج ترحيل عناصر محفوظة.
7. **جداول السبورة غير مُهاجَرة في الإنتاج** — كل المسارات تردّ 503 fail-closed حتى تُنفَّذ الـ migration (خارج نطاق هذا الطور).
8. **`tests/**` مُقصى في ESLint** — ملفات الـ harness لا تُفحَص لغوياً. قرار سابق، تُرك كما هو.
9. **نسخ `.kilo/worktrees/*` البائتة تُلوّث glob الـ vitest الافتراضي** — استُثنيت على سطر الأوامر فقط؛ `vitest.config.ts` لم يُمسّ.

---

## الحالة النهائية: `BLOCKED` (على Browser E2E)

التنفيذ والتكامل مكتملان، وTypeScript نظيف، وESLint نظيف (0 errors)، و91/91 من اختبارات السبورة و612/612 من اختبارات المستودع الفعلية تمرّ. وإصلاح الأصل المطلوب مُطبَّق ومُثبَت عند الخادم الحيّ (`127.0.0.1` → 403 على `/_next/*`، و`localhost` → يمرّ).

الطور **لا يُعلن مكتملاً**: `npx playwright test` أعطى 0 passed / 0 failed / 0 skipped لأنه توقّف في `globalSetup` بـ `P1000` / `28P01 password authentication failed for user 'neondb_owner'` — لا متصفح أُقلع، ولا مسار حرج نُفِّذ. الحاجز حاجز اعتماد بيئة، وفتحه يحتاج تدوير كلمة مرور Neon وتحديث `DATABASE_URL` في `.env` من المستخدم (تعديل `.env` ممنوع عليّ في هذه الجلسة).

**Implementation complete, browser E2E blocked (database credential rejected).**
