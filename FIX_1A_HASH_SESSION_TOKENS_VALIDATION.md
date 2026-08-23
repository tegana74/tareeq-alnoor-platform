# FIX-1A — Validation Report: 20260822_hash_session_tokens

**Date:** 2026-08-24 · **Mode:** تشخيص فقط — لم يُنفَّذ `migrate deploy` ولا أي تعديل

---

## النموذج المطلوب (كما ورد في التعليمات)

```text
Migration:
20260822_hash_session_tokens

Prisma model:
Session   (schema.prisma — model Session)

Mapped DB table:
"sessions"   (@@map("sessions") — أحرف صغيرة، جمع)

Migration references:
"Session" في كل العبارات الست (PascalCase مفرد، محاط بعلامتي اقتباس):
  L5 : ALTER TABLE "Session" ADD COLUMN "tokenHash" TEXT;
  L10: UPDATE "Session" SET "tokenHash" = encode(digest("token", 'sha256'), 'hex');
  L13: ALTER TABLE "Session" DROP CONSTRAINT IF EXISTS "Session_token_key";
  L14: ALTER TABLE "Session" DROP COLUMN "token";
  L17: ALTER TABLE "Session" RENAME COLUMN "tokenHash" TO "token";
  L20: ALTER TABLE "Session" ADD CONSTRAINT "Session_token_key" UNIQUE ("token");
لا يوجد أي استخدام لـ "sessions" داخل هذا الملف.

Production actual table:
"sessions" فقط — الاستعلام الفعلي:
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND lower(table_name) IN ('session','sessions')
  → ['sessions']   (لا يوجد جدول "Session" بأحرف كبيرة إطلاقًا)
وأعمدته الحالية: id, token(text), userId, userAgent, ip, expiresAt, createdAt
(لا يوجد tokenHash ← الهجرة لم تُنفَّذ حتى جزئيًا)

Case mismatch:
YES

pgcrypto:
MISSING —
  SELECT extname FROM pg_extension WHERE extname='pgcrypto' → صفوف صفرية
  SELECT COUNT(*) FROM pg_proc WHERE proname='digest' → 0
وهي مطلوبة للسطر L10 (digest).

Migration safe to deploy:
NO

Required correction:
تعديل ملف الهجرة الواحد (بموافقة المالك) ليصبح:
  CREATE EXTENSION IF NOT EXISTS pgcrypto;          -- أو تفعيلها من لوحة Neon
  ALTER TABLE "sessions" ADD COLUMN "tokenHash" TEXT;
  UPDATE "sessions" SET "tokenHash" = encode(digest("token",'sha256'),'hex');
  ALTER TABLE "sessions" ALTER COLUMN "tokenHash" SET NOT NULL;
  ALTER TABLE "sessions" DROP COLUMN "token";
  ALTER TABLE "sessions" RENAME COLUMN "tokenHash" TO "token";
ملاحظات التصحيح:
• لا حاجة لأي DROP CONSTRAINT / ADD CONSTRAINT: القيد الفريد القائم على عمود token
  (sessions_token_key) يتبع العمود تلقائيًا بعد RENAME.
• إضافة SET NOT NULL قبل التبديل حفاظًا على تطابق schema.prisma (token String @unique غير فارغ).
```

---

## STOP — DO NOT DEPLOY

**Mismatch مؤكد من ثلاث جهات مستقلة:** ملف SQL × schema.prisma × introspection الإنتاج.

### الأسطر المتأثرة (SQL الفعلي كما هو على القرص)

| سطر | العبارة | المصير عند deploy |
|---|---|---|
| 5 | `ALTER TABLE "Session" ADD COLUMN "tokenHash"` | ❌ ERROR 42P01 relation "Session" does not exist |
| 10 | `UPDATE "Session" ... digest(...)` | لن يصل (فشل 42P01) + كان سيفشل أيضًا: function digest(...) does not exist |
| 13 | `DROP CONSTRAINT IF EXISTS "Session_token_key"` | لن يصل (IF EXISTS وحده ما كان سيُسكت) |
| 14 | `ALTER TABLE "Session" DROP COLUMN "token"` | لن يصل |
| 17 | `RENAME COLUMN` | لن يصل |
| 20 | `ADD CONSTRAINT "Session_token_key"` | لن يصل |

