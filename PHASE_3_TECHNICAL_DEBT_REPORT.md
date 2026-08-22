# Phase 3 — Technical Debt & Architectural Cleanup Report

**Date**: 2026-08-22  
**Status**: ✅ COMPLETE  
**TypeScript Errors**: 0 (was 5 — `ignoreBuildErrors: true` removed)  
**ESLint Errors**: 0 (was 4 — all fixed)  
**ESLint Warnings**: 36 (all pre-existing unused vars in untouched code)  
**Tests**: 11/11 passing  

---

## Summary

Phase 3 eliminated dead code, consolidated duplicated configuration, removed dev artifacts, and restored build-time type safety by removing `ignoreBuildErrors: true`.

---

## Changes Made

### 3.1 Dead Code Removal
- Removed `sendOtpAction` and `verifyOtpAction` from `src/app/actions/auth.ts` (dead OTP login flow — login uses `directLoginAction`)
- Kept `sendOtp()`/`verifyOtp()` in `lib/auth.ts` — still used by `sendResetOtpAction`/`resetPasswordAction` (forgot password flow)
- Deleted `src/app/(site)/teacher/courses/[courseId]/section-ai-generator.tsx` (unused, AIGenerator imported directly)
- Removed unused `truncate`, `maskPhone` from `src/lib/utils.ts`
- Removed unused `clearRateLimits` from `src/lib/rate-limit.ts`
- Removed unused `passwordSchema` from `src/app/actions/auth.ts`

### 3.2 Prisma Client Unification
- **Deleted**: `prisma.ts` (root) — dead SQLite-era duplicate with `@prisma/adapter-better-sqlite3`
- **Deleted**: `الاصل قبل التعديل/` backup folder
- **Removed** `@prisma/adapter-better-sqlite3` from `package.json`
- Canonical client remains at `src/lib/prisma.ts` (PostgreSQL via `@prisma/adapter-pg`)

### 3.3 Dev Artifacts Removed
- `dev.db` (528KB SQLite)
- `prisma/dev.db` (0 bytes)
- `data/uploads/` (3 files)
- `dev-server.log`

### 3.4–3.8 Config Consolidation

**New file: `src/lib/constants.ts`**
| Constant | Value | Used by |
|----------|-------|---------|
| `APP_NAME` | طريق النور | — |
| `SITE_URL` | tareeq-alnoor.online | — |
| `PAYMENT.vodafoneCash` | 01021416244 | subscribe, wallet |
| `PAYMENT.instaPay` | 01116544383 | subscribe, wallet |
| `CURRENCY` | جنيه | — |
| `SUBSCRIPTION_DAYS` | 365 | payments, admin, admin-users |
| `SESSION_DAYS` | 30 | auth (cookie maxAge) |
| `SESSION_MAX_AGE` | 2592000 | auth actions |
| `OTP.*` | (6 constants) | auth (OTP verification) |
| `AI_MODEL` | gemini-3.6-flash | AI generate route |
| `CONTACT.*` | (2 constants) | — |

**New file: `src/lib/mime.ts`**
- `MIME_MAP`, `ALLOWED_FILE_EXTENSIONS`, `ALLOWED_VIDEO_EXTENSIONS`, `MAX_FILE_SIZE`, `MAX_VIDEO_SIZE`
- Used by `api/upload/route.ts` and `api/files/[filename]/route.ts`

### 3.5 Payment Fallback Numbers
- `subscribe/page.tsx`: hardcoded `"01021416244"` / `"01116544383"` → `PAYMENT.vodafoneCash` / `PAYMENT.instaPay`
- `wallet/charge/page.tsx`: same change

### 3.6 Subscription Duration
- `payments.ts`: `365` → `SUBSCRIPTION_DAYS`
- `admin.ts`: `365` → `SUBSCRIPTION_DAYS`
- `admin-users.ts`: `365` → `SUBSCRIPTION_DAYS`

### 3.9 MIME Map Deduplication
- `api/upload/route.ts`: replaced local `MIME` record with import from `@/lib/mime`
- `api/files/[filename]/route.ts`: replaced local `MIME` record with import from `@/lib/mime`

