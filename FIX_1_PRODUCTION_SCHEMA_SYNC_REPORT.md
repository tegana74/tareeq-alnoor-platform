# FIX_1_PRODUCTION_SCHEMA_SYNC_REPORT

**Date:** 2026-08-24 · **Target:** PRODUCTION (Neon PostgreSQL — host `ep-flat-wave-….aws.neon.tech`, db `neondb` — مؤكد من الاتصال الفعلي لا من اسم المتغير)

---

## 1. Root Cause

قاعدة الإنتاج بُنيت تاريخيًا عبر `db push` بلا أي سجل هجرات (`_prisma_migrations`
غير موجود أصلًا)، فتراكمت 5 migrations pending. اكتشف Safety Gate قبل التنفيذ
عطلين داخل الملفات نفسها كانا سيُسقطان deploy جزئيًا:

1. `20260822_hash_session_tokens` يشير إلى `"Session"` بينما الجدول المapped هو `"sessions"` (×6 عبارات) + يستخدم `digest()` وpgcrypto غير مثبتة.
2. `20260821_add_is_result_published` يضيف عمودًا **موجودًا فعليًا** في الإنتاج (duplicate column).
3. (اكتُشف أثناء التنفيذ) `20260824_live_classroom_foundation` استخدم تعليقات `//` بدل `--` → P3018 بعد نجاح الثلاث الأولى.

## 2. Migration files modified (3)

| File | Correction |
|---|---|
| `20260822_hash_session_tokens/migration.sql` | `"Session"`→`"sessions"` ×6 · `CREATE EXTENSION IF NOT EXISTS pgcrypto;` · `SET NOT NULL` قبل التبديل · إزالة constraint surgery الزائد |
| `20260821_add_is_result_published/migration.sql` | `ADD COLUMN IF NOT EXISTS` (idempotent) |
| `20260824_live_classroom_foundation/migration.sql` | تعليقات `//`→`--` (إصلاح P3018) — الـDDL لم يتغير |

## 3. Exact SQL changes

انظر git commit `249752c` («fix: align production migrations») — diff كامل للملفات الثلاثة؛
لا DROP DATABASE/TRUNCATE/reset، والحذف الوحيد هو `DROP COLUMN token` المقصود والموثق
(استُبدل بـtokenHash ثم rename) مع إعادة بناء الفهرس الفريد `sessions_token_key`.

## 4. Production database verification (read-only introspection)

| Object | Before | After |
|---|---|---|
| classrooms table | ❌ absent | ✅ exists (10 أعمدة مطابقة) |
| book_views table | ❌ absent | ✅ exists |
| live_sessions.status/classroomId | ❌ absent | ✅ both exist |
| exam_attempts.isResultPublished | ✅ existed (out-of-band) | ✅ (migration مسجلة applied) |
| sessions.token | plaintext ×19 | **hashed 64-hex ×19/19**، صفر plaintext |
| sessions_token_key unique index | سقط منطقيًا مع الحل المقترح القديم | ✅ restored بالاسم الأصلي |
| pgcrypto / digest() | MISSING | ✅ PRESENT |
| performance indexes (12) | 0 موجود | ✅ 12/12 |

## 5–6. Deploy & Prisma Status

```
migrate resolve --applied 20260821_add_is_result_published   (baseline موثق بالأدلة: العمود موجود)
migrate deploy        → فشل أولي P3018 (تعليقات //) ← صُحح الملف ← retry ✓
migrate deploy retry  → "All migrations have been successfully applied."
migrate status        → "Database schema is up to date!"
```

ملاحظة شفافة: حدث خطآن عابران أثناء التنفيذ وأُصلحا وفق قواعد المرحلة —
(1) P1001 انقطاع شبكة عابر (أعيد نفس الأمر) (2) P3005/P3018 المسار الرسمي الموثق
لـbaseline قاعدة db-push عبر resolve --applied المدعوم بالـintrospection ثم
resolve --rolled-back لإعادة المحاولة بعد تصحيح الملف. صفر كتابة يدوية على الجداول.

## 7–9. TypeScript / ESLint / Vitest

| Check | Result |
|---|---|
| prisma generate | ✅ PASS |
| tsc --noEmit | ✅ exit 0 |
| eslint src | ✅ 0 errors, 31 warnings (baseline) |
| vitest --no-file-parallelism | ✅ **160/160** |

## 10–12. Smoke / Git / Deployment

- HTTP smoke (guest): `/live-classrooms` → 200 login-render، `/teacher/live-classrooms` → 200 login-render، `/` → 200 — **صفر Error Boundary** (قبل الإصلاح: crash). المسار المعتمد على DB بعد تسجيل الدخول مثبت بديلًا عبر introspection (كائنات مطابقة تمامًا لعقود الاستعلام) + اختبارات المصفوفة.
- Git: commit **`249752c`** على `main` (3 ملفات، +17/−20) → pushed ✓ → Vercel auto-deploy.
- Authenticated click-through (طالب/معلم) متبقٍ لصاحب الحسابات — البنية مؤكدة سلامتها بالأدلة أعلاه.

## 13. Remaining risks

1. الجلسات النشطة قبل الهجرة انتهت حتمًا (توكن plaintext استُبدل) — دخول واحد جديد لكل مستخدم.
2. `digest()` أصبحت تبعية دائمة لpgcrypto في هذا الـDB (مثبتة الآن).
3. أي migration مستقبلية يجب أن تستخدم أسماء @@map حرفيًا (درس موثق).

---

```text
FIX-1 STATUS:
COMPLETE
```

**STOP — لم تبدأ FIX-2.**
