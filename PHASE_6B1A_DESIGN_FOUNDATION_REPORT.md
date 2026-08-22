# PHASE 6B-1A — Design System Foundational Fixes Report

**Date:** 2026-08-23
**Status:** COMPLETE
**TypeScript Errors:** 0
**ESLint Errors:** 0 (36 pre-existing warnings only)
**Tests:** 39/39 passing

---

## Summary

Phase 6B-1A establishes the design-system foundation without touching business logic,
routing, database, or APIs. It fixes broken color shade scales (mint/royal), activates
the unused `primary` semantic tokens in shared components with full dark-mode support,
converts physical RTL-hostile spacing to logical properties, normalizes typography
weights for body/helper text, and adds dark-aware semantic tokens.

No new components were created in this phase (deferred to 6B-1B as instructed).
Prematurely scaffolded component files from the previous session were removed:
`card.tsx`, `badge.tsx`, `alert.tsx`, `skeleton.tsx`, `progress.tsx`,
`empty-state.tsx`, `error-state.tsx`. Button/Field experimental API changes
(loading prop, disabled styling) were reverted to originals before applying
token swaps only.

---

## 1. Mint Shade Scale Fix

**Problem:** Tailwind v4 does not synthesize shade scales for custom `@theme` colors.
Only `--color-mint` existed, so these classes generated NO light-mode CSS:
`bg-mint-50` ×56, `bg-mint-100` ×3, `bg-mint-500`, `bg-mint-600`,
`border-mint-200` ×4, `text-mint-200`.

**Fix (`src/app/globals.css @theme`):** full emerald-anchored ramp matching the brand base:

| Token | Value | Note |
|---|---|---|
| `--color-mint-50` | `#ecfdf5` | surfaces |
| `--color-mint-100` | `#d1fae5` | chips |
| `--color-mint-200` | `#a7f3d0` | borders |
| `--color-mint-300` | `#6ee7b7` | ramp completeness |
| `--color-mint-400` | `#34d399` | = mint-light |
| `--color-mint` / `-500` | `#10b981` | brand base |
| `--color-mint-600` | `#059669` | = mint-dark |

Mental model: **500 = base, 600 = dark, 400 ≈ light** — identical anchoring used for royal.

**Dark mode:** existing hand-painted class overrides keep working
(`[data-theme="dark"] .bg-mint-50 { #052e24 }`, `.bg-mint-100 { #064e3b }`,
`.border-mint-200 { #065f46 }`, `.text-mint-dark { #34d399 }`).

**Usage audit result:** every used mint class now resolves.
The single `text-mint-200` use (redeem success helper) was a low-contrast accident of
the dead-class bug; replaced with semantic `text-mint-dark` (see §5 note).

## 2. Royal Shade Scale Fix

Same principle applied:

| Token | Value |
|---|---|
| `--color-royal-50` | `#eff6ff` |
| `--color-royal-100` | `#dbeafe` |
| `--color-royal-200..400` | `#bfdbfe` / `#93c5fd` / `#60a5fa` |
| `--color-royal` / `-500` | `#2563eb` |
| `--color-royal-600` | `#1d4ed8` (= royal-dark) |

Used shades today: `bg-royal-50` ×12, `bg-royal-100` ×1 — both now live in light mode.
Added missing dark override `[data-theme="dark"] .bg-royal-100 { #1a3560 }`
(hover state on admin grant-course chip would otherwise flash light blue).

## 3. Primary Semantic Tokens

**Tokens kept and expanded** (`--color-primary*` was defined-but-unused):

```
primary-50..800 = amber values verbatim (#fffbeb … #92400e)
primary = #f59e0b   primary-light = #fbbf24   primary-dark = #d97706
```

**Dark mode via CSS variables (new pattern):**
Tailwind v4 utilities compile to `var(--color-primary-*)`. Overriding the variables
under `[data-theme="dark"]` makes every utility adapt automatically:

