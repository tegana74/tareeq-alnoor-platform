# PHASE_4_BASELINE.md — Performance Baseline

**Date:** 2026-08-22  
**Before any changes**

---

## A. Per-Request Query Floor

Every authenticated `(site)` page pays **minimum 2 queries** before the page's own work:
1. `getCurrentUser()` → session.findUnique with heavy include (user + year + department + teacherProfile, **including password hash**)
2. Notification count → `notification.count({ userId, isRead: false })` in site-header on every render

---

## B. Page-by-Page Query Audit

### Home (`(site)/page.tsx`)
- **DB queries:** 3 (+2 header = 5)
- include year, subject, sections→videos+books+exams (3-level nested)
- `force-dynamic` → zero caching for anonymous traffic
- Sections fetched fully then stripped to `_count` in JS

### Courses (`courses/page.tsx`)
- **DB queries:** 3-4 (+2 header = 5-6)
- course.findMany with teacher, subject, _count
- year + subject findMany (subject duplicates what's in courses)
- `course.isActive` filter, no pagination on listing

### Course Details (`courses/[id]/page.tsx`)
- **DB queries:** 2-3 (+2 header = 4-5)
- Duplicate queries: metadata vs page re-fetch of same course
- `isSubscribed` checked but short-circuits for non-subscribers inconsistently

### Student Dashboard (`dashboard/page.tsx`)
- **DB queries:** 4 (+2 header = 6)
- Subscriptions, recent attempts, live sessions, notifications

### Exam Intro (`exam/[examId]/page.tsx`)
- **DB queries:** 2 (+2 header = 4)
- Duplicate: metadata re-fetches course+section+exam already fetched by page

### Exam Take (`take/page.tsx`)
- **DB queries:** 2 (+2 header = 4)
- exam.findUnique with questions (needed for runner)

### Exam Result (`result/[attemptId]/page.tsx`)
- **DB queries:** 2 (+2 header = 4)
- attempt with answers+questions (needed for review)

### Results Page (`results/page.tsx`) ⚠️ HEAVY
- **DB queries:** 2 (+2 header = 4)
- Query #1: examAttempt findMany take 20 with 4-level nested include + answers (where wrong MCQ, include question, take 50 each) → worst case ~1,000 answer+question rows
- Query #2: personalExamAttempt findMany take 20 — **only `.length` used** → should be `count()`

### Notifications (`notifications/page.tsx`)
- **DB queries:** 1 (+2 header = 3)
- findMany take 100, no pagination UI

### Wallet (`wallet/page.tsx`)
- **DB queries:** 2 (+2 header = 4)
- invoice findMany take 50, walletTransaction findMany take 20
- Invoice includes full `course` row though only `name` used

### Favorites (`favorites/page.tsx`)
- **DB queries:** 1 (+2 header = 3)
- favorite with course→teacher+subject+sections (fetched fully then stripped to counts)

### Live Sessions (`live/page.tsx`) ⚠️ N+1
- **DB queries:** 1 + N×2 sequential (+2 header = 3+N×2)
- liveSession findMany with teacher.user, course, bookings
- **N+1:** `canAccessCourse()` awaited per session in loop (each = subscription.findUnique + possibly course.findFirst)
- No date filter, past sessions accumulate forever
- No pagination

### Bookmarks (`bookmarks/page.tsx`) ⚠️ N+1
- **DB queries:** 1 + N×1 (+2 header = 3+N)
- bookmark findMany with video→section→course, book→section→course
- **N+1:** `canAccessCourse()` awaited per bookmark in loop

### Profile (`profile/page.tsx`)
- **DB queries:** 3 (+2 header = 5)
- Subscriptions (no take), notifications take 10, examAttempt count
- Subscriptions include full course rows though only `name` used

### Store (`store/page.tsx`)
- **DB queries:** 3 (+2 header = 5)
- storeItem findMany, getUserSubscriptions (heavy include), pointsTransaction take 20
- Teacher+subject fetched then thrown away

### Teacher Dashboard (`teacher/dashboard/page.tsx`)
- **DB queries:** 3-4 (+2 header = 5-6)
- Course stats, pending essays, live sessions

### Teacher Course Management (`teacher/courses/[courseId]/page.tsx`) ⚠️ HEAVY
- **DB queries:** 2 (+2 header = 4)
- course.findUnique with sections→videos+books+exams→questions
- Entire course tree serialized to client (4,000+ rows for big courses)
- All question options+correctAnswer shipped even when collapsed

### Parent Dashboard (`parent/dashboard/page.tsx`)
- **DB queries:** 4 (+2 header = 6)
- Parent-child links, children's subscriptions/attempts
- Children fetched with full user rows (password hash)

### Admin Dashboard (`admin/page.tsx`)
- **DB queries:** 5 (+2 header = 7)
- Counts: students, teachers, subscriptions, pending invoices, monthly revenue
- invoice.aggregate, invoice.count, user.count — **Invoice.status and createdAt unindexed**

### Admin Users (`admin/users/page.tsx`)
- **DB queries:** 3 (+2 header = 5)
- user.findMany take 100 with year, department, _count — **password hash fetched for 100 users**
- year findMany, course findMany
- No real pagination (hard cap at 100)

### Admin Teachers (`admin/teachers/page.tsx`)
- **DB queries:** 1 (+2 header = 3)
- teacher.findMany with **full user: true** (password hash per teacher) — only `isBlocked` consumed
- No pagination

### Admin Teacher Detail (`admin/teachers/[teacherId]/page.tsx`)
- **DB queries:** 5 (+2 header = 7)
- teacher, subscriptions (all-time, unbounded), invoices (all-time, unbounded), 2 settings
- Stats aggregated in JS from full-table scans — should use SQL groupBy

### Admin Payments (`admin/payments/page.tsx`)
- **DB queries:** 1 (+2 header = 3)
- invoice findMany take 100 with `paymentProof: true` — **relation included but never referenced**
- Pending vs reviewed split in JS after fetching only newest 100

### Admin Appeals (`admin/appeals/page.tsx`) ⚠️ HEAVIEST
- **DB queries:** 1 (+2 header = 3)
- appeal findMany take 100 with 4-level nested include + answers×questions
- **Estimated payload:** 100 appeals × avg answers × question size → megabytes
- MCQ answers fetched then filtered out client-side

### Admin Question Bank (`admin/question-bank/page.tsx`)
- **DB queries:** 2 (+2 header = 4)
- bankChapter findMany with ALL questions (unbounded, entire bank on one page)
- Subject findMany

### Teacher Grading (`teacher/grading/page.tsx`) ⚠️ HEAVY
- **DB queries:** 3 (+2 header = 5)
- examAttempt findMany **no take** — every submitted attempt ever
- user: true (password hashes) for every student
- answers include question for ALL answers (MCQ included, filtered in JS)

---

## C. API Endpoint Audit

### `/api/files/[filename]` ⚠️ CRITICAL
- HEAD: downloads entire file then discards
- GET: buffers full file in Node memory, no Range support, no streaming
- `Cache-Control: private, no-store` — every replay re-downloads

### `/api/upload`
- Buffers entire file in memory (500MB max)
- Per-request `ensureBucket()` check

### `/api/ai/generate-questions`
- Sequential per-question INSERT in loop (5-20 queries)

### Exam save/finish routes
- Per-answer writes in sequential loops (~2Q+4 sequential queries per submission)

---

## D. Missing Database Indexes (20+ needed)

| Table | Columns | Justification |
|-------|---------|---------------|
| LoginAttempt | (phone, success, createdAt desc) | Lockout counter on every login |
| OtpCode | (phone, purpose, createdAt desc) | OTP verification queries |
| Notification | (userId, isRead) | Header badge count on every render |
| Notification | (userId, createdAt desc) | Notification list ordering |
| Invoice | (userId, createdAt desc) | Wallet page latest 50 |
| Invoice | (status, createdAt desc) | Admin dashboard aggregates |
| WalletTransaction | (userId, createdAt desc) | Wallet page latest 20 |
| ExamAttempt | (userId, createdAt desc) | Results, profile, appeals |
| ExamAttempt | (examId) | Attempts per exam |
| ExamAnswer | (attemptId) | Save/finish during exams, results |
| Question | (examId) | Questions per exam |
| Section | (courseId) | Sections per course |
| Video | (sectionId) | Videos per section |
| Book | (sectionId) | Books per section |
| Exam | (sectionId) | Exams per section |
| Course | (isActive, order) | Catalog browse |
| Course | (yearId) | Year filter |
| Course | (subjectId) | Subject filter |
| Course | (teacherId) | Teacher filter |
| Bookmark | (userId) | Bookmarks page |
| LiveSession | (startAt desc) | Live listing ORDER BY |
| LiveSession | (teacherId) | Teacher listings |
| LiveSession | (courseId) | Course reverse include |
| SessionBooking | (sessionId, status) | Capacity count in booking tx |
| Session | (userId) | Session cleanup, admin delete |
| User | (role) | Admin user queries |
| User | (yearId) | Year-filtered queries |
| BankChapter | (subjectId) | Chapters per subject |
| BankQuestion | (chapterId) | Questions per chapter |
| Appeal | (userId) | Student appeals page |

---

## E. Service Worker Issues

1. **Cross-user data leakage:** cache-first strategy serves Student A's cached HTML to Student B
2. **Install-time precache:** snapshots personalized HTML at install time
3. **Blocklist fragility:** `/parent` missing from exclusion list
4. **Authenticated pages cached:** `/notifications`, `/wallet`, `/favorites`, `/bookmarks`, `/appeals`, `/exemptions`

---

## F. Server/Client Boundary Issues

- `teacher-content-forms.tsx` is "use client" but manages all content editing — acceptable
- `ai-generator.tsx` is "use client" — acceptable (needs interaction)
- Home page `force-dynamic` prevents any caching
- No server components where they could reduce client JS

---

## G. Connection Pool

- `src/lib/prisma.ts`: singleton with `@prisma/adapter-pg` + `pg.Pool`
- No explicit pool size configured
- Vercel serverless = new instance per cold start, pool per instance

---

## H. Auth Overhead

- `getCurrentUser()` called once per request (React cache() prevents duplicates within same request)
- Each call: session.findUnique + heavy user include (password, year, department, teacherProfile)
- `requireUser()` and `requireRole()` exist but **never called** — every page rolls its own check
- `isSubscribed()` called per access check = 1 subscription.findUnique each time
