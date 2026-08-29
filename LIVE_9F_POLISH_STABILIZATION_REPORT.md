# LIVE-9F — Polish + Stabilization — Implementation Report

**التاريخ:** 2026-08-29
**الحالة النهائية:** PARTIAL — كل بند مسموح بتنفيذه مُنفَّذ ومُختبَر محلياً؛ **M4 (Browser E2E + مراجعة كود الواجهة) معلّق** لغياب البيئة والمهارات
**لا يتبقى بند تنفيذي في نطاق 9F:** M4 محجوب بيئياً وS3 موقوف بانتظار إذن صريح — التفصيل في §L
**آخر commit على main:** `7b5bda7` (MUST M1–M3) — بنود SHOULD في نسخة العمل بلا commit
**baseline قبل الطور:** 511 اختباراً · **بعده:** 521 اختباراً (33 ملفاً) — لم يُضعَّف ولم يُحذف أي اختبار

---

## A. نطاق الطور كما أُقرّ في Safety Gate

طور تثبيت لا طور ميزات: لا API جديد، لا جدول، لا حزمة، لا migration. البنود مأخوذة من مراجعة LIVE-9E/9D (الأخطاء I1–I10) ومصنَّفة MUST / SHOULD / DEFER.

| الفئة | البنود | الحالة |
|---|---|---|
| MUST | M1 · M2 · M3 | ✅ منفَّذة ومُودَعة في `7b5bda7` |
| MUST محجوب | M4 (Browser E2E + code review) | ⛔ معلّق — B1/B2/B3 |
| SHOULD | S1 · S2 · S4 · S5 | ✅ منفَّذة في نسخة العمل |
| SHOULD موقوف | S3 (TTL/eviction لـ `handState`) | ⏸ **لم يُنفَّذ** — يلمس LIVE-9D المعلنة COMPLETE ويحتاج إذناً صريحاً |
| DEFER | D1 … D6 | ⏸ لم تُنفَّذ بحسب القرار |

لا يوجد بند خارج هذا الجدول: قائمة Safety Gate مقفلة على M1–M4 · S1–S5 · D1–D6، وكل ما فيها إما منفَّذ أو محجوب أو موقوف أو مؤجَّل بقرار — §L.

## B. Root Cause لكل بند منفَّذ

### M1 — صدق حالة المنح/السحب عند `applied === false` (`7b5bda7`)
**السبب الجذري:** الواجهة كانت تُصفّر شارة الميكروفون بمجرد نجاح نداء HTTP، بينما `applied: false` يعني أن LiveKit لم يُطبِّق شيئاً (طالب غير متصل أو فشل RPC). النتيجة: المعلم يرى «مكتوم» وصلاحية الطالب قائمة — مخالفة مباشرة لقاعدة «لا نجاح بلا دليل».
**الإصلاح:** الحالة المُعلَنة تُشتق من نتيجة العملية لا من نجاح النداء (`src/app/api/live/[id]/microphone/route.ts:164`)، ولوحة المشاركين تُعيد استعلام الحالة قسرياً بعد أي فشل/عدم تطبيق بدل انتظار دورة الـ12 ثانية، و`micGranted: null` تُعرض «غير معروفة» لا «مكتوم» (`participants-panel.tsx:238`).
**تكملة (مراجعة نهائية):** الاستعلام القسري بعد خطأ 5xx كان يمسح رسالة الفشل التي عُرضت للتو (`load` تُصفّر `errorMsg` عند نجاحها)، فيرى المعلم اختفاء الخطأ لا سببه. أُضيف `load({ keepErrorMsg: true })` على مسار 5xx حصراً: الحالة تُصحَّح من LiveKit والرسالة تبقى — نجاح الاستعلام ليس نجاحاً للعملية. مسارا `applied === false` و`micGranted: null` لا يعرضان `errorMsg` فبقيا على `load()` المعتاد، و«كتم الجميع» غير متأثر (يعود عند `!res.ok`).

