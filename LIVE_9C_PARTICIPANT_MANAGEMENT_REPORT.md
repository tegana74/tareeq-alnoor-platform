# LIVE-9C — Participant Management + Kick — Implementation Report

**التاريخ:** 2026-08-26
**الحالة النهائية:** PARTIAL — التنفيذ والاختبارات المحلية مكتملة؛ Browser E2E وقبول الإنتاج معلّقان على مراجعتك
**Commit production الحالي:** `7cf7cdb`

---

## A. Implementation Summary

نُفِّذت إدارة المشاركين + الطرد (Kick) لجلسات LiveKit فقط، بأربع طبقات كما في Safety Gate:

1. **طبقة سياسة خالصة** (`participants.ts`) — كل قرارات الصلاحية دوال نقية بلا React/Prisma/LiveKit.
2. **مهايئ LiveKit للسيرفر حصراً** (`livekit-admin.ts`) — الملف الوحيد الذي يلمس `RoomServiceClient` و`LIVEKIT_API_SECRET`.
3. **مساران API رفيعان** — `GET /participants` (القائمة) و`POST /participants/kick` (الطرد).
4. **واجهة بلا منطق تصريحي** — لوحة «المشاركون» للمعلم، حالة kicked في بوابة الطالب، ومعالجة `PARTICIPANT_REMOVED` في المشاهد.

الهوية الموثوقة: `participantIdentity = user.id` حصراً. لا يُقرأ أي دور أو ملكية أو هوية من العميل.

## B. Architecture Changes

| الطبقة | القرار |
|---|---|
| مصدرا حقيقة | «هل يُسمح له؟» = `live_session_admissions` · «هل هو متصل؟» = LiveKit `listParticipants`. لا تُخزَّن حالة حضور في قاعدة البيانات ولا يُكرَّر أي مصدر. |
| الاسم | من جدول `User` عبر identity = user.id حصراً. `RoomParticipantSnapshot` **لا يحتوي حقلاً للاسم أصلاً** — تسريب participantName مستحيل بنيوياً. |
| التحديث الفوري للوحة | عدّاد `participantsRevision` يرتفع من مستمعَي `ParticipantConnected/Disconnected` القائمين منذ LIVE-8B/8D + استعلام أمان كل 12 ثانية. **لا WebSocket ولا بنية realtime جديدة.** |
| حماية السر | حارس زمن تشغيل (`typeof window → throw`) + اختبار يمسح كل ملفات `"use client"` ويمنع استيراد المهايئ + `LIVEKIT_API_SECRET` بلا بادئة `NEXT_PUBLIC_` فلا يمكن inline في bundle العميل. |
| `server-only` | الحزمة غير مثبتة و`npm install` ممنوع — عُوِّض بحارس زمن التشغيل + الاختبار الماسح أعلاه. |

## C. Security / Authorization Guarantees

- **من يطرد؟** المعلم المالك أو ADMIN فقط — عبر `canManageAdmission(user, session)` مقابل `session.teacherId` من قاعدة البيانات. الطالب لا يصل إلى ما بعد هذه الحراسة إطلاقاً (403) فلا يستطيع طرد نفسه ولا غيره.
- **من يُطرد؟** صاحب سجل دخول في هذه الجلسة تحديداً فقط (`sessionId_userId`). الدور المستهدَف يُقرأ من جدول `User` مستقلاً عن السجل (المعلم/الأدمن لا سجل دخول لهما أصلاً) — طرد معلم الجلسة أو الأدمن → 403.
- **لا roomAdmin في أي توكن مشارك** — `RoomServiceClient` يوقّع `{roomAdmin:true, room}` داخلياً لكل نداء Twirp على السيرفر؛ لا يُنشأ JWT بصلاحية admin ولا يُرسل لأي متصفح. اختبار يمسح كل مصادر التوكنات ويمنع ظهور `roomAdmin`.
- **الطالب يبقى subscriber-only:** لم يُمَس منطق إصدار التوكن — `canSubscribe=true / canPublish=false / canPublishData=false` كما هو.
- **رسائل الخطأ** عربية ثابتة بلا أي تفاصيل SDK أو stack traces؛ أخطاء LiveKit تُسجَّل محلياً برسالة عامة بلا قيم.
- لا أسرار حقيقية في الاختبارات ولا السجلات (مفاتيح وهمية `test-api-*`).

