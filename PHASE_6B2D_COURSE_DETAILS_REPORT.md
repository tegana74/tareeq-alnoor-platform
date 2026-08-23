# PHASE 6B-2D — Course Details + Subscription UX Report

**Date:** 2026-08-23
**Status:** COMPLETE
**TypeScript:** 0 errors
**ESLint:** 0 errors (33 warnings — unchanged baseline from 6B-2C)
**Tests:** 115/115 passing (104 previous + 11 new course-details tests)

---

## 1. Current Architecture (audit findings)

`src/app/(site)/courses/[id]/page.tsx` (237 lines):

| Aspect | Found |
|---|---|
| Query | `course.findUnique` with FULL `include`: teacher+subject+year+department whole models AND sections→videos/books/exams **full rows** |
| Metadata | separate duplicate fetch, title only — **no description** |
| CTA states | canAccess → «ابدأ المذاكرة» mint → sections; else → «اشترك الآن» → subscribe page; subscribed note text |
| Access | `isSubscribed` + free-course check + `canAccessCourse` (unchanged) |
| Content list | flat per-section rows; lock logic `!canAccess && !item.free`; free items were linked even for non-subscribers (server enforces) but had NO explicit preview CTA label |
| Missing | breadcrumb, subscription panel w/ duration, what-you-get, teacher block, related courses, favorites placement |
| 🔴 Heavy payload | every video/book/exam full row serialized into RSC payload |

## 2. New Page Structure

```
A Breadcrumb      الرئيسية → الكورسات → [الصف] → {course}   (semantic nav+ol)
B/C/D Hero card   subject banner + discount badge · badges row · H1 ·
                  description · stats <dl> (counts + total video minutes)
E What you get    5 real bullets incl. free-preview count & SUBSCRIPTION_DAYS access
F Contents        native <details> accordion per section (first open),
                  items with lock/free-preview rules preserved & surfaced
G Teacher         image/initials + name + real title + «كورسات المدرس» deep link
H CTA panel       desktop sticky (lg:top-24) / mobile in-flow:
                  price ± old price · discount badge · duration card
                  · state-aware CTA · trust bullets · FavoriteButton (student)
J Related         same subject OR teacher OR year, take 4, CourseCard grid
```

## 3. Course Data Sources

Single narrowed `getCourse()` select: course scalars + relations reduced to display
fields (teacher id/name/title/image; subject id/name/icon/color; year/department names;
sections→items selected to **id/title/duration/isFree/type only**).
Favorites: single `favorite.count({userId,courseId})` for STUDENT (cheaper than list).
Related: one extra findMany (`OR` on subject/teacher/year, `id != self`, take 4,
CourseCard-minimal select, sections used ONLY as `_count` include → no item rows).

## 4. CTA Behavior by User State (logic untouched)

| State | Panel shows |
|---|---|
| Guest | «اشترك الآن» → `/courses/[id]/subscribe` + hint «ستحتاج إلى حساب لإتمام الاشتراك» |
| Logged-in non-subscriber | same subscribe CTA (no hint line) |
| Expired subscription | identical to non-subscriber (`isSubscribed=false`) → acts as Renew, matching existing behavior |
| Subscriber / free course / admin-teacher owner | «ابدأ المذاكرة» → `/courses/[id]/sections` (+ «أنت مشترك» confirmation when subscribed) |

Same hrefs, same underlying actions as before — zero new server actions,
zero payment/enrollment changes.

## 5–6. Content Rendering & Teacher

Sections render as native `<details open={i===0}>` accordions (keyboard-accessible,
RTL-neutral, dark-safe via tokens). Item rules byte-compatible with old page:
locked paid items are NON-links with lock icon + «بعد الاشتراك»; free items remain
real links and now surface an explicit «شاهد الآن» badge for non-subscribers —
this exposes an access path that ALREADY existed server-side (`files` route resolves
`isFree`), not a new permission. Teacher block shows only existing fields
(name/title/image) plus a catalog filter link; no invented experience/ratings.
Empty-sections graceful message added.

## 7. Performance / Query Changes

| Before | After |
|---|---|
| Full-model includes across 4 relations | scalar selects everywhere |
| All videos/books/exams FULL rows in payload | id/title/duration(→min)/isFree/type only |
| Duplicate metadata query (full teacher+subject) | metadata selects name/description/teacher.name only |
| No related query | ONE indexed OR-query, take 4, `_count`-only sections |
| Favorites n/a | single `count()` for students |

