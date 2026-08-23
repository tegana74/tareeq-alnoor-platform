# PHASE 6B-2C — Course Catalog + Discovery UX Report

**Date:** 2026-08-23
**Status:** COMPLETE
**TypeScript:** 0 errors
**ESLint:** 0 errors — warnings **34 → 33** (net −1; one legacy warning eliminated by the rewrite)
**Tests:** 104/104 passing (93 previous + 11 new catalog tests)

---

## 1. Current Architecture (audit findings)

`src/app/(site)/courses/page.tsx` (186 lines, server component):

| Aspect | Found |
|---|---|
| URL contract | `/courses?year&subject&teacher&q` via `filterLink()` — shareable, composable ✓ |
| Search | plain GET `<form>` submit → `q` param, `name.contains` match |
| Filters | Year/Subject/Teacher from live DB queries ✓ (no hardcoded arrays) |
| Data | course.findMany with FULL `include: { teacher: true, subject: true, sections:{include:_count} }` — over-fetching |
| Count | array length after fetch (real) |
| Pagination/Sort | none existed |
| Favorites | `getCurrentUser()` + favorites set for STUDENT hearts |
| 🔴 Mobile UX | 3 sidebar filter boxes stack ABOVE grid on mobile = filters consume most of first viewport |
| 🟠 Missing | active-filter chips, clear-search button, labeled search input, differentiated empty states, logical icon positioning (`right-4`) |
| Loading | 6B-1B skeleton existed but shape drifted from final layout |

## 2. New Catalog Structure

```
A Page Header        h1 «الكورسات» + real description
B Search             labeled input (sr-only label), start-icon, ×-clear when q
C Filters (mobile)   native <details> panel — trigger shows count Badge
C Filters (desktop)  <aside> sticky-free column, 260px grid lane
D Active chips       Badge chips «المادة: لغة عربية ×» per filter + «مسح الكل» when ≥2
E Results count      «عدد الكورسات المتاحة: N» (aria-live=polite, real N)
F Course grid        unchanged CourseCard grid sm:2 / xl:3
G Empty state        two distinct messages (see §9)
H Load strategy      none existed → none added (dataset assumption documented)
I Loading            loading.tsx re-aligned to new layout
```

## 3. URL Contract — PRESERVED BYTE-FOR-BYTE

`/courses`, `/courses?year=…`, `/courses?subject=…`, `/courses?teacher=…`,
`/courses?q=…`, and any combination remain valid and shareable. `filterLink()`
logic untouched (merge current params + update, drop empties). Chip ×-links and
«مسح الكل» simply target `filterLink({ key: undefined })` / `/courses`.
Tests assert removal links keep sibling params (e.g. year-only removal leaves `subject`).

## 4. Search Implementation

Kept the existing query-param model (GET form → server render). No debounce added —
there are no per-keystroke requests to begin with; submission is explicit.
Improvements: `sr-only` label + `htmlFor/id`, logical `start-4` icon position,
token focus ring (`border-primary-400 ring-primary-100`), and an ✕ clear link
(`aria-label="مسح البحث"`) that appears only while `q` is present.

## 5–6. Filters & Active Chips

Options come exclusively from live `Year/Subject/Teacher` queries (select-narrowed).
Selected option = filled primary pill (`bg-primary-500 text-white`) with
`aria-current="true"`; unselected hover uses primary tint tokens.
Active state renders as removable **Badge** chips (primary variant) — each with its
own labelled ✕ («إزالة فلتر …»); «مسح الكل» appears only at ≥2 active filters,
matching spec exactly (test-enforced).

## 7. CourseCard Data

Card API untouched. Query switched from broad `include` to exact `select`
(id, name, description, price±, isFeatured, teacher{name}, subject{name,icon,color},
sections→_count videos/books/exams) — precisely CourseCard's contract.
No ratings/student-counts/sales anywhere (test-guarded regex).

## 8. Loading

`(site)/courses/loading.tsx` updated (not replaced): header lines → search-bar bar →
mobile filter-trigger pill (`lg:hidden`) → desktop 3-group filter skeletons
(`hidden lg:block`) → count line → **6 × SkeletonCard** whose media/title/meta
shape mirrors CourseCard. Container `aria-busy`.

## 9. Empty State

| Condition | Message |
|---|---|
| No filters, zero courses | «لا توجد كورسات على المنصة بعد» (📚, no action button) |
| Any filter/search, zero results | «لا توجد نتائج للفلاتر الحالية» + Button «مسح الفلاتر وعرض كل الكورسات» |

Both wrapped in the dashed EmptyState container.

## 10. Performance

- Narrowed selects on years/subjects/teachers; teacher payload cut from full row to name.
- Course select matches card needs exactly; sections `_count` retained (required).
- No N+1: single findMany + three tiny reference lists in one Promise.all;
  favorites fetched once for STUDENT only.
