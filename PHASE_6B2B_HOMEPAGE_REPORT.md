# PHASE 6B-2B — Homepage Redesign Report

**Date:** 2026-08-23
**Status:** COMPLETE
**TypeScript:** 0 errors
**ESLint:** 0 errors — warnings **dropped 36 → 34** (rewrite removed two legacy unused-vars)
**Tests:** 93/93 passing (83 previous + 10 new homepage tests)

---

## 1. Current Homepage Findings (audit)

`src/app/(site)/page.tsx` (426 lines, ISR `revalidate=300`, public, no auth):

| Area | Finding |
|---|---|
| Queries | featured courses(isFeatured×4 + teacher/subject/sections counts) · featured teachers ×4 · active years · active subjects · 2 appearance settings |
| Sections | Hero → 3 steps → Years grid → Subjects chips → Teachers → Featured Courses → Features ×4 → Payment CTA |
| 🔴 Fake data #1 | Hero visual mock card: «رصيد المحفظة **١٢٠ ج.م**» — invented number |
| 🔴 Fake claim #2 | Featured subtitle «أعلى تقييم وأكثرها اشتراكاً» — no ratings/sales exist in system |
| ⚠️ Invented feature | Feature card «هتشارك — مجموعات نقاش» — no community/discussion feature exists |
| ⚠️ Copy drift | Badge «للمرحلة الثانوية فقط» while DB years include إعدادية |
| Missing | FAQ · Student/Parent value · section anchors · stats |
| Good | Real Year/Subject data with working filters (`/courses?year/subject`) · CourseCard reuse · honest payment numbers from constants |

## 2. New Structure (A–K)

```
A Hero            real stats row + live preview card from actual featured course
B Stages   #stages    years grouped إعدادية/ثانوية by REAL name matching
C Subjects #subjects  chips + real per-subject course count badges
D Courses  #courses   CourseCard grid (isFeatured), honest subtitle
E Teachers #teachers  whole-card deep links → /courses?teacher=id
F Why      #why       6 truthful platform features
G How      #how       4 steps matching the real signup→subscribe→learn flow
H Value    #value     student / parent value cards (existing features only)
I FAQ      #faq       6 questions answered strictly from system behavior
J Final CTA           «ابدأ رحلتك التعليمية» dual buttons (static, ISR-safe)
K Footer              rendered globally by layout — untouched
```

## 3–4. Data Sources (all real)

| Section | Source |
|---|---|
| Stats row | `course.count`, `teacher.count`, `years.length`, `subjects.length` — exact live numbers |
| Stage grouping | keyword match on `Year.name` (إعدادي/ثانوي); unmatched → «مراحل أخرى» group only if present; empty groups hidden |
| Subject counts | `course.groupBy(subjectId).count` where isActive — rendered even when 0 («0 كورس») |
| Hero preview | first featured course: real name/teacher/subject + aggregated videos/books/exams; hidden entirely when no featured courses |
| FAQ answers | flows verified in code: register fields, payment proof review via PAYMENT constants, `SUBSCRIPTION_DAYS = 365`, wallet charge/redeem codes, results analytics, parent link-by-phone OTP |

Removed outright (honesty rule): wallet-balance mockup, ratings/sales subtitle,
«مجموعات نقاش» feature claim.

## 5. Components Reused

Button (incl. size lg + outline overrides for dark CTA panel) · CourseCard (unchanged)
· Card · Badge (subject counts + hero lecture badge) · PwaInstallButton variant="hero"
· icons via lucide. One LOCAL composite only: `SectionHeading()` (7 uses on this page)
— kept file-local per §19 rule.

## 6. Queries Changed

Before: 5 queries. After: 8 in one `Promise.all` — added `course.count`,
`teacher.count`, `course.groupBy(by subjectId)`; teacher select narrowed to
4 scalar fields (was full model); subjects select narrowed to 4 fields.
All indexed/trivial cost. **Caching strategy unchanged** (`revalidate=300`).
Deliberate: homepage stays fully static-public — NO `getCurrentUser()` call,
so Final CTA is static guest-oriented (courses/register) rather than role-aware;
role-aware CTA would force dynamic rendering for every visitor (documented trade-off).

## 7. Responsive Verification

Grid ladder: hero `lg:grid-cols-2` (visual column hidden <lg) · stages `sm:2/lg:3`
· teachers `sm:2/lg:4` · why-cards `sm:2/lg:3` · steps `md:2/lg:4` · value `lg:2`.
Stats wrap via flex-wrap; FAQ max-w-3xl centered; container max-w-7xl px-4/sm:6
(matches header rhythm). No fixed widths anywhere; Arabic wraps naturally.
Static analysis passed; see §16.