### M2 — توحيد دلالة `canPublishSources` الفارغة (`7b5bda7`)
**السبب الجذري:** السيرفر والعميل كانا يقرآن القائمة الفارغة بتفسيرين متعاكسين. بدلالة LiveKit الفارغة = **كل المصادر مسموحة**؛ الفرع الخاطئ كان قد يُخفي طالباً يبثّ فعلاً عن `selectMuteAllTargets`، أي «كتم الجميع» يتركه مسموعاً.
**الإصلاح:** تفسير واحد في الطبقة الخالصة (`microphone-permissions.ts:102`) يستهلكه السيرفر (`livekit-admin.ts:112`) والعميل (`student-microphone.ts:21`) معاً. النطاق بقي mic-only: لا camera ولا screen ولا data.

### M3 — تصحيح تعليق الثبات في `livekit-admin.ts` (`7b5bda7`)
**السبب الجذري:** تعليق يزعم حدوداً للأسرار غير صحيحة في أكثر ملف حساسية في الطبقة. تعليق كاذب في موضع أمني أسوأ من لا تعليق.
**الإصلاح:** تصحيح نصي بلا أثر تشغيلي (`livekit-admin.ts:5`, `:21`)، مع تسجيل صريح أن `data-channel.ts` (chat/raise-hand) لا قيد حجم/تردد مفروض عليه وأن تقويته بند مستقل خارج نطاق 9F. لم يُعَد تصميم `data-channel.ts` ولم يتغير سلوك LIVE-9D.

### S1 — إعادة التحقق من دور هدف «كتم الجميع»
**السبب الجذري:** الأهداف كانت تُشتق من تقاطع سجل دخول الجلسة مع حضور LiveKit. ذلك يحمي اليوم (مسار `/admission/request` يرفض المعلم والأدمن فلا سجل لهما)، لكنه **دفاع بالوراثة لا بالتحقق**: أي سجل لغير طالب بأي طريق آخر (تغيّر دور بعد الموافقة، إدخال إداري، مسار مستقبلي) كان يجعل المعلم هدفاً ممكناً للكتم.
**الإصلاح:** قراءة مخصّصة للقرار الأمني `readRosterModerationTargets` تقرأ الدور والملكية من جدول `User` حصراً (`admission-server.ts:271`) — منفصلة عن `readRosterAdmissions` التي تخدم العرض — وتصفية خالصة `selectMuteAllEligibleUserIds` (`microphone-permissions.ts:179`) تستثني كل من ليس `STUDENT`، وكل من تُرجع له `canManageAdmission` صحيحاً، و`user === null` (مستخدم محذوف). الاشتقاق القديم باقٍ؛ هذه طبقة فوقه.

### S2 — حد معدّل على `/admission/request`
**السبب الجذري:** كل مسارات 9D/9E خلفها `checkRateLimit` إلا هذا: نقرة متكررة على «طلب الدخول» تفتح `findUnique` + كتابة سجل مع كل نقرة.
**الإصلاح:** `ADMISSION_REQUEST_LIMIT = 5/10s` بمفتاح `admission_request_<sessionId>_<userId>` (`admission.ts:95`)، مطبَّق **بعد** إثبات الهوية والدور وقبل أي قراءة اشتراك أو كتابة (`admission/request/route.ts:66`) — فلا يستهلك مجهول الهوية حصة أحد ولا تُقيَّد جلسة بسبب أخرى. يعيد استخدام `rate-limit.ts` القائم بلا آلية جديدة. الحد داخل العملية (نفس قيد 9B/9C/9E) والمخزن المركزي مؤجَّل في D3.
**تكلفة المفتاح:** المفتاح مركّب (جلسة + طالب) لا مفتاح مستخدم واحد كما في 9B/9C/9E، فعدد المفاتيح الممكنة يصير حاصل ضرب الجلسات في الطلاب. و`rate-limit.ts` لا يُخلي مفاتيحه أبداً (`Map` على مستوى الوحدة بلا eviction)، فS2 **يزيد فضاء المفاتيح** في هذه الخريطة ولا يقتصر على وراثة قيدها. النمو صغير بالمقياس المطلق (بضع عشرات من البايتات لكل زوج جلسة/طالب، وحياته حياة العملية على Vercel) لكنه نمو حقيقي غير محدود من حيث المبدأ — من صنف D3 نفسه، ومسجَّل في §K.4.

