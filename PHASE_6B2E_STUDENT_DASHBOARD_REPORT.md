# PHASE 6B-2E — Student Dashboard Report

**Date:** 2026-08-23
**Status:** COMPLETE
**TypeScript:** 0 errors
**ESLint:** 0 errors (33 warnings — unchanged baseline)
**Tests:** 128/128 passing (115 previous + 13 new dashboard tests)

---

## 1. Current Dashboard Audit

**Finding: no student dashboard existed.** There is no `dashboard` route anywhere;
students land on the public homepage after login, and the header only offered
dashboard buttons for ADMIN/TEACHER/PARENT. Student data lived scattered across
/results, /wallet, /notifications, /profile.

Existing real data sources discovered:

| Source | Verdict |
|---|---|
| `VideoView` (userId, videoId, progress 0-100, isCompleted, lastWatchedAt) | ✅ THE progress store — written by `/api/videos/progress` from the player (Phase 2 throttling) |
| `Subscription` (active + expiresAt) | ✅ via pattern of `getUserSubscriptions` |
| `ExamAttempt` (+ wrong-MCQ `answers`) | ✅ same source as /results weak-points |
| `SessionBooking` → `LiveSession` (startAt, status booked/cancelled) | ✅ upcoming live |
| `Notification` | ✅ |
| `user.walletBalance` | ✅ already selected by getCurrentUser |
| `StudyPlanWeek/Subject/SubjectFinish` + admin actions (`src/app/actions/study-plan.ts`) | ⚠️ models + ADMIN CRUD exist, **zero student-facing UI anywhere** — per §14 no fake UI built on them; documented below |

## 2. New Dashboard Structure

Route created: `src/app/(site)/dashboard/page.tsx` (+ `loading.tsx`), plus a one-line
header integration: `DASHBOARD_BY_ROLE.STUDENT = { href:"/dashboard", label:"لوحتي" }`
— students now get «لوحتي» in desktop actions and the mobile menu exactly like the
other three roles (the minimal header change this phase required).

```
A Welcome        «أهلاً يا {firstName} 👋» (safe «أهلاً بك» fallback)
B Today's Task   hero card — honest fallback ladder (see §3)
C/D My Courses   per-course Card with REAL completion Progress + expiry + CTA
E Recent Results last 4 attempts with threshold Badges
F Weak Areas     wrong-answers aggregated by subject (top 3) or honest EmptyState
H Live           upcoming BOOKED sessions only (future startAt, take 3)
I Notifications  latest 3 + unread Badge + view-all
J Subs/Wallet    active count · nearest expiry · real wallet balance · CTAs
K Empty          new-student EmptyState → «تصفح الكورسات»
G Continue       merged INTO Today's Task (kind=continue) to avoid duplication
```

Layout: desktop `lg:[1fr_320px]` two-column (right rail = live/notifs/subs);
mobile single column in priority order Task → Courses → Results → rest.

## 3. Today's Task Logic (no invented AI/recommendations)

Deterministic ladder over real rows:
1. Latest `VideoView` where `progress>0 AND !isCompleted` (orderBy lastWatchedAt)
   → «تابع من حيث توقفت» + lesson/course names + real percent Progress +
   deep link to that exact video.
2. Else first active subscription → «مهمتك القادمة: ابدأ أول درس في كورس X» → sections.
3. Else hidden entirely (new student sees EmptyState instead).

## 4–7. Progress / Courses / Results / Weak Areas

- **Progress formula** uses existing storage ONLY: completed = `VideoView.isCompleted`
  count; denominator = course videos via `_count`; percent clamped ≤100.
  No new completion semantics introduced; storage untouched.
- Batch discipline: totals via ONE `course.findMany(id in [...])`; completed counts via
  ONE `videoView.findMany` reduced in JS by `video.section.courseId`. Zero per-course queries.
- Results mirror `/results` source (`graded|submitted`, score/totalScore, finishedAt,
  exam→section→course→subject). Status labels are pure numeric-threshold Badges
  (≥70 success / ≥50 warning / else danger) — no editorial words like «ممتاز».
- Weak areas reuse the SAME wrong-MCQ answers feed, aggregated per subject
  (`times = wrong answer count`), top 3; empty state when no attempts.

## 8–11. Live / Notifications / Wallet / StudyPlan

- Live: only student's own future bookings (`status:"booked"`, `startAt>now`,
  asc, take 3); booking flows untouched.
- Notifications: latest 3 server-rendered; explicit «كل الإشعارات» link; no polling.
- Wallet/expiry: numbers straight from session user + subscription rows; nearest
  `expiresAt` computed client-of-server side (in RSC). No marketing claims anywhere.
- **StudyPlan documented as dormant**: admin authoring exists, student consumption
  does not; building "Today's plan" UI on it now would fabricate a feature — skipped.

