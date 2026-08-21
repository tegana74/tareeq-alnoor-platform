# PROJECT_AUDIT.md — Tareeq Alnoor Platform

**Audit Date:** 2026-08-22
**Auditor:** Senior Software Architect (AI)
**Status:** AUDIT ONLY — No code changes made

---

## A. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.3.0 (App Router) |
| Language | TypeScript (strict mode disabled, `ignoreBuildErrors: true`) |
| ORM | Prisma 7.9.1 |
| Database | PostgreSQL (Neon) via `@prisma/adapter-pg` + `pg` |
| Auth | Custom session-based (bcrypt + DB sessions + httpOnly cookies) |
| File Storage | Supabase Storage (public bucket) |
| AI | Google Generative AI (`@google/generative-ai` — gemini-3.6-flash) |
| CSS | Tailwind CSS 4 |
| Mobile | Capacitor 8.5 (Android + iOS) |
| PWA | Custom service worker + manifest |
| Hosting | Vercel |
| SMS | Console/Webhook/Twilio (configurable via `SMS_PROVIDER`) |
| Bot Protection | reCAPTCHA v2 (optional, disabled if no secret) |

---

## B. Project Structure

```
D:\hussian\
├── src/
│   ├── app/
│   │   ├── (site)/              # Public + student/teacher/parent pages
│   │   │   ├── page.tsx         # Home
│   │   │   ├── login/           # Login (OTP + direct)
│   │   │   ├── register/        # Register
│   │   │   ├── courses/         # Course browsing + detail + sections
│   │   │   │   └── [id]/sections/[sectionId]/
│   │   │   │       ├── exam/[examId]/   # Exam intro/take/result
│   │   │   │       ├── video/[videoId]/
│   │   │   │       └── book/[bookId]/
│   │   │   ├── teacher/         # Teacher dashboard + content management
│   │   │   ├── parent/          # Parent dashboard
│   │   │   ├── practice/        # Question bank practice
│   │   │   ├── results/         # Student analytics
│   │   │   ├── wallet/          # Wallet + charge
│   │   │   ├── store/           # Points store
│   │   │   ├── appeals/         # Student appeals
│   │   │   ├── exemptions/      # Exemption requests
│   │   │   ├── profile/         # User profile
│   │   │   ├── notifications/   # Notification feed
│   │   │   ├── favorites/       # Favorite courses
│   │   │   ├── bookmarks/       # Saved videos/books
│   │   │   ├── live/            # Live sessions
│   │   │   └── store-locator/   # Physical store locations
│   │   ├── admin/               # Admin panel (16 routes)
│   │   │   ├── users/           # Student management
│   │   │   ├── teachers/        # Teacher management
│   │   │   ├── courses/         # Course management
│   │   │   ├── structure/       # Years/departments/subjects
│   │   │   ├── payments/        # Invoice review
│   │   │   ├── coupons/         # Coupon management
│   │   │   ├── settings/        # Platform settings
│   │   │   └── ...
│   │   ├── api/                 # API routes (10+)
│   │   └── actions/             # Server actions (20+)
│   ├── components/              # UI components (18 files)
│   ├── lib/                     # Shared utilities
│   └── generated/prisma/        # Prisma client (auto-generated)
├── prisma/
│   ├── schema.prisma            # 829 lines, 47 models
│   └── migrations/              # 1 migration
├── public/                      # Static assets + PWA files
├── android/ + ios/              # Capacitor mobile apps
├── capacitor.config.ts
└── package.json
```

---

## C. Current Features

