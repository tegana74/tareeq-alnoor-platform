# PHASE 6B-1 UI Audit — Current State Analysis

**Date:** 2026-08-22
**Status:** AUDIT COMPLETE

---

## 1. Component Inventory

### Existing UI Components (7 files in src/components/ui/)

| Component | File | Exports | Status |
|-----------|------|---------|--------|
| Button | button.tsx | `Button` | Good — 6 variants, 3 sizes, href support |
| Field | field.tsx | `Input`, `Textarea`, `Select`, `Field` | Good — base field + label/hint/error |
| Logo | logo.tsx | `Logo` | Good — gradient icon + text |
| CourseCard | course-card.tsx | `CourseCard` | Good — complex card with media/badges |
| PasswordInput | password-input.tsx | `PasswordInput` | Good — show/hide toggle |
| ThemeToggle | theme-toggle.tsx | `ThemeToggle` | Good — dark/light with localStorage |
| BrandIcons | brand-icons.tsx | Social icons | Good — SVG with aria-hidden |

### Missing Components (ad-hoc inline patterns)

| Component | Current Pattern | Occurrences |
|-----------|----------------|-------------|
| Card | Inline divs with border/shadow/rounded | 50+ locations |
| Badge | Inline spans with color/rounded-full | 20+ locations |
| Alert/Banner | Inline divs with border/bg/text | 14 locations |
| Table | Raw HTML `<table>` | 5 files + 21 pseudo-tables |
| Dialog/Modal | None found | 0 |
| Tabs | None found | 0 |
| Progress | None found | 0 |
| Skeleton | None found | 0 (spinner-only loading) |
| EmptyState | Inline `<p>` with muted text | 49 locations |
| ErrorState | Inline error messages | Multiple patterns |

---

## 2. Critical Issues Found

### 2.1 Dead Color Classes (LIGHT MODE)

Tailwind v4 does NOT synthesize shade scales for custom `@theme` colors. Only base values exist:
- `--color-mint: #10b981` (no 50, 100, 200, 500, 600 shades)
- `--color-royal: #2563eb` (no 50, 100 shades)
- `--color-navy: #1e1b4b` (no light/dark variants as shades)

**Result:** These classes produce NO output in light mode:
- `bg-mint-50` (56 uses) — transparent background
- `bg-mint-100` (4 uses) — transparent background
- `border-mint-200` (5 uses) — no border color
- `bg-royal-50` (13 uses) — transparent background
- `bg-royal-100` (1 use) — transparent background
- `text-mint-200` (1 use) — no text color
- `bg-mint-500`, `bg-mint-600` (1 each) — transparent

Dark mode works ONLY because globals.css:193-236 manually paints these classes.

### 2.2 Unused Semantic Tokens

`--color-primary*` tokens defined (globals.css:9-13) but ZERO usage found:
```
--color-primary: #f59e0b       → 0 uses as bg-primary/text-primary
--color-primary-light: #fbbf24 → 0 uses
--color-primary-dark: #d97706  → 0 uses
--color-primary-50: #fffbeb    → 0 uses
--color-primary-100: #fef3c7   → 0 uses
```

Code hardcodes `amber-*` classes instead of semantic `primary` tokens.

### 2.3 Typography Weight Overuse

- `font-black` (900): 351 occurrences — used for nearly ALL headings and many labels
- `font-bold` (700): 306 occurrences — used for body text and sub-labels
- `font-extrabold` (800): 31 occurrences
- `font-semibold` (600): only 2 occurrences

The gap between font-bold and font-black is extreme. Most UIs use font-semibold or font-medium for body text.

### 2.4 RTL-Hostile Physical Spacing

Physical `pl-`/`pr-`/`ml-`/`mr-` classes found in RTL app:
- `mr-2` ×11, `ml-2` ×3, `ml-1` ×2, `mr-6`
- `pr-11` ×2, `pr-9`, `pl-9`, `pr-12`, `pl-4`
- `password-input.tsx:15` — `pr-9 pl-9 text-left`

