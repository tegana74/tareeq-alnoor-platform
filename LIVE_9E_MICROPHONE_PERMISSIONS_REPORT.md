# LIVE-9E — Microphone Permissions + Mute All — Implementation Report

**التاريخ:** 2026-08-29
**الحالة النهائية:** PARTIAL — التنفيذ والاختبارات المحلية مكتملة؛ Browser E2E ومراجعة الواجهة وقبول الإنتاج معلّقة
**آخر commit على main:** `a0a4c87` (لم يُنفَّذ commit ولا push في هذا الطور)

---

## A. Implementation Summary

مُنح الطالب القدرة على التحدث بالصوت **فقط** بعد قرار صريح من المعلم، بأربع طبقات على نفس نمط LIVE-9C:

1. **طبقة سياسة خالصة** (`microphone-permissions.ts`) — قرارات المنح/السحب وأهداف «كتم الجميع» دوال نقية بلا React ولا Prisma ولا LiveKit.
2. **مهايئ LiveKit للسيرفر حصراً** (`livekit-admin.ts`) — أُضيف `updateParticipant` (grant/revoke) إلى الملف الوحيد الذي يلمس `RoomServiceClient`.
3. **مسارا API رفيعان** — `POST /api/live/[id]/microphone` (طالب واحد) و`POST /api/live/[id]/microphone/mute-all`.
4. **واجهة بلا منطق تصريحي** — أزرار منح/سحب و«كتم الجميع» في لوحة المشاركين، وشريط «تشغيل/إيقاف الميكروفون» في مشاهد الطالب.

الـ enforcement الحقيقي هو `updateParticipant` في LiveKit وحده: لا DataChannel، ولا حالة React، ولا عمود في قاعدة البيانات.

## B. Architecture Changes

| الطبقة | القرار |
|---|---|
| مصدر الحقيقة | صلاحية الميكروفون تعيش في LiveKit حصراً وتُقرأ من `listParticipants` مع بقية بيانات الحضور. **لا حالة ميكروفون مخزَّنة في قاعدة البيانات ولا استعلام جديد.** |
| التوكن | لم يُلمس `token/route.ts`: الطالب يبقى يصدر بـ `canPublish: false`، والمنح يحدث بعد الاتصال. النتيجة أن إعادة الاتصال تعود تلقائياً إلى المنع الافتراضي. |
| نطاق المنح | `canPublishSources = [MICROPHONE]` فقط، مع `canPublishData: false`. الكاميرا ومشاركة الشاشة ونشر البيانات تبقى محجوبة كما في LIVE-8C/9D. |
| «كتم» = سحب الصلاحية | سحب `canPublish` يجعل خادم LiveKit يُلغي نشر المسار بنفسه. كتم المسار وحده كان سيبقي الصلاحية قائمة فيُعاد الإرسال بضغطة زر من العميل. |
| حالة الواجهة (الطالب) | من `room.localParticipant.permissions` + حدث `ParticipantPermissionsChanged` مُرشَّحاً على الهوية المحلية، ومن `LocalTrackPublished/Unpublished` لحالة الزر. **لا رسالة DataChannel تفتح الميكروفون** — الرسائل قابلة للانتحال، والصلاحية لا. |
| حالة الواجهة (المعلم) | `micGranted` / `micActive` حقلان جديدان في `RosterParticipant` يأتيان من نفس استعلام المشاركين القائم (12 ثانية) — `null` عند تعذّر الوصول إلى LiveKit. |
| لا تخزين = لا منح مؤجَّل | منحٌ لطالب غير متصل لا يُحفظ ولا يُطبَّق لاحقاً؛ يُعاد `micGranted: false` مع `warning` عربي صريح للمعلم. |

## C. Security / Authorization Guarantees

