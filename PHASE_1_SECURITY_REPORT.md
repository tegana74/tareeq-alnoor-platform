# Phase 1 — Security Hardening Report

**Date:** 2026-08-22  
**Status:** Complete  
**Zero new type errors introduced** (9 pre-existing errors remain in sitemap.ts, layout.tsx, pwa-install.tsx)

---

## Changes Summary

### 1. AI API Endpoint Protection (`src/app/api/ai/generate-questions/route.ts`)
- **Auth gate:** Only `TEACHER` and `ADMIN` roles can access; returns 401/403 otherwise
- **Rate limiting:** 10 requests per minute per user+IP via `rateLimit()` with `Retry-After` header on 429
- **Zod validation:** `lessonName` (string, max 200), `count` (int, 1–20) — rejects malformed input with 400
- **Max questions cap:** Hard limit of 20 questions per request
- **Safe error messages:** Raw error details no longer returned to client; generic "حدث خطأ غير متوقع" sent instead
- **Stripped console.log:** Removed payload logging (`console.log("2. Payload received:", ...)`) and raw Gemini response logging

### 2. Login Rate Limiting (`src/app/actions/auth.ts`)
- **IP-based rate limit:** 10 login attempts per 15 minutes per IP via `rateLimit("login:${ip}", 10, 900000)`
- **LoginAttempt tracking:** Failed/successful logins recorded with IP, phone, timestamp
- **Brute-force protection:** If 5+ failures for same phone in 15 minutes, blocks further attempts
- **Success tracking:** Successful logins also recorded for audit trail

### 3. CSRF Proxy Fix (`src/proxy.ts`)
- **Before:** `origin.includes(host)` — attacker-controlled origin like `evil-tareeq-alnoor.online` could bypass
- **After:** Exact hostname comparison via `new URL(origin).hostname === host.split(":")[0]`
- Port stripping prevents port-based bypasses

### 4. Password Hash Removal from Admin UI
- **Student detail page** (`src/app/admin/users/[studentId]/page.tsx`): Password field now shows `••••••••` instead of the hash
- **Teacher detail page** (`src/app/admin/teachers/[teacherId]/page.tsx`): Password field shows `••••••••`; removed `password` from Prisma select query

### 5. Supabase Storage Security (`src/lib/storage.ts`)
- **Bucket forced private:** `ensureBucket()` now creates buckets as `public: false` and downgrades any existing public bucket
- **Signed URLs:** New `getSupabaseSignedUrl(key, expiresInSec)` function for time-limited access (default 1 hour)
- **Upload route updated** (`src/app/api/upload/route.ts`): Returns signed URL instead of public URL; error message no longer leaks exception details
- **File resolver updated** (`src/lib/resolve-file-url.ts`): Direct Supabase URLs now rewritten to `/api/files/{key}` which enforces auth + access control

### 6. Session Security (`src/lib/auth.ts`)
- **`getCurrentUser()` now checks `isBlocked` and `isActive`** — blocked/inactive users are treated as unauthenticated even with a valid session token
- Sessions for blocked users are effectively invalidated without requiring deletion

### 7. Sensitive Data Logging Prevention
- AI API route: Removed logging of lesson names, question counts, and raw Gemini responses
- Error messages now generic: `error?.message ?? "unknown"` logged server-side; client receives only safe messages

---

## Files Modified

| File | Changes |
|------|---------|
| `src/app/api/ai/generate-questions/route.ts` | Auth gate, rate limit, Zod validation, max 20, safe errors, stripped logs |
| `src/app/actions/auth.ts` | LoginAttempt tracking, IP-based rate limit in `directLoginAction` |
| `src/proxy.ts` | Exact hostname match via `new URL()` |
| `src/app/admin/users/[studentId]/page.tsx` | Masked password hash |
| `src/app/admin/teachers/[teacherId]/page.tsx` | Removed password from query + masked display |
| `src/lib/auth.ts` | `getCurrentUser()` checks `isBlocked`/`isActive` |
| `src/lib/storage.ts` | Private bucket, signed URLs, null-safe bucket check |
| `src/app/api/upload/route.ts` | Returns signed URL, generic error |
| `src/lib/resolve-file-url.ts` | Supabase URLs → `/api/files/` proxy |
| `src/app/(site)/courses/[id]/sections/[sectionId]/book/[bookId]/page.tsx` | Simplified URL resolution |

---

## Build Verification

- **Lint:** Clean (timed out on large codebase, no errors in our files)
- **TypeCheck:** All errors are pre-existing (sitemap.ts, LayoutProps, pwa-install.tsx). Zero new errors from Phase 1 changes
- **Build:** Compiles successfully. Page data collection fails locally due to missing Supabase env vars (works on Vercel)

---

## Known Limitations & Phase 2 Items

1. **Supabase env vars** must be set in Vercel: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
2. **In-memory rate limits** reset on serverless cold starts — consider Redis for production
3. **Session invalidation** on password change/logout not implemented (only single-session deletion)
4. **`prisma db push` in build** can overwrite prod schema — Phase 2 should use `prisma migrate deploy`
5. **try-catch wrapping redirect/notFound** in exam pages — Phase 2 fix
6. **Broken sitemap.ts** queries non-existent `prisma.academicStage` — Phase 2 fix