### 3.12 Error Boundaries
- `src/app/not-found.tsx`: branded 404 page (Arabic, RTL)
- `src/app/global-error.tsx`: global error boundary with retry
- `src/app/(site)/error.tsx`: site error boundary
- `src/app/(site)/loading.tsx`: site loading spinner
- `src/app/admin/error.tsx`: admin error boundary

### 3.13 TypeScript Fix
- Created `src/types/navigator.d.ts` — augments `Navigator` interface with `standalone?: boolean`
- Resolves TS2339 in `pwa-install.tsx`

### 3.14 Build Safety
- Removed `ignoreBuildErrors: true` from `next.config.ts`
- TypeScript now enforced at build time: **0 errors**

### 3.15 Lint Cleanup
- Fixed `any` → proper type in `ai-generator.tsx` (generatedQuestions state)
- Fixed `error: any` → `error: unknown` in `api/ai/generate-questions/route.ts`
- Fixed `react/no-unescaped-entities` in `pwa-install.tsx` (curly quotes)
- Fixed `react-hooks/set-state-in-effect` in `pwa-install.tsx` (lazy init)
- Fixed `react-hooks/set-state-in-effect` in `forgot-password/page.tsx` (ref-based prev state)
- Removed unused `Loader2` import from `ai-generator.tsx`
- Removed unused `skipping`/`setSkipping` from `forgot-password/page.tsx`
- Renamed `error` → `_error` in all error boundary components

### 3.16 Console Logs
- Kept `console.log` in `sms.ts` — this is the **console SMS provider** (prints OTP to server logs in dev), not a debug statement
- No other debug logs found to remove

### 3.18 Git Hygiene
- Updated `.gitignore`: added `*.db`, `data/uploads/`, `dev-server.log`

---

## Files Modified (20)
1. `src/lib/constants.ts` (new)
2. `src/lib/mime.ts` (new)
3. `src/types/navigator.d.ts` (new)
4. `src/lib/auth.ts` (imports SESSION_DAYS, OTP from constants)
5. `src/app/actions/auth.ts` (removed dead OTP actions, imports SESSION_MAX_AGE)
6. `src/lib/utils.ts` (removed truncate, maskPhone)
7. `src/lib/rate-limit.ts` (removed clearRateLimits)
8. `src/app/api/ai/generate-questions/route.ts` (AI_MODEL, error: unknown)
9. `src/app/api/upload/route.ts` (shared MIME import)
10. `src/app/api/files/[filename]/route.ts` (shared MIME import)
11. `src/app/(site)/courses/[id]/subscribe/page.tsx` (PAYMENT fallback)
12. `src/app/(site)/wallet/charge/page.tsx` (PAYMENT fallback)
13. `src/app/actions/payments.ts` (SUBSCRIPTION_DAYS)
14. `src/app/actions/admin.ts` (SUBSCRIPTION_DAYS)
15. `src/app/actions/admin-users.ts` (SUBSCRIPTION_DAYS)
16. `src/components/ai-generator.tsx` (typed questions, removed unused import)
17. `src/components/pwa-install.tsx` (lazy init, curly quotes)
18. `src/app/(site)/forgot-password/page.tsx` (ref-based effect)
19. `next.config.ts` (removed ignoreBuildErrors)
20. `.gitignore` (dev artifacts)

## Files Created (5)
1. `src/lib/constants.ts`
2. `src/lib/mime.ts`
3. `src/types/navigator.d.ts`
4. `src/app/not-found.tsx`
5. `src/app/global-error.tsx`
6. `src/app/(site)/error.tsx`
7. `src/app/(site)/loading.tsx`
8. `src/app/admin/error.tsx`

## Files Deleted (6)
1. `prisma.ts` (root — dead SQLite duplicate)
2. `الاصل قبل التعديل/` (backup folder)
3. `dev.db`
4. `prisma/dev.db`
5. `data/uploads/`
6. `dev-server.log`
7. `src/app/(site)/teacher/courses/[courseId]/section-ai-generator.tsx`

## Dependencies Removed
- `@prisma/adapter-better-sqlite3`

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ 0 errors |
| `eslint` | ✅ 0 errors, 36 warnings |
| `vitest run` | ✅ 11/11 tests passing |
| `prisma generate` | ✅ Success |

---

## What's NOT in Phase 3
- No framework changes (still Next.js 16.3.0)
- No UI/UX changes
- No new features
- No database schema changes
- No dependency upgrades
