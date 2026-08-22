# Phase 5 — File Delivery, Media Architecture & Session Maintenance Report

**Date:** 2026-08-22
**Status:** COMPLETE
**TypeScript Errors:** 0
**ESLint Errors:** 0
**Tests:** 22/22 passing (11 original + 9 file security + 2 session invalidation)

---

## Summary

Phase 5 restructured file delivery to eliminate Node.js memory buffering, added path traversal protection, implemented session lifecycle management, and optimized admin aggregation. Files are now served via signed URLs redirect, uploads support direct-to-storage mode, expired sessions are cleaned up probabilistically, and password changes invalidate other sessions.

---

## 1. File Delivery Architecture

**File:** `src/app/api/files/[filename]/route.ts`

### Before
- GET buffered entire file in Node.js memory (`getSupabaseFile` downloads full blob)
- 500MB video = 500MB Node.js heap allocation per request
- HEAD also downloaded full file then discarded (fixed in Phase 4, confirmed here)

### After
- GET performs authorization server-side, then redirects (302) to a signed Supabase URL
- Node.js never touches file content
- Signed URL expires in 1 hour (inline) or 5 minutes (download via `?dl=1`)
- HEAD still returns metadata without file content (uses `supabaseFileExists`)
- Supabase CDN handles Range requests natively for video playback

### Flow
```
Client GET /api/files/abc.pdf
  -> Server: authenticate user
  -> Server: sanitize filename (path traversal check)
  -> Server: resolve access (video/book/invoice ownership + subscription)
  -> Server: verify file exists in Supabase
  -> Server: generate signed URL (1hr expiry)
  -> Server: 302 redirect to signed URL
  -> Client: follows redirect to Supabase CDN
  -> Supabase: serves file with native Range/Cache support
```

---

## 2. Range / Video Delivery

Video files flow through `/api/files/[filename]` which now redirects to Supabase signed URLs. Supabase Storage supports HTTP Range requests natively, so:

- Video seeking works without Node.js proxy
- No full-file buffering for video playback
- CDN caching handled by Supabase infrastructure
- External providers (YouTube, Vimeo, VdoCipher, Bunny, Gumlet) are unaffected

---

## 3. Upload Architecture

**File:** `src/app/api/upload/route.ts`

### Dual-Path Upload

| Mode | Path | Use Case |
|------|------|----------|
| `buffer` (default) | Client -> Node -> Supabase | Current behavior, works for files up to 25MB/500MB |
| `signed` | Client -> signed URL -> Supabase directly | New option, bypasses Node.js memory |

### Signed Upload Flow
```
POST /api/upload?mode=signed
  -> Server: authenticate + authorize
  -> Server: validate file type
  -> Server: generate signed upload URL (5min expiry)
  -> Client: PUT file directly to Supabase via signed URL
  -> Client: uses returned key for database references
```

### Buffer Flow (unchanged)
```
POST /api/upload (default)
  -> Client: sends FormData
  -> Server: authenticates + validates
  -> Server: buffers file, uploads to Supabase
  -> Server: returns signed read URL + internal path
```

Both modes return `{ url: "/api/files/{key}" }` for consistent internal references.

---

## 4. File Type / Size Validation

Validated server-side in upload route:
- Extension checked against `ALLOWED_FILE_EXTENSIONS` / `ALLOWED_VIDEO_EXTENSIONS` from `src/lib/mime.ts`
- MIME type determined from extension (not from client Content-Type header)
- File size checked against `MAX_FILE_SIZE` (25MB) / `MAX_VIDEO_SIZE` (500MB)
- No new file types opened
- Validation runs in both `buffer` and `signed` modes

---

## 5. File Name Security

**New function:** `sanitizeKey()` in `src/app/api/files/[filename]/route.ts`

Protection against:
- `../` path traversal
- `%2e%2e` encoded traversal
- Absolute paths (`/etc/passwd`)
- URLs (`https://evil.com/steal`)
- Null bytes (`file.pdf\0.jpg`)
- Backslash traversal (`..\\..\\windows`)
- Empty or oversized keys (>255 chars)
- Dot-only segments (`.` and `..`)

### Test Results
```
allows normal file keys          ✓
rejects ../ traversal            ✓
rejects encoded traversal %2e%2e ✓
rejects absolute paths           ✓
rejects URLs                     ✓
rejects null bytes               ✓
rejects empty or too long keys   ✓
rejects dot segments             ✓
handles backslash traversal      ✓
```

---

## 6. Session Cleanup

**File:** `src/lib/auth.ts`

### Problem
Expired sessions accumulated in the `sessions` table indefinitely. No garbage collection existed.

### Solution: Probabilistic Cleanup
- Runs inside `getCurrentUser()` (called on every authenticated request)
- ~2% chance per request (after 5-minute cooldown)
- Deletes all sessions where `expiresAt < now()`
- Wrapped in try/catch — best-effort, never blocks requests
- In-memory cooldown prevents hammering the cleanup query

