# FIX-7 — Live Room Shell Report

## Root Cause / Existing Architecture

كان نظام البث المباشر الحالي يعتمد كلياً على **حساب الوقت** لتحديد حالة الجلسة (مباشر / منتهي / لم يبدأ)، بدون أي تحكم فعلي من المعلم لبدء أو إنهاء البث عبر واجهة تفاعلية. حقل `status` في جدول `LiveSession` كان يُنشأ بقيمة `scheduled` ولا يتغير أبداً.

كذلك لم تكن هناك حماية كافية على تسجيل الحضور: كان يمكن تسجيل حضور الطالب بمجرد فتح الصفحة خلال النافذة الزمنية دون التحقق من أن المعلم قد بدأ البث فعلاً (أي أن `status = "live"` في قاعدة البيانات).

---

## الملفات المعدلة

| الملف | نوع التغيير | الوصف |
|-------|------------|-------|
| `src/app/actions/teacher-live.ts` | تعديل | إضافة `updateLiveSessionStatusAction` لتغيير حالة الجلسة مع فحص الصلاحيات وقيود الانتقال |
| `src/app/api/live/[id]/attend/route.ts` | تعديل | تحديث API لمنع تسجيل الحضور خارج حالة `live` أو خارج الوقت الزمني أو لحساب غير مصرح |
| `src/app/(site)/live/[id]/page.tsx` | تعديل | تبسيط الصفحة لتصبح Server Component تقوم بالتحقق الأولي وتمرير البيانات لـ Client Component |

## الملفات الجديدة

| الملف | الوصف |
|-------|-------|
| `src/app/(site)/live/[id]/live-room-client.tsx` | Client Component تفاعلي لغرفة البث: يعرض Shell views مختلفة (scheduled, waiting, live, ended, cancelled) + لوحة تحكم المعلم + Polling خفيف للحالة |
| `src/app/api/live/[id]/status/route.ts` | API route خفيف (GET) لجلب حالة الجلسة والصلاحيات والحضور للـ Polling |
| `tests/live-room-shell.test.ts` | 13 اختباراً شاملاً لانتقالات الحالة والصلاحيات والحضور |

---

## حالات الجلسة المدعومة (Session States)

تم الحفاظ على جميع الحالات المعرّفة مسبقاً في `LIVE_SESSION_STATUSES`:
- **scheduled** → الجلسة مجدولة، تظهر عداد تنازلي
- **waiting** → المعلم يستعد، تظهر شاشة انتظار متحركة
- **live** → البث مباشر، يظهر مشغل الفيديو أو رابط البث الخارجي + تسجيل الحضور التلقائي
- **ended** → انتهى البث، تظهر شاشة الانتهاء
- **cancelled** → تم إلغاء الجلسة، تظهر شاشة الإلغاء
- **recording** → محجوزة للمراحل المستقبلية (لم تُفعّل)
- **archived** → محجوزة للمراحل المستقبلية (لم تُفعّل)

---

## Teacher Controls (لوحة تحكم المعلم)

المعلم المالك أو الأدمن يستطيع:
- `scheduled → waiting` (بدء وضع الانتظار)
- `scheduled → live` (بدء البث المباشر مباشرة)
- `scheduled → cancelled` (إلغاء الجلسة)
- `waiting → live` (بدء البث من وضع الانتظار)
- `waiting → cancelled` (إلغاء من وضع الانتظار)
- `live → ended` (إنهاء البث)

جميع الانتقالات محمية بـ `canTransitionSessionStatus` من `src/lib/live-classroom/types.ts`.

---

## Status Polling

- يقوم Client Component بعمل Polling خفيف كل **6 ثوانٍ** على `/api/live/[id]/status`
- يعيد الـ API: `{ status, isLive, isPast, canWatch, attended, url }`
- عند تغيير الحالة من المعلم، ينعكس التحول عند جميع الطلاب خلال ثوانٍ

---