| Feature | Status | Notes |
|---|---|---|
| User registration (Student/Parent) | ✅ Working | Phone + password + Zod validation |
| Login (Direct) | ✅ Working | Phone + password, no rate limiting |
| Login (OTP) | ⚠️ Dead code | Full implementation exists but login form calls `directLoginAction` instead |
| Forgot password | ✅ Working | OTP-based reset |
| Course browsing | ✅ Working | Filterable by year/subject/teacher |
| Course enrollment (payment) | ✅ Working | Vodafone Cash / InstaPay / Wallet |
| Video lessons | ✅ Working | Upload/YouTube/Vimeo/VdoCipher/Bunny/Gumlet |
| PDF books | ⚠️ Partially working | Supabase public URLs bypass access control |
| Exams & quizzes | ⚠️ Partially working | Black screen issues recently fixed; AI-generated exams working |
| Question bank practice | ✅ Working | Chapter-based random question generation |
| AI question generation | ⚠️ Working but unauthenticated | Anyone can call the API |
| Live sessions | ✅ Working | Booking, attendance, Zoom/YouTube integration |
| Wallet system | ⚠️ Race conditions | Balance double-spend possible under concurrency |
| Payment proof upload | ✅ Working | Admin review flow |
| Points store | ✅ Working | Redeem items for subscription days |
| Coupon system | ✅ Working | Percentage/fixed discounts |
| Insert codes | ⚠️ Race condition | Double-redemption possible |
| Student results & analytics | ✅ Working | Per-subject averages, weak points |
| Essay grading | ✅ Working | Teacher grading with appeal system |
| Parent-child linking | ✅ Working | OTP-based linking |
| Notifications | ✅ Working | In-app only |
| SEO (sitemap, meta) | ⚠️ Broken | Sitemap queries non-existent models |
| PWA | ✅ Working | Manifest, service worker, install button |
| Mobile apps | ✅ Working | Capacitor Android + iOS |
| Store locator | ✅ Working | Physical branch locations |
| Exemption requests | ✅ Working | Student submit, admin review |
| Community | ❌ Removed | Deleted in earlier sprint |

---

## D. Database Schema

**47 models** across these domains:

### Users & Auth (8 models)
- `User` (phone @unique, password, role, walletBalance, points)
- `Session` (token @unique, userId, expiresAt)
- `OtpCode` (phone, code, purpose, expiresAt, attempts)
- `LoginAttempt` (phone, ip, success)
- `ParentChildLink` (parentId, childId)
- `Notification` (userId, title, body, link, isRead)
- `ExemptionRequest` (userId, reason, status)

### Education (5 models)
- `Year`, `Department`, `Subject`, `Teacher`

### Content (5 models)
- `Course`, `Section`, `Video`, `Book`

### Exams (8 models)
- `Exam`, `Question`, `ExamAttempt`, `ExamAnswer`, `Appeal`, `UserExamAssignment`, `PersonalExamAttempt`

### Question Bank (2 models)
- `BankChapter`, `BankQuestion`

### Payments (7 models)
- `Subscription`, `Invoice`, `WalletTransaction`, `Coupon`, `InsertCode`, `InsertCodeUsage`, `PaymentProof`

### Engagement (5 models)
- `VideoView`, `Favorite`, `Bookmark`, `CommunityCategory`, `CommunityPost`, `CommunityComment`

### Live (3 models)
- `LiveSession`, `SessionBooking`, `LiveSessionAttendance`

### Study Plan (3 models)
- `StudyPlanWeek`, `StudyPlanSubject`, `StudyPlanSubjectFinish`

### Store (3 models)
- `StoreLocator`, `StoreItem`, `PointsTransaction`

### Misc (1 model)
- `Setting` (key-value)

---

## E. Authentication Architecture

