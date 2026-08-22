# PHASE 6B-1B — Reusable UI Components Report

**Date:** 2026-08-23
**Status:** COMPLETE
**TypeScript:** 0 errors
**ESLint:** 0 errors (36 pre-existing warnings; net new warnings from this phase: 0)
**Tests:** 70/70 passing (39 pre-existing + 31 new component tests)

---

## 1. Components Created (7)

All in `src/components/ui/`, all typed, className-mergeable, composition-friendly,
RTL-logical, dark-mode aware via Phase 6B-1A tokens.

### card.tsx — `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
- Variants: `default` · `bordered` · `elevated` · `interactive`
- Tokens: `border-border bg-card text-card-foreground`; interactive adds
  hover lift + `focus-visible:ring-primary-400` + offset on background.
- Extends native `HTMLAttributes<HTMLDivElement>` (id, aria-*, onClick… pass through).
- No forced padding at root (padding lives in Header/Content/Footer = p-6 pattern).

### badge.tsx — `Badge`
- Variants: `default`(primary tint) · `primary` · `success` · `warning` · `danger` · `neutral` · `info`
- Sizes sm/md. Pure presentational; zero business logic.
- Tokens: `bg-success-50 text-success-strong`, `bg-danger-50 text-danger-strong`,
  `bg-primary-*`, neutral=`bg-border text-foreground`, info=`bg-royal-50 text-royal`.
- Exports type `BadgeVariant`.

### alert.tsx — `Alert`
- Variants info/success/warning/danger; props `title?`, `icon?`, children.
- Accessibility: danger → `role="alert"` (assertive); others → `role="status"`
  + `aria-live="polite"`. Icon wrapped `aria-hidden`. Custom icon slot.
- Never renders raw errors itself — caller passes safe Arabic copy only.