### S4 — عرض لوحة طلبات الدخول على `scheduled`
**السبب الجذري:** `canRequestAdmission` تسمح بالطلب في `scheduled` + `waiting` + `live`، بينما شرط عرض اللوحة كان `waiting || live` فقط. الطالب يُقدّم طلباً مشروعاً على جلسة `scheduled` ولا توجد لوحة تعرضه: انتظار قرار لا يراه أحد.
**الإصلاح:** `shouldShowAdmissionPanel` مشتقة من `canRequestAdmission` نفسها (`admission.ts:76`) ويستهلكها `live-room-client.tsx:631`، فلا يمكن للشرطين أن يتباعدا مستقبلاً. لوحة المشاركين تبقى على `waiting/live` لأنها تُصدر نداءً إلى LiveKit ولا غرفة قبل بدء الجلسة.

### S5 — تشخيص flake `live-room-polish`
**التشخيص:** `beforeEach` كان يُرقّع `globalThis.fetch` بدالة تبدأ بـ
`const res = await import("@/app/api/live/[id]/token/route")` **ونتيجتها غير مستخدمة إطلاقاً**. استيراد ميت لكن ليس بلا أثر: كل نداء `fetch` كان يُحمّل شجرة الوحدة الحقيقية (prisma + livekit-server-sdk) داخل زمن الاختبار، فيصير زمن `connectStudentSubscriber` تابعاً لزمن تحميل الوحدات لا لمنطق الاختبار. وهو المسار الوحيد في هذا الملف القادر على تجاوز مهلة الاختبار الافتراضية (5s) على تحميل بارد أو تحت تشغيل كامل مزدحم — وهو ما يفسّر flake لوحظ مرة (R6) ولم يتكرر.
عيب ثانٍ في نفس الموضع: `globalThis.fetch` مُسند إسناداً مباشراً لا عبر spy، و`vi.restoreAllMocks()` في `afterEach` لا تُرجعه — الملف كان يترك `fetch` مُرقَّعاً بعد انتهائه.
**الإصلاح (بلا إضعاف):** حُذف الاستيراد الميت، وأُعيدت `globalThis.fetch` صراحة في `afterEach` من مرجع مُحتفظ به. **لم يُحذف اختبار ولا تأكيد ولا تغيّر عددها: 7 اختبارات قبل و7 بعد**، وعقد استجابة التوكن المُختبَر كما هو.
**تُحقّق:** 6 تشغيلات متتالية قبل الإصلاح و3 بعده — أخضر في كلّها؛ الـflake لم يُعَد إنتاجه في هذه البيئة، فالإصلاح إزالة سببٍ بنيوي محتمل لا إثبات لعلاقة سببية مُشاهَدة.

## C. ما لم يُنفَّذ ولماذا

| البند | السبب |
|---|---|
| **M4** — Browser E2E + مراجعة كود/تصميم الواجهة | **B1:** لا بيئة LiveKit اختبارية ولا Neon branch. **B2:** `playwright` · `front:frontend-testing` · `front:frontend-code-review` — وهي مهارات 9F الثلاث حرفياً — غير محمَّلة في هذه الجلسة؛ بحسب `CLAUDE.md §8` لا يُختلق اسم ولا يُدَّعى استخدام. **B3:** لا `@playwright/test` ولا مجلد `e2e/`، وإضافتهما تغيير حزم ممنوع بأمرك. |
| **S3** — TTL/eviction لـ `handState` | يلمس LIVE-9D المعلنة COMPLETE (B4) — **موقوف بانتظار إذنك الصريح**. النمو غير المحدود لخريطة `handState` في الذاكرة قائم ومسجَّل. |
| **D1** ذرّية approve ↔ kick | يحتاج versioning/معاملة = تصميم جديد لا تثبيت |
| **D2** إدارة `unknown identities` | مؤجَّلة عمداً في 9C + ميزة إدارية جديدة |
| **D3** مخزن مركزي لحدود المعدل و`handState` | infra جديدة (Redis/DB) + migration محتملة |
| **D4** ذرّية «كتم الجميع» | تصميم؛ لا ثغرة اليوم — توكن الطالب بلا نشر أصلاً |
| **D5** تنظيف stubs في `services.ts` | توثيق منخفض القيمة؛ يصح ضمن طور Recording |
| **D6** `npm run build` محلياً بلا `SUPABASE_SERVICE_KEY` | عيب بيئي سابق غير متعلق بالطور |
| **B5** نسختان قديمتان في `.kilo/worktrees` تفشلان في التجميع | `.kilo` و`vitest.config.ts` ممنوعان بأمرك — يُستثنى المجلد على سطر الأمر فقط |

