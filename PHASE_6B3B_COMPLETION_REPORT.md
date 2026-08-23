# PHASE 6B-3B — Unified Learning Completion Report

**Date:** 2026-08-23
**TypeScript:** 0 errors
**ESLint:** 0 errors — 31 warnings (baseline unchanged from 6B-3A)
**Vitest:** 151/151 passing (137 previous + 14 new: 7 shell-unified + 7 action-security)

---

## 1. What Changed

Learning Shell completion expanded from **videos-only** to the three content kinds,
with one unified progress metric and per-section percentages:

| Kind | Completion source | Rule |
|---|---|---|
| Video | `VideoView.isCompleted` (existing) | unchanged — done stays done |
| Book | **NEW** `BookView` storage + «تمت القراءة» action | explicit student mark; opening ≠ complete |
| Exam | existing `ExamAttempt` rows | best attempt ≥ **50%** → done |

Plus: unified `calculateLearningProgress()` helper, per-section percent badges in
ContentsNav, locked content excluded from progress denominator.

## 2. Files Modified / Created

| File | Change |
|---|---|
| `prisma/schema.prisma` | +`BookView` model; +`Book.views`, +`User.bookViews` relations |
| `prisma/migrations/20260823_add_book_views/migration.sql` | NEW migration |
| `src/app/actions/books.ts` | NEW `markBookCompletedAction` (guarded, idempotent) |
| `src/components/learning/book-read-button.tsx` | NEW accessible «تمت القراءة» button |
| `src/lib/learning-shell.ts` | books/exams statuses · unified progress · section % · pure helper export |
| `src/components/learning/contents-nav.tsx` | section % Badges (success @100%) |
| `src/app/(site)/courses/[id]/sections/[sectionId]/book/[bookId]/page.tsx` | button wired in both layouts |
| `video/[videoId]`, exam intro | sectionsProgress passthrough to ContentsNav |
| `tests/learning-shell.test.tsx`, `tests/book-completion.test.ts` | updated/new |

## 3. Database Changes

Minimal model following the `VideoView` pattern:

```prisma
model BookView {
  id          String   @id @default(cuid())
  userId      String
  bookId      String
  isCompleted Boolean  @default(false)
  completedAt DateTime @default(now())
  user        User     @relation(...)   // Cascade
  book        Book     @relation(...)   // Cascade
  @@unique([userId, bookId])
  @@index([bookId])
  @@map("book_views")
}
```

Migration SQL written manually matching project convention (`20260823_add_book_views`);
`prisma generate` succeeded. `migrate deploy` runs at deploy time like prior migrations.
No other tables/columns touched.

## 4–5. Completion Rules & Exam 50%

- **Video**: untouched (`isCompleted` at ≥90% or ended — player/API as-is).
- **Book**: row created ONLY via explicit «تمت القراءة» press. Opening/viewing never
  creates completion.
- **Exam**: engine already stored `isPassed = score ≥ totalScore×0.5` on finish AND
  recomputed identically by teacher grading — reused as-is. Shell computes real
  percentage per attempt and takes **best across submitted/graded attempts**
  (`max(score/totalScore×100)`); `done ⇔ best ≥ 50`. In-progress rows are excluded at
  query level. Failed attempts remain `available` and retaking works exactly as before.

Verified by tests: 49→available, 50/75/100→done, 42/38/56% → done with meta «56%».

## 6. Progress Calculation

New exported pure helper:

```ts
calculateLearningProgress(items: { status }[]) → { completed, total, percent }
```

Denominator = non-locked items only (locked paid content invisible to a
non-subscriber does not penalize their %). Used for course-level AND per-section
percentages from the same in-memory flat array. Dashboard intentionally keeps its
previous video-based metric this phase (backward compatibility §19); unifying it is
queued for 6B-3C.

## 7. Security Verification

- Action derives userId exclusively from session (`getCurrentUser`) — client cannot
  spoof ownership (test).
- Guards chain: auth → role STUDENT → book exists → `book.isFree || canAccessCourse`
  → upsert. Unauthorized completion rejected before any write (test).
- Idempotent via unique(userId,bookId)+upsert — duplicate submissions safe (test).
- Shell serialization guard test still passes: no `provider/url/fileUrl/password/token`.
- Locked rows render as non-links with lock state only; protected media URLs never
  enter shell data.

## 8. Query Count / Performance

Shell stays constant-cost: course tree (1) + videoViews batch (1) + bookViews batch
(1) + examAttempts batch (1) + optional started-video fallback (1) = **≤5 queries**,
all `in:`-batched; zero queries inside loops/map. Section percentages derive from the
same flat array (pure JS). Test asserts exactly one call per store mock.

## 9. Tests Added

learning-shell.test.tsx (+7): unified-progress math incl. locked-exclusion ·
50%-boundary matrix (49/50/75/100/1-of-2/0-of-2) · best-attempt wins with meta % ·
failed-only stays available + where-clause excludes in_progress · BookView marks
done & counts toward progress (20% case) · section % correctness (100/0) with
call-count N+1 assertions · (existing flat/order/current/leak tests updated).
book-completion.test.ts (+7): guest/non-student/unauthorized/free-bypass/
authorized-upsert-shape/duplicate-idempotent/unknown-book.

## 10–12. Validation Results

```
npx tsc --noEmit                    → exit 0
eslint src                          → 0 errors, 31 warnings (baseline)
vitest run --no-file-parallelism    → 151/151 passing (16 files)
```

`next build` not executed locally — requires production env vars (Supabase/Neon),
consistent with all previous phases; type+test coverage substitutes locally.
RTL clean on every touched file; dark tokens only; a11y additions: aria-live button
feedback, text+icon completion state (never color-alone), sr-safe error alerts.

## 13. Known Limitations

1. Dashboard course % remains videos-only this phase (compat-first decision);
   unify by feeding dashboard through `calculateLearningProgress` in 6B-3C.
2. Un-reading a book («تراجع») intentionally unsupported — completion is monotonic,
   matching video semantics.
3. Essay-flow nuance: an essay exam graded later flips `isPassed`; shell reflects it
   on next server render (no live push), consistent with results page behavior.
4. Section % counts exams equally with videos (spec formula) — weighted scoring would
   be a product decision.
5. Migration applies at deploy; local verification used generate + SQL review.
6. Parallel-vitest flakiness persists locally (`--no-file-parallelism`).

## 14. Recommended Next Phase

**PHASE 6B-3C**: adopt `calculateLearningProgress` in Student Dashboard cards +
Today's-Task fallbacks (books/exams-aware), then extend weak-areas links into
section-scoped practice. After that, promote LearningHeader/ContentsNav patterns to
teacher preview flows if product wants parity.

```text
PHASE 6B-3B STATUS:
COMPLETE
```
