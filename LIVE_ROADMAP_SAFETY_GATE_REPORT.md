# LIVE Roadmap Safety Gate — Tareeq Alnoor

**التاريخ:** 2026-08-26
**نوع المرحلة:** تحليل فقط — READ-ONLY
**Commit الأساس:** `cd7f1b5` (= origin/main)

---

## 1. Executive Summary

فُحصت بنية Live Classroom كاملة (10 وحدات lib، 10 مسارات API، 8 مكونات واجهة، 6 migrations، 32 ملف اختبار) على commit `cd7f1b5` دون تعديل أي ملف.

الخلاصة: المنصة تمتلك أساساً صلباً وقابلاً للتمديد — طبقة سياسة خالصة، تفويض server-side موحّد، بوابة دخول ثلاثية (توكن + admission + حضور)، ومهايئ LiveKit admin معزول. **لا يوجد اليوم أي قناة بيانات (data channel) مستخدمة، ولا chat ولا سبورة ولا تسجيل فعلي** — كلها عقود stub في `services.ts` بانتظار التنفيذ.

**التوصية: LIVE-9D (Chat + Raise Hand) هي المرحلة التالية.** التحليل أثبت ذلك لا افترضه: هي المرحلة الوحيدة التي (أ) يعتمدها ترتيب CLAUDE.md للمهارات، (ب) تحتاج فقط إلى `canPublishData=true` للمعلم + data channel موجود أصلاً في livekit-client دون أي migration أو خدمة خارجية، (ج) تبني آلية الرسائل التي ستُعاد استخدامها في Raise Hand ثم السبورة ثم Mute All. كل ما عداها إما يحتاج migration (سبورة/بحث)، أو بيئة تسجيل غير موجودة (recording)، أو يعتمد على ما قبلها.

## 2. Rules Loaded

| البند | الحالة |
|---|---|
| CLAUDE.md | ✅ موجود — 470 سطراً، آخر commit لمسه `6949ac3`؛ نسخة العمل فيها تعديل Skills Policy غير ملتزم (pre-existing قبل LIVE-9C، مقصود استثناءه من commits الطورين) |
| AGENTS.md | ✅ موجود — كتلة `nextjs-agent-rules` المولّدة تلقائياً (`next dev`)، تحذّر من فروقات Next.js وتوجّه لقراءة `node_modules/next/dist/docs/` |
| Skills المطلوبة (بحسب CLAUDE.md §6) | 9D: `frontend-design`, `playwright`, `front:frontend-testing` · 9E: `playwright`, `front:frontend-testing`, `front:frontend-code-review` · 9F: نفس 9E |
| Skills المتاحة فعلياً | `~/.claude/skills`: `frontend-design`, `playwright`, `ui-ux-pro-max` · plugin `front:`: `frontend-code-review`, `frontend-design`, `frontend-testing` + أدوات مساندة. **جميع المهارات المطلوبة متاحة** |

## 3. Current Baseline

- FIX-1 → FIX-7 ✅ COMPLETE · LIVE-8A → 8D ✅ COMPLETE
- LIVE-9A (camera/screenshare) ✅ · LIVE-9B (admission/waiting room) ✅ · LIVE-9C (participants/kick) ✅ implementation + production deployed
- LIVE-9C Browser E2E: **BLOCKED / NOT TESTED** — يبقى كذلك حتى تتوفر بيئة LiveKit اختبارية؛ لا يُعتبر PASS
- Implementation commit `6644482` · report commit `cd7f1b5` = origin/main
- Production: `https://www.tareeq-alnoor.online` — deployment success لـ SHA `6644482`
- قيود ثابتة: لا إعادة فتح مراحل مكتملة · لا كتابة على Production DB للاختبار · baseline الاختبارات 443/443

## 4. Current Live Classroom Architecture