- المعلم **المالك** (`user.teacherId === session.teacherId`) أو الأدمن حصراً — يُتحقق مقابل `session.teacherId` من قاعدة البيانات.
- الطالب لا يصل إلى ما بعد حراسة الملكية، فلا يمنح نفسه ولا غيره.
- دور المستهدَف يُقرأ من جدول `User`، لا من جسم الطلب (اختبار يثبت أن `role` في الجسم يُتجاهل).
- المطرود (`kicked`) وغير المقبول (`pending`/`rejected`/`none`) ومن لا سجل دخول له في **هذه الجلسة** لا يُمنحون إطلاقاً.
- استهداف المعلم/الأدمن مرفوض (`manager`) — لا يُمنح ولا يُكتم بهذا المسار.
- «كتم الجميع» يُشتق من تقاطع سجل دخول هذه الجلسة مع حضور LiveKit، فلا يمكن أن يشمل المعلم (هوية المعلم لا سجل دخول لها) ولا هوية غريبة عن السجل.
- حد معدل **بعد** التحقق من الصلاحية: `mic_<userId>` = 10/10s، `mic_mute_all_<userId>` = 2/10s.
- `LIVEKIT_API_SECRET` و`RoomServiceClient` لم يخرجا من `livekit-admin.ts`؛ الاختبار الماسح لملفات `"use client"` في LIVE-9C ما زال أخضر، و`student-microphone.ts` (وهو `"use client"`) لا يستورد إلا `livekit-client`.
- رسائل المستخدم عربية ثابتة بلا تفاصيل SDK؛ سجلات الأخطاء بلا قيم أسرار.

## D. Failure Semantics

| الحالة | السلوك |
|---|---|
| طالب غير متصل (`not_found` من LiveKit) | `200` + `applied: false` + `micGranted: false` + `warning` صريح. لا يُحفظ المنح. |
| فشل RPC في المنح الفردي | `200` + `applied: false` + `warning` «أعد المحاولة» — لا يُدَّعى نجاح. |
| مفاتيح LiveKit ناقصة | لا يُنشأ عميل ولا نداء شبكة → `rpc_failed`. |
| `listParticipants` غير متاح في «كتم الجميع» | `503` صريح — لا يجوز إبلاغ المعلم بأن الجميع كُتم بينما لم يُطبَّق شيء. |
| فشل جزئي في «كتم الجميع» | `200` + `revoked`/`failed` + تحذير بالعدد، والواجهة تُعيد الاستعلام لتُظهر من بقي يملك الصلاحية. |
| جدول `live_session_admissions` مفقود | `503` fail-closed في المسارين بلا أي نداء LiveKit. |
| إعادة الاتصال / الانفصال / `Reconnecting` | العميل يعود إلى `micGranted: false` ويُطفئ الزر؛ الصلاحية تُقرأ من الغرفة الجديدة لا من حالة قديمة. |

## E. Files Created / Modified

**جديدة (5):**

```
src/lib/live-classroom/microphone-permissions.ts        سياسة خالصة + رسائل + حدود
src/lib/live-classroom/student-microphone.ts            عميل الطالب (خالٍ من React)
src/app/api/live/[id]/microphone/route.ts               منح/سحب لطالب واحد
src/app/api/live/[id]/microphone/mute-all/route.ts      كتم الجميع
tests/live-microphone-permissions.test.ts               68 اختباراً (أُضيف في هذه الجلسة)
```

**معدَّلة (5):**

```
src/lib/live-classroom/livekit-admin.ts                 grant/revoke + micGranted/micActive في اللقطة
src/lib/live-classroom/participants.ts                  micGranted/micActive في RosterParticipant + mergeRoster
src/lib/live-classroom/admission-server.ts              readModerationTarget (سجل + دور في قراءة واحدة)
src/app/(site)/live/[id]/participants-panel.tsx         أزرار المنح/السحب + «كتم الجميع» + شارة الحالة
src/app/(site)/live/[id]/student-live-viewer.tsx        شريط التحدث + تتبّع الصلاحية والنشر الفعلي
tests/live-room-participants.test.ts                    مواءمة mocks مع الحقول الجديدة (TrackSource، tracks)
```

لم يُلمس: `token/route.ts` · `vitest.config.ts` · `.kilo/worktrees` · `prisma/` · `package.json`. لا migration ولا تغيير حزم.

## F. Tests Added + Full Test Result

`tests/live-microphone-permissions.test.ts` — **68 اختباراً** في ست مجموعات:

