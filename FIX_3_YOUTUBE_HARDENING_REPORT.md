# FIX_3_YOUTUBE_HARDENING_REPORT

**Date:** 2026-08-24 · **Scope:** YouTube support end-to-end (حفظ + عرض) — Vimeo/Bunny/VdoCipher/Gumlet/Upload بدون تغيير
**Git:** commit `a01681d` → pushed `main` → Vercel auto-deploy

---

## Root Cause (مؤكد بالكود)

1. **shorts غير مدعوم**: `video.ts` لا يحتوي نمط `/shorts/<id>` ← يرجع الرابط الخام داخل iframe ← YouTube يرفض.
2. **لا validation عند الحفظ**: `z.string().min(5)` فقط — أي نص يُخزَّن كرابط درس.
3. **raw fallback**: فشل استخراج المعرف كان يُرجع الرابط الخام إلى iframe src.

Vimeo يعمل لأن استخراج معرفه رقمي صارم دائمًا. لا CSP/X-Frame في المشروع (grep صفري) — المتصفح غير متهم.

## Files changed

| File | Change |
|---|---|
| `src/lib/video.ts` | `extractYouTubeId()` بستة أنماط + حارس نطاق youtube/youtu.be + تحقق طول معرف قياسي (11) · `extractVimeoId` · `validateVideoUrl(provider,url)` برسائل عربية · `getVideoEmbedUrl` صارم يرجع **null** بدل الرابط الخام |
| `src/components/player/video-player.tsx` | حالة عرض «رابط الفيديو غير صالح للعرض المدمج» بدل iframe مكسور |
| `src/app/(site)/live/[id]/page.tsx` | يستخدم `extractYouTubeId` — روابط shorts/live تعمل مضمّنة الآن؛ غير القياسي يسقط لزر الرابط الخارجي |
| `src/app/actions/teacher-content.ts` | `validateVideoUrl` في create/update للفيديو (رفض عربي واضح قبل أي كتابة DB) — saveBookAction لم يُمس نهائيًا |
| `tests/video-links.test.ts` | NEW — 14 اختبار |

## Exact behavior after fix

| Input | Save | Embed |
|---|---|---|
| watch?v=ID | ✅ | embed/ID |
| youtu.be/ID | ✅ | embed/ID |
| /shorts/ID | ✅ (**جديد**) | embed/ID |
| /embed/ID · /live/ID · studio | ✅ | embed/ID |
| رابط غير يوتيوب/معرف ≠11 | ❌ رسالة «رابط يوتيوب غير صالح…» | — |
| Vimeo رقمي | ✅ | player.vimeo.com كما كان |
| Bunny/VdoCipher/Gumlet/Upload | بدون تحقق URL (سلوك قائم) | passthrough كما هو |

## Validation & Tests

tsc exit 0 · eslint **0 errors, 30 warnings (−1 baseline)** · vitest --no-file-parallelism → **186/186**
(+14: مصفوفة الروابط الست · رفض non-youtube/طول غير قياسي/نطاق غريب · strict null fallback · vimeo regression · passthrough · validate gate بالعربية)

## Security

لا تسريب: iframe يعرض فقط معرفات مستخرجة من نمط يوتيوب الصارم؛ لا raw URL injection؛ لا تغيير على access rules (player يظهر للمصرح لهم فقط كما كان).

## Production verification

بعد النشر: `/live` و `/courses` → HTTP 200 (لا انكسار). اختبار إدخال رابط فعلي بحساب معلم/طالب متبقٍ لصاحب الحسابات — المنطق مغطى باختبارات المصفوفة الكاملة.

## Remaining risks

1. فيديو يوتيوب صاحبه عطّل التضمين سيرفض داخل iframe (قيد من يوتيوب نفسه، خارج سيطرتنا).
2. معرفات بطول ≠11 (نادرة تاريخياً) ستُرفض الآن — مقصود للتصلب.
3. live/[id] لروابط يوتيوب غير القياسية يسقط لتجربة «فتح خارجي» بدل رسالة خطأ — مقصود لبث اليوتيوب.

---

```text
FIX-3 STATUS:
COMPLETE
```

**STOP — لم تبدأ FIX-4.**
