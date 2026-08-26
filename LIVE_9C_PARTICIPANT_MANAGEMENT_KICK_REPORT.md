# LIVE-9C — Participant Management + Kick — Final Report

**التاريخ:** 2026-08-26
**Commit:** `6644482 feat: add live participant management and kick` — على `origin/main` ومنشور في Vercel Production

| التصنيف | الحالة |
|---|---|
| LIVE-9C implementation | **COMPLETE** |
| Local automated validation | **PASS** |
| Frontend code review | **PASS — 0 urgent issues** |
| Commit / push / Vercel deployment | **VERIFIED** (`6644482` · state: success) |
| Production smoke test | **4 PASS / 1 NOT TESTABLE** |
| Real LiveKit Browser E2E | **BLOCKED / NOT TESTED** |
| Final status | **PARTIAL** (انظر §14) |

---

## 1. Executive Summary

نُفِّذ LIVE-9C (إدارة المشاركين + الطرد) لجلسات LiveKit حصراً، بأربع طبقات: طبقة سياسة خالصة، مهايئ LiveKit للسيرفر فقط، مساران API رفيعان، وواجهة بلا أي منطق تصريحي.

الهوية الموثوقة `participantIdentity = user.id` حصراً؛ لا يُقرأ أي دور أو ملكية أو هوية من العميل. الطرد server-authorized بالكامل: المعلم المالك أو ADMIN فقط، والكتابة في قاعدة البيانات تسبق الإزالة من LiveKit دائماً (مُثبتة باختبار).

اجتازت جميع بوابات التحقق المحلية: **443/443 Vitest** (baseline 383 سليم + 60 اختباراً جديداً)، **0 أخطاء TypeScript**، **0 أخطاء ESLint** (29 تحذيراً pre-existing مطابقة للـ baseline)، و`git diff --check` نظيف. مراجعة كود الواجهة الأمامية أرجعت **0 مشاكل عاجلة** و5 اقتراحات تحسين غير مانعة.

**Browser E2E الحقيقي BLOCKED**: البيئة المحلية بلا غرفة LiveKit وبلا قاعدة بيانات dev منفصلة (`DATABASE_URL` يشير إلى Neon Production). لم يُشغَّل E2E ضد غرفة حقيقية، ولذلك **لم يُعلَن PASS لأي سيناريو يتطلب مشاركاً حقيقياً** — انظر §8 و§9.

## 2. Scope

داخل النطاق (LIVE-9C فقط):
- لوحة «المشاركون» للمعلم المالك/الأدمن (قائمة + حالة اتصال + طرد + إعادة قبول)
- `GET /api/live/[id]/participants` و`POST /api/live/[id]/participants/kick`
- حالة `"kicked"` كقيمة رابعة على العمود النصي الموجود
- بوابة دخول موحّدة لمسارَي attend/heartbeat
- معالجة `DisconnectReason.PARTICIPANT_REMOVED` في مشاهد الطالب
- فرع kicked نهائي في بوابة دخول الطالب

خارج النطاق صراحةً (لم يُمَس): YouTube/Zoom/Meet، الكاميرا/الميكروفون/مشاركة الشاشة (LIVE-9A)، نظام الدخول (LIVE-9B)، Chat/Raise Hand (LIVE-9D)، الميكروفون/Mute All (LIVE-9E)، وأي بنية realtime جديدة.

## 3. Implemented Features

### Participant management
لوحة `participants-panel.tsx` للمعلم المالك/الأدمن فقط، تعمل في جلسات LiveKit النشطة (`waiting`/`live`) عبر `shouldTrackParticipants`. التحديث الفوري مدفوع بأحداث الغرفة القائمة أصلاً (`ParticipantConnected/Disconnected` → عدّاد revision + debounce 800ms) مع استعلام أمان كل 12 ثانية. **لا WebSocket ولا بنية realtime جديدة.**

### Participant roster/presence
دمج مصدرين بلا تكرار: «من يُسمح له؟» من `live_session_admissions` (approved + kicked فقط — pending ملك لوحة LIVE-9B)، و«من متصل الآن؟» من `listParticipants`. الاسم من جدول `User` عبر identity = user.id حصراً؛ `RoomParticipantSnapshot` **لا يحتوي حقلاً للاسم إطلاقاً** فتسريب participantName مستحيل بنيوياً. تعذّر الوصول إلى LiveKit يعطي presence=`unknown` مع بقاء القائمة ظاهرة (`roomReachable=false`) — لأن مسار الطرد لا يعتمد على listParticipants.