### skeleton.tsx — `Skeleton`, `SkeletonText`, `SkeletonAvatar`, `SkeletonCard`
- CSS-only (`animate-pulse bg-border`) — no JS, no layout shift.
- All parts `aria-hidden="true"`; loading containers add `aria-busy="true"`.
- `bg-border` adapts light (#e2e8f0)/dark (#334155) automatically.

### empty-state.tsx — `EmptyState`
- Props: `title`, `description?`, `icon?` (default Inbox), `action?` (ReactNode),
  `className?` (used for container styling like dashed borders).
- `role="status"`; no business strings baked in.

### error-state.tsx — `ErrorState`
- Props: `title?`, `description?`, `onRetry?` (renders primary Button "إعادة المحاولة"),
  `action?` slot, `className?`. `role="alert"`.
- Generic default copy only; callers must never pass internals (test asserts convention).

### progress.tsx — `Progress` + exported `clampProgress()`
- Handles `undefined/null/NaN/<0/>max` safely via clamp; `role="progressbar"`
  with `aria-valuenow/min/max` + optional `aria-label`; variants primary/success/danger;
  sizes sm/md; optional label row with %.

## 2. Existing Components Modified

| File | Change | Preserved |
|---|---|---|
| button.tsx | +`loading?: boolean` (spinner prepend, disables, `aria-busy`; href → `pointer-events-none` + `aria-disabled` + tabIndex −1) | all 6 variants, 3 sizes, href, onClick, type |
| field.tsx | auto id via `useId`; wires `htmlFor`, `aria-describedby` (hint/error ids), `aria-invalid`; `disabled:*` + `aria-[invalid=true]:*` styles on baseField; hint uses muted token | Input/Textarea/Select/Field public APIs identical |

No breaking changes — every pre-existing call site compiles untouched (tsc=0 proves it).

## 3. APIs Introduced
`Card(+4 sub)` · `Badge/BadgeVariant` · `Alert` · `Skeleton(+3 sub)` ·
`EmptyState` · `ErrorState` · `Progress/clampProgress` · `Button.loading` ·
`Field` implicit a11y wiring (+optional explicit `htmlFor`).

## 4. Existing APIs Preserved
Button (variants/sizes/href/disabled/type/onClick), Field/Input/Textarea/Select/PasswordInput,
Logo, CourseCard, ThemeToggle — signatures unchanged.

## 5. Pages Migrated (scoped list only)

| Page/File | Migration |
|---|---|
| login/login-form.tsx | manual card shell → `Card` (rounded-3xl shadow-xl kept via className); error `<p>` → `Alert danger`; submit → `loading={pending}` |
| register/register-form.tsx | same trio; success box → `Alert success` |
| subscribe/payment-form.tsx | error box → `Alert danger`; submit `loading={pending}` |
| wallet/charge/charge-form.tsx | same as payment |
| results/page.tsx | score pill → `Badge` success/warning/danger; 2 inline empties → `EmptyState` (compact) |
| courses/page.tsx | hero empty block → `EmptyState` (dashed container via className, 🔍 icon slot) |
| courses/loading.tsx **(new)** | skeleton grid (filters + 6 SkeletonCard) replaces spinner for route |
| results/loading.tsx **(new)** | stat cards + table + text skeletons |

Home page intentionally NOT migrated (unique decorative cards; global `(site)/loading.tsx`
spinner left serving it — replacing globally would affect every route).

## 6. Duplicated Patterns Removed
8 inline patterns replaced (2 card shells, 4 error/success boxes, 1 score-pill loop ×N rows,
3 inline empty messages consolidated into 2 EmptyStates) + 2 spinner-only routes → Skeletons.

## 7. Accessibility Improvements
- Field↔input programmatic linkage (`label[for]`, `aria-describedby`, `aria-invalid`)
  for ALL existing forms using Field — zero call-site changes needed.
- Alert live-regions (polite/assertive by severity); ErrorState/EmptyState roles;
  Progress full progressbar ARIA; Skeleton hidden from AT with busy regions announced.
- Button `aria-busy`; required-marker gets `sr-only "مطلوب"` + decorative star aria-hidden.
- No nested interactive elements introduced (Link-in-button impossible by design).

## 8. RTL Improvements
New components use only logical utilities (`gap`, `ms/me/ps/pe` where applicable);
grep confirms **zero physical mr/ml/pr/pl inside src/components/ui/**. Icons flow
naturally in RTL flex rows. Migrated pages inherit 6B-1A logical spacing.

## 9. Dark Mode Verification (static matrix)
Every token used resolves under `[data-theme=dark]`: card/bg/border/muted set,
success/danger trios overridden (#052e24/#065f46/#34d399 · #4a1122/#881337/#fb7185),
primary family per 6B-1A, royal/info lifted via existing overrides. States checked:
hover (buttons/cards), focus-visible rings, disabled (opacity+bg-muted/20), invalid ring,
badge/alert tints. Forbidden `text-primary-50` absent. Legacy slate/rose classes in
untouched old components remain covered by the hand-painted dark layer.

## 10. Tests Added — `tests/ui-components.test.tsx` (31)
SSR-rendered (`renderToStaticMarkup`, no jsdom dependency added):
Card render/composition/focus variant · Badge 7 variants + size · Alert 4 variants +
role/live-region mapping + title/icon · Skeleton hidden+animated + helpers ·
EmptyState title/desc/action/role · ErrorState retry + role + generic-copy guard ·
Progress clamp (−5,150,null,undefined,NaN,custom-max) + ARIA attrs + label % ·
Button loading (disabled="" + aria-busy + spinner, enabled when idle) ·
Field wiring (generated id ↔ label, error→invalid+describedby+role=alert, hint path,
caller-id respected).

## 11–13. Regression Results
`tsc --noEmit` → **exit 0**. `eslint` → **0 errors**, warnings unchanged in count
category (pre-existing unused-vars only; 2 self-introduced fixed to zero).
`vitest run --no-file-parallelism` → **70/70**.
Functional review of migrated flows (login, register, payment submit paths,
results rendering, courses filtering/empty): logic untouched — diffs are markup-only;
server actions, handlers, and data calls byte-identical.

## 14. Remaining Duplicated Patterns (out of scope, listed not fixed)
~40 inline empty-states outside scoped pages (wallet, favorites, bookmarks, admin lists,
teacher lists…) · pseudo-table divide-y lists ×20 · raw `<table>` ×4 remaining ·
inline score/status pills in practice & exam-result pages · banner boxes in
subscribe/exam/login-notice pages · single IOSModal (pwa-install).

## 15. Components Intentionally NOT Created
- **Dialog**: exactly ONE modal exists (IOSModal in pwa-install) → rule "لا abstraction لـ1–2 استخدامات". Revisit if ≥3 real modals appear.
- **Tabs**: zero tab-like switchers found project-wide.
- Table, Tooltip, Dropdown, Toast: no qualifying duplication in scope.

## 16. Risks
1. Field now injects ids into its child — inputs rendered conditionally or wrapped in
   custom fragments still fine (only single valid element is wired; others untouched).
   Verified against every current usage (all pass plain Input/Select/Textarea/PasswordInput).
2. Card default radius rounded-2xl vs legacy shells rounded-3xl — migrated shells pass
   `rounded-3xl` explicitly; future adopters should match per-screen intent.
3. SSR-based tests don't execute client event handlers (onClick wiring covered by
   types + disabled attr assertions, not simulation).
4. Parallel-vitest flakiness on this machine persists (documented in 6B-1A) — use
   `--no-file-parallelism` locally.
5. Encoding hazard: PowerShell bulk edits must always preserve bytes (one corruption
   occurred & was reverted this phase; Edit-tool-only workflow adopted thereafter).

## Out of Scope / Recommended Later
Dark-layer consolidation onto variable overrides · migrating remaining empty-states/
tables opportunistically per-page · Button ghost/danger/mint variant tokenization ·
password-input absolute insets → start/end · E2E browser pass for §22 across
Desktop/Tablet/Mobile × Light/Dark (static analysis performed; runtime screenshots need
a deployed environment).

## 17. Recommendation for PHASE 6B-2
1. Redesign Homepage/Header/Course-Catalog/Student-Dashboard **on top of these primitives**
   (per roadmap stop-condition they were untouched here).
2. Standardize page headers (title + description + actions) as a small `PageHeader`
   composite once ≥3 redesigned pages confirm the shape.
3. Introduce a `Table` primitive when the first admin redesign touches its 5 raw tables.
4. Replace remaining `window.alert()` legacy calls with Alert/toast during those pages'
   redesigns.
5. Adopt Skeletons for teacher/admin list routes after their redesigns land.

**STOP — PHASE 6B-2 not started.**