## D. Kick Semantics

**الترتيب مقصود ولا يجوز عكسه (مُثبت باختبار):**

1. `markKicked` — كتابة `status="kicked"` + `decidedAt` + `decidedBy=actor.id` في قاعدة البيانات. هذا هو الحاجز الدائم: يرفض أي توكن جديد فوراً.
2. `removeParticipant(roomName=session.id, identity=user.id)` مع `revokeTokenTs=now` — الأثر الفوري + إبطال التوكنات الصادرة قبل اللحظة.

لو فشلت الخطوة 2 **لا تُلغى** الخطوة 1: الرد 200 مع `removed:false` وتحذير للمعلم («أعد المحاولة»). لو كان المشارك غير موجود في الغرفة → `removed:true` (idempotent — النتيجة المطلوبة متحققة). تكرار الطرد لطالب مطرود سابقاً آمن.

## E. Admission / kicked Behavior

- `kicked` قيمة رابعة على العمود النصي نفسه — **لا migration** (انظر §M).
- **من جهة الطالب حالة نهائية:** `resolveRequestOutcome("kicked") → "unchanged"` — لا reset ولا requestedAt جديد ولا زر إعادة طلب في الواجهة. لا يرفعها إلا قبول صريح من المعلم (زر «إعادة القبول» في لوحة المشاركين يستخدم مسار approve الحالي من LIVE-9B دون تعديله).
- البوابة تبقى fail-closed: `canIssueStudentToken` تقبل `approved` حصراً — kicked/pending/rejected/none كلها تُرفض.
- القائمة (roster) تعرض approved + kicked فقط؛ pending ملك للوحة LIVE-9B (لا ازدواجية)، وkicked ظاهرة كي يستطيع المعلم التراجع.

## F. Reconnect / Rejoin Behavior

| السيناريو | النتيجة |
|---|---|
| طلب توكن بعد الطرد (reload / reconnect / توكن قديم) | 403 برسالة «تم إخراجك…» — لا توكن جديد |
| اتصال LiveKit بتوكن قديم صالح زمنياً | `revokeTokenTs` يبطل التوكنات السابقة للحظة الطرد؛ وإن نجح اتصال عابر فأي طلب attend/heartbeat مرفوض |
| انقطاع شبكة عادي | يبقى كما في LIVE-8C/8D — reconnect تلقائي وزر «إعادة المحاولة» |
| `DisconnectReason.PARTICIPANT_REMOVED (=4)` | المشاهد يميّزه من انقطاع الشبكة: رسالة «تم إخراجك من الجلسة بواسطة المعلم»، **بلا زر إعادة محاولة**، ونبضات تتوقف |

## G. Attendance / Heartbeat Impact

**ثغرة مغلقة:** قبل 9C كان مسار التوكن هو الحاجز الوحيد، فكان بإمكان مطرود تسجيل حضوره بنداء HTTP مباشر. أُضيفت بوابة موحّدة `checkAttendanceAdmission` إلى المسارين بعد حراسة canWatch وقبل upsert:

- جلسة خارجية (YouTube/Zoom/Meet) → تمر كما كانت، صفر تغيير.
- معلم مالك/أدمن → يمر كما كان (لا سجل دخول له).
- طالب: نفس قاعدة التوكن حرفياً — غير approved → 403 بلا كتابة حضور.
- fail-closed: تعذّرت قراءة الحالة → 503 بلا كتابة (P2021 → 503 كما في نظام الدخول).
- الحضور المسجَّل سابقاً لا يُحذف ولا يُعدَّل — الطرد يمنع النبضات الجديدة فقط. `LiveSession.status` لم يُمَس.

## H. Files Created / Modified / Deleted