```
Browser (client components)
  │  live-room-client.tsx (معلم: نشر + لوحات إدارة)
  │  student-live-viewer.tsx (مشاهد subscriber)
  │  admission-gate / admission-panel / participants-panel
  ▼  fetch REST + polling
Next.js API routes (/api/live/[id]/*)  + Server Action (teacher-live.ts)
  ▼
Auth: getCurrentUser() — جلسة cookie tn_session مشفّرة hash في جدول sessions
  ▼
Authorization: canManageAdmission/canManageClassroom (server-side حصراً)
               + canAccessCourse (اشتراكات) + bookings (الحصص المدفوعة)
  ▼
Prisma → Neon PostgreSQL (Production instance واحدة — لا dev DB)
  ▼                                    ▼
LiveKit Cloud (ws)              Supabase Storage (خاص، signed URLs)
```

- **Source of truth:** حالة الجلسة = `live_sessions.status` (DB). حالة الدخول = `live_session_admissions.status`. الحضور الفعلي = LiveKit (لا يُخزَّن). الاسم = جدول User عبر identity=user.id.
- **فرض الصلاحيات:** كل مسار API يعيد التحقق من الصفر (auth → session → role/ownership → admission/access). العميل لا يُوثق به في أي شيء سوى targetUserId المقيد بسجل الجلسة.
- **Client:** عرض، polling، وإرسال نوايا فقط (POST/Action). لا قرار تصريحي.
- **LiveKit:** النشر/الاشتراك/الإزالة الفورية (removeParticipant+revokeTokenTs) — RoomServiceClient server-only.
- **Polling:** status كل 6s (الطالب والمعلم) · admission pending 4→20s · participants 12s + أحداث غرفة · heartbeat 45s.
- **Realtime/data channel:** **غير مستخدم حالياً.** `canPublishData=true` يُمنح للمعلم/الأدمن في التوكن لكن لا أحد يستدعي publishData/dataReceived. livekit-client 2.22 يدعم RoomEvent.DataReceived + localParticipant.publishData — **abstraction جاهزة للتمديد بلا أي dependency جديدة**.
- **Stub قابل للتمديد:** `services.ts` يعرّف BroadcastService/RecordingService/WhiteboardService كعقود رمية — نقطة الإدراج الموثقة للمراحل القادمة.

## 5. Current API Map

| المسار | الدور | الحراسة بالترتيب |
|---|---|---|
| GET `/token` | توكن LiveKit (معلم=publisher، طالب=subscriber) | auth → session → دور → course access → booking → admission gate |
| GET `/status` | حالة الجلسة للحاضرين | auth → session → course access → booking |
| POST `/attend` | تسجيل حضور | auth → session → access → booking → live-window → **admission gate (9C)** → upsert |
| POST `/heartbeat` | نبضة وجود 45s | نفس attend حرفياً |
| GET/POST `/admission[/request/approve/reject]` | نظام الدخول (9B) | auth → session → canManageAdmission (أو طالب مع request rules) → P2021 fail-closed 503 |
| GET `/participants` · POST `/participants/kick` | إدارة المشاركين (9C) | auth → session → canManageAdmission → سياسة kick الخالصة → DB-first ثم removeParticipant |
| Server Action `updateLiveSessionStatusAction` | انتقالات الحالة | user() → ownership → `canTransitionSessionStatus` |

## 6. Current Database Model

```
Classroom (1)──▶(N) LiveSession ──▶ SessionBooking (unique userId+sessionId)
                     │       ├──▶ LiveSessionAttendance (unique, attendedAt فقط — بلا مدة)
                     │       └──▶ LiveSessionAdmission (unique, status نصي:
                     │             pending|approved|rejected|kicked, decidedAt/decidedBy)
                     └─ teacherId ▶ Teacher ▶ User (identity=participant identity)
```
- migrations: الأخير `20260825_add_live_session_admissions`. لا حاجة لأي migration لأي مرحلة من 9D/9E.
- `live_session_admissions.status` عمود نصي — قابل لاستيعاب قيم مستقبلية بلا migration (نمط مثبت بـ kicked).

