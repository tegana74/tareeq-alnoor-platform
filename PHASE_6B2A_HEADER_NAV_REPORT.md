# PHASE 6B-2A — Header + Navigation Redesign Report

**Date:** 2026-08-23
**Status:** COMPLETE
**TypeScript:** 0 errors
**ESLint:** 0 errors (36 warnings — all pre-existing, unchanged from 6B-1B)
**Tests:** 83/83 passing (70 previous + 13 new header/nav tests)

---

## 1. Current Header Architecture (audit result)

Single file `src/components/layout/site-header.tsx` (138 lines, async server component):

| Region | Content |
|---|---|
| Shell | `sticky top-0 z-50` white/90 blur bar, h-16, max-w-7xl |
| Brand | `Logo` (ui/logo.tsx) |
| Desktop nav | 7 fixed links (`hidden md:flex`): الرئيسية، الكورسات، بنك الأسئلة، نتائجي، بث مباشر، المتجر، منافذ البيع — shown identically to ALL roles incl. guests (existing behavior) |
| Actions | PwaInstallButton(small) · ThemeToggle |
| Authed | role dashboard Button (ADMIN→/admin, TEACHER→/teacher, PARENT→/parent, navy variant) · محفظتي→/wallet · Bell→/notifications with hand-rolled rose count bubble · STUDENT-only icon links →/favorites /appeals /exemptions · حسابي→/profile outline · logout `<form action={logoutAction}>` |
| Guest | تسجيل الدخول ghost · إنشاء حساب primary (hidden below sm) |

**Critical gap found:** NO mobile navigation existed at all — under `md` the 7 links
simply disappeared; phones got only the icon-action row. Data layer:
`getCurrentUser()` (cached) + `prisma.notification.count(isRead:false)`.

**Usages:** exactly ONE consumer — `(site)/layout.tsx`. Admin/Teacher/Parent layouts use
their own sidebars (untouched per instruction §18).

## 2. New Header Architecture

```
src/components/layout/
├── header-config.ts          NEW  pure config: NAV_ITEMS[], resolveActiveHref()
├── site-header.tsx           REWRITTEN  thin server wrapper (auth + unread → props)
└── site-header-client.tsx    NEW  "use client" shell: desktop nav + actions +
                                 mobile trigger + portal drawer
```

Split rationale = genuine separation, not ceremony: server file keeps DB access;
client file owns interactivity (`usePathname`, open state, Escape listener,
scroll-lock, `createPortal`). Only 3 files total (+1 test file).

`(site)/layout.tsx NOT modified` — export name/path preserved, so wiring is automatic.

## 3. Files Modified / Created

| File | Status |
|---|---|
| `src/components/layout/site-header.tsx` | rewritten (~26 lines) |
| `src/components/layout/header-config.ts` | created |
| `src/components/layout/site-header-client.tsx` | created (~300 lines) |
| `tests/header-nav.test.tsx` | created (13 tests) |
| `src/app/(site)/layout.tsx`, homepage, admin/teacher/parent layouts | **untouched** |

## 4. Components Reused (zero restyling inside header)

Logo · Button (navy/ghost/outline/primary variants) · **Badge** (notification count —
replacing the old raw span, per spec §10) · ThemeToggle (untouched logic) ·
PwaInstallButton · lucide-react icons · `classNames()` util.
No external library added; no second design system.

## 5. Routes Preserved

Every href byte-identical to the old header:
`/ /courses /practice /results /live /store /store-locator` (nav) ·
`/admin /teacher /parent /wallet /notifications /favorites /appeals /exemptions
/profile /login /register` (actions) · logout through the SAME `logoutAction`
server action in a form. Zero routes added, removed, or renamed.

## 6. Role-Based Navigation Behavior

Visibility matrix reproduced exactly:

| Role | Sees |
|---|---|
| Guest | 7 public links · login · register (register hidden <sm on desktop) |
| STUDENT | 7 links · wallet · notifications(count) · favorites/appeals/exemptions · profile · logout |
| TEACHER | 7 links · «لوحة المدرس» · wallet · notifications · profile · logout |
| PARENT | 7 links · «لوحة ولي الأمر» · wallet · notifications · profile · logout |
| ADMIN | 7 links · «لوحة الإدارة» · wallet · notifications · profile · logout |

Defense-in-depth unchanged: hiding is cosmetic only; every target page still enforces
`requireRole()` server-side (touched nowhere). Deliberate decision documented:
the 7 nav links stay visible to guests (previous behavior — e.g. نتائجي redirects to
login) rather than silently changing information architecture in a "redesign" phase.

## 7. Mobile Behavior

- Trigger: hamburger (`md:hidden`) with `aria-expanded/controls/label`.
- Panel: `createPortal` to body → full-screen overlay (`bg-black/40`, click closes)
  + start-anchored drawer (`inset-y-0 start-0 w-[85%] max-w-xs`) with subtle
  `animate-fade-up`; rendered OUTSIDE the blurred header because
  `backdrop-filter` would otherwise trap fixed positioning (real bug avoided).
- Contents: same 7 links as large touch rows (h-12, text-base, icons) with active
  pill state; divider; role dashboard · wallet · notifications row (with Badge) ·
  STUDENT 3-tile quick-links grid · profile · logout (danger styling) · theme row ·
  PWA install.
- Close paths: X button, overlay tap, any link tap (`onClick={closeMenu}`),
  **Escape** (focus returns to trigger).