### Kick authorization
`canKickParticipant` (دالة خالصة): invalid-target → not-managed → self → manager → no-record (الترتيب مقصود). المعلم المالك/ADMIN فقط بعد حراسة `canManageAdmission` مقابل `session.teacherId` من قاعدة البيانات. الطالب لا يصل إلى ما بعد الحراسة (403) فلا يطرد نفسه ولا غيره. المستهدَف محصور بسجل دخول ينتمي إلى جلسة الـ URL نفسها؛ دور المستهدَف يُقرأ من جدول `User` — طرد معلم الجلسة/الأدمن → 403.

### DB-first kicked state
الترتيب مقصود ولا يجوز عكسه (اختبار call-order يثبته):
1. `markKicked`: كتابة `status="kicked"` + `decidedAt` + `decidedBy=actor.id`
2. `removeParticipant(roomName=session.id, identity=user.id)` مع `revokeTokenTs=now`

فشل الخطوة 2 لا يُلغي الخطوة 1: رد 200 مع `removed:false` وتحذير للمعلم («أعد المحاولة»). مشارك غير موجود = `removed:true` (idempotent). تكرار الطرد آمن.

### LiveKit participant removal
`livekit-admin.ts` (server-only بثلاث طبقات حماية) يستدعي `RoomServiceClient.removeParticipant` بمهلة 8 ثوانٍ و`revokeTokenTs` لإبطال التوكنات السابقة للحظة الطرد. `RoomServiceClient` يوقّع `{roomAdmin:true, room}` داخلياً لكل نداء Twirp — لا يُنشأ roomAdmin JWT ولا يُرسل لأي متصفح.

### Token/admission protection
بوابة التوكن تقبل `approved` حصراً — kicked/pending/rejected/none كلها ترفض برسالة عربية مخصصة («تم إخراجك من هذه الجلسة بواسطة المعلم»). الطالب المطرود لا يحصل على توكن جديد بإعادة تحميل الصفحة ولا بأي طريق. `resolveRequestOutcome("kicked") → "unchanged"` — الطلب الجديد يتجاهله السيرفر تماماً (حالة نهائية من جهة الطالب). الإلغاء الوحيد: قبول صريح من المعلم عبر مسار approve الحالي من LIVE-9B دون تعديله.

### Attendance/heartbeat protection
ثغرة مغلقة: قبل 9C كان مسار التوكن هو الحاجز الوحيد فأمكن تسجيل حضور بنداء HTTP مباشر. أُضيفت بوابة موحّدة `checkAttendanceAdmission` للمسارين بعد حراسة canWatch وقبل upsert: جلسة خارجية تمر كما كانت، المعلم/الأدمن يمرّ كما هو، الطالب غير approved → 403 بلا كتابة، fail-closed عند تعذّر القراءة (P2021 → 503). الحضور المسجَّل سابقاً لا يُحذف ولا يُعدَّل؛ `LiveSession.status` لم يُمَس.

### Student subscriber-only enforcement
لم يُغيَّر منطق إصدار التوكن إطلاقاً: `canSubscribe=true / canPublish=false / canPublishData=false` كما هو منذ LIVE-8A. لا roomAdmin في أي توكن مشارك (اختبار يمسح كل مصادر التوكنات ويمنع ظهور `roomAdmin`).

## 4. Security Model

1. **الهوية**: identity = user.id من بوابة التوكن (LIVE-8A). لا اعتماد على participantName — النوع بلا حقل اسم.
2. **التفويض على السيرفر حصراً**: actor من الجلسة المصادَق عليها؛ session.teacherId وurl وstatus من قاعدة البيانات؛ دور/teacherId المستهدَف من جدول `User`. الشيء الوحيد القادم من العميل هو targetUserId المقيد بسجل الدخول.
3. **حماية السر**: `LIVEKIT_API_SECRET` بلا بادئة `NEXT_PUBLIC_` (لا يمكن inline في bundle العميل) + حارس زمن تشغيل في المهايئ (`typeof window → throw`) + اختبار يمسح كل ملفات `"use client"` ويمنع استيراد `livekit-admin` أو ذكر `LIVEKIT_API_SECRET`/`RoomServiceClient`.
4. **رسائل الخطأ**: عربية ثابتة بلا تفاصيل SDK أو stack traces؛ أخطاء LiveKit تُسجَّل محلياً برسالة عامة بلا قيم.
5. **الاختبارات**: مفاتيح وهمية (`test-api-*`) — لا أسرار حقيقية في fixtures ولا سجلات.

## 5. API/Server Validation

جميع المسارات مغطاة باختبارات سلوكية (mock Prisma + mock SDK، نفس عرف livekit-token/live-admission):