## 7. Current LiveKit Integration

- SDKs: `livekit-client ^2.22.0`, `livekit-server-sdk ^2.18.0`.
- الغرفة = `session.id`. الهوية = `user.id`. التوكن TTL = مدة الجلسة + 15 دقيقة.
- المعلم: Room + createLocalTracks (h720) + publishTrack، أحداث LocalTrackPublished كمصدر حقيقة (9A)، ConnectionQuality.
- الطالب: subscriber صرف، adaptiveStream، بدون أي مسار محلي، معالجة PARTICIPANT_REMOVED (9C).
- Admin: `livekit-admin.ts` — listParticipants/removeParticipant فقط، server-only بثلاث طبقات حماية.

## 8. Current Authorization Model

| الدور | صلاحياته اليوم |
|---|---|
| TEACHER (مالك) | publisher token، بدء/إنهاء البث، انتقالات الحالة، إدارة الدخول والمشاركين، الطرد |
| ADMIN | كل ما سبق على أي جلسة |
| STUDENT | subscriber token بعد approved فقط، حضور/نبضات، طلب دخول، لا Kick ولا إدارة |

النمط الثابت: دالة سياسة خالصة في `src/lib/live-classroom/*.ts` + استدعاء واحد منها في المسار + رفض برسالة عربية ثابتة. أي ميزة جديدة تتبع هذا النمط لا تحتاج ابتكار نظام صلاحيات جديد.

## 9. Existing Realtime/Data Mechanisms

الموجود فعلياً: HTTP polling بأنماط أربعة (status 6s ثابت، admission متكيف 4–20s، participants 12s+أحداث، heartbeat 45s) + أحداث Room المحلية (ParticipantConnected/Disconnected، Reconnecting، track events).
غير موجود: data channel messages، WebSocket مخصص، SSE، أي مكتبة realtime خارجية.
**النتيجة المعمارية:** أول ميزة تحتاج مزامنة فورية (chat) يجب أن تقرر: LiveKit DataChannel (متاح، بلا خادم إضافي، لكنه volatile — لا تاريخ) مقابل REST+polling (مثل نمط admission المثبت). التحليل يميل لـ DataChannel للأحداث اللحظية + REST للتاريخ، ويوثق ذلك في §10.

## 10. Chat Analysis

| الطبقة | المسؤولية |
|---|---|
| Client | صندوق رسائل، إرسال `{text}` عبر القناة، عرض، حد أقصى للحجم/التردد |
| Server | **يجب أن يكون هو مصدر الشرعية**: بوابة دخول (approved/معلم)، sanitize وطول، rate-limit، وحفظ تاريخ اختياري في DB |
| LiveKit | النقل فقط (DataChannel) — لا يفهم المحتوى ولا يفرض شيئاً |
| Database | جدول رسائل اختياري للتاريخ بعد الجلسة (يتطلب migration عند الحاجة) |

**ثغرة محتملة تُسجل:** إذا اقتصر الإرسال على DataChannel من العميل فلن يمر عبر أي تحقق server-side — أي طالب داخل الغرفة يمكنه إرسال رسائل لأي أحد. تخفيفها: بوابة التوكن تضمن أن داخل الغرفة = مصرح له (approved/معلم)؛ لكن الرسائل ذات المحتوى الحساس تحتاج moderation server-side أو مرور عبر REST. **اعتماد زائد على client state محتمل في تصميم chat مباشر على DataChannel — يجب حسمه في Safety Gate الخاص بـ 9D.**
Dependency: يحتاج قرار قناة البيانات أولاً. Raise Hand يعتمد عليه (نفس القناة).

## 11. Raise Hand Analysis