## D. Files Created / Modified

**جديد (1):**

```
LIVE_9F_POLISH_STABILIZATION_REPORT.md                  هذا التقرير
```

**معدَّل في `7b5bda7` (MUST — مُودَع):**

```
src/app/api/live/[id]/microphone/route.ts               M1 — الحالة المُعلَنة من نتيجة العملية
src/app/(site)/live/[id]/participants-panel.tsx         M1 — إعادة استعلام قسرية + null = غير معروفة
src/lib/live-classroom/livekit-admin.ts                 M2 + M3 — التفسير الموحَّد + تصحيح التعليق
src/lib/live-classroom/microphone-permissions.ts        M2 — قراءة الصلاحية في الطبقة الخالصة
src/lib/live-classroom/student-microphone.ts            M2 — استهلاك نفس القراءة في العميل
tests/live-microphone-permissions.test.ts               M1/M2 — اختبارات الدلالة والصدق
```

**معدَّل في نسخة العمل (SHOULD — بلا commit):**

```
src/app/(site)/live/[id]/participants-panel.tsx         M1 — تكملة: حفظ رسالة الخطأ عبر load({ keepErrorMsg })
src/lib/live-classroom/admission-server.ts              S1 — readRosterModerationTargets
src/lib/live-classroom/microphone-permissions.ts        S1 — selectMuteAllEligibleUserIds + MuteAllRosterEntry
src/app/api/live/[id]/microphone/mute-all/route.ts      S1 — التصفية قبل الكتم
src/lib/live-classroom/admission.ts                     S2 + S4 — الحد والرسالة + shouldShowAdmissionPanel
src/app/api/live/[id]/admission/request/route.ts        S2 — checkRateLimit بعد إثبات الهوية
src/app/(site)/live/[id]/live-room-client.tsx           S4 — شرط اللوحة مشتق من سياسة الطلب
tests/live-microphone-permissions.test.ts               S1 — مجموعتا اختبار جديدتان
tests/live-admission.test.ts                            S2 — حد المعدل
tests/live-room-polish.test.ts                          S5 — إزالة الاستيراد الميت + استرجاع fetch
```

**لم يُلمس:** `token/route.ts` · `data-channel.ts` · `vitest.config.ts` · `.kilo/**` · `prisma/**` · `package.json` · `AGENTS.md`.
`CLAUDE.md` و`resources/icon.png` ظاهران معدَّلين في `git status` — **تعديلان سابقان لهذا الطور ولم يُلمسا فيه** بحسب أمرك.

## E. Tests

```
npx vitest run tests/live-microphone-permissions.test.ts tests/live-admission.test.ts \
  tests/live-room-participants.test.ts --no-file-parallelism --exclude "**/.kilo/**"
  Test Files  3 passed (3)
  Tests       168 passed (168)

npx vitest run tests/live-room-polish.test.ts --no-file-parallelism --exclude "**/.kilo/**"
  Test Files  1 passed (1)
  Tests       7 passed (7)        ×3 تشغيلات متتالية — أخضر في كلّها

npx vitest run --no-file-parallelism --exclude "**/.kilo/**" --exclude "**/node_modules/**"
  Test Files  33 passed (33)
  Tests       521 passed (521)
```

**اختبارات أُضيفت في هذا الطور:** S1 — `selectMuteAllEligibleUserIds` (استثناء غير الطالب، الأدمن، معلم الجلسة، المستخدم المحذوف) و`mute-all يُعيد التحقق من الدور قبل الكتم`؛ S2 — حد معدّل `/admission/request` بمفتاح الجلسة+الطالب؛ M1/M2 — دلالة `canPublishSources` الفارغة وعدم إعلان حالة لا دليل عليها (`null`).
**baseline:** 511 → 521. لم يُضعَّف ولم يُحذف اختبار واحد (`CLAUDE.md §Testing`).
**استثناء `.kilo`:** التشغيل بلا استثناء يجمع نسختين قديمتين داخل `.kilo/worktrees` تفشلان في مرحلة الجمع (قيد B5 المعروف من 9E) — ممنوع لمسهما ولمس `vitest.config.ts`، فالاستثناء على سطر الأمر حصراً.