- No DB query per card; no pagination added (catalog currently renders the full
  filtered set as before — dataset is course-catalog scale; revisit if it grows).

## 11. Caching

`revalidate = 300` kept as-is but **documented as a no-op here**: reading
`searchParams` (and cookies via getCurrentUser for favorites) makes this route
dynamic per-request in App Router regardless of ISR. It was already like this before
the redesign; converting favorites to client-fetch to enable true ISR would change
visible behavior and is deferred. No force-dynamic introduced; nothing cached got lost.

## 12. Responsive Behavior

Mobile order: Header → Search → Filter trigger (collapsed `<details>`) → chips →
count → cards. Desktop ≥lg: two-lane `[260px_1fr]` with always-visible sidebar.
Native `<details>` chosen over a JS drawer/dialog — accessible by default
(summary button semantics), zero JS, Escape/browser handling free, consistent with
the FAQ pattern from 6B-2B. Grid drops to 1 col under sm.

## 13. RTL

Grep `\b(mr|ml|pr|pl)-\d` over page+loading → **0 matches**. Search icon anchored
`start-4`, clear button `end-3`, paddings `ps-12 pe-12`, chip spacing `ms-1`,
layout gap-based. Arrow/direction-sensitive elements: none needed beyond links.

## 14. Dark Mode

All-new markup tokenized: surfaces `bg-card bg-background border-border`; text
`text-navy` (legacy-painted headings) + `text-muted-foreground text-ink`;
accents `bg-primary-500/50/100/200 text-primary-600/700`; danger hover for clear-X
(`hover:bg-danger-50 hover:text-danger-strong`). Selected pill white-on-primary-500
works both themes. Skeletons use `bg-border` (auto-adapts). No raw palette additions.

## 15. Accessibility

One H1. `<fieldset>/<legend>` per filter group. Labeled search (`sr-only` label +
id). Trigger summary natively keyboard-operable with visible «عرض/إخفاء» hint and
count badge. Every chip ✕ and search ✕ carries a descriptive `aria-label`. Results
line is `aria-live="polite"` so filter changes announce the new count. Focus-visible
rings inherited from primitives + explicit on option links. Empty-state action is a
real Button link.

## 16–18. Tests / TypeScript / ESLint

**tests/courses-catalog.test.tsx (11)** — prisma hoisted-mocks; conditional
findMany mock emulates filter effects:
header+search+all groups render from DB data · real results count (12 asserted,
invented «200» guarded absent) · year filter chip + removal link · subject/teacher
chips · combined filters keep shareable sibling links (2 removal hrefs asserted) ·
search term chip + clear-search button · platform-empty vs filtered-empty message
split incl. clear-filters CTA presence/absence · no fake metrics regex guard ·
mobile trigger present with active count context · clean `/courses` defaults.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `eslint src` full | **0 errors**, 33 warnings (−1 vs baseline) |
| page/loading targeted lint | 0 problems |
| `vitest run --no-file-parallelism` | **104/104** |

Lint-driven fix during phase: inner `FilterGroups()` JSX component violated
`react-hooks/static-components`; converted to invoked helper `renderFilterGroups()`
(same output, rule-compliant, zero behavior change).

## 19. Browser Verification

Browser visual verification pending deployment. Static checks completed for RTL
properties, token coverage, mobile/desktop layout branches, overflow risk (long
Arabic option names truncate-safe via block flow; chips wrap), and sticky-header
offset not required here (no in-page anchors on this route).

## 20. Remaining Issues

1. True ISR for this route requires moving favorites out of the server render
   (client store or route segment config) — deferred; current dynamic behavior
   predates this phase and is unchanged.
2. No pagination/load-more — fine at current catalog size; add cursor pagination
   only if catalog grows past ~100 active courses (monitor).
3. `<details>` filter panel doesn't auto-close after selecting an option on mobile;
   acceptable (users often apply multiple filters), revisit if feedback says otherwise.
4. Search remains substring `contains` (case-sensitive per Postgres default for the
   collation in use) — pre-existing matching behavior intentionally untouched.
5. Vitest parallel flakiness on this machine persists (use `--no-file-parallelism`).

## 21. Recommendation for PHASE 6B-2D (Course Details)

1. Carry over the token-first shell (`bg-card border-border text-muted-foreground`)
   and SectionHeading-style header block for consistency.
2. Course detail hero should reuse the same real-data discipline: title, teacher
   (deep-link), subject/year badges, honest content counts (_count aggregates).
3. Reuse Badge for meta chips and Progress for "your progress in this course" only
   if such data actually exists for the viewer.
4. Keep enrollment/paywall CTAs wired to existing actions — zero logic changes.
5. Consider extracting shared `SectionHeading` once detail pages confirm the shape
   (would then have homepage + catalog + details ≥3 usages → promote to ui/).

**STOP — PHASE 6B-2D not started.**