1. سياسة `canModerateMicrophoneTarget` (كل أسباب الرفض + ترتيبها + اكتمال جدول الرسائل) و`toMicrophoneAction`.
2. `selectMuteAllTargets` (استثناء المعلم، الهوية الغريبة، غير المتصل، غير المالك للصلاحية).
3. عميل الطالب: `hasLocalMicrophonePermission` بدلالات LiveKit، `bindMicrophonePermission` (ترشيح الهوية + إزالة المستمع)، رفض التشغيل بلا صلاحية دون طلب إذن المتصفح، ترجمة أخطاء الأجهزة.
4. مهايئ LiveKit: شكل `permission` المُرسل في grant/revoke، `not_connected` مقابل `rpc_failed`، مفاتيح ناقصة، `micGranted`/`micActive` من اللقطة.
5. `POST /microphone`: 401/404/403 (طالب، معلم آخر)، الأدمن مسموح، إجراء غير معروف، هوية ناقصة، جلسة خارجية، kicked/pending/بلا سجل، استهداف المعلم، الدور من قاعدة البيانات، منح ناجح، منح غير مطبَّق + تحذير، سحب، جدول مفقود، حد المعدل.
6. `POST /microphone/mute-all`: 401/404/403، جلسة خارجية، LiveKit غير متاح، مفاتيح ناقصة، اختيار الأهداف الصحيح، لا أهداف، فشل جزئي، جدول مفقود، حد المعدل الأضيق.

```
npx vitest run tests/live-microphone-permissions.test.ts --no-file-parallelism
  Test Files  1 passed (1)
  Tests       68 passed (68)

npx vitest run --no-file-parallelism --exclude "**/.kilo/**" --exclude "**/node_modules/**"
  Test Files  33 passed (33)
  Tests       511 passed (511)
```

**ملاحظة عن `npx vitest run` بلا استثناء:** التشغيل الكامل يجمع أيضاً نسخاً قديمة من الاختبارات داخل `.kilo/worktrees/hypnotic-yarrow` و`.kilo/worktrees/quixotic-bellflower` (نسخ `live-room-participants.test.ts` قبل LIVE-9E). تفشل هذه النسختان في مرحلة الجمع لأنها لا تُموّه `TrackSource` بينما alias `@` يشير إلى `src` الجذر، فتحمّل نسخة `livekit-admin.ts` الجديدة. النتيجة `2 failed | 95 passed (97) — 1277 tests passed`: الفشل في ملفَي worktree فقط، ولا اختبار واحد فاشل. لم تُعدَّل هذه النسخ ولا `vitest.config.ts` بحسب نطاق الطور.

## G. TypeScript Result

```
npx tsc --noEmit
(بلا مخرجات — 0 أخطاء)
```

## H. ESLint Result

```
npx eslint src
✖ 31 problems (0 errors, 31 warnings)
```

صفر أخطاء. لا تحذير واحد في أي ملف من ملفات LIVE-9E (تحقّق بترشيح المخرجات على `microphone|student-live-viewer|participants-panel|livekit-admin|admission-server|participants.ts`). التحذيرات كلها سابقة (imports غير مستخدمة في صفحات admin و`data-channel.ts` من LIVE-9D، `<img>` في teacher-photo-upload).
`npx eslint tests` غير ممكن: مجلد `tests` مستثنى في إعداد ESLint للمشروع.

## I. git diff --check Result

```
git diff --check → exit 0 (لا مسافات زائدة ولا تعارضات)
```

## J. Migration Status

لا migration. LIVE-9E لا يضيف عموداً ولا جدولاً: صلاحية الميكروفون حالة زمن تشغيل في LiveKit وحده.

## K. Remaining Risks