No N+1 introduced (total queries: metadata 1, page 1 + subs checks (≤2, pre-existing)
+ favorite count (students) + related 1). No password/token fields touched anywhere.

## 8. SEO

`generateMetadata` now returns dynamic `title = course.name` AND a real
`description` from `course.description` (fallback composes name+teacher honestly,
truncated 160 chars); missing course → «الكورس غير موجود» (and page `notFound()`).

## 9. RTL Verification

`\b(mr|ml|pr|pl)-\d` over the page → **0 matches**. Logical only: breadcrumb uses
flex+gap with ChevronLeft (correct RTL pointing), discount badge `end-4`,
panel paddings logical, drawer-free layout. Arabic truncation handled via
min-w-0/truncate on section titles.

## 10. Dark Mode

Token-first: Card/Badge/Button primitives carry theme adaptation; accents
primary-50..700 / success-strong / royal / violet chips all dark-overridden via the
6B-1A variable layer; hero banner gradient uses subject color over transparent
(theme-neutral); slate-400 strikethrough price covered by legacy dark layer.
Accordion hover `hover:bg-primary-50/40` adapts.

## 11. Accessibility

One `<h1>` (course name); section `<h2>`s with ids + aria-labelledby; breadcrumb
`nav[aria-label] > ol > li[aria-current=page]`. Stats use `<dl>` with sr-only terms.
FavoriteButton keeps its action but now sits full-width with clear title/aria from
the component. Locked rows get `aria-disabled="true"` (non-interactive div).
Accordions keyboard-operable natively with inset focus-visible ring. Price never
color-only (old-price struck-through + numeric discount badge + text labels).

## 12–15. Tests / TypeScript / ESLint / Browser

**tests/course-details.test.tsx (11)** — hoisted prisma/auth/subscriptions mocks;
notFound mocked to throw:
breadcrumb links+current marker · aggregated counts (3/1/1 + 45 minutes) ·
guest matrix (subscribe href, login hint, FREE v1 linked with «شاهد الآن», LOCKED v2
unlinked + «بعد الاشتراك», no subscriber href) · subscriber matrix (sections href,
no subscribe href) · duration copy driven by constant (365 يوماً كاملة) ·
price/old-price/discount% from fixtures · fabricated-social-proof regex guard ·
teacher real fields + filtered link · favorite button student-only presence ·
related section renders from mocked related query · inactive course → notFound.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `eslint src` full | **0 errors**, 33 warnings (baseline unchanged; 4 warnings inside courses/[id] subtree are pre-existing unused-vars in OTHER files) |
| `vitest run --no-file-parallelism` | **115/115** |

## 15. Browser Verification

Browser visual verification pending deployment. Static review covered guest /
student-subscribed / expired-as-unsubscribed matrices (test-enforced), mobile flow
order (breadcrumb→hero→CTA panel in-flow→content…), sticky panel offset vs header
(`top-24` clears h-16 bar), and long-title truncation paths.

## 16. Remaining Issues

1. Related query lacks year when course.yearId null (OR narrows naturally) — fine;
   consider relevance ranking later if catalog grows.
2. Free-preview items rely on legacy `isFree` flags; no per-item analytics exist —
   nothing fabricated.
3. Accordion state resets on navigation (native element, no persistence) — acceptable.
4. Expired-subscriber detection intentionally NOT special-cased visually (would need
   extra subscription-row read); CTA semantics already correct per current behavior.
5. PowerShell text-editing caused two transient corruptions this session (both fully
   rebuilt/cleaned via Write/Edit tools; mojibake greps clean). Standing rule: content
   mutations only via Write/Edit tools.
6. Vitest parallel flakiness persists locally (use `--no-file-parallelism`).

## 17. Recommendation for PHASE 6B-2E (Student Dashboard)

1. Reuse the token shell + Card grid established here; dashboards are data-dense —
   prefer Badge/Progress primitives over custom pills.
2. Real progress exists (videoProgress model from Phase 2 work) — safe to render
   Progress bars there for enrolled courses only.
3. Promote `SectionHeading` to ui/ once dashboard confirms its third usage.
4. Keep wallet/subscription cards wired to existing actions; mirror the CTA-panel
   honesty pattern (duration from constants, no invented claims).
5. Empty-dashboard should reuse EmptyState with role-appropriate CTAs
   («تصفح الكورسات» primary).

**STOP — PHASE 6B-2E not started.**
