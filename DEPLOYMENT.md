# دليل النشر — منصة طريق النور

دليل عملي لنشر المنصة على خادم إنتاجي (Node.js).

## المتطلبات

- Node.js 20+ (يُنصح بـ 22 LTS)
- npm

## خطوات النشر الأساسية

```bash
# 1) تثبيت الاعتماديات
npm install

# 2) إعداد متغيرات البيئة
cp .env.example .env
# عدّل .env حسب بيئتك (انظر جدول المتغيرات أدناه)

# 3) تجهيز قاعدة البيانات
npm run db:generate      # توليد عميل Prisma
npm run db:deploy        # تطبيق ترحيلات قاعدة البيانات
npm run db:seed          # (اختياري) بيانات أولية للعرض

# 4) التحقق من الأنواع وبناء الإنتاج
npm run typecheck
npm run build

# 5) تشغيل الخادم
npm run start
```

يفتح التطبيق على `http://localhost:3000` (عدّل المنفذ بـ `PORT` أو خلف وكيل عكسي).

## جدول متغيرات البيئة

| المتغير | الوصف | مثال |
| --- | --- | --- |
| `DATABASE_URL` | رابط قاعدة البيانات (SQLite أو MySQL) | `file:./dev.db` أو `mysql://u:p@h:3306/db` |
| `ALLOWED_ORIGINS` | أصول مسموح بها لطلبات التعديل (CSRF)، مفصولة بفواصل | `https://tariqnoor.com` |
| `ALLOW_ORIGINLESS` | السماح بطلبات POST بلا Origin (`true` للإنتاج خلف بعض البروكسيات) | `false` |
| `RECAPTCHA_SECRET` | مفتاح reCAPTCHA v2 سري (فارغ = معطل) | |
| `SMS_PROVIDER` | مزود الرسائل: `console` / `webhook` / `twilio` | `console` |
| `SMS_WEBHOOK_URL` | عنوان webhook يستقبل `{to, text}` عند اختيار `webhook` | |
| `SMS_TWILIO_SID/AUTH/FROM` | إعدادات Twilio عند اختيار `twilio` | |

## التحويل من SQLite إلى MySQL

التطبيق يعمل افتراضياً على SQLite (ملف واحد، بدون إعداد) وهو مناسب للتثبيت أحادي الخادم.
لبيئة إنتاج أكبر يُنصح بـ MySQL:

1. **ثبّت محرك MySQL**: `npm install @prisma/adapter-mariadb`
2. **عدّل `prisma/schema.prisma`**: غيّر سطر `provider = "sqlite"` إلى `provider = "mysql"`.
3. **عدّل `src/lib/prisma.ts`**: استخدم محول `PrismaMariadb` (لأسماء السيرفرات) بدلاً من `PrismaBetterSqlite3`.
4. **اضبط `DATABASE_URL`**: `mysql://USER:PASSWORD@HOST:3306/tariq_noor`
5. **أعد التوليد والترحيل**: `npm run db:generate && npm run db:deploy`
6. **انقل البيانات**: استخدم أداة تصدير/استيراد (مثل `mysqldump` + التحويل، أو سكربت جلب من SQLite).

ملاحظات:
- جميع النماذج تستخدم أنواع قياسية (Decimal/Int/String/DateTime) متوافقة مع MySQL.
- راقب فهارس الجداول الكبيرة (`users.phone`, `otp_codes.phone+purpose`, `sessions.token`).

## الأمان

- **CSRF**: طبقة `src/proxy.ts` ترفض أي طلب تعديلي من أصل مختلف. اضبط `ALLOWED_ORIGINS` بعنوان موقعك.
- **تسجيل الدخول**: حد أقصى 5 محاولات فاشلة لكل رقم خلال 15 دقيقة، و3 أكواد OTP لكل رقم كل 5 دقائق، و5 محاولات تحقق لكل كود.
- **reCAPTCHA**: فعّله بوضع `RECAPTCHA_SECRET`؛ سيُطلب تأكيد في التسجيل وإرسال الكود.
- **الكوكيز**: الجلسة `httpOnly` و `secure` تلقائياً في وضع الإنتاج.
- **SMS**: استخدم مزوداً حقيقياً في الإنتاج (`webhook` أو `twilio`) بدلاً من `console` الذي يطبع الأكواد في السجل.

## النسخ الاحتياطي

- SQLite: انسخ ملف قاعدة البيانات (`dev.db`) يومياً، أو استخدم `sqlite3 dev.db ".backup backup.db"`.
- MySQL: `mysqldump -u USER -p tariq_noor > backup.sql`

## نشر خلف وكيل عكسي (Nginx/Caddy)

وجّه الطلبات إلى `127.0.0.1:3000` وأضف:
- `X-Forwarded-For` و `X-Real-IP` (المستخدمة في تحديد معدل الطلبات).
- عنوان Origin للوكيل يجب أن يكون في `ALLOWED_ORIGINS` أو مطابقاً لـ `Host`.

## البنية النهائية (حالة المشروع)

المنصة تغطي: المصادقة عبر OTP، الكورسات والمحاضرات (فيديو/كتب)، البنك الأسئلة، الامتحانات (تصحيح MCQ تلقائي + مراجعة مقالي + تظلمات)، خطة المذاكرة، الإشعارات، المجتمع، الجلسات المباشرة، المحفظة والاشتراكات والكوبونات وأكواد الشحن، المتجر ومنافذ البيع، لوحات (الطالب/المدرس/ولي الأمر/الإدارة)، إعدادات النسب وشكل صور المدرسين، وإدارة البنية التعليمية (سنوات/شعوب/مواد)، وطلبات الإعفاء.
