# دليل بناء تطبيق الموبايل - طريق النور

## المتطلبات

### للأندرويد:
- Android Studio (يُحمّل من https://developer.android.com/studio)
- Java JDK 17 أو أعلى
- Android SDK (يأتي مع Android Studio)

### للآيفون:
- Mac مع macOS Ventura أو أعلى
- Xcode 15 أو أعلى (من App Store)
- Apple Developer Account (مدفوع - $99/سنة)

---

## البناء

### 1. بناء التطبيق للويب أولاً:
```bash
npm run build
```

### 2. مزامنة Capacitor:
```bash
npm run mobile:sync
```

### 3. فتح المشروع في IDE:

**للأندرويد:**
```bash
npm run mobile:open:android
```
سيفتح Android Studio مع المشروع.

**للآيفون:**
```bash
npm run mobile:open:ios
```
سيفتح Xcode مع المشروع.

### 4. بناء APK (للأندرويد):
```bash
npm run mobile:build:android
```
سيتم بناء APK في: `android/app/build/outputs/apk/debug/app-debug.apk`

### 5. بناء للآيفون:
من Xcode: Product → Archive

---

## إعداد أيقونة التطبيق (App Icon)

### للأندرويد:
1. افتح Android Studio
2. اذهب إلى `app/src/main/res/`
3. ضع الأيقونات في المجلدات المناسبة:
   - `mipmap-mdpi` (48x48)
   - `mipmap-hdpi` (72x72)
   - `mipmap-xhdpi` (96x96)
   - `mipmap-xxhdpi` (144x144)
   - `mipmap-xxxhdpi` (192x192)

### للآيفون:
1. افتح Xcode
2. اذهب إلى `Assets.xcassets/AppIcon`
3. ضع الأيقونات بالحجم المناسب

---

## إعداد Splash Screen

### للأندرويد:
- `android/app/src/main/res/drawable/splash.png` (1080x1920)

### للآيفون:
- `ios/App/App/Assets.xcassets/Splash.imageset/`

---

## النشر

### Google Play:
1. بناء Release APK أو AAB
2. تسجيل حساب مطور Google Play ($25 مرة واحدة)
3. رفع التطبيق على Google Play Console

### App Store:
1. بناء Archive من Xcode
2. رفع على App Store Connect
3. انتظار المراجعة من Apple (1-7 أيام)

---

## ملاحظات مهمة

1. **الرابط الأساسي**: التطبيق يحمل من `https://www.tareeq-alnoor.online`
2. **OTA Updates**: يمكن تحديث المحتوى بدون تحديث التطبيق
3. **Offline**: 일부 الصفحات تعمل بدون إنترنت بفضل Service Worker
4. **Notifications**: يمكن إضافة إشعارات لاحقاً باستخدام `@capacitor/push-notifications`
