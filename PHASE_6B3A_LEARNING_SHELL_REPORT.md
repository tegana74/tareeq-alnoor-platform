# PHASE 6B-3A — Student Learning Shell Report

**Date:** 2026-08-23
**Status:** COMPLETE
**TypeScript:** 0 errors
**ESLint:** 0 errors — warnings **33 → 31** (rewrite removed legacy unused imports)
**Tests:** 137/137 passing (128 previous + 9 new learning-shell tests)

---

## 1. Current Flow (audit findings)

| Surface | Before |
|---|---|
| `sections/page.tsx` | course-wide list with REAL VideoView progress ✓ but hand-rolled header, no aria progressbar, partial breadcrumb |
| `video/[videoId]` | player + prev/next **confined to videos within the SAME section** — books/exams and other sections invisible to navigation; section-only sidebar without completion/lock states; RTL bug (`mr-auto`) |
| `book/[bookId]` | viewer + same section-only sidebar; duplicate title bar; no shell |
| `exam/[examId]` | intro page with plain breadcrumb; engine untouched ✓ |
| Progress API | `/api/videos/progress` upserts `VideoView(progress,isCompleted≥90%)` + points — solid, untouched |
| Access gates | every page: `canAccessCourse` / free-item bypass + redirect to details — preserved verbatim |

## 2. Learning Shell Structure

New shared server layer + three server components (zero client JS):

```
src/lib/learning-shell.ts            getLearningShell(courseId,{user,current})
src/components/learning/
├── learning-header.tsx              breadcrumb <nav><ol> + course bar + ARIA Progress
├── contents-nav.tsx                 ContentsNav (desktop aside sticky + mobile <details>)
│                                    PrevNextNav (flat, skips locked, RTL arrows)
```

Wired into: video page (full rewrite of nav/aside), book page (same), exam intro
(breadcrumb upgraded to semantic ol; engine/take flow untouched), sections overview
(header swapped for LearningHeader).

## 3. Course Navigation

Flat ordered map across the WHOLE course in true content order:
per section → videos → books → exams (`order asc` respected everywhere).
Each row carries one status:

| Status | Meaning | Icon |
|---|---|---|
| `done` | video with `VideoView.isCompleted` | CheckCircle (success) |
| `current` | active lesson (see §5) | highlighted pill + `aria-current="page"` |
| `available` | accessible, not done | kind icon (primary) |
| `locked` | `!canAccess && !free` | Lock, **rendered as non-link div** |

Books/exams have NO completion storage today → always available/locked (documented,
no fake checkmarks).

## 4. Progress Source

100% existing `VideoView`. Course percent = completedVideos/totalVideos (clamped).
Rendered via ui `Progress` (full progressbar ARIA) in LearningHeader and reused on
sections overview. No schema/storage change; open ≠ complete (API thresholds intact).

## 5. Current Lesson Logic (deterministic)

1. Explicit item passed by the page (the one being viewed).
2. Fallback: latest `VideoView` with `progress>0 && !isCompleted`
   (orderBy lastWatchedAt desc) — single targeted query.
3. Else first flat item.
Completed videos keep status `done`; visual "you are here" comes from
`currentIndex` overlay in ContentsNav (so re-watching a finished lesson shows both).

## 6. Next/Previous Logic

Computed over the FLAT map filtered to `status !== "locked"` — navigation jumps
across section boundaries and over locked content, landing only on reachable items;
if nothing reachable remains, the button is absent (not a dead link). Locked paid
content is never linked or previewed.

## 7. Access Control

Untouched end-to-end: `canAccessCourse` still called per page; video/book/exam pages
keep their `redirect('/courses/[id]')` for paid-unauthorized; progress API keeps its
own subscription/free check. The shell's lock state is presentation ON TOP of these
server guards — never a replacement (verified by existing + new tests).

## 8. Video / Book / Exam Behavior