**جديدة (4):**
- `src/lib/live-classroom/participants.ts` — طبقة السياسة الخالصة (mergeRoster، canKickParticipant، KICK_REFUSAL_RESPONSES، إيقاع التحديث)
- `src/lib/live-classroom/livekit-admin.ts` — مهايئ RoomServiceClient، server-only بثلاث طبقات حماية
- `src/app/api/live/[id]/participants/route.ts` — GET القائمة (manager-only، تدهور مهذّب عند تعذر LiveKit)
- `src/app/api/live/[id]/participants/kick/route.ts` — POST الطرد (DB أولاً ثم LiveKit)
- `src/app/(site)/live/[id]/participants-panel.tsx` — لوحة المشاركون (تأكيد داخل الصف، إعادة قبول، حالات تحميل/خطأ/تعذر اتصال)
- `tests/live-room-participants.test.ts` — 60 اختباراً جديداً

**معدَّلة (9 + اختباران):**
- `src/lib/live-classroom/admission.ts` — `kicked` في ADMISSION_STATUSES، توسيع AdmissionDecision، isKickedState، فرع kicked في resolveRequestOutcome، توثيق
- `src/lib/live-classroom/admission-server.ts` — readRosterAdmissions، readKickTarget (الدور من جدول User)، markKicked، checkAttendanceAdmission
- `src/app/api/live/[id]/token/route.ts` — رسالة الرفض للحالة kicked فقط (+1 سطر فعلي)
- `src/app/api/live/[id]/attend/route.ts` و `heartbeat/route.ts` — بوابة الدخول الموحدة (+6 أسطر لكل منهما)
- `src/app/(site)/live/[id]/admission-gate.tsx` — الحالة الخامسة kicked (بلا زر إعادة طلب)
- `src/app/(site)/live/[id]/student-live-viewer.tsx` — PARTICIPANT_REMOVED + منع retry بعده
- `src/app/(site)/live/[id]/live-room-client.tsx` — تركيب اللوحة + عدّاد revision من الأحداث القائمة
- `tests/livekit-heartbeat.test.ts` و `tests/live-room-shell.test.ts` — **توسيع fixtures فقط** لتطابق شرط البوابة الجديد (url:null + طالب approved). لم يُحذف ولم يُضعف أي تأكيد.

**محذوفة:** لا شيء.

## I. Tests Added + Full Test Result

**60 اختباراً جديداً** في `tests/live-room-participants.test.ts` تغطي:
حالة kicked في السياسة · تركيب القائمة (دمج/ترتيب/unknown/غياب اسم في اللقطة) · صلاحية الطرد الخالصة (invalid/not-managed/self/manager/no-record + ترتيب الأسباب) · تحويل ParticipantInfo · GET /participants (401/403 طالب/403 معلم غير مالك/200 دمج/أدمن/roomReachable=false/not_found/جلسة خارجية/503 P2021) · POST kick (401/404/403×4/400×2/ترتيب DB←LiveKit/تحذير عند فشل الإزالة/idempotent/503/عدم تسريب سر) · المطرود لا يعود (توكن/attend/heartbeat/approved يعمل كما كان/المعلم مستثنى/جلسة خارجية كما كانت/fail-closed/none مرفوض) · ثلاثة اختبارات حدود سيرفر/عميل (منع استيراد المهايئ في "use client"، منع SECRET/RoomServiceClient في العميل، منع roomAdmin في التوكنات).

**النتيجة الكاملة:**
```
Test Files  32 passed (32)
Tests       443 passed (443)
```
Baseline قبل LIVE-9C: 383/383 → الآن 443/443 (383 قديمة سليمة + 60 جديدة). صفر حذف، صفر إضعاف.

## J. TypeScript Result

```
npx tsc --noEmit → 0 errors
```

## K. ESLint Result

```
npx eslint src → 0 errors, 29 warnings (كلها pre-existing — مطابق للـ baseline تماماً، لا تحذير جديد)
```

## L. git diff --check Result

```
git diff --check → clean (لا whitespace errors)
(تحذيرات LF/CRLF المعروفة على Windows فقط — pre-existing وليست من هذا الطور)
```

## M. Migration Status