إشارة حالة خفيفة (student→teacher): client يرسل حدثاً عبر نفس قناة 9D؛ server يسجله اختيارياً؛ teacher panel يعرضه. لا migration إلزامية (يمكن أن يكون ephemeral في الغرفة). يعتمد كلياً على بنية الرسائل من 9D. خطره الأدنى بين الميزات.

## 12. Microphone/Mute All Analysis

| الطبقة | المسؤولية |
|---|---|
| Client (طالب) | لا ينشر شيئاً اليوم (subscriber-only). تفعيل الميكروفون يتطلب توكن canPublish — **يجب ألا يُمنح إلا بموافقة معلم لحظية** |
| Server | إصدار توكن publisher مؤقت للطالب عند سماح صريحة + revokeTokenTs عند السحب |
| LiveKit | فرض الصلاحيات فعلياً في الغرفة (canPublish grant) |
| DB | حالة "mic granted" إن احتاجت البقاء بعد reconnect |

**ثغرة تُسجل:** توكن الطالب الحالي TTL = مدة الجلسة كاملة. لو مُنح canPublish مؤقتاً بتوكن طويل الأمد يبقى ممكناً الاستخدام بعد سحب الإذن — الحل نمط 9C (revokeTokenTs أو توكن قصير المدى خاص بالنشر).
Mute All = معلم يرسل أمراً عبر القناة + فرض LiveKit (setRemotePublished false أو removeParticipant للمعاندين). يعتمد على قناة 9D وعلى نموذج mic-grant.

## 13. Smart Whiteboard Analysis

أكبر مرحلة في الخريطة. المكوّنات: رسم/كتابة/ممحاة/أشكال/صفحات/أذونات/مزامنة/recovery/PDF→whiteboard/حفظ الحالة.

| الطبقة | المسؤولية |
|---|---|
| Client | محرك رسم (tldraw موثق كمرشح في تعليق services.ts — **غير مثبت في package.json**)، التقاط strokes كأحداث |
| Server | سلطة الصفحات والحالة، بوابة الكتابة (معلم فقط افتراضياً)، حفظ snapshot |
| LiveKit | نقل أحداث الرسم عبر DataChannel (حجم/تردد يحتاج throttling) |
| DB | جدول boards/pages/snapshots — **migration مطلوبة** |

**ثغرات تُسجل:** (1) أحداث الرسم عبر DataChannel لا تمر بأي تحقق — طالب يمكنه الرسم إن سمح له العميل؛ الحماية الحقيقية = قبول server للأحداث أو تقييد الإرسال بمنح صريح. (2) reconnect/state recovery يتطلب مصدر حالة server-side (snapshot) — DataChannel وحده لا يكفي. (3) PDF→whiteboard يعيد استخدام بنية signed-read الحالية (آمنة).
Dependencies: قناة بيانات (9D) ← whiteboard؛ Storage الحالي ← PDF والحفظ.

## 14. Teacher Local Recording Analysis

**المواصفة:** بدء/إيقاف من المعلم فقط · حفظ محلي على قرصه · ملف واحد يجمع camera+audio+screen+whiteboard · لا ملفات منفصلة ولا events-file.

**Feasibility الفعلية في المتصفح (مدققة ضد الكود):**