| المسار | الحالات المختبرة |
|---|---|
| `GET /participants` | 401 · 404 · 403 طالب (لا تسرب أسماء) · 403 معلم غير مالك · 200 دمج DB+LiveKit · الأدمن مصرح · roomReachable=false مع unknown · not_found ليست خطأ · جلسة خارجية managed=false بلا نداء LiveKit · 503 P2021 |
| `POST /participants/kick` | 401 · 404 · 403 طالب/نفسه/معلم غير مالك · 400 userId مفقود/غير نصي · 403 طرد النفس (رسالة self لا no-record) · 403 طرد معلم/أدمن (الدور من DB) · 404 بلا سجل في هذه الجلسة · 400 جلسة خارجية · 200 + ترتيب db:kicked ← livekit:remove · فشل الإزالة = 200 + warning بلا إلغاء الحظر · idempotent (not_found → removed:true) · طرد مطرود سابقاً آمن · 503 P2021 بلا إزالة · عدم تسريب سر/roomAdmin |
| token / attend / heartbeat | kicked → 403 توكن برسالة الطرد · attend/heartbeat مرفوضان بلا كتابة حضور · approved يعمل كما كان · المعلم مستثنى من البوابة · جلسة خارجية كما كانت قبل 9C · fail-closed 503 · none مرفوض |

## 6. Automated Test Results

```
npx vitest run --no-file-parallelism
  Test Files  32 passed (32)
  Tests       443 passed (443)        ← baseline 383 سليم + 60 جديد؛ صفر حذف أو إضعاف

npx tsc --noEmit      → 0 errors
npx eslint src        → 0 errors, 29 warnings (كلها pre-existing — مطابقة للـ baseline)
git diff --check      → clean (تحذيرات LF/CRLF المعروفة على Windows فقط — pre-existing)
```

ملفات الاختبار الجديدة: `tests/live-room-participants.test.ts` (60 اختباراً).
تعديلان على اختبارين قديمين (`tests/livekit-heartbeat.test.ts`, `tests/live-room-shell.test.ts`): **توسيع fixtures فقط** (`url:null` + طالب approved) لتطابق شرط البوابة الجديد — لم يُضعف أي تأكيد.

## 7. Frontend Code Review

**الحالة: PASS — 0 urgent issues.** استُخدم مهارة `front:frontend-code-review` (CLAUDE.md §6) بقراءة حصرية.

نتائج الفحص: React hooks صحيحة (تبعيات + تنظيف + خيط active) · عقد stale-response عبر decidedRef يمنع رجوع حالة قديمة · لا rerender غير ضروري (revision counter + debounce) · TypeScript مشترك من طبقة السياسة بلا تكرار أشكال · Tailwind-first · لا dead code جديد · حدود أمان سليمة: اللوحة ترسل `{userId}` فقط، لا سر ولا RoomServiceClient ولا roomAdmin في العميل، وYouTube regression محصّن بنيوياً (`shouldTrackParticipants` → false لأي url خارجي).

**5 اقتراحات غير مانعة** (موثقة في §10، لم تُنفَّذ بطلب المستخدم).

**لم يُعدَّل أي ملف أثناء المراجعة** — المراجعة قراءة حصرية (Read/Grep فقط)، وشجرة git بقيت مطابقة لحالة ما بعد التنفيذ.

## 8. Browser E2E Status

**Real LiveKit Browser E2E: BLOCKED — requires a real non-production LiveKit test environment.**

### سيناريوهات قابلة للاختبار محلياً (HTTP/auth/DB خالصة — تغطيتها الفعلية تمت في §5/§6 وليست E2E متصفح حقيقياً)
- 5: نداء مباشر للطالب على kick API → 403 وصفر تأثير
- 6: جلسة YouTube → لا لوحة، لا تغيير سلوك
- أجزاء من 1a/2a/3a/4 على مستوى API: ظهور اللوحة، حراسة الطرد، رفض توكن المطرود، بوابة kicked، تدفق إعادة القبول

### سيناريوهات جزئية (تنجز نصفها محلياً ونصفها يتطلب غرفة)
- 1a: عرض القائمة وحالاتها تعمل بلا غرفة (تصميم roomReachable:false) لكن presence الحقيقية تحتاج غرفة
- 3a: بوابة kicked ورفض التوكن محليان؛ إبطال التوكن القديم عبر revokeTokenTs سلوك خادم LiveKit
- 4: تدفق approve/re-enter في DB كامل؛ العودة الفعلية للغرفة تحتاج LiveKit