- Video: player, bookmarks, throttled progress API unchanged; shell adds context.
- Book: iframe/download logic unchanged (private `/api/files/*` signed flow);
  duplicate title bar removed in favor of one clean header row.
- Exam: intro card/questions count/attempts logic untouched; only breadcrumb modernized.

## 9–10. Query Changes & N+1

Per page now: **3 queries total** regardless of course size —
1× course tree with scalar-selects (id/title/duration/type/isFree/order only —
NO provider/url/fileUrl), 1× batched `videoView.findMany(videoId in all)`,
1× optional started-video lookup for fallback current.
Before: video page fetched full section trees twice + full models; book included all
section items full rows. Zero loops issuing queries (asserted by mock call counts).

## 11–13. Responsive / RTL / Dark

Mobile order = Lesson → PrevNext → collapsible «محتوى الكورس» `<details>`; desktop =
sticky aside (`top-24`, own scroll region). RTL: grep `\b(mr|ml|pr|pl)-\d` → **0**
in lib/components/pages touched; prev chevron `rtl:rotate-180`, next `rotate-180`,
breadcrumb uses logical gap. Tokens only (`bg-card border-border primary/success
danger/muted-*`) — dark mode inherits the variable-override layer.

## 14. Accessibility

Semantic `<nav>/<ol>` breadcrumb with `aria-current="page"` at leaf; contents nav
labelled; per-item `aria-current` + focus-visible rings; locked rows are
`aria-disabled` divs with explanatory `title` («يتطلب اشتراكاً نشطاً») and are NOT
focusable links; free badge pairs icon+text; LearningHeader exposes real
progressbar ARIA + sr-only counts; prev/next is a labelled `<nav>`.

## 15. Security

Shell output contains titles/durations/kinds/hrefs only — test asserts serialized
shell lacks `provider`, `url`, `fileUrl`, `password`. No tokens/secrets/private
signed URLs anywhere; locked paid media never exposed client-side; server routes
remain the enforcement point.

## 16–19. Tests / TypeScript / ESLint / Browser

**tests/learning-shell.test.tsx (9)**: flat ordering across sections · REAL progress
(1/3→33%, single batched call asserted) · explicit-current vs done preservation ·
deterministic started-video fallback (currentIndex=4) · non-subscriber matrix
(4 locked, prev/next null when nothing reachable) · sensitive-field leak guard
(provider/url/fileUrl/password) · inactive→null · ContentsNav aria-current +
locked-not-link + free chip (subscriber view) · PrevNext rtl-rotated arrows &
logical classes.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `eslint src` | **0 errors**, 31 warnings (**−2 vs baseline**) |
| `vitest run --no-file-parallelism` | **137/137** |

## 20. Remaining Limitations

1. Books/exams lack completion storage → cannot show done-state for them without a
   schema/logic change (out of scope); their rows show availability only.
2. PrevNext labels truncate long Arabic titles via line-clamp (tooltip-less).
3. Mobile contents panel doesn't auto-close after selection (consistent with catalog
   filters decision).
4. Free-preview deep-links still route through server guards; expired students get
   redirected mid-flow (existing behavior).
5. Browser visual verification pending deployment (matrices listed in §20 prompt —
   static equivalents covered by tests where feasible).
6. Parallel-vitest flakiness persists locally (`--no-file-parallelism`).

## 21. Recommendation for PHASE 6B-3B

1. Extend completion semantics decision (books read-marking? exam-passed-as-done?)
   BEFORE any UI promise — requires product/schema call, keep out of UX phases.
2. Add `?from=dashboard` style return-context if analytics on task-completion
   sources are wanted (no new models needed).
3. Consider surfacing section-level percent chips inside ContentsNav headers using
   the already-batched views map (pure JS, zero extra queries).
4. When teacher/admin need the same shell, promote `learning-shell.ts` selects into
   a shared options object rather than duplicating queries.

**STOP — PHASE 6B-3B not started.**