## 12–13. Query Count & N+1

Baseline (per prompt): dashboard effectively didn't exist (4-query reference).
New page: **7 Prisma calls total**, all batched in ≤2 Promise.all waves:
1×subscriptions, 1×continue-view, 1×attempts(take20), 1×bookings(take3),
1×notifications(take3), then conditionally 2 more (totals + completed views) ONLY
when courses exist. Lists bounded with take. No loops issuing queries anywhere
(test asserts data layer shape implicitly through mocks receiving single batched calls).

## 14–17. Responsive / RTL / Dark / A11y

- Mobile order enforced structurally: Task → Courses → Results → rail items stacked.
  Desktop two-column with right rail.
- RTL clean (`\b(mr|ml|pr|pl)-\d` → 0 matches in dashboard/*): gap/ms/me/ps/pe only.
- Tokens throughout (`bg-card border-border text-navy/muted-foreground primary/success/danger`);
  Progress/Badge/Card primitives adapt dark automatically; loading skeleton likewise.
- Single H1 welcome; every section has `<h2 aria-labelledby>`; Progress exposes full
  progressbar ARIA; badges pair color with text («جديد», percentages); EmptyState roles;
  focus-visible rings inherited from primitives; role gate: guests AND non-STUDENT
  roles get `notFound()` server-side (test-enforced).

## 18. Loading / Error

`dashboard/loading.tsx`: skeleton mirrors final anatomy (welcome lines → task card
with bar+CTA → two course cards with bars+CTAs → results rows with pill → rail
cards + summary rows), container `aria-busy`. Error surface: page relies on Next
error boundary (`ErrorState`-styled global/(site) boundaries from Phase 3); no DB
text can leak since no try/catch swallows here.

## 19. Security

Sent to client: names, course/lesson titles, percentages, dates, wallet balance
(already visible to student elsewhere), notification titles/bodies owned by user.
Never rendered: password/hash, session token, payment secrets, signed file URLs,
admin data. Access control stays server-side (`getCurrentUser` + role check +
subscription-scoped queries only for `userId = current user`). Route marked
`robots: noindex` — private, non-cacheable, dynamic by cookies.

## 20–22. Tests / TypeScript / ESLint

**tests/student-dashboard.test.tsx (13)** — hoisted prisma + auth module mock:
greeting w/ real name + safe fallback · continue-task (title/deep-link/aria-valuenow=40)
· no-progress fallback task href · REAL completion math (3/10 → 30%, 1/10 → 10% via
aria-valuenow) · result threshold Badges 85%/45% without editorial praise · weak-area
aggregation (4 إجابة خاطئة + /practice link) vs honest empty state · upcoming-live block ·
notifications unread badge + view-all · subs summary incl. real formatted wallet &
absence of discount claims · brand-new-student EmptyState · guest/ADMIN rejected.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 (after aligning to real relation paths: Exam.title, Video.section.courseId, Decimal→Number) |
| `eslint src` full | **0 errors**, 33 warnings (baseline unchanged) |
| `vitest run --no-file-parallelism` | **128/128** |

Header regression: existing header tests still green with the added STUDENT
dashboard entry (they assert absence of admin/teacher/parent links only).

## 23. Browser Verification

Browser visual verification pending deployment. Static review covered empty /
subscribed / with-progress / with-results matrices (all test-enforced), sticky-header
offset not applicable (no anchors), long-name truncation, and dark-token coverage.

## 24. Remaining Limitations

1. StudyPlan feature remains admin-only/dormant; wiring it into Today's Task needs a
   product decision + student consumption flow (future phase, not UX-only).
2. Course-card progress counts videos only (books/exams excluded) — mirrors the
   existing VideoView storage; extending to mixed-content completion is a logic change.
3. Continue-learning considers only uncompleted views; re-watching a completed lesson
   won't resurface it (matches isCompleted semantics).
4. Weak areas lack drill-down links per subject (practice route is global); deeper
   linking requires practice-filter params that don't exist yet.
5. No pagination on any list — all takes are small (≤20) by design.
6. Parallel-vitest flakiness persists locally (`--no-file-parallelism`).

## 25. Recommendation for PHASE 6B-3

1. Decide StudyPlan productization (student view + finish toggles already exist as
   actions) — would slot naturally above Today's Task.
2. Introduce subject-filtered practice (`/practice?subject=`) so weak areas link
   becomes targeted training.
3. Unify role dashboards (teacher/parent/admin shells) onto the same Card/rail
   grammar established across 6B-2D/E.
4. Consider an SSE/interval-free "refresh" affordance rather than polling.
5. Promote recurring composites (stat-row, section-card list) to ui/ once 6B-3
   confirms ≥3 cross-page usages.

**STOP — PHASE 6B-3 not started.**