## F. TypeScript

```
npx tsc --noEmit   → exit 0 (بلا مخرجات، 0 أخطاء)
```

## G. ESLint

```
npx eslint src     → ✖ 31 problems (0 errors, 31 warnings)
```

صفر أخطاء. التحذيرات كلها سابقة (imports غير مستخدمة في صفحات admin و`data-channel.ts` من 9D، `<img>` في teacher-photo-upload) — لا تحذير واحد في ملف عدّله هذا الطور.
`npx eslint tests` غير ممكن: مجلد `tests` مستثنى في إعداد ESLint للمشروع.

```
git diff --check   → exit 0
```

## H. Browser E2E Status

**Implementation complete, browser E2E pending.**

لا بيئة LiveKit حقيقية ولا متصفح ولا أجهزة صوت في هذه الجلسة، ولا يُدَّعى أي PASS. السيناريوهات المطلوبة عند توفر البيئة:

- M1: منح لطالب **غير متصل** → الشارة تُظهر «غير مطبَّق» مع التحذير العربي، ولا تُظهر نجاحاً.
- M1: فشل RPC أثناء السحب → إعادة استعلام فورية تكشف أن الصلاحية باقية.
- M2: طالب يبثّ فعلاً وقائمة مصادره فارغة → «كتم الجميع» يشمله (كان قد يتركه مسموعاً).
- S1: سجل دخول لغير طالب → لا يُكتم، والباقون يُكتمون.
- S2: نقر متكرر على «طلب الدخول» → `429` بالرسالة العربية بلا كتابة إضافية.
- S4: جلسة `scheduled` + طلب طالب → اللوحة تظهر للمعلم ويُقرَّر الطلب.
- S5: لا سيناريو متصفح — بند اختبارات.

## I. Production Verification

**لم تُنفَّذ.** لا commit لبنود SHOULD، ولا push، ولا deploy، ولا smoke test — بحسب أمرك بالتوقف عند نهاية الطور. آخر ما على `main` هو `7b5bda7` (MUST).

## J. Migration Status

لا migration. الطور بلا عمود ولا جدول ولا تغيير حزم.

## K. Remaining Risks

1. **M4 معلّق** — Browser E2E ومراجعة كود/تصميم الواجهة لم تُنفَّذا؛ شرط إغلاق إلزامي في `CLAUDE.md §10`. Vitest ليس بديلاً عن سلوك المتصفح والأجهزة.
2. **S3 غير منفَّذ** — `handState` في LIVE-9D يبقى بلا TTL ولا إخلاء: نمو غير محدود في ذاكرة العملية عبر جلسات كثيرة. موقوف بانتظار إذنك.
3. **`data-channel.ts` بلا قيد حجم/تردد مفروض** على chat/raise-hand (مُسجَّل في M3 بلا إصلاح) — بند مستقل خارج نطاق 9F.
4. **حدود المعدل داخل العملية** (`Map` في الذاكرة) لا يتقاسمها أكثر من instance على Vercel — قيد قائم منذ 9B، وS2 يورثه. **وS2 يزيد فضاء المفاتيح فوق ذلك:** مفتاحه مركّب `admission_request_<sessionId>_<userId>` بينما مفاتيح 9B/9C/9E لمستخدم واحد، فالعدد الممكن = الجلسات × الطلاب، و`rate-limit.ts` لا يُخلي مفتاحاً أبداً. النمو صغير مطلقاً وغير محدود مبدئياً — من صنف D3 (مخزن مركزي) ومن صنف S3 (غياب TTL/eviction)، ولم يُعالَج في هذا الطور. لا تغيير في التنفيذ: هذا تصحيح توصيف لا إصلاح كود.
5. **`micActive`** تُقرأ من لقطة LiveKit وتتأخر حتى دورة استعلام (12 ثانية) — مؤشر عرض لا حاجز أمني.
6. **flake `live-room-polish`** — أُزيل سبب بنيوي محتمل (استيراد ميت داخل مسار مؤقَّت) ولم يُعَد إنتاج الـflake أصلاً؛ فالنتيجة إزالة احتمال لا نفي مؤكَّد. تستحق المراقبة في تشغيلات لاحقة.
7. **اختبار 12 في `live-room-polish`** يبحث عن مستمعي `reconnecting`/`reconnected` بحرس `if (call)`، و`connectStudentSubscriber` لا يسجّل أياً منهما — فالتأكيد الأساسي فيه غير فعّال. تقويته يستلزم قراراً في دلالات LIVE-8D (تسجيل مستمعين فعليين) فخارج نطاق تثبيت؛ **مُسجَّل بلا إصلاح ولا إضعاف**.
8. **لا تحقّق إنتاجي** لبنود SHOULD (§I).

