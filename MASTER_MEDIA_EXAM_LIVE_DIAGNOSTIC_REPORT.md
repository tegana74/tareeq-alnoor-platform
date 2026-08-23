# MASTER_MEDIA_EXAM_LIVE_DIAGNOSTIC_REPORT
## منصة طريق النور — تشخيص شامل (YouTube · الرفع · الاختبارات · البث)

**Date:** 2026-08-24 · **Mode:** تشخيص فقط — صفر تعديلات كود

---

## 1. Executive Summary

| # | المشكلة | الحالة | Root Cause | Severity |
|---|---------|--------|-----------|----------|
| 1 | YouTube لا يعمل | محدد بالكود | محلل video.ts ينقصه نمط shorts + حفظ بلا تحقق صيغة (min 5 حروف فقط) ← رابط غير قابل للتضمين يُحقن في iframe | P1 |
| 2 | رفع فيديو | محدد — خللان مستقلان | (أ) getSupabaseSignedUploadUrl يستدعي createSignedUrl وهي واجهة تنزيل موقّع بدل createSignedUploadUrl ← PUT يفشل لكل فيديو أكبر من 25MB. (ب) مسار Buffer يتجاوز حد Vercel body نحو 4.5MB ← فشل أي ملف أكبر في الإنتاج | P0 |
| 3 | رفع PDF | محدد | نفس عطل الرفع ب: ملفات أكبر من 4.5MB عبر buffer تُرفض في الإنتاج؛ الأصغر يعمل | P0 |
| 4 | Vimeo يعمل | مرجع سليم | استخراج رقمي صارم لمعرف الفيديو ← رابط مشغل صالح دائمًا؛ نفس iframe/الوصول — الفرق كله في صلاحية الرابط الناتج | — |
| 5 | الاختبار اليدوي | سليم وظيفيًا | الأحرف تولد وقت العرض (مصفوفة أ ب ج د) والتصحيح يقارن الفهرس الرقمي — التعريب أو الإنجلة آمنان بلا مساس للدرجات | P2 |
| 6 | استيراد اختبارات | جاهزية محددة | لا مكتبات استخراج نص مثبتة (mammoth وpdf-parse غائبتان)؛ الـschema يمثل الأنواع الثلاثة بدون migration عبر TRUE_FALSE كـMCQ ثنائي الخيارات | P2 |
| 7 | AI Generator | يعمل وقابل للتوسيع | يحفظ MCQ فقط ويحول الإجابة الصحيحة نصا←فهرس؛ إضافة True/False/Essay/Mixed/اللغة توسيع منخفض الخطورة | P2 |
| 8 | البث المباشر | محدد — سببان | أ: لا محرك بث إطلاقا — الغرفة iframe يوتيوب مؤقت زمنيا أو رابط Zoom/Meet خارجي؛ جدولة فيديو عادي كمباشر يعطي شاشة فارغة داخل النافذة. ب: صفحات live-classrooms الجديدة تحطم على prod بسبب migration غير مطبق (تقرير FIX المنفصل) | P0/P1 |

---

## 2. Root Cause التفصيلي

### العطل 1 — YouTube
Observed: فشل عام عند الطالب والمعلم بينما Vimeo يعمل للطرفين.
Expected: أي رابط يوتيوب صالح يُضمن ويعمل.
Actual Flow: حفظ (تحقق طول فقط) ← DB provider=YOUTUBE والرابط كما دخل ← عرض عبر getVideoEmbedUrl ← iframe.
Failure Point: src/lib/video.ts أسطر 5-14. الأنماط المغطاة: watch?v= وyoutu.be وembed وstudio وlive. غير المغطى: مسار shorts ← لا معرف ← ترجع الدالة الرابط الخام داخل iframe ← يوتيوب يرفض التضمين.
إضافة: saveVideoAction يتحقق بطول 5 حروف فقط لأي مزود — لا تحقق صيغة، فتُخزَّن روابط معطوبة.
Root Cause: فجوات normalization/embed-generation + غياب validation وقت الحفظ.
Evidence: مقارنة Vimeo الصارمة مقابل اليوتيوب؛ وgrep صفري لأي CSP أو X-Frame-Options في المشروع كله ← المتصفح وسياساته غير متهمة.
Affected Files: src/lib/video.ts · src/app/actions/teacher-content.ts · كل مستهلكي embed.
Security Risk: لا يوجد.
INSUFFICIENT EVIDENCE: رسالة خطأ متصفح الطالب الفعلية لكل حالة (تحتاج console من جهته) — لكن مسار الفشل بالكود مؤكد.