### Flow
1. User registers with Egyptian phone (`01XXXXXXXXX`) + password → bcrypt hashed
2. Login via `directLoginAction` (phone + password → session immediately)
3. OTP flow exists but is **dead code** (form doesn't call it)
4. Session stored in DB (`sessions` table), 30-day expiry
5. Cookie `tn_session`: httpOnly, secure (prod), sameSite=lax

### Session Management
- `getCurrentUser()`: React `cache()` wrapped, reads cookie → DB lookup
- Does NOT re-check `isBlocked`/`isActive` per request
- Expired sessions never garbage-collected from DB
- Password change/reset do NOT invalidate other sessions

### Roles
- STUDENT, TEACHER, ADMIN, PARENT (actively used)
- MODERATOR, CENTER_USER (defined but never checked)
- `requireUser()`/`requireRole()` helpers exist but are **never called** — every page rolls its own inline check

---

## F. Payment Architecture

### Payment Methods
- Vodafone Cash: `01021416244`
- InstaPay: `01116544383`
- Fawry: `788`
- Wallet balance

### Payment Flow
1. Student clicks "Subscribe" → sees payment numbers
2. Transfers money manually → uploads proof image
3. Admin reviews in `/admin/payments` → approves/rejects
4. Approval creates 365-day subscription + notification

### Wallet Flow
1. Admin charges wallet or student redeems code
2. Student pays from wallet → balance deducted
3. Subscription created (365 days)

### Critical Issues
- **Race condition in wallet deduction**: reads balance → computes → writes absolute value (not atomic decrement)
- **Race condition in code redemption**: `isUsed` checked outside transaction
- **Coupon overuse**: `usedCount` incremented without conditional guard

---

## G. Course Architecture

```
Year → Department → Subject → Course → Section → [Video | Book | Exam]
```

- Course has `price`, `priceBeforeDiscount`, `isFeatured`, `isActive`
- Section groups videos, books, and exams
- Free content accessible without subscription
- Paid content requires subscription (`canAccessCourse`)

---

## H. Exam Architecture

### Exam Types
- EXAM (timed)
- HOMEWORK (untimed)
- EVALUATION

### Exam Flow
1. Teacher creates exam (manual or AI-generated)
2. Student opens exam intro → sees stats (duration, questions, points)
3. Clicks "ابدأ الآن" → creates `ExamAttempt`
4. `ExamRunner` client component handles:
   - Timer countdown (auto-submits at 0)
   - Question navigation
   - Auto-save answers
5. Submit → server-side grading (MCQ auto-graded, ESSAY pending)
6. Result page shows score, answer review

### AI Generation
- Teacher enters lesson name + count → Gemini generates MCQs
- Can specify title, duration, type, free status
- Questions saved to new Exam record

---

## I. Security Findings

### CRITICAL
1. **Unauthenticated AI endpoint** — `POST /api/ai/generate-questions` has no auth check. Anyone can drain Gemini API quota.
2. **Login brute-force bypass** — `directLoginAction` has zero rate limiting, no reCAPTCHA, no login attempt tracking. The protected OTP alternative is dead code.
3. **Password hashes rendered in admin UI** — `admin/users/[studentId]` and `admin/teachers/[teacherId]` display bcrypt hashes on screen.
4. **Supabase public bucket defeats paywall** — `/api/upload` returns direct public URLs. Any student sharing a URL lets non-subscribers access content.

### HIGH
5. **CSRF origin check bypassable** — `origin.includes(host)` is substring match. `https://site.com.evil.com` passes for `site.com`. Plus `ALLOW_ORIGINLESS="true"` ships by default.
6. **Wallet double-spend race** — concurrent requests can overspend wallet balance.
7. **Code double-redemption race** — concurrent requests can redeem one code twice.
8. **Live session double-booking** — capacity check outside transaction.

### MEDIUM
9. **OTP codes stored plaintext** in DB
10. **Session tokens stored plaintext** in DB
11. **`getCurrentUser` ignores `isBlocked`** — only admin toggle deletes sessions
12. **Password reset doesn't revoke sessions**
13. **Redirect/notFound inside try-catch** on exam pages — Next.js throws NEXT_REDIRECT/NEXT_NOT_FOUND which the catch swallows
14. **Sitemap queries non-existent models** — `prisma.academicStage` doesn't exist (should be `Year`)
15. **User enumeration** via distinct error messages

### LOW
16. **`Math.random()` for recharge codes** — predictable PRNG for value-bearing codes
17. **In-memory rate limiter** resets on restart, per-instance only
18. **reCAPTCHA silently disabled** if `RECAPTCHA_SECRET` unset
19. **Console.log in production** — exam pages log params and results
20. **`ALLOW_ORIGINLESS=true` in .env.example** — if copied to prod, CSRF protection disabled

---

## J. Performance Findings

1. **N+1 queries in exam pages** — `prisma.exam.findUnique` with nested includes on every page load
2. **Notification count on every render** — `site-header.tsx` runs `prisma.notification.count()` on every page for logged-in users
3. **No DB connection pooling config** — `pg.Pool` created without explicit pool size
4. **Sequential question creation** — AI exam saves questions one-by-one in a loop (not batched)
5. **Service worker caches authenticated pages** — stale-first strategy shows old content
6. **No `error.tsx` or `loading.tsx` boundaries** — no graceful error/loading states
7. **`ignoreBuildErrors: true`** — TypeScript errors silently ignored in production
8. **HEAD endpoint buffers full file** — `/api/files` HEAD downloads entire file then discards

---

## K. UX/UI Findings

1. **Broken OG image** — `og-image.png` referenced but file doesn't exist
2. **Social links are placeholders** — Facebook/TikTok/Instagram URLs point to bare domains
3. **Password hashes visible in admin panel** — confusing for admins
4. **Favorites/bookmarks show blank page** for non-students instead of redirecting
5. **Teacher role-guard inconsistency** — some pages redirect to `/teacher`, others to `/login`
6. **`alert()` used in AI generator** — poor UX vs form-state error patterns
7. **No global not-found page** — default Next.js 404 instead of branded
8. **Invalid HTML nesting** — buttons inside `<a>` tags in admin user list
9. **`section-ai-generator.tsx`** — pointless wrapper component
10. **Console logs visible in production** exam pages

---

## L. Technical Debt

### Dead Code
| Item | Location |
|---|---|
| OTP login flow (entire implementation) | `lib/auth.ts` sendOtp/verifyOtp + `actions/auth.ts` sendOtpAction/verifyOtpAction |
| Root `prisma.ts` (SQLite) | `prisma.ts` at project root |
| Backup folder | `الأصول قبل التعديل/` with duplicate dev.db |
| `requireUser()` / `requireRole()` | `lib/auth.ts` |
| `truncate()` / `maskPhone()` | `lib/utils.ts` |
| `clearRateLimits()` | `lib/rate-limit.ts` |
| `CACHE_NAME` in service worker | `public/sw.js` |
| `@prisma/adapter-better-sqlite3` dependency | `package.json` |
| `section-ai-generator.tsx` wrapper | `src/app/(site)/teacher/courses/[courseId]/` |
| 5 decorative SVGs | `public/` |

### Duplicated Code
| What | Locations |
|---|---|
| Prisma client factory | 3 copies (lib/prisma.ts, root prisma.ts, backup folder) |
| MIME extension maps | api/files + api/upload |
| Payment number fallbacks | constants.ts + wallet/charge + subscribe pages |
| Session cookie options | verifyOtpAction + directLoginAction |
| `ownsSection` pattern | Re-implemented in every teacher action file |

### Hardcoded Values
| Value | Locations |
|---|---|
| `https://www.tareeq-alnoor.online` | constants.ts, capacitor.config.ts |
| Payment phone numbers | constants.ts + 2 fallback duplicates |
| `#f59e0b` (amber) | globals.css, manifest.json, capacitor.config.ts |
| `gemini-3.6-flash` | api/ai/generate-questions/route.ts |
| `365` days subscription | 3 separate action files |
| Session lifetime `30` days | lib/auth.ts + actions/auth.ts |
| OTP windows (5min, limits 3/5) | Repeated throughout lib/auth.ts |

### Git Hygiene
- `dev.db` × 3 committed (contains real user data)
- `data/uploads/*` committed (media files)
- `dev-server.log` committed
- Backup folder `الأصول قبل التعديل/` committed

---

## M. Critical Bugs

| # | Bug | Severity | File |
|---|---|---|---|
| 1 | `redirect()`/`notFound()` inside try-catch — Next.js redirects are swallowed | 🔴 Critical | exam/page.tsx, take/page.tsx, result/page.tsx |
| 2 | Password reset `sendResetOtpAction` passes bcrypt hash as plaintext to `sendOtp()` — `bcrypt.compare(hash, hash)` always passes, but the logic is fragile/obscure | 🟠 Medium | actions/auth.ts |
| 3 | Sitemap queries `prisma.academicStage` (doesn't exist) and `course.isPublished` (doesn't exist) | 🟠 Medium | app/sitemap.ts |
| 4 | Video progress `savedRef` prevents intermediate saves — only 0% or 100% saved | 🟠 Medium | video-player.tsx |
| 5 | `saveLiveSessionAction` writes admin's userId as teacherId for standalone sessions → FK violation | 🟠 Medium | teacher-live.ts |
| 6 | `deleteTeacherAction` runs multi-table deletion outside transaction | 🟠 Medium | admin-users.ts |
| 7 | `teacher-grading.ts` excludes ADMIN from grading (role !== "TEACHER") | 🟡 Low | teacher-grading.ts |
| 8 | `og-image.png` doesn't exist — social previews broken | 🟡 Low | public/ |
| 9 | `prisma db push` in build command — can overwrite prod schema unexpectedly | 🟠 Medium | package.json |

---

## N. Recommended Architecture

### Current Architecture
```
Client → Vercel (Next.js) → Neon (PostgreSQL)
                           → Supabase Storage
                           → Gemini API
                           → SMS Provider
```

### Issues with Current Architecture
1. **No middleware** — every page does DB query for auth
2. **No API rate limiting** — only auth flows are rate-limited
3. **No caching layer** — every request hits DB
4. **No queue system** — no background job processing
5. **In-memory state** — rate limiter lost on restart

### Recommended Architecture
```
Client → Vercel (Next.js)
           ├── Middleware (auth + rate limit)
           ├── Redis (rate limit + session cache)
           ├── Neon (PostgreSQL)
           ├── Supabase Storage (PRIVATE bucket)
           ├── Resend/SendGrid (Email)
           └── Gemini API (proxied + rate-limited)
```

---

## O. Migration Risks

1. **`prisma db push` in build** — can apply breaking schema changes to production without migration review
2. **Supabase bucket is public** — making it private requires updating all upload/download paths
3. **Dead OTP code** — removing it is safe but tests must verify login still works
4. **365-day subscription hardcoded** — should be a Setting or per-course config
5. **Session tokens in plaintext** — migrating to hashed tokens requires a DB migration + code update
6. **`ignoreBuildErrors`** — enabling strict TS will surface many errors

---

## P. Proposed Development Phases

### Phase 1: Security Hardening (CRITICAL — 1-2 days)
1. Add auth + rate limiting to `/api/ai/generate-questions`
2. Add rate limiting to `directLoginAction`
3. Fix CSRF origin check in `proxy.ts` (exact hostname match)
4. Set `ALLOW_ORIGINLESS=false` in production
5. Remove password hash display from admin pages
6. Make Supabase bucket private + update all upload/download code

### Phase 2: Core Bug Fixes (HIGH — 2-3 days)
7. Remove try-catch around `redirect()`/`notFound()` in exam pages
8. Fix sitemap.ts to use correct model names
9. Fix video progress saving (intermediate saves)
10. Wrap financial operations in atomic transactions
11. Fix `saveLiveSessionAction` FK violation
12. Remove `prisma db push` from build command

### Phase 3: Technical Debt (MEDIUM — 2-3 days)
13. Remove dead code (OTP flow, root prisma.ts, backup folder, unused utils)
14. Remove dev.db files and uploads from git history
15. Remove `ignoreBuildErrors` and fix TS errors
16. Add `error.tsx` and `not-found.tsx` boundaries
17. Add global middleware for auth checks
18. Remove debug console.logs from production code

### Phase 4: Architecture Improvements (MEDIUM — 3-5 days)
19. Add Redis for rate limiting and session caching
20. Add proper loading states
21. Add missing `og-image.png`
22. Fix social media placeholder links
23. Unify role-guard patterns across all pages
24. Add proper accessibility (aria labels, htmlFor/id)

### Phase 5: Polish & Scale (LOW — ongoing)
25. Add batch question creation for AI exams
26. Add background job queue for notifications
27. Add proper error monitoring (Sentry)
28. Add E2E tests for critical flows
29. Add proper TypeScript strict mode

---

## Executive Summary

**Tareeq Alnoor** is a functional educational platform with 47 database models, 52 page routes, 10+ API endpoints, and 20+ server actions. The core features (courses, exams, payments, live sessions) work, but the platform has **significant security vulnerabilities** that need immediate attention.

### Top 10 Most Critical Issues

| # | Issue | Severity |
|---|---|---|
| 1 | AI endpoint completely unauthenticated | 🔴 CRITICAL |
| 2 | Login brute-force path (directLoginAction) | 🔴 CRITICAL |
| 3 | Password hashes displayed in admin panel | 🔴 CRITICAL |
| 4 | Public Supabase bucket bypasses paywall | 🔴 CRITICAL |
| 5 | CSRF origin check bypassable | 🟠 HIGH |
| 6 | Wallet double-spend race condition | 🟠 HIGH |
| 7 | Code double-redemption race condition | 🟠 HIGH |
| 8 | redirect/notFound swallowed by try-catch | 🟠 HIGH |
| 9 | Sitemap broken (wrong model names) | 🟠 MEDIUM |
| 10 | `prisma db push` in production build | 🟠 MEDIUM |

### Top 10 Priorities

| # | Task | Phase |
|---|---|---|
| 1 | Secure AI endpoint (auth + rate limit) | Phase 1 |
| 2 | Secure direct login (rate limit + captcha) | Phase 1 |
| 3 | Fix CSRF middleware | Phase 1 |
| 4 | Make Supabase bucket private | Phase 1 |
| 5 | Remove password hashes from admin UI | Phase 1 |
| 6 | Fix exam page try-catch redirect bug | Phase 2 |
| 7 | Fix wallet/payment race conditions | Phase 2 |
| 8 | Fix sitemap.ts | Phase 2 |
| 9 | Remove dead code + dev artifacts | Phase 3 |
| 10 | Add error boundaries + loading states | Phase 3 |

### Files to Modify in Next Phase

```
# Phase 1 — Security (immediate)
src/app/api/ai/generate-questions/route.ts
src/app/actions/auth.ts
src/proxy.ts
src/lib/storage.ts
src/app/admin/users/[studentId]/page.tsx
src/app/admin/teachers/[teacherId]/page.tsx

# Phase 2 — Core bugs
src/app/(site)/courses/[id]/sections/[sectionId]/exam/[examId]/page.tsx
src/app/(site)/courses/[id]/sections/[sectionId]/exam/[examId]/take/page.tsx
src/app/(site)/courses/[id]/sections/[sectionId]/exam/[examId]/result/[attemptId]/page.tsx
src/app/sitemap.ts
src/components/player/video-player.tsx
src/app/actions/payments.ts
src/app/actions/student-live.ts
src/app/actions/teacher-live.ts

# Phase 3 — Technical debt
src/app/actions/auth.ts (remove dead OTP)
prisma.ts (root — delete)
الأصول قبل التعديل/ (delete)
dev.db × 3 (remove from git)
package.json (remove ignoreBuildErrors, fix build script)
```
