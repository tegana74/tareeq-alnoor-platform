# FIX_2_STORAGE_RELIABILITY_REPORT

**Date:** 2026-08-24 · **Scope:** منظومة الرفع (فيديو/PDF/ملفات) — Production reliability
**Git:** commit `76fb598` → pushed `main` → Vercel auto-deploy

---

## Root Cause

ثلاث طبقات مثبتة بالتشخيص:
1. `getSupabaseSignedUploadUrl` استخدمت `createSignedUrl` (تنزيل موقّع) بدل `createSignedUploadUrl` → كل PUT يفشل.
2. مسار Buffer يمر الجسم عبر Vercel Serverless (~4.5MB cap) → أي ملف أكبر يُرفض قبل الكود.
3. فرع signed في `/api/upload` كان يستمد الامتداد من `Content-Type` header (قيمة مثل `video/mp4` بلا نقطة → امتداد فارغ → رفض شامل) — عطل كامن لم يظهر لأن المسار كان معطوبًا أصلًا.

## Files changed

| File | Change |
|---|---|
| `src/lib/storage.ts` | `getSupabaseSignedUploadUrl` ← `createSignedUploadUrl(key)` الحقيقية (+ensureBucket)، توقيعها بلا expiry (Supabase upload-sign لا يأخذ مدة) |
| `src/lib/upload-client.ts` | إعادة كتابة: helper نقي `shouldUseSignedUpload(kind,size)` + تدفق signed بـXHR progress + تمرير `name/size` للـroute |
| `src/app/api/upload/route.ts` | الفرع الموقّع: الامتداد من **اسم الملف** (server-authoritative)، فحص حجم معلن ضد حدود kind، أكواد تشخيص داخلية `[UPLOAD_SIGNED_URL_ERROR]/[UPLOAD_STORAGE_ERROR]/[UPLOAD_SIGNED_READ_ERROR]` في سجلات السيرفر فقط، رسائل عميل عربية آمنة كما هي |
| `tests/upload-storage.test.ts` | NEW — 12 اختبار |

Buffer path decision: **أُبقي للملفات الصغيرة ≤4.5MB** (أسرع: round-trip واحد بلا XHR)؛ الفيديو من أي حجم والملفات الأكبر من 4.5MB → signed مباشر. صفر فيديو يعود ليمر عبر Serverless.

## Signed upload implementation

```
Client: shouldUseSignedUpload(kind,size)
  ↓ true
POST /api/upload?kind&mode=signed&name&size   (بدون جسم ملف!)
  ← { uploadUrl, key, url }
PUT uploadUrl (Binary, XHR progress)  ──→ Supabase Storage مباشرة
  ← 200
حفظ record (Video/Book) عبر نفس server actions القائمة
```
- `createSignedUploadUrl(path,{upsert?})` متوفرة في storage-js المضمن (تم التحقق من التوقيع داخل node_modules).
- المفاتيح `randomUUID()+ext` — اسم الملف العربي/المسافات لا يدخل مفتاح التخزين إطلاقًا؛ الامتداد وحده يُشتق منه (lowercased).

## Validation changes

لا تغيير على القواعد: نفس `ALLOWED_*` و`MAX_*` من mime.ts، تُطبق server-side في كلا المسارين (extension من اسم الملف في signed، ومن file.name في buffer). لم تُفتح أنواع جديدة، ولم ترتفع الحدود.

## Security verification

- bucket خاص + signed read عبر `/api/files/[filename]` كما هي — صفر روابط عامة.
- اختبارات: unauth→401 · student-video→403 · exe→400 · oversized→400 · no-ext→400 · الحمولة لا تحتوي service key أو تفاصيل Supabase الداخلية (فشل الإنشاء يرجع رسالة عامة بينما التفاصيل console-only).
- `sanitizeKey` ومسار `/api/files` لم يُمسا.
- CSRF proxy ما زال يمنع POST بلا Origin (ملاحظ حيًا: 403 قبل إضافة Origin — سلوك صحيح).

## Tests

**New:** tests/upload-storage.test.ts — 12 ✅
(عقد createSignedUploadUrl بدل createSignedUrl · null-on-error · مصفوفة التوجيه video/file × أحجام · عقد الاستجابة الثلاثية · اسم عربي → uuid.pdf · 401/403/400s · عدم تسريب secrets عند فشل الإنشاء)

**Full suite:** vitest --no-file-parallelism → **172/172** (160 baseline + 12)

## Local validation

tsc exit 0 · eslint 0 errors / 30 warnings (**−1 vs baseline**: إعادة كتابة upload-client أزالت تحذيرًا قديمًا) · prisma generate ✓ (schema لم يتغير — لا migration)

## Git commit / Vercel deployment

commit `76fb598` pushed to `main` ✓ — Vercel auto-deploy (Build قائم على pipeline المشروع؛ لم يُشغّل محليًا لنفس سبب FIX-1: مفتاح Supabase المحلي placeholder).

## Production verification (مباشر عبر HTTP)

| Check | Result | Evidence |
|---|---|---|
| Endpoint live post-deploy | ✅ | استجابة JSON من /api/upload على الإنتاج |
| Unauthenticated POST (مع Origin) | ✅ 401 `{"error":"يجب تسجيل الدخول"}` | بوابة auth تعمل، رسالة آمنة |
| POST بلا Origin | ✅ 403 (CSRF proxy guard) — سلوك أمني سليم | |
| DB untouched | ✅ `Database schema is up to date!` | migrate status بعد النشر |

### Production authenticated uploads (Test A–G بالنقر)
**متبقية لصاحب الحسابات** (يتطلب login معلم/طالب فعلي): PDF صغير وكبير (>4.5MB)، فيديو <25MB و>25MB (سيستخدم signed دائمًا الآن)، فتح المشغل كمصرح له، ورفض غير المصرح. البنية المؤكدة آليًا تغطي منطق هذه الحالات (routing matrix + route contract + introspection).

## Remaining risks

1. Signed upload URL صالح ~ساعة (سواباس) — إخفاق المستخدم في البدء سريعًا يعيد العملية برفع جديد (keys جديدة، بلا تعارض).
2. حجم الملف في المسار الموقّع «معلَن» من العميل (لا يمكن قياسه pre-upload) — Supabase يفرض حدود bucket الفعلية؛ الرقم يمنع التجاوزات الصريحة فقط.
3. orphan files (رفع ناجح ثم عدم حفظ record) ممكنة كالسابق — تنظيف دوري مقترح لاحقًا.
4. double-submit: keys عشوائية لكل محاولة → لا duplicate records، لكن قد تتعدد نسخ ملفات يتيمة إن ضغط المستخدم مرتين قبل اكتمال الواجهة (الأزرار disabled أثناء pending تخفف ذلك).
5. Authenticated click-through matrix (Test A–G) مؤجل لصاحب الحسابات.

---

```text
FIX-2 STATUS:
COMPLETE
```

**STOP — لم تبدأ FIX-3 (YouTube Hardening).**
