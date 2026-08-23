# LIVE_CLASSROOM_PHASE_1_FIX_REPORT

**Date:** 2026-08-24
**Scope:** تشخيص فشل صفحات `/live-classrooms` و `/teacher/live-classrooms` بعد Deployment (Vercel Ready)

---

## 1. Root Cause

**لم تُطبَّق أي Prisma migration على قاعدة بيانات Production** — بما فيها
`20260824_live_classroom_foundation` التي تنشئ جدول `classrooms`.

كل استعلام في الصفحتين المعطلتين يمر عبر `prisma.classroom.*` (جدول `classrooms`)
الغير موجود في الـDB الفعلي ← Prisma يرمي خطأ وقت التشغيل ← Error Boundary
`(site)/error.tsx` يلتقطه ويعرض الرسالة العامة.

## 2. Evidence (أدلة مباشرة — لا تخمين)

1. **مصدر الرسالة**: `src/app/(site)/error.tsx:15` يحتوي النص نفسه
   «حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.» — وهو boundary عام لكل قسم `(site)`.
2. **مسار الاستعلام**: `/live-classrooms` → `listStudentClassrooms()` و
   `/teacher/live-classrooms` → `listTeacherClassrooms()/listUpcomingSessionsForTeacher()`
   — الثلاثة تبدأ بـ `prisma.classroom.findMany(...)` (`classrooms.ts:45,93,192`).
3. **الحسم — `npx prisma migrate status` مقابل Neon الفعلية**:
   ```
   Datasource: PostgreSQL "neondb" @ ep-flat-wave-….neon.tech
   Following migrations have not yet been applied:
     20260821_add_is_result_published
     20260822_add_performance_indexes
     20260822_hash_session_tokens
     20260823_add_book_views
     20260824_live_classroom_foundation   ← سبب هذا العطل
   ```
   أي أن جدول `classrooms` غير موجود على الإطلاق في الإنتاج.
4. **لماذا Vercel Ready رغم ذلك؟** البناء لا ينفذ هذه الاستعلامات (صفحات ديناميكية
   تعتمد cookies)، و`prisma generate` يولّد Client من schema المحلي — فالفشل
   runtime-only، تمامًا كما رُصد.

### اكتشاف جانبي حرج (من نفس الدليل)
4 migrations أخرى معلّقة تعني أن مزايا سابقة **معطوبة/ناقصة في الإنتاج حاليًا**:
- `20260822_hash_session_tokens` → جلسات قديمة بلا تطابق بعد نشر 6A (الدخول الجديد يعمل).
- `20260823_add_book_views` → زر «تمت القراءة» سيرمي خطأ.
- `20260821_add_is_result_published` + `20260822_add_performance_indexes` →
  صفحات نتائج/تصحيح تختار عمودًا غير موجود = انكسار محتمل الآن.

## 3. Files Changed

**لا تغييرات كود.** السبب بنية تحتية وليس شيفرة؛ أي "إصلاح برمجي" هنا كان سيخفي
العطل بدل حله (مخالف لشرط G).

## 4. Exact Fix (يُنفَّذ بواسطتك — لم أطبقه)

```bash
# من جذر المشروع، بعد تأكيد DATABASE_URL في بيئة التنفيذ أنها指向 Neon الإنتاجية
npx prisma migrate deploy
```

- آمن: يطبق الملفات المعلقة **بترتيبها الزمني فقط**، ولا يصمم شيئًا جديدًا.
- سيغطي تلقائيًا الـ5 المعلقة (live-classroom + إصلاحات المراحل السابقة).
- بعد التطبيق: أعد Deploy من Vercel (أو Push فارغ) ليس غير ضروري — الصفحات
  ستعمل فورًا دون rebuild لأن الكود الحالي صحيح.

## 5. Database / Migration Status

| Migration | Status |
|---|---|
| 20260821_add_is_result_published | ❌ pending |
| 20260822_add_performance_indexes | ❌ pending |
| 20260822_hash_session_tokens | ❌ pending |
| 20260823_add_book_views | ❌ pending |
| **20260824_live_classroom_foundation** | ❌ **pending — سبب العطل** |

لا يوجد أي drift آخر؛ `_prisma_migrations` فارغة عمليًا منذ التأسيس.

## 6. Authentication Status

سليم وغير مساس: الصفحات تستخدم `getCurrentUser()` نفسها؛ لا null-unhandled ولا
exception من الجلسة. اختلاف الأدوار مقصود (STUDENT-only للطالب، TEACHER+teacherId
للمعلم) ومغطى باختبارات مصفوفة الأدوار (9 اختبارات live-classroom خضراء).

## 7. Tests Results (مثبتة فعليًا الآن)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS (exit 0) |
| `eslint src` | ✅ PASS (0 errors, 31 warnings baseline) |
| `vitest run --no-file-parallelism` | ✅ **160/160** |
| `npm run build` | ⚠️ **FAIL محليًا فقط** — سبب مثبت خارج نطاقنا: `.env` المحلي فيه `SUPABASE_SERVICE_KEY` بطول 2 حرف (placeholder) → `createClient` يرمي عند جمع page-data لـ `/api/files/[filename]`. الإنتاج سليم (Deployment Ready بمتغيرات حقيقية). **ليس مرتبطًا بـLive Classroom ولا بهذه المشكلة.** |
| تشغيل المسارين محليًا بحسابات حقيقية | ❌ غير قابل للإثبات محليًا بدون مفاتيح Supabase صحيحة + مستخدمين — التحقق الوظيفي سيتم مباشرة على Vercel بعد تطبيق الأمر أعلاه |

## 8. Production Deployment Requirements

1. نفّذ: `npx prisma migrate deploy` (بعد تأكيدك لـDATABASE_URL).
2. تحقق سريع بعدها: `npx prisma migrate status` يجب أن يقول «Database schema is up to date».
3. افتح المسارين بحساب معلم مالك وطالب مشترك — لا حاجة لإعادة Deploy.
4. راقب Function Logs إن ظهر أي خطأ ثانٍ (متوقع: لا شيء).

## 9. Final Status

```text
Root Cause        : CONFIRMED — unapplied migration (classrooms table missing in prod)
Code Fix Required : NO (code is correct)
Action Required   : npx prisma migrate deploy  (بواسطة مالك البيئة)
Local tsc/lint    : PASS
Local vitest      : PASS 160/160
Local build       : FAIL (pre-existing local env gap: Supabase key placeholder — unrelated)
Prod pages        : BLOCKED until migration
```
