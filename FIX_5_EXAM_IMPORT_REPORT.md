# FIX_5_EXAM_IMPORT_REPORT

**Date:** 2026-08-25 · **Scope:** استيراد اختبارات من TXT/DOCX/PDF عبر معالج معاينة وتعديل ثم حفظ ذرّي
**Git:** commit `2522386` → pushed `main` → Vercel deployed ✓
**Dependencies added:** `mammoth@1.12.1` · `pdf-parse@2.4.5` (مبررة: لا مكتبات استخراج سابقة)

---

## Root Cause / Existing Architecture (ملخص ما بُني عليه)

- `Question.type` enum: MCQ | ESSAY | AUTO_ESSAY — **TRUE_FALSE يُمثَّل كـMCQ ثنائي الخيارات بدون migration** (قرار موثق).
- التصحيح يقارن فهارس نصية؛ AI يحول نص الإجابة لفهرس — الاستيراد يسلك المسار نفسه.
- الحفظ القديم للـAI كان بلا transaction؛ الاستيراد الجديد يستخدم `$transaction` ذرّياً كما تطلب §23.

## Supported file types & DOC status

| Type | Status |
|---|---|
| .txt | ✅ مباشر utf8 |
| .docx | ✅ mammoth extractRawText (نص خالص، بلا HTML) |
| .pdf | ✅ pdf-parse v2 (`new PDFParse({data}).getText()` + destroy) |
| **.doc** | ❌ **غير مدعوم عمداً** — يُرفض برسالة: «هذا الإصدار من Word غير مدعوم… احفظه بصيغة DOCX أو PDF» |

## Extraction strategy & Parser formats

استخراج in-memory (الملف لا يُخزَّن إطلاقاً ← خصوصية بالتصميم وصفر orphan files).
المحلل النقي يدعم: ترقيم `1.` / `1)` · خيارات بأحرف عربية (أ)ب)ـ) وإنجليزية (A.B.-) ·
«الإجابة / Answer» مع تجاهل «الإجابة النموذجية» (lookahead) · «الدرجة:» ·
TF ضمني (إجابة صح/خطأ بلا خيارات) · TF صريح بسطرين · مقالي بلا إجابة.
تحويل الإجابة: رقم فهرس، حرف (أ/A)، أو مطابقة نص خيار (تسامح همزات/مسافات) — **فهرس فقط يُحفظ**.

## Normalized model & Validation

`ImportedQuestion{order,text,type,options[],correctAnswer:number|null,points,explanation?}`
+ حدود ثابتة `IMPORT_LIMITS`: ≤200 سؤال، ≤1000 حرف سؤال، ≤300 خيار، 2–4 خيارات، نقاط 1–100.
غير الصالح يُجمَع في `invalid[]` بسبب واضح لكل عنصر (لا حذف صامت).

## Preview & UX

معالج من خطوتين داخل صفحة المعلم: رفع (سحب/اختيار، 10MB حد) ← معاينة بعدّادات
MCQ/TF/Essay + تحرير كامل (نص/نوع/خيارات/راديو الإجابة/درجة/حذف) + قائمة غير الصالح +
زر «استيراد الاختبار (N)». زر الدخول: «استيراد من ملف» في محرر الاختبارات.

## Security & Authorization

- Route: auth → TEACHER/ADMIN فقط → extension allowlist server-side → size 10MB → استخراج.
- Action: نفس `ownsSection` (ADMIN أو مالك الكورس عبر session teacherId) + course.isActive
  + re-validation لكل سؤال قبل الكتابة. userId دائماً من الجلسة.
- DOCX يُستخرج كنص خام ولا يُعرض HTML إطلاقاً (منع stored XSS). الملف لا يلمس التخزين.

## Transaction behavior

`prisma.$transaction(async tx => { exam.create; question.createMany })` —
Exam + كل الأسئلة أو لا شيء. الفشل يعيد ok:false برسالة عامة والتفاصيل console-only.

## Tests

**tests/exam-import.test.ts — 23 ✅**: تنسيق A عربي (label→index=3) · B إنجليزي ·
TF ضمني/صريح/إنجليزي · مقالي بنموذجية وبلاها · mixed مع invalid reason («أقل من المطلوب») ·
حد maxQuestions · txt extraction · DOC→LEGACY_DOC · امتدادات · action: نجاح بمعاملة واحدة
(3 صفوف) · ضيف/غير مالك/طالب مرفوضون pre-query · JSON مشوه · مصفوفة فارغة · طول متجاوز ·
توحيد TF→MCQ فهرس "1" · rollback عند فشل DB.

## Validation Results (مثبتة)

```
npx tsc --noEmit                 exit 0
eslint src                       0 errors, 29 warnings (-1 baseline)
vitest --no-file-parallelism     215/215 (192 baseline + 23)
prisma generate                  n/a (schema unchanged)
migrate status                   up to date
```

## Git / Vercel

commit `2522386` (9 files, +1600/−1) pushed `main` ✓ · Vercel auto-deploy ✓
Prod smoke: POST `/api/exams/import/extract` unauth → **401** JSON آمن ✓ (live)

## Known limitations

1. `.doc` legacy غير مدعوم (رسالة تحويل) — يتطلب محرك خارجي مستقبلاً إن لزم.
2. docx/pdf runtime click-through بحساب معلم مؤجل لصاحب الحسابات (الكود مغطى unit-wise؛ txt مغطى end-to-end).
3. حجم معلن في signed-less flow قابل للتزييف نظرياً لكنه هنا قراءة كاملة للبايتات فعلياً — الحد 10MB مفروض على الجسم الفعلي.
4. لا background queue: ملفات ضخمة (>10MB) تُرفض مقدماً بدل timeout.
5. flakiness متوازٍ محلي معروف (`--no-file-parallelism`).

## Recommended next phase

FIX-6 AI Expansion (أنواع ولغة) ثم FIX-7 Live Room Shell — كما في خطة التشخيص.

```text
FIX-5 STATUS:
COMPLETE
```

**STOP — لم تبدأ FIX-6.**