### سيناريوهات BLOCKED (تتطلب غرفة LiveKit حقيقية ومشاركاً حقيقياً متصلاً)
- 1b: تحديث roster عند join/leave فعلي (presence من listParticipants على غرفة حية)
- 2b: إزالة مشارك متصل فعلياً من الغرفة ووصول رسالة الطرد إليه عبر `PARTICIPANT_REMOVED` وزوال زر إعادة المحاولة
- 3b: فشل reconnect بتوكن قديم بسبب revokeTokenTs

**لم يُشغَّل Playwright ضد غرفة حقيقية. لا يُعتبر أي من 1b/2b/3b PASS.**

## 9. Environment Limitation

سبب الحجب بيئي بحت وموثق:

- **`DATABASE_URL` المحلي يشير إلى قاعدة Neon Production** (`ep-flat-wave-b2ufbzlu...neon.tech/neondb`) — نفس المثيل الذي تخدمه Vercel Production (أثبتته تقارير 9B/9A).
- **لا توجد قاعدة بيانات dev/test منفصلة لهذا المشروع** (لا `.env.local` ولا Neon branch مهيأ).
- **لا خادم LiveKit محلي** (لا ثنائي، لا Docker، وتركيبه عبر npx مرفوض).
- **بيانات اعتماد LiveKit غير متوفرة محلياً** — `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`/`NEXT_PUBLIC_LIVEKIT_URL` موجودة في Vercel Production فقط.
- محاولات seed/E2E توقفت قبل أي كتابة على قاعدة البيانات بأمر المستخدم.

لذلك **يجب عدم الإبلاغ عن سيناريوهات إزالة/presence/reconnect الحقيقية كـ PASS** — فهي غير قابلة للتنفيذ في هذه البيئة، وأي ادعاء بنجاحها سيكون ادعاءً كاذباً (CLAUDE.md §12).

مسارات التشغيل المستقبلية المتاحة (بقرار المستخدم): Neon branch كقاعدة dev + بيانات LiveKit Cloud اختبارية كمتغيرات shell مؤقتة أمام `next dev`، أو staging.

## 10. Known Non-Blocking Improvements

الاقتراحات الخمسة من مراجعة الكود — موثقة هنا دون تنفيذ:

1. **استدعاء `updateViewers()` الأولي يرفع revision قبل الاتصال الفعلي بالغرفة** (`live-room-client.tsx:260`) — يجعل أول رندر للوحة يطلق نداءً مزدوجاً. الإصلاح: تأجيل الاستدعاء بعد `r.connect()` أو استثناء عدّاد revision منه.
2. **مستمعا `ParticipantConnected/Disconnected` و`ConnectionQualityChanged` لا يُفكّان صراحة** (`live-room-client.tsx:258–269`) — عملياً غير ضار (الغرفة GC بعد setRoom(null)) لكن يُفضّل نمط unbindPublisher القائم.
3. **حالة kicked ساكنة لدى الطالب**: إذا أعاد المعلم القبول وبطاقة kicked معروضة فلن تتغير البوابة إلا بإعادة تحميل يدوية (لا polling). إضافة نص توضيحي أو polling بطيء.
4. **رسالة الإخراج في المشاهد وبوابة الدخول بلا ARIA live role** — لن يعلنها قارئ الشاشة تلقائياً؛ يُضاف `role="alert"`/`role="status"`.
5. **زر «إخراج» معطل لصفوف «مشارك غير معروف» بلا سبب مرئي** (`participants-panel.tsx:342`) — استبداله بنص توضيحي أو tooltip.

## 11. Database/Migration Status

- **لا migration جديدة لـ LIVE-9C** — `kicked` قيمة رابعة على عمود `status` النصي الموجود في `live_session_admissions`.
- المخطط الحالي محدث: `npx prisma migrate status` → "Database schema is up to date!" (6 migrations؛ الأخير `20260825_add_live_session_admissions`).
- **لم تُنفَّذ أي أمر كتابة Prisma في هذا الطور** (`db push`/`migrate deploy`/`migrate reset` غير مستخدمة)، ولا seed، ولا أي كتابة على Production Neon.

## 12. Git & Deployment State (final)

### Commit
```
6644482 feat: add live participant management and kick
17 files changed, 2548 insertions(+), 17 deletions(-)
```
نُفِّذ بعد مراجعة الـ diff النهائية وتجهيز الملفات الـ 17 المقصودة فقط.

**ملفات استُبعدت عمداً من الـ commit وتبقى خارجه:**
- `CLAUDE.md` — تعديل Skills Policy سابق قبل LIVE-9C
- `LIVE_9B_ADMISSION_WAITING_ROOM_REPORT.md` — تقرير الطور السابق (له مسار commit خاص)
- `LIVE_9C_PARTICIPANT_MANAGEMENT_REPORT.md` — تقرير مؤقت استُبدل بهذا التقرير النهائي