```css
[data-theme="dark"] {
  --color-primary-50: #3b2408;  /* mirrors legacy .bg-amber-50 override   */
  --color-primary-100: #452a0d;
  --color-primary-200: #854d0e;
  --color-primary-300: #a16207;
  --color-primary-400..600: #fbbf24;  /* mirrors .text-amber-500/600 lift */
  --color-primary-700: #fcd34d;
  --color-primary-800: #fde68a;
}
```

Known trade-off (documented): a variable serves both bg- and text- utilities;
`text-primary-50` would be dark-on-dark — avoid it; use `text-primary-600/700` for
accent text (matches existing amber conventions).

**Amber → primary swap scope (shared UI components ONLY):**

| File | Replaced classes |
|---|---|
| `ui/button.tsx` | `from-primary-400`, `shadow-primary-500/30(/40)`, outline: `border-primary-500 text-primary-600 hover:bg-primary-50` |
| `ui/field.tsx` | focus: `border-primary-400 ring-primary-100` |
| `ui/logo.tsx` | icon gradient `from-primary-400`, dot `text-primary-500`, shadows |
| `ui/theme-toggle.tsx` | hover `text-primary-600` |

Pixel-identical in light mode (values equal amber counterparts); gradient endpoint
`to-orange-500/orange-600` intentionally kept (brand gradient partner, not a primary token).

Page-level `amber-*` left untouched by design (foundation ≠ migration):
prices, warning banners, star badges, decorative accents stay amber until later phases.

## 4. RTL Logical Spacing

All 21 physical margin/padding occurrences converted (rendering-identical under
`dir="rtl"` since start=right / end=left):

| Physical → Logical | Sites |
|---|---|
| `mr-* → ms-*` | appeals, courses, exemptions, teacher/admin appeals rows, ai-generator, home feature card (`mr-6`) |
| `ml-* → me-*` | exam/practice question numbers (`ml-1/ml-2`), points chip, live ranking |
| `pr-* → ps-*` | search input (`ps-12`), phone inputs (`ps-11` ×2), password field (`ps-9`) |
| `pl-* → pe-*` | password field (`pe-9`), search input (`pe-4`) |

Post-check: `\b(mr|ml|pr|pl)-\d` over src/**/*.tsx → **0 matches**.
Intentionally kept physical: `text-left` on numeric inputs (LTR digit intent),
absolute `right-3/left-3` icon insets (positional, converted to `start-/end-` deferred to 6B-1B component work).

## 5. Typography Normalization

Targeted weight softening for non-heading text (78 replacements across ~30 files):

| Pattern replaced | Count | Rationale |
|---|---|---|
| `font-bold text-slate-400/500` → `font-medium` | 51 | metadata, helpers, empty-state line B |
| `font-black text-slate-400/500` → `font-bold` | 27 | muted meta wrongly at 900 weight |

Resulting weight census: `font-black` 351→322, `font-bold` 306→282,
`font-medium` 2→53. Hierarchy now: headings/buttons keep black/bold;
body-meta sits at medium. No font sizes changed.

Extra contrast fix surfaced during audit: `redeem-code-form.tsx` helper pair
`text-rose-200` / `text-mint-200` (pale-on-white, formerly half-dead classes)
→ `text-rose-600` / `text-mint-dark` at `font-medium`.

## 6. Semantic Token Structure

Defined in `@theme` + dark overrides via variable redefinition:

| Token | Light | Dark | Intended class |
|---|---|---|---|
| background / foreground | `#f8fafc` / `#0f172a` | `#0f172a` / `#e2e8f0` | `bg-background text-foreground` |
| card / card-foreground | `#ffffff` / `#0f172a` | `#1e293b` / `#e2e8f0` | `bg-card` |
| border | `#e2e8f0` | `#334155` | `border-border` |
| muted / muted-foreground | `#64748b` / `#94a3b8` | `#94a3b8` | `bg-muted text-muted-foreground` |
| success / warning / danger | emerald/amber/rose bases | lifted tints | `bg-success text-danger …` |