Should use logical `ps-`/`pe-`/`ms-`/`me-` for RTL support.

### 2.5 Loading States

- 94 Loader2 instances across 39 files
- Zero skeleton components
- All loading is spinner-only (no content placeholder patterns)

---

## 3. Color Palette Analysis

### Most Used Colors (by frequency)

**Backgrounds:**
1. `bg-white` — 141 uses (base surface)
2. `bg-amber-50` — 72 uses (primary tint)
3. `bg-slate-50` — 67 uses (neutral tint)
4. `bg-rose-50` — 62 uses (danger tint)
5. `bg-slate-100` — 57 uses (neutral hover)
6. `bg-mint-50` — 56 uses (dead in light!)
7. `bg-navy` — 25 uses (dark surfaces)
8. `bg-amber-100` — 23 uses (primary hover)

**Text:**
1. `text-navy` — 278 uses (primary text)
2. `text-slate-500` — 242 uses (muted text)
3. `text-slate-400` — 125 uses (placeholder text)
4. `text-amber-600` — 108 uses (primary accent)
5. `text-rose-600` — 89 uses (danger text)
6. `text-white` — 86 uses (on dark backgrounds)
7. `text-mint-dark` — 75 uses (success text)

**Borders:**
1. `border-slate-200` — 174 uses (default border)
2. `border` — 172 uses (bare border)
3. `border-2` — 60 uses (emphasized border)
4. `border-slate-100` — 39 uses (subtle border)
5. `border-amber-400` — 37 uses (focus/active border)

---

## 4. Spacing Scale

### Most Used Padding/Margin
```
px-4 (150)  px-3 (88)   p-4 (72)    py-3 (70)   py-2 (68)
mt-2 (61)   p-6 (56)    mt-1 (54)   px-6 (52)   mb-6 (49)
py-1 (49)   mb-2 (46)   px-5 (42)   mb-4 (41)   mb-8 (36)
```

### Most Used Gap
```
gap-2 (200)  gap-3 (92)   gap-1 (55)   gap-4 (48)   gap-1.5 (19)
```

### Most Used Border Radius
```
rounded-xl (155)   rounded-2xl (150)   rounded-full (105)   rounded-lg (60)   rounded-3xl (59)
```

---

## 5. Button Variants Analysis

| Variant | Classes | Use Case |
|---------|---------|----------|
| primary | `bg-gradient-to-l from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/30` | Main CTA |
| outline | `border-2 border-amber-500 text-amber-600 hover:bg-amber-50 bg-white` | Secondary actions |
| ghost | `text-navy hover:bg-slate-100 bg-transparent` | Tertiary/links |
| navy | `bg-navy text-white hover:bg-navy-light shadow-md` | Admin/dark surfaces |
| danger | `bg-rose-600 text-white hover:bg-rose-700` | Destructive |
| mint | `bg-mint text-white hover:bg-mint-dark shadow-md` | Success actions |

### Button Sizes
```
sm: h-9 px-4 text-sm rounded-lg
md: h-11 px-6 text-sm rounded-xl
lg: h-13 px-8 text-base rounded-xl
```

---

## 6. Form Field Pattern

```tsx
// Base field
"w-full h-12 rounded-xl border-2 border-slate-200 bg-white px-4 text-sm text-ink
 placeholder:text-slate-400 outline-none transition-colors
 focus:border-amber-400 focus:ring-4 focus:ring-amber-100"

// Field wrapper
<div className="space-y-1.5">
  <label className="block text-sm font-bold text-navy">{label}{required && <span className="text-rose-500"> *</span>}</label>
  {children}
  {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
  {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
</div>
```

---

## 7. Card Pattern (Ad-hoc)

