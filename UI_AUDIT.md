# Complete UI Audit — D:\hussian (2026-08-22)

## 0. Critical Findings

**CRITICAL — Dead color classes (verified against compiled CSS `.next/static/chunks/0zfglpj1zsx17.css`).**
`@theme` defines only `--color-mint`, `--color-mint-light`, `--color-mint-dark`, `--color-royal`, `--color-royal-light`, `--color-royal-dark`. Tailwind v4 does not synthesize missing shades, so these utilities are NEVER generated for light mode (they exist ONLY as `[data-theme=dark]` hand-painted overrides in globals.css):

| Dead class | Uses | Light-mode result |
|---|---|---|
| `bg-mint-50` | ×56 | transparent |
| `bg-royal-50` | ×13 | transparent |
| `bg-mint-100` | ×4 | transparent |
| `border-mint-200` | ×5 | no border color |
| `bg-mint-500`, `bg-mint-600`, `bg-royal-100`, `text-mint-200` | ×1 each | transparent |

Dark mode works only because globals.css:193–198, 208–210, 234–236 paint them manually. Fix: add `--color-mint-50…600` and `--color-royal-50/100` to `@theme`.

Other flags:
- `--color-primary*` tokens defined (globals.css:9–13) but ZERO `bg-primary/text-primary/border-primary` usage — code hardcodes `amber-*`.
- `font-black` ×351 vs `font-bold` ×306 — extremely heavy typography everywhere.
- Physical `pl-/pr-/ml-/mr-` in RTL app (e.g., password-input.tsx:15 `pr-9 pl-9`) — prefer logical `ps-/pe-/ms-/me-`.
- No Skeleton component exists anywhere; loading is spinner-only.
- `bg-gradient-to-*` (v3 name) used ×24 — v4 renamed to `bg-linear-to-*` (old alias still compiles).
- `h-13` (button lg) verified GENERATED in compiled CSS (v4 dynamic spacing OK).

## 1. File Inventory

### src/components/ui/ — 7 files total (glob-verified)
| File | Lines | Exports |
|---|---|---|
| button.tsx | 66 | `Button` |
| field.tsx | 45 | `Input`, `Textarea`, `Select`, `Field` |
| logo.tsx | 29 | `Logo` |
| course-card.tsx | 120 | `CourseCard` |
| password-input.tsx | 27 | `PasswordInput` |
| theme-toggle.tsx | 43 | `ThemeToggle` |
| brand-icons.tsx | 45 | `FacebookIcon`, `InstagramIcon`, `TikTokIcon`, `TelegramIcon`, `YouTubeIcon` |

DO NOT EXIST: card.tsx, dialog.tsx, tabs.tsx, badge.tsx, alert.tsx, table.tsx, input.tsx, select.tsx, progress.tsx, skeleton.tsx. Cards/alerts/badges/tables are ad-hoc inline combos (recipes below).

### Config
- NO tailwind.config.* anywhere. Tailwind v4 CSS-first (`tailwindcss ^4`, `@tailwindcss/postcss ^4` — package.json:48,55).
- postcss.config.mjs: `{ plugins: { "@tailwindcss/postcss": {} } }`.
- next 16.3.0, react 19.2.8, lucide-react ^1.31.0. No cva/tailwind-merge/radix/headlessui/framer-motion.
- Class joiner: `classNames()` src/lib/utils.ts:26–27.
- RTL Arabic app: `<html lang="ar" dir="rtl">` src/app/layout.tsx:96–97. Font Cairo (`--font-cairo`) layout.tsx:7–11.

### Theme tokens — src/app/globals.css (290 lines)
`@import "tailwindcss"` (1); `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))` (3).