1. **الدمج ممكن تقنياً**: `MediaRecorder` يقبل mixed canvas (camera+screen compositing) + mixed audio (WebAudio destination). المشروع ينشر أصلاً tracks منفصلة (9A) فيمكن التقاطها محلياً عبر `track.mediaStream` دون أي نداء شبكة.
2. **الثغرة الحرجة — Whiteboard داخل الفيديو**: السبورة ليست video track؛ هي DOM/canvas. دمجها يتطلب رسمها في الـ composite canvas يدوياً (drawImage من عنصر tldraw/canvas). هذا **يعمل فقط إذا كانت السبورة نفسها تعمل في نفس صفحة المعلم** — أي أن Recording يعتمد فعلياً على اكتمال Smart Whiteboard، وليس قبله.
3. **"المعلم يحدد مكان الحفظ"**: File System Access API (`showSaveFilePicker`) يتيح ذلك في Chromium فقط؛ Safari/Firefox لا تدعمه — fallback هو تنزيل Blob باسم ملف (المتصفح يحدد المجلد). **قيود بيئية يجب التصريح بها لا إخفاؤها.**
4. **ملف واحد قابل للمشاهدة**: MediaRecorder يخرج webm/mp4 حسب codec المتصفح؛ webm مقبول للتشغيل. لا حاجة لخادم.
5. **موثوقية**: انقطاع tab/تعطل يفقد التسجيل — لا استمرارية server-side. هذه حدود النموذج المحلي المطلوب نفسه، تُقبل ضمن المواصفة.

**الخلاصة:** feasible بشرطين صريحين: (أ) بعدها عن Whiteboard لا قبله، (ب) قيود المتصفح (Chromium-first للحفظ المخصص) تُعلن في Safety Gate الخاص بها. **لا اعتماد على RecordingService stub الحالي** — التسجيل محلي كلياً؛ الـ stub (finalizeRecording/storagePath) يخص نموذجاً خادمياً مختلفاً ولا يجب استخدامه.

## 15. Research Rooms Analysis

لا مواصفة موجودة في الكود ولا في CLAUDE.md — لن تُختلق.

**ما يثبته الكود:** `classrooms.ts` + model Classroom موجودة كبُنية (active/archived) لكنها **غير مربوطة بواجهة نشطة** (لا صفحة classrooms مستقلة؛ LiveSession.classroomId اختياري وغير مستخدم في مسارات live). أي أن "قاعة" ككيان موجود جزئياً في DB فقط.

**التقييم:** Research Rooms الأنسب لها أن تكون **كياناً مستقلاً** (جدول خاص بقواعد عضوية/دعوة مختلفة تماماً عن admission الخطي للمعلم الواحد) يعيد استخدام: نمط التوكن، نمط admission، نمط السياسة الخالصة، وربما LiveKit rooms منفصلة (roomName ≠ session.id). ربطها بنوع LiveSession سيسرّب دلالات attendance/admission المبنية حول معلم واحد وجلسة مجدولة.
**Dependency:** لا شيء منها مبني اليوم؛ تتطلب migration خاصة بها. تأتي بعد اكتمال 9D–9F.

## 16. Post-Session Analysis

ما يبقى اليوم بعد `ended`: attendance records (دائمة)، admissions (بسجل القرارات)، bookings. ما لا يوجد: recording metadata (stub فقط)، whiteboard state (لا شيء)، files مرتبطة بالجلسة (uploads عامة غير مرتبطة بـ sessionId)، chat history (لا شيء)، session events log (لا شيء).
**نموذج الاحتفاظ المقترح (تحليل فقط):** جدول/جداول post-session مرتبطة بـ sessionId؛ recording metadata يشير لملف محلي لدى المعلم (بلا تخزين فيديو على المنصة — اتساقاً مع نموذج 14) مع إمكانية رفع نسخة اختيارية عبر signed upload الموجود. يتطلب migration مجمعة في مرحلة Post-Session نفسها.

## 17. Dependencies

```
Auth/Authorization (موجود) ◀── جميع المراحل
قناة بيانات موحدة (قرار معماري جديد)
   ├─▶ Chat (9D)
   ├─▶ Raise Hand (9D)
   ├─▶ Mute All (9E)
   ├─▶ Whiteboard sync (SMART-WB)
   └─▶ Mic grant signaling (9E)
Mic grant (9E) ◀── Mute All
Whiteboard (SMART-WB) ◀── Teacher Recording (دمج السبورة في الفيديو)
Storage signed URLs (موجود) ◀── PDF→Whiteboard ◀── Recording
Migration خاصة ◀── Research Rooms · Post-Session persistence
Browser E2E env (غير موجودة) ◀── إغلاق 9D/9E/9F بشكل COMPLETE
```
التوازي الممكن: Whiteboard UI (بدون sync) يمكن بناؤه بالتوازي مع 9E. ما لا يُدمج: Recording مع أي شيء قبل اكتمال Whiteboard؛ Research Rooms مع أي طور 9x.