### Why Not Cron/External Service
- Vercel serverless has no persistent process for cron
- Database-level cleanup via Neon Scheduled Tasks would add infrastructure
- Probabilistic approach is zero-config, self-scaling, and sufficient for current scale

---

## 7. Password Change / Session Invalidation

**Files:** `src/lib/auth.ts`, `src/app/actions/auth.ts`

### changePasswordAction
- After updating password hash, calls `invalidateOtherSessions(userId, currentToken)`
- Deletes all sessions for the user EXCEPT the current one
- User remains logged in on the device where they changed the password
- Other devices/browsers are forced to re-login

### resetPasswordAction
- After updating password hash, calls `invalidateAllSessions(userId)`
- Deletes ALL sessions for the user
- User must re-login on all devices (appropriate for reset scenario)

### New Functions in `src/lib/auth.ts`
- `invalidateOtherSessions(userId, currentToken)` — removes all sessions except current
- `invalidateAllSessions(userId)` — removes all sessions for user

---

## 8. Session Token Security Audit

### Current Architecture
| Aspect | Implementation |
|--------|---------------|
| Token generation | `randomBytes(32).toString("hex")` — 256-bit random |
| Storage | Plaintext in `sessions` table, `token` column has `@unique` |
| Verification | `session.findUnique({ where: { token } })` on every request |
| Cookie | `tn_session`, httpOnly, secure (prod), sameSite=lax |
| Expiry | 30 days, checked in `getCurrentUser()` |

### Hashed Token Migration Assessment
- **Feasible:** Yes, using SHA-256 before storage
- **Impact on logout:** Must hash token from cookie before lookup
- **Impact on expiry:** No change (expiry is a separate column)
- **Impact on session cleanup:** No change (deletes by `expiresAt`)
- **Downtime risk:** Requires migration to hash existing tokens + code update
- **Recommendation:** Defer to Phase 6+ — current 256-bit random tokens are cryptographically strong, and the DB is not publicly accessible

---

## 9. Notification Count Optimization

**File:** `src/components/layout/site-header.tsx`

### Current Implementation
```ts
const unread = user
  ? await prisma.notification.count({ where: { userId: user.id, isRead: false } })
  : 0
```

### Assessment
- Runs once per authenticated page render (React `cache()` prevents duplicates within same RSC render)
- Uses indexed query: `Notification(userId, isRead)` index added in Phase 4
- `count()` is lightweight — PostgreSQL uses index-only scan
- Returns a single integer — negligible payload

### Decision: No Change Needed
- The query is already optimized by Phase 4 indexes
- Adding client-side polling would increase complexity without meaningful gain
- Redis caching would add infrastructure for <1ms query
- The current approach is the simplest correct solution

---

## 10. Admin Teacher Detail Aggregation

**File:** `src/app/admin/teachers/[teacherId]/page.tsx`

### Before
- Fetched ALL subscriptions (unbounded) with full user+year includes
- Fetched ALL invoices (unbounded)
- Computed totalStudents via `new Set(subscriptions.map(s => s.userId)).size` in JS
- Computed totalRevenue by summing invoice amounts in JS loop

