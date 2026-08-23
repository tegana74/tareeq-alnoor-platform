# LIVE_CLASSROOM_PHASE_1_AUDIT — قبل التنفيذ

**Date:** 2026-08-24

## A. معلومات المشروع (الواقعي — لا افتراضات)

| البند | القيمة |
|---|---|
| نوع المشروع | **Next.js 16.3.0 (App Router) + TypeScript** — **ليس Flutter/Dart** (لا يوجد pubspec.yaml إطلاقًا؛ أوامر flutter غير قابلة للتطبيق) |
| Web / Android | PWA (service worker + manifest) · Capacitor 8.5 للأندرويد |
| Backend | Next.js Server Actions + Route Handlers |
| Database | PostgreSQL (Neon) عبر Prisma 7.9.1 + adapter-pg — **لا يوجد RLS** (الحماية server-side في الكود) |
| Authentication | جلسات خاصة (bcrypt + جدول Session + كوكي httpOnly) — `getCurrentUser()` مع select محدود |
| State Management | Server Components + `useActionState`/`useSubmit` للنماذج — لا Redux/Zustand |
| Routing | App Router بمجلدات `(site)/` و`admin/` — لا مكتبة routing خارجية |
| أهم dependencies | Tailwind 4 · lucide-react · zod · vitest 4 |

## B. البنية الحالية (المهمة فقط)

```
src/
├── app/
│   ├── (site)/            # الموقع العام: طالب/معلم/ولي أمر
│   │   ├── live/          # ★ بث مباشر موجود: قائمة + [id] + booking + attendance
│   │   ├── teacher/live/  # ★ جانب المعلم للبث الحالي
│   ├── admin/             # لوحة الأدمن (sidebar)
├── api/                   # progress/exams/practice/upload/files...
├── actions/               # server actions (student-live.ts, teacher-live.ts ...)
├── components/{ui,layout,learning,player}
└── lib/                   # auth · prisma · subscriptions · learning-shell ...
prisma/migrations/         # migrations يدوية متسلسلة بالتاريخ
tests/                     # vitest (160 اختبار قبل هذه المرحلة)
```

## C. نظام الصلاحيات الحالي

`user.role ∈ {ADMIN, TEACHER, STUDENT, PARENT}` من DB عبر الجلسة.
أنماط الحماية المتّبعة: فحص داخل الصفحة (`getCurrentUser` + role + redirect/notFound)
و`requireRole()`، وفحوص ملكية على مستوى الاستعلام (مثل `teacherId === user.teacherId`).
**يُعاد استخدامها كما هي — لا نظام صلاحيات جديد.**

## D. قاعدة البيانات

- Prisma Client singleton (`src/lib/prisma`) — استعلامات مباشرة في pages/actions.
- **لا Repository Pattern ولا service layer رسمية** → التزمت بالأسلوب الحالي:
  `lib/live-classroom/classrooms.ts` دوال خدمية رقيقة فوق prisma (بنمط subscriptions.ts).
- كيانات بث **موجودة فعلًا ويُعاد استخدامها**:
  - `LiveSession` (title, teacherId, courseId?, startAt, durationMinutes, url?, price, isFree, maxCapacity)
  - `SessionBooking` (userId/sessionId/status booked|cancelled) ≈ Participants
  - `LiveSessionAttendance` (userId/sessionId/attendedAt) ≈ Attendance المخزّن
- **لا يوجد أي شيء باسم live_classroom سابقًا** → لا تعارض أسماء.

## E. التنقل — مواضع الإضافة المختارة

- معلم: بطاقة روابط في `(site)/teacher/page.tsx` (نفس نمط بطاقات grading/live) → `/teacher/live-classrooms`
- طالب: زر «القاعات المباشرة» أعلى `/live/page.tsx` → `/live-classrooms`
- صفحة الطالب الحالية `/live` **تبقى كما هي تمامًا**.

## F. المخاطر المحددة قبل التنفيذ

1. تداخل مفاهيمي مع `/live` الحالي → عُولج بفصل مساحات الأسماء (`live-classrooms`) وإعادة استخدام الجلسات لا استنساخها.
2. `LiveSession` بلا حالة/قاعة → توسيع **additive** (عمودان قابلان للفراغ) دون كسر الشيفرة الحالية.
3. قاعدة purity-lint عند استخدام `Date.now()` في RSC → استثناء موثق بسطر واحد.
4. ترميز PowerShell (حادثات سابقة) → التعديلات عبر Write/Edit حصرًا.