**Rules for future phases (6B-1B onward):**
1. New components MUST consume tokens (`bg-card`, `border-border`, `text-primary-600`,
   `bg-primary-50`, `text-mint-dark`, `text-rose-600`) — no raw palette classes inside ui/.
2. Never write `text-primary-50` (dark-mode trap); accent text = `primary-600/700`.
3. Page-level palette classes may remain; migrate opportunistically when editing a page.
4. Spacing: logical only (`ms/me/ps/pe`, gap) inside components.
5. Weights: headings `font-black/extrabold`, actions/labels `font-bold/semibold`,
   meta/helpers `font-medium`, body default.

## 7. Light Mode Verification

Static mapping check — every used shade class resolves to a defined token:

```
mint:    bg-50/100/500/600 · border-200            ✓ all defined
royal:   bg-50/100                                  ✓ all defined
primary: bg-50 · border-400/500 · from-400 · ring-100 · shadow-500 · text-500/600 ✓
```

Previously-dead classes (`bg-mint-50` ×56 etc.) now emit real CSS — surfaces like
success banners regain their intended tinted backgrounds.

## 8. Dark Mode Verification

Three-layer coverage confirmed statically:
1. Legacy hand-painted class overrides (slate/amber/mint/rose/royal families) — untouched.
2. NEW variable-level overrides for entire primary scale + semantic tokens — any current/future utility adapts.
3. New-shade gap fills: `.bg-royal-100` dark override added; solid greens
   (`bg-mint-500/600` + white text, admin exemptions button) verified legible on dark.

No transparent backgrounds, invisible borders, or invisible texts found in the
audited matrix. Runtime visual pass recommended at next deploy.

## 9. Tests

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 — includes fixing 2 latent TS2339 errors in `admin/coupons/coupon-form.tsx` (explicit `useActionState<State, FormData>` generic; type-only fix, zero behavior change) |
| `npx eslint src --ext .ts,.tsx` | 0 errors, 36 warnings (all pre-existing `no-unused-vars`) |
| `npx vitest run --no-file-parallelism` | **39/39 passing** |

Note: full-suite parallel runs intermittently time out on this machine under load
(import phase >25s starves workers; identical flake observed pre-phase with six files).
Isolated runs pass in <1.5s per file. Flagged as environment issue, not code.

## 10. Files Modified

**Core tokens/components (7):**
- `src/app/globals.css` — mint/royal/primary scales, dark var overrides, semantic tokens
- `src/components/ui/button.tsx` · `field.tsx` · `logo.tsx` · `theme-toggle.tsx` — primary token swap
- `src/components/ui/password-input.tsx` — ps-9/pe-9

**RTL spacing + typography sweeps (~30 page/component files)** including:
appeals, courses, courses/[id], exam take/result/runner, practice page/runner,
exemptions (site+admin), forgot-password, login-form, teacher appeals/live/grading/
attempts/question-bank, wallet charge/redeem pages, admin users/teachers/payments/
coupons/store/store-locator/structure/recharge-codes/appeals/page, ai-generator,
live mark-attendance, store-redeem, results, favorites/bookmarks/notifications,
parent/add-child-form, pwa-install, course-actions, global-error.

**Deleted (premature 6B-1B scaffolding):** `ui/{card,badge,alert,skeleton,progress,empty-state,error-state}.tsx`

**Type fix:** `src/app/admin/coupons/coupon-form.tsx`

## 11. Remaining Issues

1. **Parallel vitest flakiness** — machine-load timeouts; consider `testTimeout: 10000`
   or CI sequential pool in a future infra pass.
2. **Legacy dark-mode layer** — dozens of hand-painted class selectors could eventually
   be replaced wholesale by the new variable-override technique (big cleanup, not now).
3. **Page-level amber/mint hardcoding** — prices, badges, banners still raw palette;
   migrate per-page opportunistically.
4. **Absolute insets** (`right-3/left-3`) still physical in password-input & file inputs —
   convert alongside 6B-1B component work.
5. **`to-orange-500/600`** gradient endpoints untokenized (brand decision pending).
6. **36 lint warnings** (unused vars) — pre-existing, untouched per scope.