## 18. Risks

| # | الخطر | الشدة | المجال | الطور الموصى به |
|---|---|---|---|---|
| R1 | DataChannel يتجاوز server-side authorization (chat/draw/hand) | High | كل الميزات اللحظية | 9D safety gate |
| R2 | توكن الطالب طويل TTL يتعارض مع منح/سحب mic مؤقت | Medium | 9E | 9E |
| R3 | Recording يعتمد DOM-canvas compositing هش عبر المتصفحات + حفظ مخصص Chromium-only | Medium | Recording | SMART-WB/REC gate |
| R4 | لا بيئة LiveKit اختبارية → E2E يبقى BLOCKED لكل الأطوار القادمة | High | الجودة | بيئة اختبار (§20) |
| R5 | Production Neon هو DB التطوير الوحيد | High | كل ما يتطلب migration | قبل Research Rooms/Post-Session |
| R6 | flake عابر في live-room-polish (لوحظ مرة) | Low | CI موثوقية | مراقبة |
| R7 | services.ts stubs قد توحي بأن التسجيل الخادمي مخطط — وهو متناقض مع نموذج التسجيل المحلي المعتمد | Low | توثيق | REC gate |
| R8 | heartbeat/attend يظهران 503 عند P2021 fail-closed — سلوك صحيح لكنه يعتمد أن migrations تسبق الكود دائماً | Info | عمليات النشر | قائم (مطبق) |

## 19. Required Infrastructure

1. **بيئة LiveKit اختبارية** (cloud account منفصل أو self-host) + متغيرات shell مؤقتة أمام `next dev` — شرط إغلاق أي 9x كـ COMPLETE.
2. **Neon branch/dev DB** — شرط لأي migration مستقبلية (Research Rooms، Post-Session، chat history).
3. لا حاجة اليوم لأي خدمة خارجية جديدة للـ 9D/9E (livekit-client يغطي القناة).
4. tldraw (أو بديل) سيتطلب dependency جديدة عند Smart Whiteboard — تُقدَّر وقتها.

## 20. Browser E2E Strategy

- **قابل للاختبار محلياً الآن:** كل مسارات HTTP/auth/policy (كما فعلنا في 9C) — Vitest + Playwright ضد dev server بـ network-stubbing.
- **يحتاج LiveKit room حقيقية:** presence، الإزالة الفعلية، reconnect/revokeTokenTs، ونقل DataChannel الفعلي (chat/hand/draw).
- **يحتاج حساب Teacher حقيقي:** كل سيناريوهات النشر والإدارة. **Student حقيقي:** الاشتراك، الطرد، chat.
- **Test environment آمنة بدون Production DB:** ممكنة — Neon branch (تنشأ من اللوحة) + DATABASE_URL مؤقت في shell + مفاتيح LiveKit اختبارية. **لم تُنشأ بعد؛ إنشاؤها قرار مستخدم.** بدونها يبقى نمط الإغلاق الحالي: implementation complete + E2E blocked.

## 21. Production Safety

ميزات مستقبلية تتطلب (تسجيل فقط، لا تنفيذ):
- **migration:** chat history (اختياري)، whiteboard boards/snapshots، research rooms، post-session tables.
- **storage changes:** رفع PDF للحفظ داخل السبورة (signed read موجود)، رفع تسجيل اختياري (signed upload موجود) — بلا تغييرات bucket structure.
- **secrets/env جديدة:** LiveKit test credentials (بيئة اختبار فقط). لا سر جديد للـ 9D/9E.
- **خدمات خارجية:** لا شيء حتى Research Rooms/Post-Session؛ tldraw مكتبة client لا خدمة.