- Body scroll locked while open, restored on unmount; no horizontal overflow
  (drawer width capped, `max-w-xs`).

## 8. Accessibility

- `aria-expanded` / `aria-controls="mobile-nav"` / `aria-label` on trigger;
  panel `role="dialog"` + `aria-modal` + label; Escape + focus return.
- Active section announced via `aria-current="page"`.
- Notification link label announces count («الإشعارات، 3 غير مقروءة») and hides
  decorative icon/badge from AT.
- All icon-only controls carry `title` + `aria-label`; global `focus-visible`
  rings (primary-400) on every interactive element.
- No `<a>`↔`<button>` nesting anywhere; logout stays a real submit button in a form.
- Lint-driven improvement: initial "close menu on pathname effect" violated React's
  `react-hooks/set-state-in-effect`; refactored to explicit close-on-click handlers
  (more idiomatic, removes an effect entirely).

## 9. RTL Verification

Zero physical spacing utilities in all three files (grep `\b(mr|ml|pr|pl)-\d` → none);
flex + gap + logical `start-/end-/-start-1` used throughout. Drawer anchors to
inline-start (visually RIGHT in Arabic — conventional). Icons inherit flow direction;
badge offsets logical. Long Arabic labels wrap safely (min-w-0 not needed at these
sizes; drawer rows are block-level).

## 10. Dark Mode Verification

Shell now uses `border-border bg-card/95` → adapts via 6B-1A variable overrides
(#334155 border / #1e293b card). Hover/active pills use primary-50/100/600/700
(dark values #3b2408/#452a0d/#fbbf24). Notification Badge uses success-family-style
danger tokens (#4a1122 bg / #fb7185 text in dark). Logout hover `bg-danger-50
text-danger-strong` adapts. Remaining `slate-*` icon-muted classes match the app's
legacy muted pattern already covered by the hand-painted dark layer. Theme toggle
itself untouched — Light/Dark switching preserved with no page reload.

## 11. Performance Considerations

- Same server data path as before: cached `getCurrentUser()` + one indexed
  `notification.count` — no new queries, no client-side DB access.
- Client payload: role string + number only (no PII across the RSC boundary).
- Drawer markup mounts ONLY while open (portal conditional); closed-state DOM is
  the same size as the old header.
- No new dependencies; animation is CSS-only.

## 12–15. Tests / TypeScript / ESLint / Regression

**tests/header-nav.test.tsx (13)** — SSR-rendered like 6B-1B suite:
`resolveActiveHref`: home exact-match · nested `/courses/abc`,`/practice/x/y`,
`/live/42` activate parents · prefix safety (`/coursesxyz` null) · trailing-slash
normalization · null pathname.
Rendering matrix: student sees wallet/profile/quick-links/badge>3< and NONE of the
three dashboards · aria-current on nested route + active pill classes · each of
ADMIN/TEACHER/PARENT sees exactly its own dashboard · guest gets login/register and
zero user actions · unread 14 → «9+», unread 0 → badge absent · trigger exposes
`aria-controls/expanded/label` · all 7 labels render for BOTH student and guest
(behavior-preservation guard).

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `eslint src` | **0 errors**, 36 warnings (identical pre-existing set) |
| `vitest run --no-file-parallelism` | **83/83** |

Functional review against §19 checklist (login/logout/register/theme/notifications/
profile/navigation/mobile/deep-links/nested course routes): all flows ride the same
hrefs + logoutAction as before; role gates server-side untouched; verified by the
role-rendering tests above (browser-level pass recommended at deploy, listed below).

Process note: mid-phase, two files were transiently corrupted by a PowerShell
encoding roundtrip (PS 5.1 reads BOM-less UTF-8 as ANSI). Both were rebuilt cleanly
via the Write/Edit tools and verified mojibake-free by grep. Rule adopted: file
content mutations happen exclusively through Write/Edit tools.

## 16. Remaining Issues

1. Focus is moved (open→close btn, Escape→trigger) but a full focus-trap cycle is
   not implemented in the drawer — acceptable for a non-modal-critical nav sheet;
   revisit if a true modal drawer is wanted.
2. The 7 nav links remain guest-visible (pre-existing IA decision) — product may
   want `نتائجي` auth-gated visually in a later phase.
3. Browser screenshot pass (Desktop/Tablet/Mobile × Light/Dark) still pending
   deploy environment, as in prior phases.
4. Sticky-header offset: in-page `#anchor` jumps can hide targets under the 64px
   bar — add `scroll-margin-top` during 6B-2B page work.
5. Pre-existing vitest parallel flakiness on this machine persists (use
   `--no-file-parallelism` locally).

## 17. Recommendation for PHASE 6B-2B (Homepage)

1. Build hero + sections on Card/Badge/Skeleton/EmptyState primitives and the same
   token palette the header now establishes (primary pills, card surfaces).
2. Add `scroll-mt-20` (or similar) to homepage section anchors for sticky-header offset.
3. If homepage needs compact icon-actions, extract the header's iconLinkBase pattern
   into a tiny shared `IconButtonLink` ui primitive (≥3 real usages will exist then).
4. Keep `PwaInstallButton variant="hero"` for the homepage CTA area (already supported).
5. Do NOT touch navigation/routes — reuse `header-config.ts` if a section needs
   link data.

**STOP — PHASE 6B-2B not started.**