## Attendance (الحضور)

تم الحفاظ على نظام الحضور الحالي مع تعزيزات أمنية:
- **منع تسجيل الحضور** إذا كانت حالة الجلسة ليست `live` في قاعدة البيانات
- **منع تسجيل الحضور** خارج النافذة الزمنية الفعلية (`startAt` إلى `startAt + durationMinutes`)
- **منع تسجيل الحضور** للطالب غير المحجوز في الحصة المدفوعة
- تسجيل الحضور يتم تلقائياً عند دخول الطالب أثناء البث المباشر

---

## Authorization (الصلاحيات)

| الدور | الوصول | تغيير الحالة |
|-------|--------|-------------|
| Guest (غير مسجل) | ❌ يُحوّل لـ `/login` | ❌ |
| طالب مشترك بالكورس | ✅ مشاهدة | ❌ |
| طالب محجوز (حصة مدفوعة) | ✅ مشاهدة | ❌ |
| طالب غير مشترك/محجوز | ❌ يُحوّل لـ `/` | ❌ |
| معلم مالك الجلسة | ✅ مشاهدة + لوحة تحكم | ✅ |
| معلم آخر | ❌ إذا لم يكن مشتركاً | ❌ |
| Admin | ✅ مشاهدة + لوحة تحكم | ✅ |

---

## Media Engine

**MEDIA ENGINE: NOT PRESENT** — لم يُضف أي محرك بث (لا WebRTC، لا LiveKit، لا Mux، لا Daily، لا Jitsi، لا Agora). البث يعتمد على تضمين YouTube أو رابط خارجي (Zoom/Meet) كما كان سابقاً.

---

## Database

**NO MIGRATION REQUIRED** — لم يُعدّل `prisma/schema.prisma`. جميع التغييرات تعمل ضمن الهيكل الحالي.

---

## الاختبارات

تم إنشاء `tests/live-room-shell.test.ts` يحتوي على **13 اختباراً**:
- انتقالات حالة الجلسة (صالحة وغير صالحة)
- صلاحيات تغيير الحالة (معلم مالك / أدمن / معلم أجنبي / طالب)
- API الـ status polling (طالب مصرح / غير مصرح)
- API الحضور (أثناء البث / خارج الحالة / خارج الوقت / حصة مدفوعة غير محجوزة)

**نتائج التشغيل:**
- `npx tsc --noEmit` → **PASS** (0 errors)
- `npx eslint src` → **PASS** (0 errors, 29 warnings = baseline)
- `npx vitest run --no-file-parallelism` → **260/260 passed** (247 سابقة + 13 جديدة)
- `npm run build` → **PASS** (49 routes compiled successfully)

---

## Git Commit

```
feat: live room shell with status transitions and teacher controls

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Vercel Deployment

- تم دفع الكود لـ `origin/main` بنجاح
- البناء الإنتاجي المحلي يمر بنجاح تام
- الـ route الجديد `/api/live/[id]/status` ظهر في قائمة البناء

---

## Production Verification

- المعلم: لوحة التحكم تظهر أزرار بدء الانتظار/البث/الإنهاء/الإلغاء حسب الحالة
- الطالب المحجوز: يرى الشاشة المناسبة لكل حالة مع تحديث تلقائي عبر Polling
- الطالب غير المشترك: يُحوّل تلقائياً للصفحة الرئيسية
- الحضور: يُسجل تلقائياً فقط عندما تكون الحالة `live` وخلال النافذة الزمنية

---

## Remaining Risks

1. **Polling delay**: قد يتأخر الطالب في رؤية تغيير الحالة حتى 6 ثوانٍ (مقبول لـ Shell بدون WebSocket)
2. **No Media Engine**: البث يعتمد على روابط خارجية فقط — المحرك الفعلي يأتي في مرحلة مستقبلية

---

## Final Status

**COMPLETE**

---
Co-Authored-By: Claude <noreply@anthropic.com>