## 22. Recommended Phase Order

1. **قرار قناة البيانات** (ضمن Safety Gate مصغر لبداية 9D) — DataChannel + REST hybrid
2. **LIVE-9D** — Chat + Raise Hand (يبنيان معاً على القناة)
3. **LIVE-9E** — Mic permissions + Mute All (يعتمد 9D للـ signaling + نمط grant/revoke من 9C)
4. **LIVE-9F** — كما عرّفه CLAUDE.md (polish/stabilization لما سبق)
5. **Smart Whiteboard** — أكبر طور؛ بعد استقرار القناة والأذونات
6. **Teacher Local Recording** — بعد اكتمال Whiteboard (شرط دمجها في الملف الواحد)
7. **Research Rooms** — كيان مستقل + migration خاصة
8. **Post-Session** — تجميع البقايا (attendance/recording metadata/whiteboard/files/chat/events)
9. **بالتوازي الممكن في أي وقت:** إنشاء بيئة E2E (Neon branch + LiveKit test) — unblocks إغلاق كل الأطوار

## 23. Recommended NEXT PHASE

**LIVE-9D — Chat + Raise Hand**

## 24. Reasons for the recommendation

1. **ترتيب CLAUDE.md نفسه** يضع 9D بعد 9C مباشرة في جدول مهارات Live Classroom — والتزم به لأن قواعد المشروع تسبق استنتاجاتي.
2. **الدليل من الكود:** `canPublishData=true` موجود في توكن المعلم منذ 8A بلا أي مستهلك — البنية نصف جاهزة؛ livekit-client 2.22 يوفر publishData/DataReceived بلا dependency جديدة؛ لا migration مطلوبة.
3. **تبني الأساس المشترك:** كل ما تبقى في الخريطة (9E mute-all/mic-signaling، whiteboard sync) يحتاج نفس آلية الرسائل — 9D أقل الطورين تكلفة وأكثرها تأثيراً على ما بعده.
4. **مخاطرها الأدنى:** لا storage، لا secrets، لا خدمات خارجية، وسطح الـ authorization محدود ومفهوم (بوابة الدخول الحالية تكفي كخط دفاع أول مع قرار moderation موثق في safety gate الخاص بها).

## 25. Open Questions

1. **Chat moderation model:** DataChannel مباشر (سريع، بلا تاريخ، ثغرة R1) أم REST relay (تحكم كامل، latency أعلى) أم hybrid؟ — قرار Safety Gate 9D.
2. **Chat history:** هل تُحفظ الرسائل بعد الجلسة (يتطلب migration) أم ephemeral؟
3. **Raise Hand state:** ephemeral في الغرفة أم مسجل في DB؟
4. **Mic grant duration:** توكن قصير خاص بالنشر أم revokeTokenTs على الرئيسي؟
5. **Whiteboard library:** tldraw (الموثق في stub) أم بديل أخف؟ — يحدد حجم dependency.
6. **Recording save UX:** هل يُقبل تنزيل Blob كـ fallback كافٍ لغير Chromium؟
7. **Research Rooms:** هل هناك مواصفة خارج الكود سيقدمها المستخدم قبل بدء تحليلها؟
8. **متى تُنشأ بيئة E2E؟** (Neon branch + LiveKit test creds) — بدونها تبقى كل الأطوار تُغلق PARTIAL.

## 26. Confirmation

**NO CODE WAS MODIFIED.** هذه المرحلة قراءة حصراً (Read/Grep/Bash للقراءة فقط). لم يُنشأ migration، لم تُلمس قاعدة البيانات، لا commit، لا push، لا deploy، ولم يُعدَّل CLAUDE.md أو AGENTS.md. كل ما ورد في §18 مسجل بلا إصلاح.
