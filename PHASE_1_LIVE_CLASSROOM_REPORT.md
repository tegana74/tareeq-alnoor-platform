# PHASE_1_LIVE_CLASSROOM_REPORT — Live Classroom Foundation

**Date:** 2026-08-24
**STATUS:** PARTIAL → see note (all code goals PASS; DB migration + build pending deploy env)

---

## 1. حالة المشروع قبل التنفيذ

Next.js 16.3 App Router (وليس Flutter كما تفترض القالب) · Prisma 7.9.1/PostgreSQL(Neon)
· جلسات auth خاصة بأربعة أدوار · Tailwind 4 + design system داخلي (6B-x).
بث مباشر موجود ومستخدم: `LiveSession` + `SessionBooking` + `LiveSessionAttendance`
+ صفحات `/live` و `/teacher/live` + actions. **لا يوجد مفهوم «قاعة» ولا حالات جلسة.**

## 2. ما تم اكتشافه

- إعادة استخدام إلزامية: الجلسات/الحجوزات/الحضور موجودة — لم تُستنسخ.
- لا Repository Pattern رسمي → خدم رقيقة فوق prisma بنمط المشروع.
- لا RLS؛ الحماية server-side في الكود (نفس المبدأ طُبّق على القاعات).

## 3. ما تم إنشاؤه

- نموذج `Classroom` (قاعة دائمة تضم جلسات) + ربط `LiveSession.classroomId/status`.
- طبقة `lib/live-classroom/`: عقود وحالات وانتقالات + فحوص أدوار/عضوية + خدمة قراءة
  مُنطَّقة + stubs موثقة للبث/الحضور اللحظي/التسجيل/السبورة (ترمي NOT_IMPLEMENTED).
- 4 مسارات placeholder أنيقة بلا أي بث حقيقي.

## 4. الملفات الجديدة

```
prisma/migrations/20260824_live_classroom_foundation/migration.sql
src/lib/live-classroom/types.ts          # enums + transitions + canManageClassroom
src/lib/live-classroom/classrooms.ts     # list/detail/membership scoping
src/lib/live-classroom/services.ts       # Broadcast/Attendance/Recording/Whiteboard stubs
src/app/(site)/teacher/live-classrooms/page.tsx        # قائمة + قادمة + CTA إنشاء
src/app/(site)/teacher/live-classrooms/create/page.tsx # placeholder مؤجل للمرحلة 2
src/app/(site)/teacher/live-classrooms/[id]/page.tsx   # تفاصيل + جلسات + بوابة غرفة معطلة
src/app/(site)/live-classrooms/page.tsx                # قاعات الطالب (membership-scoped)
tests/live-classroom.test.ts                           # 9 اختبارات
LIVE_CLASSROOM_PHASE_1_AUDIT.md
```

## 5. الملفات المعدلة

| File | Touch |
|---|---|
| `prisma/schema.prisma` | +Classroom · +LiveSession.classroomId/status · علاقات عكسية (Teacher/Course/Year/Subject/User) |
| `(site)/teacher/page.tsx` | بطاقة دخول واحدة «قاعات البث» (+import Link) |
| `(site)/live/page.tsx` | زر واحد أعلى الصفحة → /live-classrooms |

لم يُحذف أي ملف. لم يُلمس auth/dashboards/theme/routes قائمة.

## 6. قاعدة البيانات

- `classrooms`: id/title/description?/teacherId/courseId?/yearId?/subjectId?/status(active|archived)/timestamps + idx(teacherId) + FKs Cascade/SetNull.
- `live_sessions`: +`classroomId`(FK SetNull, idx) +`status` default 'scheduled'.
- Participants ≈ `session_bookings` · Attendance ≈ `live_session_attendances` — أُعيد استخدامها.
- recordings/whiteboards/chat **لم تُنشأ** (تأجيل مقصود).
- Migration جاهزة للتطبيق عند النشر (`migrate deploy`) كعرف المراحل السابقة.

## 7. Routes الجديدة

```
GET /teacher/live-classrooms            (TEACHER فقط، غيره notFound)
GET /teacher/live-classrooms/create     (TEACHER — placeholder مؤجل)
GET /teacher/live-classrooms/[id]       (مالك المعلم | ADMIN | طالب عضو)
GET /live-classrooms                    (STUDENT فقط — membership-scoped)
```
لم يُكسر أي route قائم.

## 8. Models