### العطل 2 — Video Upload
Failure Points (كل منها كافٍ):
1. storage.ts سطر 51: getSupabaseSignedUploadUrl يستخدم createSignedUrl (تنزيل موقّع) بدل createSignedUploadUrl. upload-client.ts:14 يوجه كل فيديو أكبر من 25MB لهذا المسار تلقائيا ← PUT على رابط قراءة ← رفض سواباس.
2. Buffer path: حد جسم الطلب في Vercel serverless نحو 4.5MB ولا vercel.json ولا sizeLimit ← أي فيديو أكبر من 4.5MB يُرفض قبل الكود (يعمل محليا فقط).
Security Risk: لا (kind=video يتطلب TEACHER أو ADMIN).
Fix: الواجهة الحقيقية للرفع الموقّع + توجيه كل الفيديوهات إليها + رفع الحد أو إلغاء buffer نهائيا.

### العطل 3 — PDF Upload
نفس العطل 2-ب. الامتداد pdf وapplication/pdf مسموحان في mime.ts، والعرض عبر api/files سليم. مرحلة الفشل: upload وليس save أو view.

### العطل 4 — مقارنة طبقة بطبقة
Validation عند الحفظ متطابق (ضعيف للاثنين) · Parser مختلف كما فوق · Embed الناتج هو نقطة الاختلاف الوحيدة · Player وiframe وCSP وAccess متطابقة تماما.

### العطل 5 — Manual Exams
options مخزنة Json نصوص، correctAnswer فهرس نصي، runner يرسل فهرسا. Labels وقت العرض فقط (runner سطر 207 مصفوفة عربية، QuestionEditor منCharCode عربي).
القرار: helper واحد يعتمد لغة السياق وقت العرض — لا تخزين، تأثير تصحيح = صفر، existing exams سليمة.

### العطل 6 — Import Feasibility
A/B: لا parser ولا مكتبات (لا mammoth ولا pdf-parse في package.json). خيار بلا dependencies جديدة: لصق نص يدوي. خيار بمكتبات: mammoth لdocx وpdf-parse لpdf وtxt أصلي.
D: المدعوم حاليا MCQ وESSAY وAUTO_ESSAY. TRUE_FALSE بدون migration = MCQ بخياري صح/خطأ وصحيح=فهرس. قيمة enum أصلية تتطلب تعديل enum فقط.

### العطل 7 — AI Generator
المسار: route ينظف fences ويرجع JSON ← ai-generator يعرض ← saveAIQuestionsAction يستقبل questions JSON ويتحقق ownsSection ثم indexOf يحول النص لفهرس ثم إنشاء exam وأسئلة MCQ بنقاط حسب difficulty. نفس جدول Question لليدوي والألي.
التوسيع الآمن: True/False كـMCQ ثنائي، Essay عبر type موجود والمحرك يدعم تسليمه للمصحح، Mixed بدمج، اللغة بارامتر prompt.

### العطل 8 — Live Streaming
Flow: teacher-live ينشئ LiveSession بعناصر startAt وdurationMinutes وurl ← /live و[id] للطالب ← BookingPanel للمدفوع ← الغرفة iframe يوتيوب بشرط زمني (startAt حتى زائد المدة) أو زر خارجي Zoom/Meet ← MarkAttendance مستقل.
Failure Point: لا WebRTC ولا LiveKit ولا HLS ولا Mux ولا Daily ولا Jitsi ولا Agora ولا Zoom-embed ولا WebSocket (grep صفري). جدولة فيديو عادي كمباشر = مشغل فارغ خلال النافذة. وصفحات live-classrooms الجديدة تحطم بسبب migration غير مطبق (خارج هذا القسم — بتقرير FIX).
إضافة: لا حالة بدء/إنهاء server-side للمعلم؛ الزمن هو الحكم الوحيد.
---

## 3. Cross-System Root Causes

| الطبقة المشتركة | من تُصيب | الدليل |
|---|---|---|
| A. Migrations غير مطبقة على الإنتاج (5) | live-classrooms crash · زر تمت القراءة · نتائج وتصحيح (عمود isResultPublished) · الأداء | ناتج prisma migrate status الحاسم |
| B. Upload pipeline مزدوج الخلل (signed خاطئ + Vercel body cap) | فيديو + PDF معا | storage.ts سطر 51 + غياب vercel.json |
| C. Provider-URL gaps (shorts وغياب تحقق) | YouTube حصرا | video.ts مقابل Vimeo الصارم |
| D. غياب طبقة البث (حد تصميمي للمرحلة 1) | البث كله | grep صفري لأي محرك |
| E. مفتاح Supabase المحلي placeholder | يمنع build وE2E محليا فقط | طول القيمة 2 |