**لا migration. لا prisma db push. لا migrate deploy.** `status` عمود String في `live_session_admissions` (migration `20260825_add_live_session_admissions` مطبَّقة) — `kicked` قيمة رابعة على العمود نفسه بلا أي تغيير schema. لم تنشأ أي حاجة تقنية تبرر migration.

## N. Remaining Risks

1. **approve ↔ kick سباق عرضي:** قرارا معلمَين متزامنان على نفس الطالب — آخر كتابة تفوز (Prisma update بسيط بلا versioning). مقبول لأن كليهما مصرَّح له، لكنه غير ذري.
2. **توكن قديم صالح زمنياً قد يُكمل اتصالاً قائماً لحظات** حتى يصل removeParticipant — لهذا أُضيف revokeTokenTs وبوابة attend/heartbeat؛ نافذة التعرض ثوانٍ.
3. **قائمة unknown identities** (متصل بلا سجل دخول — نظرياً أدمن/معلم غير مالك يدخل غرفة) تعرض «مشارك غير معروف» وزر الطرد معطَّل لها؛ إدارة هذه الحالة مؤجلة عمداً خارج نطاق 9C.
4. **Browser E2E غير منفَّذ** (انظر §O).
5. `front:frontend-code-review` مجدول قبل إغلاق الطور (CLAUDE.md §6) — لم يُشغَّل بعد.

## O. Browser E2E Status

**Implementation complete, browser E2E pending.**

لم يُشغَّل Playwright بعد. السيناريوهات المطلوبة قبل إعلان COMPLETE (بحسب CLAUDE.md §10/§11):
معلمان + طالبان حقيقيان على production/staging: (1) ظهور اللوحة وتحديثها عند دخول/خروج طالب، (2) طرد طالب متصل → اختفاؤه ورسالة الطرد لديه فوراً، (3) reload الطالب المطرود → لا عودة، (4) إعادة القبول → عودة الطالب بالطلب، (5) طالب يحاول نداء kick مباشراً → 403، (6) جلسة YouTube: لا لوحة ولا تغيير سلوك.

## P. Git Status

```
Modified   (11): CLAUDE.md* · admission-gate.tsx · live-room-client.tsx ·
                  student-live-viewer.tsx · api/live/[id]/attend/route.ts ·
                  api/live/[id]/heartbeat/route.ts · api/live/[id]/token/route.ts ·
                  lib/live-classroom/admission-server.ts · lib/live-classroom/admission.ts ·
                  tests/live-room-shell.test.ts · tests/livekit-heartbeat.test.ts
Untracked   (6): LIVE_9B_ADMISSION_WAITING_ROOM_REPORT.md* · participants-panel.tsx ·
                  api/live/[id]/participants/ (route + kick) · livekit-admin.ts ·
                  participants.ts · tests/live-room-participants.test.ts
Branch: main — لم يُنفَّذ commit ولا push ولا deploy (بانتظار مراجعتك)
(*) CLAUDE.md وتقرير 9B تعديلات سابقة موجودة قبل LIVE-9C
```

---

### المهارات المستخدمة ولماذا (CLAUDE.md §13)

| المهارة | الاستخدام |
|---|---|
| `frontend-design` | ✅ نُفِّذت — تصميم لوحة المشاركون على نظام بطاقات المشروع القائم (RTL، حالات presence، empty/loading/error/warning states) مع تطبيق انضباط المحتوى (لا بيانات ملفقة، أيقونات lucide حقيقية). |
| `playwright` | ⏳ معلّقة — Browser E2E بعد موافقتك (§O). Vitest ليس بديلاً عنها في سلوكيات المتصفح. |
| `front:frontend-testing` | ✅ مغطاة — اختبارات حدود العميل/السيرفر ضمن ملف الاختبارات الجديد (فحص ملفات "use client" بنيوياً). |
| `front:frontend-code-review` | ⏳ مجدولة قبل إغلاق الطور بعد E2E. |

### Final Status: PARTIAL

الكود والاختبارات المحلية (tsc/eslint/vitest/git diff --check) مكتملة وخضراء بالكامل.
الإغلاق الكامل (COMPLETE) يتطلب: مراجعتك → Browser E2E → code review → ثم commit/push/deploy/smoke test بموافقتك.