`@theme` (5–29):
```
--font-sans: var(--font-cairo), ui-sans-serif, system-ui, sans-serif;
--color-primary:#f59e0b  --color-primary-light:#fbbf24  --color-primary-dark:#d97706
--color-primary-50:#fffbeb  --color-primary-100:#fef3c7      (UNUSED in code)
--color-navy:#1e1b4b  --color-navy-light:#312e81  --color-navy-dark:#141233
--color-mint:#10b981  --color-mint-light:#34d399  --color-mint-dark:#059669
--color-royal:#2563eb --color-royal-light:#60a5fa --color-royal-dark:#1d4ed8
--color-surface:#f8fafc  --color-ink:#0f172a
```
Custom utilities: `.bg-light-glow` (58–63, dual radial amber/royal glows over #f8fafc; dark variant 96–101), `.text-gradient-gold` (65–70, linear 90deg #f59e0b→#f97316→#f59e0b clipped text), `.animate-fade-up` (72–84, fadeUp keyframes translateY(16px)→0, 0.5s ease-out).
Body defaults (35–39): background var(--color-surface), color var(--color-ink). Scrollbar styling (42–55; dark 282–290).

Dark-mode override map `[data-theme="dark"]` (87–290): body #0f172a/#e2e8f0; repaints `.bg-white`→#1e293b, `.bg-slate-50/100/200/800`, `.border-slate-100/200/200\/80`, `.divide-slate-50`, `.text-navy/navy-dark/ink/slate-300…900/white`, placeholders #64748b, `.bg-white\/5/10/20/90`, `.hover\:bg-white\/10:hover`, colored tints `.bg-amber-50/100`, `.bg-mint-50/100`, `.bg-rose-50/100/200`, `.bg-royal-50`, `.bg-violet-50/100`, `.bg-emerald-50`, `.bg-orange-50`, `.bg-cyan-50`, borders `.border-amber-200/300`, `.border-mint-200`, `.border-rose-300/400`, texts `.text-amber-500…800`, `.text-mint-dark`, `.text-rose-500/600`, `.text-royal`, `.text-violet-600`, `.text-emerald-600`, `.text-orange-600`, `.text-cyan-600`.

### Component recipes (exact strings)

**button.tsx**
- Variants (8–17):
  - primary: `bg-gradient-to-l from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/30 hover:shadow-lg hover:shadow-amber-500/40 hover:brightness-105`
  - outline: `border-2 border-amber-500 text-amber-600 hover:bg-amber-50 bg-white`
  - ghost: `text-navy hover:bg-slate-100 bg-transparent`
  - navy: `bg-navy text-white hover:bg-navy-light shadow-md`
  - danger: `bg-rose-600 text-white hover:bg-rose-700`
  - mint: `bg-mint text-white hover:bg-mint-dark shadow-md`
- Sizes (19–23): sm `h-9 px-4 text-sm rounded-lg` · md `h-11 px-6 text-sm rounded-xl` · lg `h-13 px-8 text-base rounded-xl`
- Base (47): `inline-flex items-center justify-center gap-2 font-bold transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed`
- Props: href?, variant=primary, size=md, type="button", disabled, onClick. href → Next `<Link>` (53–59), else `<button>` (61–65).

**field.tsx**
- baseField (4–5): `w-full h-12 rounded-xl border-2 border-slate-200 bg-white px-4 text-sm text-ink placeholder:text-slate-400 outline-none transition-colors focus:border-amber-400 focus:ring-4 focus:ring-amber-100`
- Textarea (13): + `h-auto min-h-28 py-3` · Select (19): + `cursor-pointer`
- Field (33–44): wrapper `space-y-1.5`; label `block text-sm font-bold text-navy`; required star `text-rose-500`; hint `text-xs text-slate-500`; error `text-xs font-semibold text-rose-600`

**logo.tsx** (14–27): link `flex items-center gap-2 group`; tile `flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-lg shadow-amber-500/30 group-hover:shadow-amber-500/50 transition-shadow`; LampDesk `h-6 w-6` strokeWidth 2.2; wordmark `text-xl font-extrabold text-navy`; dot `text-amber-500`.

**course-card.tsx**
- Card (39): `group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:border-amber-300 hover:shadow-xl hover:shadow-amber-500/10`
- Media (42): `relative flex h-32 items-center justify-center overflow-hidden` + inline `linear-gradient(135deg, ${subject.color}22, #ffffff)` (43–45)
- Emoji (47): `text-5xl drop-shadow-sm transition-transform group-hover:scale-110`
- Discount badge (51): `absolute top-3 right-3 rounded-full bg-rose-500 px-2.5 py-1 text-xs font-extrabold text-white shadow`
- Featured badge (56): `absolute top-3 left-3 flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-xs font-extrabold text-white shadow` + Star `h-3 w-3 fill-white`
- FavoriteButton anchor (65): `absolute right-3 ${discount > 0 ? "top-14" : "top-3"}`
- Body (70): `flex flex-1 flex-col gap-3 p-4`
- Title (71): `line-clamp-2 text-base font-extrabold text-navy group-hover:text-amber-600 transition-colors`
- Teacher (74): `line-clamp-1 flex items-center gap-1.5 text-sm text-slate-500` + GraduationCap `h-4 w-4 shrink-0 text-amber-500`
- Meta row (79): `mt-auto flex items-center gap-3 text-xs text-slate-500`; PlayCircle/BookOpen/FileText `h-4 w-4`
- Footer (97): `flex items-center justify-between border-t border-slate-100 pt-3`
- Price (99): `text-lg font-extrabold text-amber-600`; strikethrough (103): `text-sm text-slate-400 line-through`
- CTA chip (108–113): `rounded-lg px-3 py-1.5 text-xs font-bold` + `bg-amber-100 text-amber-700 group-hover:bg-amber-500 group-hover:text-white transition-colors`

**password-input.tsx**: wrapper `relative` (10); Lock `absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none` (11); Input gets `pr-9 pl-9 text-left` (15); toggle `absolute top-1/2 left-3 -translate-y-1/2 text-slate-400 hover:text-slate-600` (21); Eye/EyeOff `h-4 w-4` (23).

**theme-toggle.tsx** (38): `flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-amber-600`; Sun/Moon `h-4 w-4` (40). Persists `localStorage.theme`, sets `data-theme` on documentElement.

**brand-icons.tsx**: Facebook/TikTok/Telegram/YouTube = fill="currentColor"; Instagram = stroke currentColor strokeWidth 2. All accept className, aria-hidden.

## 2. Color Classes (frequency counts; scans include globals.css dark-override selectors)

### bg-* — 68 unique / 710 occurrences
```
141 bg-white          72 bg-amber-50        67 bg-slate-50        62 bg-rose-50
 57 bg-slate-100       56 bg-mint-50†       25 bg-navy            23 bg-amber-100
 17 bg-amber-500       16 bg-slate-200       16 bg-gradient-to-l   13 bg-royal-50†
  9 bg-rose-100         9 bg-mint             8 bg-violet-50        7 bg-white/20
  7 bg-amber-50/40      6 bg-white/10         6 bg-gradient-to-br   6 bg-rose-600
  5 bg-rose-500         5 bg-slate-800        5 bg-slate-700        4 bg-white/15
  4 bg-mint-100†        3 bg-light-glow       3 bg-emerald-50       3 bg-black
  3 bg-rose-700         3 bg-slate-300        2 bg-gradient-to-r    2 bg-amber-500/10
  2 bg-white/90         2 bg-cyan-50          2 bg-orange-50        2 bg-white/5
  2 bg-amber-50/50      2 bg-amber-400        2 bg-rose-200         2 bg-amber-600
  2 bg-violet-100       1 bg-green-500/20     1 bg-red-500/20       1 bg-white/70
  1 bg-navy-light       1 bg-mint-dark        1 bg-slate-900        1 bg-green-500/10
  1 bg-rose-50/50       1 bg-black/50         1 bg-green-500        1 bg-yellow-500/20
  1 bg-green-600/20     1 bg-green-600        1 bg-transparent      1 bg-mint-600†
  1 bg-sky-50           1 bg-slate-50/60      1 bg-white/25         1 bg-amber-500/20
  1 bg-mint-500†        1 bg-mint/10          1 bg-mint-50/40       1 bg-royal
  1 bg-black/30         1 bg-royal-100†       1 bg-violet-50/40     1 bg-amber-100/60
```
† = dead in light mode (see §0).

### text-* — 59 unique / 2258 occurrences
Sizes: `373 text-sm · 251 text-xs · 64 text-2xl · 37 text-lg · 23 text-[10px] · 22 text-[11px] · 17 text-3xl · 15 text-xl · 7 text-6xl · 6 text-base · 4 text-4xl · 2 text-5xl · 1 text-7xl`
Alignment: `88 text-center · 18 text-left · 15 text-right`
Colors:
```
278 text-navy        242 text-slate-500   125 text-slate-400   108 text-amber-600
 89 text-rose-600      86 text-white        75 text-mint-dark    56 text-slate-600
 43 text-amber-500     39 text-amber-700    30 text-slate-300    26 text-rose-500
 19 text-mint          17 text-royal        13 text-violet-600   10 text-amber-400
  9 text-amber-800     8 text-slate-700      3 text-emerald-600   3 text-green-400
  3 text-violet-100    2 text-orange-600     2 text-slate-800     2 text-cyan-600
  2 text-white/80      2 text-ink            2 text-white/70      2 text-rose-700
  2 text-amber-50      1 text-slate-900      1 text-yellow-400    1 text-rose-600/70
  1 text-slate-200     1 text-white/40       1 text-red-400       1 text-amber-100
  1 text-blue-500      1 text-sky-600        1 text-mint-200†     1 text-navy-dark
  1 text-violet-500    1 text-rose-200
```
Custom: `4 text-gradient-gold`

### border-* — 33 unique / 623 occurrences (incl. bare `border` and 2 CSS-prop false hits)
```
174 border-slate-200  172 border            60 border-2           39 border-slate-100
 37 border-amber-400   19 border-b           17 border-amber-300   14 border-amber-200
 12 border-dashed      11 border-t            7 border-mint         6 border-rose-200
  5 border-slate-700   5 border-mint-200†     4 border-amber-500    4 border-slate-600
  4 border-slate-300   3 border-rose-400      3 border-rose-300     2 border-white/10
  2 border-amber-500/50 2 border-violet-400   2 border-0            2 border-slate-50
  1 border-slate-800   1 border-green-500/50  1 border-green-500/30 1 border-4
  1 border-t-amber-500 (loading.tsx spinner only)              1 border-transparent
  1 border-slate-200/80
```
Dividers: `divide-y ×21 · divide-slate-50 ×20 · divide-slate-100 ×1 ((site)/teacher/grading/page.tsx:83)`

### Gradients — 74 occurrences
Directions: `bg-gradient-to-l ×16 · bg-gradient-to-br ×6 · bg-gradient-to-r ×2`
from-: `amber-400 ×10 · mint ×3 · navy ×3 · rose-500 ×2 · violet-600 ×2 · slate-900 · royal · amber-500 · amber-200 (×1 each)`
to-: `orange-500 ×9 · mint-dark ×3 · royal ×3 · rose-600 ×2 · indigo-600 ×2 · white · orange-600 · slate-800/80 · rose-500 · navy (×1 each)`
via-: `amber-100 ×1`
Named recipes: gold CTA `from-amber-400 to-orange-500` (buttons/logo); navy→royal `from-navy to-royal` (admin/layout.tsx:15); mint `from-mint to-mint-dark`; rose `from-rose-500 to-rose-600`; violet→indigo `from-violet-600 to-indigo-600`.

### ring-* — 8 occurrences
`ring-amber-100 ×3 · ring-4 ×3 (field focus) · ring-amber-200 ×1 · ring-2 ×1`

## 3. Spacing

### padding/margin — 64 unique / 1410 occurrences
```
150 px-4    88 px-3    72 p-4     70 py-3    68 py-2    61 mt-2    56 p-6     54 mt-1
 52 px-6    49 mb-6    49 py-1    46 mb-2    42 px-5    41 mb-4    36 mb-8    35 mb-3
 31 py-2.5  31 p-5     30 mb-1    27 py-10   24 p-3     24 mt-3    23 mt-4    22 p-8
 22 px-2    22 py-4    20 py-1.5  19 py-0.5  19 mt-6    11 mr-2    11 mt-0.5   9 px-2.5
  9 p-10     8 py-16    7 mb-5     6 py-8     6 mb-10    6 p-12     4 p-1.5    4 mt-5
  4 py-6     4 pb-2     3 py-12    3 p-2      3 ml-2     3 mt-8     3 pt-4     2 p-14
  2 pt-3     2 pt-2     2 pt-6     2 ml-1     2 pr-11    1 my-1     1 px-1     1 px-8
  1 pr-9     1 pl-9     1 pr-12    1 pl-4     1 py-20    1 mr-6     1 py-24    1 pb-1
```
Physical (RTL-hostile) usages: mr-2 ×11, ml-2 ×3, ml-1 ×2, mr-6, pr-11 ×2, pr-9/pl-9 (password-input), pr-12, pl-4.

### gap / space — 20 unique / 525 occurrences
```
200 gap-2    92 gap-3    55 gap-1    48 gap-4    19 gap-1.5  13 gap-6     5 gap-5     3 gap-8
  1 gap-10    1 gap-12    1 gap-2.5  22 space-y-6 20 space-y-4 18 space-y-2 13 space-y-3
  7 space-y-5  2 space-y-8 2 space-y-1.5 2 space-y-1 1 space-y-2.5
```
NO space-x-* anywhere (RTL-consistent).

## 4. Border Radius — 7 unique / 534 occurrences
```
155 rounded-xl   150 rounded-2xl  105 rounded-full  60 rounded-lg
 59 rounded-3xl    4 rounded         1 rounded-md
```
No directional variants (rounded-t/b/l/r-*) anywhere.

## 5. Shadows — 79 occurrences
```
16 shadow-sm     13 shadow-xl      8 shadow-md       8 shadow (bare)
 6 shadow-lg      6 shadow-amber-500/30               5 shadow-slate-200/60
 4 shadow-amber-500/10              3 shadow-2xl
 3 shadow-[0_10px_30px_rgba(245,158,11,0.1)]  → src/app/(site)/page.tsx:226,317,376
 2 shadow-amber-500/50              1 shadow-amber-500/20
 1 drop-shadow-sm (course-card.tsx:47)
```

## 6. Typography
Weights: `351 font-black · 306 font-bold · 31 font-extrabold · 13 font-mono · 2 font-semibold`
Sizes: see §2 text-* sizes. Family: Cairo only (`--font-cairo` → `--font-sans`, globals.css:6). `leading-7` used in error/404 pages.

## 7. Loading / Spinner Patterns
Totals: **Loader2 ×94 across 39 files; animate-spin ×46.** Zero skeletons.

Canonical submit-button pattern (~35 sites):
```tsx
{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />} label
```
Size variants: `h-3 w-3` (bookmark-button.tsx:41, users/student-form.tsx:97, teachers/teacher-form.tsx:168, teachers/teacher-photo-upload.tsx:68) · `h-4 w-4` standard · `h-5 w-5` (forgot-password/page.tsx:116, login/login-form.tsx:82, register/register-form.tsx:104, profile/change-password-form.tsx:56) · `h-8 w-8 text-amber-500` upload spinners (courses/[id]/subscribe/payment-form.tsx:168, wallet/charge/charge-form.tsx:149).

Route-level spinner — src/app/(site)/loading.tsx (only one in app):
- :5 `h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500`
- :6 `text-sm font-bold text-slate-400` "جارٍ التحميل..."
No admin/loading.tsx, no root loading.tsx.

Pending-state plumbing: `useSubmit` hook (src/lib/use-submit.ts) → `{ state, formAction, pending }`; manual `useState<"idle"|"loading"|"done"|"error">` (live/[id]/mark-attendance.tsx:7,26–29); `uploading` states (payment-form.tsx:26, charge-form.tsx:22, teacher-photo-upload.tsx:10); `disabled={pending || uploading}` on submits (payment-form.tsx:201, charge-form.tsx:175).

Files using Loader2 (39): components/{appeal-form,bookmark-button,course-actions,exemption-form,favorite-button}.tsx, components/player/video-player.tsx, components/ai-generator.tsx, (site)/forgot-password/page.tsx, (site)/notifications/mark-all-read.tsx, (site)/login/login-form.tsx, (site)/register/register-form.tsx, (site)/parent/add-child-form.tsx, (site)/profile/change-password-form.tsx, (site)/wallet/redeem-code-form.tsx, (site)/wallet/charge/charge-form.tsx, (site)/store/store-redeem.tsx, (site)/live/[id]/booking-form.tsx, (site)/live/[id]/mark-attendance.tsx, (site)/practice/practice-launcher.tsx, (site)/practice/[attemptId]/runner.tsx, (site)/teacher/teacher-structure-forms.tsx, (site)/teacher/question-bank/question-bank-client.tsx, (site)/teacher/appeals/appeal-review-form.tsx, (site)/teacher/grading/grading-form.tsx, (site)/teacher/courses/[courseId]/teacher-content-forms.tsx, (site)/courses/[id]/subscribe/wallet-pay-button.tsx, (site)/courses/[id]/subscribe/payment-form.tsx, admin/users/student-form.tsx, admin/users/grant-course-form.tsx, admin/teachers/teacher-form.tsx, admin/teachers/teacher-photo-upload.tsx, admin/structure/structure-client.tsx, admin/store/store-form.tsx, admin/store-locator/store-locator-form.tsx, admin/settings/settings-form.tsx, admin/recharge-codes/recharge-form.tsx, admin/payments/review-buttons.tsx, admin/coupons/coupon-form.tsx (+ others in truncated tail).

## 8. Empty States (49 matches, exact locations)
Taxonomy:
- **A. Admin muted centered**: `<p className="p-6|p-8|py-2|py-6 text-center text-sm|text-xs text-slate-400">لا توجد …</p>`
- **B. Bold variant**: `<p className="text-sm font-bold text-slate-500">`
- **C. Hero blocks** (icon + heading + sub)
- **D. Inline conditional strings**

Exact list:
```
admin/page.tsx:167,194,219,252        (A: p-6 text-center text-sm text-slate-400)
admin/exemptions/page.tsx:31          لا توجد طلبات إعفاء
admin/store-locator/page.tsx:40       (A: p-8 …)
admin/recharge-codes/page.tsx:68      (A: p-8 …)
admin/store/page.tsx:40               (A: p-8 …)
admin/coupons/page.tsx:40             (A: p-8 …)
admin/structure/structure-client.tsx:189  (py-2 text-center text-xs text-slate-400)
admin/question-bank/page.tsx:43       (text-sm text-slate-400)
admin/appeals/page.tsx:65             لا توجد تظلمات
admin/payments/page.tsx:124           لا توجد طلبات دفع بعد
admin/teachers/page.tsx:84            (A: p-8 …)
admin/teachers/[teacherId]/page.tsx:161,188  (py-6 text-center text-sm text-slate-400)
(site)/wallet/page.tsx:73,105         (105 includes inline Link font-bold text-amber-600)
(site)/favorites/page.tsx:58          (B)
(site)/notifications/page.tsx:32,41   (B at 41)
(site)/bookmarks/page.tsx:90          (B)
(site)/store/page.tsx:62,87
(site)/exemptions/page.tsx:51
(site)/results/page.tsx:109,159,179
(site)/teacher/page.tsx:51            (D)
(site)/teacher/live/page.tsx:77,201   (77: mb-10 text-sm text-slate-400)
(site)/teacher/grading/page.tsx:63    (B)
(site)/teacher/attempts/page.tsx:55   (B)
(site)/teacher/appeals/page.tsx:46
(site)/teacher/question-bank/page.tsx:41
(site)/live/page.tsx:130              (text-sm text-slate-400)
(site)/parent/page.tsx:63             (C: font-black text-navy)
(site)/profile/page.tsx:107
(site)/store-locator/page.tsx:61      (D ternary)
(site)/appeals/page.tsx:48
(site)/courses/page.tsx:176           (C: h3 text-lg font-extrabold text-navy "لا توجد نتائج")
(site)/courses/[id]/sections/[sectionId]/exam/[examId]/take/page.tsx:37   (text-lg font-bold text-slate-500)
(site)/courses/[id]/sections/[sectionId]/exam/[examId]/take/exam-runner.tsx:122
offline.tsx:5                          (PWA offline: mt-4 text-2xl font-black text-navy)
actions/* server messages: actions/teacher-content.ts:381, student-live.ts:102, practice.ts:35, parent.ts:44, lib/auth.ts:123
```

## 9. Error States

**A. Error boundaries — identical recipe ×3 + not-found:**
Files: global-error.tsx, (site)/error.tsx, admin/error.tsx, not-found.tsx
```
container: flex min-h-[60vh] flex-col items-center justify-center px-4 text-center
glyph:     text-6xl font-black text-rose-500  ("!")   |  not-found: text-amber-500 ("404")
heading:   mt-4 text-2xl font-black text-navy
body:      mt-2 max-w-md text-sm leading-7 text-slate-500
retry:     mt-6 rounded-2xl bg-mint px-6 py-3 text-sm font-black text-white hover:opacity-80
```
Lines: global-error.tsx:11–22 · (site)/error.tsx:11–22 · admin/error.tsx:11–22 · not-found.tsx:5–16 · offline.tsx:5.

**B. Inline form errors** (canonical pair):
```
error:   <p className="flex items-center gap-2 text-sm font-bold text-rose-600"><AlertCircle className="h-4 w-4"/>{error}</p>
success: <p className="flex items-center gap-2 text-sm font-bold text-mint-dark"><CheckCircle2 className="h-4 w-4"/>{msg}</p>
```
appeal-form.tsx:42–53. Field component error slot: field.tsx:42 `text-xs font-semibold text-rose-600`.

**C. Alert/banner boxes (14 catalogued):**
```
ERROR rose:
  appeal-form.tsx:14                rounded-2xl border border-rose-200 bg-rose-50/50 p-4
  users/student-form.tsx:88         rounded-xl border border-rose-200 bg-rose-50 px-2 py-1 (chip)
  teachers/teacher-form.tsx:159     rounded-xl border border-rose-200 bg-rose-50 px-2 py-1 (chip)
SUCCESS mint:
  wallet/charge/charge-form.tsx:65          rounded-3xl border-2 border-mint bg-mint-50 p-8 text-center
  courses/[id]/subscribe/payment-form.tsx:67  rounded-3xl border-2 border-mint bg-mint-50 p-8 text-center
  live/[id]/booking-form.tsx:26             rounded-2xl border border-mint-200 bg-mint-50 p-5
  courses/[id]/subscribe/page.tsx:115       rounded-2xl border border-mint-200 bg-mint-50 p-4
  courses/[id]/sections/[sectionId]/exam/[examId]/page.tsx:129  rounded-2xl border border-mint-200 bg-mint-50 p-4 text-center
  login/registered-notice.tsx:10            rounded-2xl border border-mint-200 bg-mint-50 px-5 py-4 text-center text-sm font-bold text-mint-dark
  forgot-password/page.tsx:65               rounded-3xl border border-mint bg-mint/10 p-8
OPTION STATES (answer correctness):
  practice/[attemptId]/page.tsx:104         border-mint bg-mint-50 text-mint-dark
  exam result [attemptId]/page.tsx:112,114  border-mint bg-mint-50 | border-rose-200 bg-rose-50
  exam result [attemptId]/page.tsx:190      border-mint bg-mint-50 text-mint-dark
```

**D. Legacy window.alert() calls:** ai-generator.tsx:43 · charge-form.tsx:46 · payment-form.tsx:48 · exam take/exam-runner.tsx:107 · practice runner.tsx:73.

**E. XCircle (reject/fail) icons:** booking-form.tsx:37 · admin/payments/review-buttons.tsx:45,58 · practice/[attemptId]/page.tsx:61,110 · exam result page:86,199 · appeals/appeal-review-form.tsx:117.

**F. Server-action error convention:** `{ ok: false, error: "..." }` throughout src/app/actions/*.ts and lib/auth.ts:123.

## 10. Tables — raw HTML `<table>` ×5 files (no Table component)
```
admin/users/[studentId]/page.tsx:119-150
  table w-full text-sm · thead bg-slate-50 text-xs font-black text-slate-500
  th px-4 py-2 text-right · tbody divide-y divide-slate-50 · td px-4 py-3
  price td font-black text-amber-600 · date td text-slate-500
admin/teachers/[teacherId]/page.tsx:191-208
  same head · td px-4 py-3 · money font-black text-mint-dark / font-black text-royal
admin/recharge-codes/page.tsx:26-59
  th px-5 py-3 · tbody divide-y divide-slate-50 · td px-5 py-3
  code cell font-mono font-black text-navy dir="ltr"
(site)/teacher/live/page.tsx:178-200
  th px-4 py-3 font-black · td px-4 py-2.5 · empty colSpan row px-4 py-6 text-center text-xs text-slate-400
(site)/results/page.tsx:182-210
  th pb-2 font-bold · td py-2.5 · status badges inside td
```
Pseudo-tables (divide-y list rows instead of tables) — 21 locations: (site)/courses/[id]/page.tsx:169 · sections/page.tsx:115 · store/page.tsx:90 · teacher/courses/[courseId]/page.tsx:113 · teacher/grading/page.tsx:83 (divide-slate-100) · teacher/question-bank/page.tsx:58 · wallet/page.tsx:76,108 · admin/coupons/page.tsx:21 · admin/page.tsx:149,181,208,233 · admin/question-bank/page.tsx:63 · admin/recharge-codes/page.tsx:37 · admin/store/page.tsx:20 · admin/store-locator/page.tsx:23 · admin/teachers/[teacherId]/page.tsx:200 · admin/teachers/page.tsx:40 · admin/users/[studentId]/page.tsx:128 · admin/users/page.tsx:46.

## 11. Layouts

**src/app/layout.tsx (root)**: html `lang="ar" dir="rtl" suppressHydrationWarning` + `${cairo.variable} h-full antialiased` (95–99); inline pre-hydration theme script reading localStorage.theme → prefers-color-scheme fallback → sets `data-theme` (103–107); body `min-h-full flex flex-col` (109); PwaRegistrar (110). Viewport: themeColor #f59e0b, maximumScale 5 (13–19). Metadata: ar_EG OG, manifest /manifest.json, appleWebApp black-translucent (21–91).

**src/app/(site)/layout.tsx**: `flex min-h-screen flex-col bg-light-glow` wrapping SiteHeader + `<main className="flex-1">` + SiteFooter (6–10).

**src/app/admin/layout.tsx**: auth gate getCurrentUser → redirect /login, role!=="ADMIN" → redirect / (7–9); shell `mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row` (12); aside `lg:w-64 lg:shrink-0` (13) > card `sticky top-20 overflow-hidden rounded-2xl border border-slate-200 bg-white` (14) > header `bg-gradient-to-l from-navy to-royal p-4` with Logo textClassName="text-white" (15–16); main `min-w-0 flex-1` (21).