الخلاصة: لا نقطة فشل واحدة تشرح الكل — لكن A يفسر انهيار live-classrooms، وB يفسر عطلَي الرفع معا، بينما YouTube مستقل تحت C.

## 4. Priority Matrix

- P0: FIX-A تطبيق الـ5 migrations على الإنتاج (live-classrooms + book-read + النتائج معطلة الآن)
- P0: FIX-B إصلاح signed upload الحقيقي + تجاوز body cap
- P1: FIX-C YouTube extractor شامل + validation عند الحفظ
- P1: FIX-D غرفة بث هيكلية + حالة جلسة server-side (تمهيد المحرك)
- P2: FIX-E exam labels i18n helper
- P2: FIX-F import wizard (بعد قرار استراتيجية الاستخراج)
- P2: FIX-G AI أنواع متعددة ولغة
- P3: تسجيل، سبورة، تحليلات موسعة

## 5. Recommended Fix Phases

FIX-1 Prod Schema Sync — migrate deploy ثم status verification. لا كود.
FIX-2 Storage Reliability — createSignedUploadUrl الحقيقي، توجيه كل الفيديوهات للـsigned، مراجعة sizeLimit.
FIX-3 YouTube Hardening — extractor شامل + validation حفظ برسائل عربية.
FIX-4 Exam Labels i18n — helper عرض فقط بلا مساس بالتصحيح.
FIX-5 Import Wizard — استخراج نص ومعاينة ثم نفس pipeline الحفظ الحالي.
FIX-6 AI Expansion — أنواع ولغة عبر prompt ومapping مع zod صارم.
FIX-7 Live Room Shell — صفحة غرفة بحالات waiting/ended + أزرار حالة عبر transitions المعرفة.
FIX-8 E2E Production Verification — smoke بعد كل deploy.

## 6. OpenCode Implementation Prompts

### PROMPT FIX-1 Prod Schema Sync
Goal: تطبيق المايجريشنز المعلقة بأمان. Files: لا كود؛ أوامر فقط (migrate deploy/status). Guards: ممنوع db push وممنوع تعديل migrations موجودة. Tests: status up-to-date ثم smoke للمسارات المتأثرة.

### PROMPT FIX-2 Storage Reliability
Goal: رفع موثوق لكل الأحجام. Expected files: src/lib/storage.ts، src/lib/upload-client.ts، /api/upload اختياري، vercel.json اختياري. Guards: عدم تغيير contracts، بقاء kind-guards، لا روابط عامة. Tests: unit للروابط الموقعة (upload vs read) وmock e2e لحجم 4.5MB+ و25MB+.

### PROMPT FIX-3 YouTube Hardening
Goal: extractor شامل + validation حفظ. Files: src/lib/video.ts (+tests)، teacher-content.ts. Guards: Vimeo وBunny وVdoCipher كما هي؛ لا CSP جديد إلا بالقياس. Tests: مصفوفة روابط watch/short/youtu.be/embed/live/studio/رابط خاطئ برسائل عربية.

### PROMPT FIX-4 Exam Labels i18n
Goal: helper أ ب ج د / A B C D وقت العرض. Files: runner وQuestionEditor وresult page وlib جديد. Guards: correctAnswer يظل فهرسا؛ لا migration. Tests: لغتان + regression تصحيح.

### PROMPT FIX-5 Import Wizard
Goal: استيراد MCQ/TRUE_FALSE كـMCQ2/ESSAY من docx/pdf/txt مع معاينة قبل الحفظ عبر saveAIQuestionsAction نفسه. New deps مبررة: mammoth وpdf-parse. Files: actions/import-exam.ts + wizard client. Tests: fixtures ثلاثة + حدود حجم + أخطاء تنسيق.

### PROMPT FIX-6 AI Expansion
Goal: أنواع متعددة ولغة. Files: api/ai/generate-questions/route.ts وai-generator.tsx وmapping في teacher-content.ts. Guards: zod صارم على المخرجات؛ لا مساس بالمحرك. Tests: contract + persistence لكل نوع.

### PROMPT FIX-7 Live Room Shell
Goal: صفحة غرفة بحالات waiting/ended وأزرار حالة للمعلم عبر SESSION_STATUS_TRANSITIONS. Files: lib/live-classroom/* وصفحات [id]. Guards: لا media layer؛ booking وattendance كما هما. Tests: مصفوفة انتقالات + وصول.

ملاحظة: لا Prompt إصلاح نهائي إضافي لليوتيوب أو الرفع إلا بعد تأكيد runtime من console المتصفح لحالات خارج المصفوفة الموثقة أعلاه.

---

DIAGNOSTIC STATUS:
COMPLETE