```tsx
// CourseCard base
"group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm
 transition-all hover:-translate-y-1 hover:border-amber-300 hover:shadow-xl hover:shadow-amber-500/10"

// Admin cards
"overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"

// Payment success
"rounded-3xl border-2 border-mint bg-mint-50 p-8 text-center"
```

---

## 8. Alert/Banner Patterns

### Success
```
rounded-3xl border-2 border-mint bg-mint-50 p-8 text-center
rounded-2xl border border-mint-200 bg-mint-50 p-5
```

### Error
```
rounded-2xl border border-rose-200 bg-rose-50/50 p-4
rounded-xl border border-rose-200 bg-rose-50 px-2 py-1
```

---

## 9. Empty State Pattern

```tsx
// Admin muted
<p className="p-6 text-center text-sm text-slate-400">لا توجد ...</p>

// Bold variant
<p className="text-sm font-bold text-slate-500">لا توجد نتائج</p>

// Hero block
<div className="flex flex-col items-center py-12">
  <Icon className="h-12 w-12 text-slate-300" />
  <h3 className="mt-4 text-lg font-extrabold text-navy">لا توجد نتائج</h3>
  <p className="mt-2 text-sm text-slate-500">...</p>
</div>
```

---

## 10. Table Pattern

```tsx
<table className="w-full text-sm">
  <thead className="bg-slate-50 text-xs font-black text-slate-500">
    <tr>
      <th className="px-4 py-2 text-right">Header</th>
    </tr>
  </thead>
  <tbody className="divide-y divide-slate-50">
    <tr>
      <td className="px-4 py-3">Cell</td>
    </tr>
  </tbody>
</table>
```

---

## 11. Typography Scale

### Font Sizes Used
```
text-[10px]  ×23   text-[11px] ×22   text-xs     ×251   text-sm     ×373
text-base    ×6    text-lg     ×37   text-xl     ×15    text-2xl    ×64
text-3xl     ×17   text-4xl    ×4    text-5xl    ×2     text-6xl    ×7
text-7xl     ×1
```

### Font Weights Used
```
font-semibold ×2    font-bold    ×306   font-extrabold ×31   font-black  ×351
font-mono     ×13
```

---

## 12. Shadow Scale

```
shadow-sm          ×16
shadow             ×8
shadow-md          ×8
shadow-lg          ×6
shadow-xl          ×13
shadow-2xl         ×3
shadow-[custom]    ×3 (arbitrary)
```

---

## 13. Gradient Recipes

| Name | Classes | Usage |
|------|---------|-------|
| Gold CTA | `from-amber-400 to-orange-500` | Buttons, logo |
| Navy-Royal | `from-navy to-royal` | Admin sidebar |
| Mint | `from-mint to-mint-dark` | Success elements |
| Rose | `from-rose-500 to-rose-600` | Danger elements |
| Violet-Indigo | `from-violet-600 to-indigo-600` | Premium/special |

---

## 14. Recommendations for Design System

### Priority 1: Fix Critical Bugs
1. Add mint-50..600 and royal-50..100 shade scales to @theme
2. Wire up --color-primary* tokens to actual usage

### Priority 2: Create Missing Components
1. Card — standardized container with variants
2. Badge — status/tag component
3. Alert — success/error/info banners
4. Skeleton — loading placeholder (replace spinners)
5. EmptyState — reusable empty content pattern
6. ErrorState — reusable error display pattern

### Priority 3: Improve Existing Components
1. Button — add loading prop (replace manual Loader2)
2. Field — add disabled state, improve error styling

### Priority 4: Token Centralization
1. Semantic color tokens (background, foreground, muted, primary, success, warning, danger, border, card)
2. Typography scale tokens
3. Spacing scale documentation

### Priority 5: Accessibility
1. Logical spacing for RTL (ps-/pe-/ms-/me-)
2. Focus-visible states
3. ARIA labels for icon-only buttons
4. Keyboard navigation patterns
