# FIX_4_EXAM_LABELS_I18N_REPORT

**Date:** 2026-08-24 · **Scope:** عرض أحرف خيارات MCQ فقط — صفر تغيير على التخزين أو التصحيح
**Git:** commit `cee61fb` → pushed `main` → Vercel deployed

---

## Root Cause (من التشخيص)

الأحرف كانت **مولّدة inline بثلاث طرق مختلفة** في خمسة ملفات:
`["أ","ب","ج","د","ه","و"][i]` في runner، و`String.fromCharCode(0x0623+i)` في
runner الممارسة وصفحتَي بنك الأسئلة ومحرر المعلم — بلا مصدر واحد ولا دعم إنجليزي.
التصحيح نفسه يقارن **الفهرس الرقمي** (`"0".."3"`) — الأحرف عرضية بحتة.

## Decision (موثق)

- **التوليد وقت العرض** عبر helper مشترك — لا تخزين، لا migration، لا مساس بالدرجات
  ولا بالاختبارات الحالية (يدوية أو AI).
- اللغة: الافتراضي `ar` (الموقع عربي-first بلا حقل لغة للاختبار)؛ الـhelper يدعم
  `"en"` جاهزاً لأي مستقبل يضيف اختيار لغة.

## Files changed

| File | Change |
|---|---|
| `src/lib/exam-labels.ts` | NEW — `OPTION_LETTERS{ar,en}` + `getOptionLabel(i, lang="ar")` مع fallback رقمي |
| `exam-runner.tsx` | المصفوفة الثابتة → helper |
| `practice/[attemptId]/runner.tsx` | fromCharCode → helper |
| `teacher/question-bank/page.tsx` + `admin/question-bank/page.tsx` | fromCharCode(1571) → helper |
| `teacher-content-forms.tsx` | placeholder «الخيار أ» + select الإجابة الصحيحة → helper |
| `tests/exam-labels.test.ts` | NEW — 6 اختبارات |

## Grading impact

**صفر**: التصحيح في `/api/exams/attempts/[id]/finish` يقارن `userAnswer === question.correctAnswer`
(فهارس نصية) — لم يُلمس. AI persistence (indexOf text→index) لم يُلمس. النتائج السابقة سليمة.

## Tests & Validation (مثبتة فعلياً)

| Check | Result |
|---|---|
| vitest full | ✅ **192/192** (+6: عربي/إنجليزي، امتداد هـ/و وA-H، fallback رقمي، negative index، uniqueness) |
| tsc --noEmit | ✅ exit 0 |
| eslint src | ✅ 0 errors, 30 warnings (**−1 baseline**: إزالة fromCharCode القديم نظّف تحذيراً) |

## Production verification

بعد deploy: `/courses` و`/practice` → HTTP 200 (لا انكسار). فحص الأحرف داخل جلسة
اختبار حقيقية يتطلب تسجيل دخول طالب — متبقٍ لصاحب الحسابات (المنطق مغطى باختبار الوحدة مباشرة).

## Notes

- حادثة أثناء التنفيذ: PowerShell أنشأ ملفاً شارداً بمسار خاطئ (`src/components/…`)
  — حُذف فوراً وأُعيد العمل عبر Write/Edit فقط (نفس الدرس الموثق سابقاً).
- placeholders بنك الأسئلة («الخيار أ») تُركت عربية كما هي — UI إداري عربي-first.

---

```text
FIX-4 STATUS:
COMPLETE
```

**STOP — لم تبدأ FIX-5.**