### الأثر على `prisma migrate deploy` إن نُفِّذ الآن كما هو

التنفيذ تسلسلي: **#1 (is_result_published) ✓ و #2 (performance_indexes) ✓ سيُطبَّقان بنجاح**
(تحقق يدوي: performance_indexes يستخدم `"sessions"` الصحيحة وباقي الجداول snake_case مطابقة،
وبلا CONCURRENTLY)، ثم **#3 يفشل** بالخطأ أعلاه ← يتوقف Deploy ويترك
#4 (book_views) و#5 (live_classroom_foundation) غير مطبقتين مع تسجيل هجرة فاشلة في
`_prisma_migrations` تتطلب `migrate resolve` لاحقًا بعد تصحيح الملف.

لهذا السبب تحديدًا: **لم يُنفَّذ `deploy` إطلاقًا خلال هذه المهمة.**

### حقائق إضافية مثبتة من نفس الفحص (قراءة فقط)

- `_prisma_migrations`: الجدول **غير موجود** في Production
  (code 42P01) ← قاعدة الإنتاج بُنيت تاريخيًا عبر db push بلا سجل هجرات؛
  لهذا يعدّ status الـ5 كلها «pending» وليس بعضها.
- `classrooms` / `book_views`: غير موجودة (cnt=0).
- `exam_attempts.isResultPublished`: **موجود فعليًا (cnt=1)** رغم أن هجرته pending ←
  أُضيف سابقًا خارج نظام المايجريشنز (db push). أثرها عند deploy:
  عبارة `ADD COLUMN ... DEFAULT false` ستُنتج خطأ duplicate column ما لم تُصحَّح
  الهجرة إلى `ADD COLUMN IF NOT EXISTS` — **عطل ثانٍ محتمل في نفس الدفعة** يجب
  حسمه قبل deploy (مدرج في Required corrections أدناه كخيار B).
- `live_sessions.status/classroomId`: غير موجودين (cnt=0) كما هو متوقع.

### Required Corrections (للموافقة — لم تُطبَّق)

A) **hash_session_tokens**: استبدال الملف بالنص المصحح أعلاه (sessions + pgcrypto + NOT NULL، بلا constraint surgery).
B) **is_result_published**: تحويل السطر إلى `ALTER TABLE "exam_attempts" ADD COLUMN IF NOT EXISTS "isResultPublished" BOOLEAN NOT NULL DEFAULT false;` لأن العمود موجود مسبقًا في الإنتاج.

بعد موافقتك على A (+B اختياريًا لتجنب فشل #1): يُعاد تشغيل FIX-1 من خطوة
Safety Gate ثم `migrate deploy` مباشرة.

### حالة بقية الملفات (نظافة)

| Migration | يستخدم أسماء mapped صحيحة؟ | destructive؟ |
|---|---|---|
| 20260821_add_is_result_published | ✅ exam_attempts | ⚠️ سيفشل duplicate-column (انظر B) |
| 20260822_add_performance_indexes | ✅ snake_case كامل، IF NOT EXISTS، بلا CONCURRENTLY | لا |
| 20260822_hash_session_tokens | ❌ "Session" ×6 | DROP COLUMN مقصود وموثق لكنه فاشل بالاسم |
| 20260823_add_book_views | ✅ users/books | لا |
| 20260824_live_classroom_foundation | ✅ teachers/courses/years/subjects/live_sessions | لا |

### خلاصة FIX-1 الكاملة المتأثرة

```text
FIX-1 STATUS:
BLOCKED (pre-deploy gate)

Blocker:
20260822_hash_session_tokens.sql — table-name mismatch ("Session") ×6 statements
+ pgcrypto MISSING (digest غير متاحة)
+ احتمال duplicate-column في 20260821 (عمود موجود فعليًا)

Deploy attempted before blocker found: NO (تم كشفه في Safety Gate — عمدًا)
Migrations applied so far: NONE (صفر كتابة على الإنتاج)
Next safe action: الموافقة على تصحيحات A وB أعلاه ثم إعادة تشغيل FIX-1
```