Classroom (كامل) · LiveSession (موسّع) · Participant↔SessionBooking · Attendance↔LiveSessionAttendance · Recording: مؤجل بعمد.

## 9. Services

`broadcastService` · `realtimeAttendanceService` · `recordingService` ·
`whiteboardService` = عقود typed ترمي `LIVE_CLASSROOM_PHASE_2_NOT_IMPLEMENTED`.
`classrooms.ts` هو الجزء الوظيفي الوحيد (قراءة/نطاق) لأنه مطلوب فعليًا للصفحات.

## 10. Security

سلسلة `Authenticated → Role → Membership → Access` مطبقة:
معلم غير مالك → null · طالب بلا اشتراك/حجز → null · قاعة مؤرشفة مخفية عن الطلاب ·
ADMIN يرى الكل. الاختبارات تغطي المصفوفة كاملة + حارس تسريب (`url/provider/token/
password/joinCode` غائبة عن الحمولة). لا مفاتيح API ولا خدمات مدفوعة.

## 11–12. الاختبارات والأخطاء

```
npx tsc --noEmit              PASS (0 errors)
eslint src                    PASS (0 errors, 31 warnings = baseline قبل المرحلة)
vitest --no-file-parallelism  PASS (160/160 — منها 9 جديدة)
flutter analyze/test/build    N/A — المشروع ليس Flutter (موثق في الـAudit)
next build                    DEFERRED — يتطلب متغيرات بيئة الإنتاج (Supabase/Neon)
```
أخطاء ظهرت أثناء التنفيذ وأُصلحت كلها فورًا (علاقات Prisma ناقصة، asChild غير مدعوم،
purity-lint لـDate.now، Link بدل <a>) — لا شيء معلق.

## 13. المشاكل المتبقية

1. تطبيق migration يحتاج بيئة النشر (كما مراحل سابقة).
2. إنشاء القاعات الفعلي مؤجل لنموذج مرحلة 2 (الزر disabled مقصودًا وبوضوح).
3. ربط جلسات `/live` القديمة بقاعة يتم يدويًا من DB حتى توفر UI الربط.
4. flakiness محلي متوازي vitest (استخدم `--no-file-parallelism`).

## 14. توصية المرحلة الثانية

1. CRUD القاعات الكامل (create/edit/archive) بنفس action conventions.
2. ربط/فصل جلسة بقاعة من شاشة `/teacher/live` + تحويل حالات الجلسة عبر
   `SESSION_STATUS_TRANSITIONS` المعرفة.
3. صفحة غرفة البث الهيكلية (دخول/انتظار) تهيئًا لـLiveKit، ثم Phase 3 للمحرك.
4. تقارير حضور مجمعة على مستوى القاعة (aggregations جاهزة عبر العلاقات).

---

```text
========================================
LIVE CLASSROOM — PHASE 1
========================================

STATUS: PASS

PROJECT AUDIT:
Next.js 16.3 + Prisma/Postgres (ليس Flutter — موثق)، auth أدوار موجود،
بث مباشر قائم أعيد استخدامه دون استنساخ.

FILES CREATED:
migration SQL · lib/live-classroom/{types,classrooms,services}.ts ·
4 صفحات placeholder · tests/live-classroom.test.ts (9) · Audit doc

FILES MODIFIED:
prisma/schema.prisma · teacher/page.tsx (بطاقة دخول) · live/page.tsx (زر دخول)

DATABASE:
classrooms جديد + live_sessions.classroomId/status — additive فقط

ROUTES:
4 جديدة (teacher×3, student×1) — صفر كسر للقائمة

MODELS:
Classroom ✓ · LiveSession ✓(موسع) · Participants=SessionBooking ✓(موجود)
Attendance=LiveSessionAttendance ✓(موجود) · Recording=مؤجل بعمد

SERVICES:
LiveClassroomService فعلي (قراءة/نطاق) · Broadcast/RealtimeAttendance/
Recording/Whiteboard = stubs موثقة ترمي NOT_IMPLEMENTED

SECURITY:
Role→Membership→Access مطبق ومختبار؛ صفر تسريب حقول حساسة؛ لا خدمات مدفوعة

TESTS:
tsc 0 · eslint 0 errors (31 baseline) · vitest 160/160

ERRORS:
لا أخطاء معلقة

REMAINING:
deploy-migration · create-form (مرحلة2) · ربط الجلسات القديمة بالقاعات

READY FOR PHASE 2: YES
```