1. **Browser E2E لم يُنفَّذ** — سلوك `setMicrophoneEnabled` وإذن الميكروفون في المتصفح و`ParticipantPermissionsChanged` الحقيقي لم تُتحقق إلا بـ mocks. Vitest ليس بديلاً.
2. **حالة `micActive`** تُقرأ من `tracks[].muted` في لقطة LiveKit وتتأخر بمقدار دورة الاستعلام (حتى 12 ثانية) — مؤشر عرض لا حاجز أمني.
3. **حد المعدل داخل العملية** (`Map` في الذاكرة) لا يتقاسمه أكثر من instance على Vercel — نفس القيد القائم منذ LIVE-9B/9C، لا جديد.
4. **«كتم الجميع» غير ذرّي**: نداء `updateParticipant` لكل هدف؛ طالب يتصل أثناء التنفيذ يبقى بلا صلاحية أصلاً (التوكن بلا نشر)، فلا ثغرة — لكن الفشل الجزئي ممكن ويُبلَّغ عنه.
5. **مراجعة الكود والتصميم للواجهة** لم تُنفَّذا (المهارات غير متاحة في هذه البيئة — انظر أدناه).
6. **لا تحقّق إنتاجي**: لا commit ولا push ولا deploy ولا smoke test في هذا الطور.

## L. Browser E2E Status

**Implementation complete, browser E2E pending.**

البيئة الحقيقية (متصفح + أجهزة صوت + خادم LiveKit) غير متاحة في هذه الجلسة، ولا يُدَّعى أي PASS. السيناريوهات المطلوبة عند التنفيذ:

- منح المعلم → ظهور شريط التحدث لدى الطالب → تشغيل الميكروفون → سماع المعلم.
- سحب المعلم → إلغاء نشر المسار من الخادم → اختفاء الشريط وإطفاء الزر بلا تدخل من العميل.
- «كتم الجميع» مع أكثر من طالب متصل.
- رفض إذن المتصفح للميكروفون → الرسالة العربية الصحيحة.
- إعادة الاتصال بعد منح → العودة إلى المنع الافتراضي.
- عميل معدَّل يحاول النشر بلا منح → رفض من خادم الوسائط.

## M. Production Verification

لم تُنفَّذ. لا commit ولا push ولا deploy ولا smoke test — بانتظار موافقتك.

## N. Git Status

```
Modified   (7): CLAUDE.md* · participants-panel.tsx · student-live-viewer.tsx ·
                 lib/live-classroom/admission-server.ts · lib/live-classroom/livekit-admin.ts ·
                 lib/live-classroom/participants.ts · tests/live-room-participants.test.ts
Untracked      : LIVE_9E_MICROPHONE_PERMISSIONS_REPORT.md ·
                 src/app/api/live/[id]/microphone/ (route + mute-all) ·
                 lib/live-classroom/microphone-permissions.ts ·
                 lib/live-classroom/student-microphone.ts ·
                 tests/live-microphone-permissions.test.ts
                 (+ تقارير 9B/9C/9D و LIVE_ROADMAP و .claude/ — سابقة لهذا الطور)
Branch: main — بلا commit / push / deploy
(*) CLAUDE.md تعديل سابق موجود قبل LIVE-9E
```

---

### المهارات المستخدمة ولماذا (CLAUDE.md §13)

| المهارة | الاستخدام |
|---|---|
| `playwright` | ❌ **غير متاحة في هذه البيئة** — لم تُستخدم ولا يُدَّعى تنفيذ Browser E2E (§L). |
| `front:frontend-testing` | ❌ **غير متاحة في هذه البيئة** — اختبارات LIVE-9E كُتبت بـ Vitest على نمط `tests/live-room-participants.test.ts` القائم: دوال العميل خالية من React فتُختبر مباشرة بلا DOM. |
| `front:frontend-code-review` | ❌ **غير متاحة في هذه البيئة** — مراجعة الواجهة معلّقة؛ تبقى شرطاً لإغلاق الطور بحسب §6. |

المهارات الثلاث مُدرَجة في CLAUDE.md كمتاحة (تحقّق 2026-08-25) لكنها **غير موجودة في قائمة المهارات المحمَّلة في هذه الجلسة**. بحسب §8 لا تُختلق أسماء ولا يُدَّعى استخدام، فأُبلغ عنها كغير متاحة.

### Final Status: PARTIAL

الكود والاختبارات المحلية (tsc / eslint / vitest / `git diff --check`) مكتملة وخضراء بالكامل: 68 اختباراً جديداً و511 اختباراً في السويت كلها ناجحة.
الإغلاق الكامل (COMPLETE) يتطلب: Browser E2E + مراجعة الكود/التصميم للواجهة، ثم commit/push/deploy/smoke test بموافقتك.