### Push
```
To https://github.com/tegana74/tareeq-alnoor-platform.git
   7cf7cdb..6644482  main -> main
```
مؤكد: local HEAD = origin/main = `664448294265b1d69cc92249501be73f30e5c290`.

## 13. Vercel Production Deployment

نشر Vercel التلقائي بعد الـ push — لا deploy يدوي ولا تغيير إعدادات.

| العنصر | القيمة | الدليل |
|---|---|---|
| SHA | `664448294265b1d69cc92249501be73f30e5c290` | GitHub Deployments API (أحدث deployment، لا يوجد أحدث منه) |
| Environment | Production (`production_environment`)، بواسطة `vercel[bot]`، 2026-08-26T09:34:33Z | نفس المصدر |
| Deployment ID | GitHub deployment `6101031586`؛ معرف نشر Vercel `3pvwj3ces` | `target_url` في حالة الـ deployment |
| State | **success** — "Deployment has completed" | `/deployments/6101031586/statuses` |
| Production URL | **https://www.tareeq-alnoor.online** — HTTP 200، `Server: Vercel` | HTTP HEAD للقراءة فقط |

### Production Smoke Test (2026-08-26 — طلبات HTTP مجهولة للقراءة فقط)

| # | الفحص | النتيجة | HTTP | الاستجابة |
|---|---|---|---|---|
| 1 | `GET /api/live/nonexistent-e2e-probe-id/participants` (ضيف) | PASS | 401 | `{"error":"يجب تسجيل الدخول"}` — حارس LIVE-9C الأول |
| 2 | `GET /api/live/nonexistent-e2e-probe-id/token` (ضيف) | PASS | 401 | `{"error":"يجب تسجيل الدخول"}` — سلوك pre-existing لمسار التوكن |
| 3 | `POST /api/live/…/participants/kick` (ضيف) | PASS | 403 | نص `Forbidden` — حارس POST المنصّي (CSRF/Origin، pre-existing) يعترض قبل منطق المسار؛ الضيف محجوب بطبقتين |
| 4 | الجلسات الخارجية (YouTube) على production | **NOT TESTABLE** | — | يتطلب جلسة production مصادَقة حقيقية؛ لم تُستخدم أي حسابات. المنطق مغطى بـ 60 اختبار وحدة وSHA `6644482` مؤكد على production |
| 5 | `https://www.tareeq-alnoor.online` | PASS | 200 | الصفحة تحمّل (~2.4s) |

لا أسرار في أي استجابة؛ جميعها أشكال أخطاء عامة. لم يُنفَّذ أي Kick مصادَق ضد طالب حقيقي.

### Browser E2E Limitation

**REAL LIVEKIT BROWSER E2E = BLOCKED / NOT TESTED** — لا توجد غرفة LiveKit اختبارية غير إنتاجية ولا حسابا معلم/طالب متاحان لجلسة متصفح حقيقية. سيناريوهات join/presence/kick الفعلي/reconnect عبر المتصفح (§8 BLOCKED: 1b، 2b، 3b) **لم تُختبر ولم تُعلن PASS** — التغطية الوحيدة لها تبقى مستوى الوحدة/التكامل (§5–§6).

### Post-deploy regression note
أعيد تشغيل الحزمة المحلية كاملة على commit `6644482` بعد الرفع: tsc 0 errors، ESLint 0 errors/29 warnings، Vitest **443/443** (فشل عابر واحد في `live-room-polish.test.ts` في الجولة الأولى اختفى في العزل وإعادة التشغيل الكاملة — flake تحميل ملفات، والملف غير مماس بهذا الطور)، `git diff HEAD^ HEAD --check` نظيف.

## 14. Final Acceptance Status

PARTIAL

- Implementation: **COMPLETE**
- Local validation: **PASS**
- Commit / push / deployment: **VERIFIED** (`6644482` · Vercel Production state: success)
- Production smoke test: **completed — 4 PASS / 1 NOT TESTABLE**
- Real LiveKit Browser E2E: **BLOCKED / NOT TESTED**

LIVE-9C ليس Browser-E2E COMPLETE. السيناريوهات المعتمدة على غرفة LiveKit حقيقية ومشارك حقيقي متصل (join/presence/إزالة فعلية/reconnect) تبقى دليلاً مطلوباً قبل إعلان COMPLETE الكامل، وتتطلب بيئة اختبار غير إنتاجية (Neon branch + بيانات LiveKit Cloud اختبارية).