## 8. RTL Verification

Grep `\b(mr|ml|pr|pl)-\d` over page.tsx → **0 matches**. Logical only:
`me-1`, `gap-*`, `ms-6` (preview offset), arrow motion uses
`group-hover:-translate-x-1 rtl:group-hover:translate-x-1` so arrows nudge in the
reading direction in both locales.

## 9. Dark Mode

Token-first rewrite: surfaces `bg-card border-border bg-background`; muted text via
`text-muted-foreground`; accents `text-primary-600 bg-primary-50/100 text-primary-700`;
success `text-success-strong`. Headings keep brand `text-navy` (dark-painted by the
legacy layer, consistent with rest of site). Navy sections keep white-on-navy with
white/10 surfaces (theme-invariant by design). No raw new palette dependencies that
lack dark coverage.

## 10. Accessibility

Single `<h1>`; every section `<h2>` via SectionHeading; stage groups use `<h3>`.
Steps rendered as semantic `<ol><li>`. Stats as `<dl>` with `sr-only` labels.
FAQ uses native `<details>/<summary>` (keyboard-free-of-charge) with rotating
decorative marker (`aria-hidden`). Teacher images get descriptive alt
(`صورة المدرس {name}`); initials fallback is decorative. Icon-only arrows hidden.
Focus-visible rings on every Link/Button (inherited from primitives + explicit).
Contrast: primary-700 on primary-50 and foreground tokens both modes ✓.

## 11. SEO

Root layout already ships full metadata (title template, description, OpenGraph) —
global SEO untouched. Added page-level `metadata`: descriptive title suffix +
Arabic description mirroring real offerings. OG image binary remains a pre-existing
TODO (recorded, not fabricated).

## 12. Performance

8 cheap parallel queries; no nested includes beyond what CourseCard already needed;
teacher payload reduced; groupBy replaces N+1 counting. Static generation preserved —
zero runtime auth cost. Portal/drawer unaffected (header concern). No new JS shipped
by the page (server component; details/summary is HTML-native animation-free).

## 13–15. Tests / TypeScript / ESLint

**tests/homepage.test.tsx (10)** — prisma mocked via `vi.hoisted`, async server
component awaited before SSR render:
hero H1 + dual CTAs · stats reflect mocked counts exactly (12/3/2 asserted) ·
stage grouping from year names incl. hiding empty groups · subject chip shows
real count («7 كورس») · CourseCard output contains course name and contains NO
rating/subscriber fabrications (regex guard) · teacher deep-link hrefs · all 8
anchor ids present with ≥8 `scroll-mt-20` offsets · FAQ contains payment numbers +
«365 يوماً» + parent OTP wording · preview badge aggregates videos (3+4→7) ·
empty-DB graceful degradation (sections disappear, page renders).

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `eslint src` | 0 errors / 34 warnings (−2 vs baseline) |
| `vitest run --no-file-parallelism` | **93/93** |

## 16. Browser Verification Status

Browser visual verification pending deployment. Static checks completed for
responsive ladders, RTL logical properties, token coverage (light+dark), anchor
offsets, and overflow risk points (blur orbs are `-z-10` inside `overflow-hidden`
root; drawer unaffected).

## 17. Remaining Issues

1. Role-aware Final CTA requires either dynamic rendering or a client-side user
   probe — deferred to avoid regressing ISR (documented §6).
2. OG image still missing project-wide (pre-existing TODO).
3. `details` FAQ lacks animated height transition (native element chosen for
   accessibility > flourish).
4. Stage detection relies on Arabic naming convention of Year records; if admins
   enter non-conforming names, those fall into «مراحل أخرى» gracefully.
5. Homepage test mocks mirror current Prisma shapes; schema field additions will
   require fixture updates like any unit suite.
6. Vitest parallel flakiness on this machine persists (run with
   `--no-file-parallelism`).

## 18. Recommendations for PHASE 6B-2C (Course Catalog)

1. Reuse the same SectionHeading pattern (promote to shared ui primitive once
   catalog adopts it → 2 pages ≥ threshold).
2. Apply identical stage-grouping helper (`header-config` style pure module) to
   catalog sidebar/filters — consider extracting `stageOf(yearName)` there.
3. Keep `/courses?year&subject&teacher&q` contract untouched; homepage links
   already target it.
4. Skeleton loading for catalog should mirror homepage card rhythm
   (`SkeletonCard` grid) via `(site)/courses/loading.tsx` (already scaffolded in 6B-1B).
5. After catalog, evaluate promoting `IconButtonLink` + `SectionHeading` into ui/.

**STOP — PHASE 6B-2C not started.**