### After
- Subscriptions still fetched for stage breakdown (bounded by teacher's courses)
- **Revenue:** Uses `prisma.invoice.aggregate({ _sum: { amount: true } })` — single SQL query
- Student deduplication uses `Set` but with leaner data (no unnecessary year nesting for count)
- Monthly revenue bucketing still done in JS (unavoidable without raw SQL date truncation)

### Improvement
- Revenue computed at DB level instead of summing N rows in JS
- Invoice query adds `orderBy: { createdAt: "desc" }` for consistent monthly bucketing
- Stage breakdown unchanged (requires user+year join, not possible with Prisma groupBy alone)

---

## 11. Production Logging Safety

### Audit Results
- `src/app/api/files/[filename]/route.ts` — no logging (clean)
- `src/app/api/upload/route.ts` — no logging of file keys or URLs (clean)
- `src/lib/storage.ts` — no logging of signed URLs or keys (clean)
- `src/lib/auth.ts` — no logging of session tokens (clean)
- `src/app/actions/auth.ts` — no logging of passwords or tokens (clean)
- `src/app/actions/payments.ts` — no logging of payment secrets (clean)

### No changes needed — no sensitive data is logged anywhere in the modified files.

---

## 12. Security Regression Tests

**File:** `tests/file-security.test.ts` (9 tests)

| Test | Input | Expected |
|------|-------|----------|
| Normal file keys | `abc123.pdf`, `folder/file.pdf` | Pass |
| `../` traversal | `../../etc/passwd` | Rejected |
| Encoded traversal | `%2e%2e/%2e%2e/etc/passwd` | Rejected |
| Absolute paths | `/etc/passwd` | Rejected |
| URLs | `https://evil.com/steal` | Rejected |
| Null bytes | `file.pdf\0.jpg` | Rejected |
| Empty/long keys | `""`, `"a".repeat(256)` | Rejected |
| Dot segments | `.` , `..` | Rejected |
| Backslash traversal | `..\\..\\windows\\system32` | Rejected |

**File:** `tests/session-invalidation.test.ts` (2 tests)

| Test | Verifies |
|------|----------|
| invalidateOtherSessions | Deletes all sessions except current token |
| invalidateAllSessions | Deletes all sessions for user |

---

## 13. Performance Impact

### File Delivery
| Metric | Before | After |
|--------|--------|-------|
| Node.js memory per file request | Full file size (up to 500MB) | ~0 bytes (redirect only) |
| Time to first byte | Download from Supabase + buffer + send | 302 redirect (~50ms) |
| Video Range requests | Not supported (full download) | Native via Supabase CDN |
| Connection reuse | New connection per request | CDN-cached connections |

### Session Cleanup
| Metric | Before | After |
|--------|--------|-------|
| Expired sessions in DB | Accumulate forever | Cleaned probabilistically |
| Cleanup overhead | None | ~1 query every 50 requests (5 min cooldown) |

### Admin Teacher Detail
| Metric | Before | After |
|--------|--------|-------|
| Revenue computation | Sum N rows in JS | Single `aggregate` SQL query |
| Subscription fetch | Full user+year includes | Leaner select |

---

## 14. Test Results

| Check | Result |
|-------|--------|
| `tsc --noEmit` | 0 errors |
| `eslint` | 0 errors, pre-existing warnings only |
| `vitest run` | 22/22 passing |
| `prisma generate` | Success |

### Test Files
| File | Tests | Status |
|------|-------|--------|
| `tests/file-security.test.ts` | 9 | All passing |
| `tests/session-invalidation.test.ts` | 2 | All passing |
| `tests/wallet-atomicity.test.ts` | 2 | All passing |
| `tests/insert-code-redemption.test.ts` | 2 | All passing |
| `tests/coupon-concurrency.test.ts` | 2 | All passing |
| `tests/live-booking-atomicity.test.ts` | 3 | All passing |
| `tests/invoice-idempotency.test.ts` | 2 | All passing |

---

## 15. Files Modified

| File | Change |
|------|--------|
| `src/app/api/files/[filename]/route.ts` | Signed URL redirect, path traversal protection, leaner access resolution |
| `src/app/api/upload/route.ts` | Dual-path upload (buffer + signed URL mode) |
| `src/lib/storage.ts` | Added `getSupabaseSignedUploadUrl()` |
| `src/lib/auth.ts` | Probabilistic session cleanup, `invalidateOtherSessions()`, `invalidateAllSessions()` |
| `src/app/actions/auth.ts` | Session invalidation on password change/reset |
| `src/app/admin/teachers/[teacherId]/page.tsx` | Revenue via Prisma aggregate |

### Files Created
| File | Purpose |
|------|---------|
| `tests/file-security.test.ts` | 9 path traversal security tests |
| `tests/session-invalidation.test.ts` | 2 session invalidation tests |

---

## 16. Remaining Risks

1. **Signed URL leakage** — if a signed URL is shared, it grants access until expiry. Mitigated by short expiry (1hr/5min) and private bucket.
2. **Upload signed URL race** — client could theoretically use upload URL for wrong file type. Mitigated by server-side type check before URL generation.
3. **Session cleanup probability** — at low traffic, cleanup may not run for hours. Acceptable since expired sessions are harmless (rejected by expiry check in `getCurrentUser`).
4. **Buffer upload still exists** — large files (500MB video) still buffer in Node.js when using default mode. Clients should migrate to `mode=signed` for large files.
5. **Admin teacher subscriptions still unbounded** — if a teacher has 10,000+ student subscriptions, the JS dedup loop processes all rows. Needs raw SQL for extreme scale.

---

## 17. Production Verification Requirements

1. Test file download: verify 302 redirect to signed Supabase URL works
2. Test video playback: verify Range requests work via Supabase CDN
3. Test path traversal: verify `../`, `%2e%2e`, absolute paths are rejected
4. Test password change: verify other sessions are invalidated
5. Test password reset: verify all sessions are invalidated
6. Monitor session table size: should stabilize after cleanup runs
7. Verify signed upload URL mode works from client code
8. Test large file upload via signed URL (bypasses Node.js memory)

---

## 18. Recommendations for Phase 6

1. **Migrate client upload code** to use `mode=signed` for large files (video uploads)
2. **Session token hashing** — hash tokens with SHA-256 before storage (requires migration)
3. **Streaming upload** for buffer mode — use `request.body` pipe instead of `arrayBuffer()`
4. **Admin teacher raw SQL** — replace subscription query with `COUNT(DISTINCT userId)` for extreme scale
5. **E2E tests** for file upload/download flow
6. **Error monitoring** (Sentry) for production visibility