---

### المهارات المستخدمة ولماذا (`CLAUDE.md §13`)

| المهارة | الاستخدام |
|---|---|
| `playwright` | ❌ **غير متاحة في هذه الجلسة** — لم تُستخدم ولا يُدَّعى تنفيذ Browser E2E (§H). |
| `front:frontend-testing` | ❌ **غير متاحة في هذه الجلسة** — اختبارات الطور كُتبت بـ Vitest على النمط القائم: الدوال الخالصة وعميل الطالب بلا React فتُختبر مباشرة بلا DOM. |
| `front:frontend-code-review` | ❌ **غير متاحة في هذه الجلسة** — مراجعة كود الواجهة معلّقة؛ تبقى شرطاً لإغلاق الطور (§6). |

المهارات الثلاث مُدرَجة في `CLAUDE.md` كمتاحة (تحقّق 2026-08-25) لكنها غير موجودة في قائمة المهارات المحمَّلة في هذه الجلسة. بحسب §8 لا يُختلق اسم ولا يُدَّعى استخدام.

### Final Status: PARTIAL

كل بند من MUST القابل للتنفيذ محلياً (M1–M3) وكل SHOULD مسموح (S1, S2, S4, S5) منفَّذ ومُختبَر: `tsc` 0 أخطاء · `eslint src` 0 أخطاء · 521/521 اختباراً · `git diff --check` نظيف.
الإغلاق COMPLETE يتوقف على: **M4** (بيئة LiveKit اختبارية + المهارات الثلاث)، وقرارك في **S3**، ثم commit/push/deploy/smoke test بموافقتك.

---

## L. حالة الإقفال — ما تبقى فعلاً

قائمة Safety Gate لهذا الطور مقفلة على 15 بنداً (M1–M4 · S1–S5 · D1–D6)، ولا بند فيها بلا موضع:

| البند | الحالة | ما يلزم لإغلاقه |
|---|---|---|
| M1 · M2 · M3 | ✅ منفَّذ ومُختبَر (`7b5bda7` + تكملة M1 في نسخة العمل) | لا شيء |
| S1 · S2 · S4 · S5 | ✅ منفَّذ ومُختبَر في نسخة العمل | لا شيء |
| **M4** | ⛔ **محجوب** | بيئة LiveKit اختبارية + Neon branch (B1) · المهارات الثلاث `playwright`/`front:frontend-testing`/`front:frontend-code-review` (B2) · `@playwright/test` ومجلد `e2e/` = تغيير حزم ممنوع (B3) |
| **S3** | ⏸ **موقوف** | إذنك الصريح — يلمس LIVE-9D المعلنة COMPLETE (B4) |
| D1 … D6 | ⏸ مؤجَّل بقرار الطور | طور لاحق (تصميم/infra) — لا يُنفَّذ هنا |

**لا يتبقى عمل تنفيذي مسموح في نطاق 9F.** كل ما هو قابل للتنفيذ محلياً وبلا إذن إضافي وبلا كسر قاعدة (حزم · migration · مرحلة مكتملة · `.kilo` · `vitest.config.ts` · `token/route.ts` · `prisma`) قد نُفِّذ. الباقي ثلاثة أنواع فقط:

1. **محجوب بيئياً** — M4: لا يُغلق بكتابة كود بل بتوفير بيئة؛ Vitest ليس بديلاً (`CLAUDE.md §10/§11`).
2. **موقوف بقرارك** — S3.
3. **مؤجَّل بقرار الطور** — D1…D6.

الخطوة التالية ليست تنفيذاً بل قراراً: commit/push ثم تحقّق Vercel وsmoke test بموافقتك (§I لا تزال «لم تُنفَّذ»)، مع بقاء الحالة **PARTIAL** حتى تُنفَّذ M4 فعلاً.
