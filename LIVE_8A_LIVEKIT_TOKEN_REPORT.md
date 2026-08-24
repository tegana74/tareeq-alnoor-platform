# LIVE-8A — LiveKit Token Foundation Report

## Phase
LIVE-8A — Media Provider Foundation & Token Generation

## Root Cause / Motivation
The project had a Live Classroom shell (FIX-7) with session management, booking, and attendance — but no actual media streaming infrastructure. LIVE-8A adds the LiveKit Cloud backend integration and secure token generation as the foundation for future live streaming (LIVE-8B/C/D).

---

## Existing Architecture
- **LiveSession model**: `id`, `teacherId`, `courseId`, `durationMinutes`, `price`, `isFree`, `status`, `bookings[]`
- **Auth**: Cookie-based sessions via `getCurrentUser()` from `@/lib/auth`
- **Access control**: `canAccessCourse()` from `@/lib/subscriptions` — checks admin, teacher ownership, or active subscription
- **Booking logic**: `SessionBooking` with `status: "booked" | "cancelled"`
- **Existing routes**: `GET /api/live/[id]/status`, `POST /api/live/[id]/attend`

---

## Dependency Changes
| Package | Version | Purpose |
|---------|---------|---------|
| `livekit-server-sdk` | `^2.18.0` | Server-side AccessToken generation |

**Not added** (not needed for LIVE-8A):
- `livekit-client`
- `@livekit/components-react`

---

## Token Endpoint
**Route**: `GET /api/live/[id]/token`  
**File**: `src/app/api/live/[id]/token/route.ts`  
**Type**: Server-only Route Handler (`export const dynamic = "force-dynamic"`)

---

## Authorization Matrix

| User Type | Condition | Result | canPublish | canSubscribe |
|-----------|-----------|--------|------------|--------------|
| Guest (unauthenticated) | — | 401 | — | — |
| Teacher (owner) | `user.teacherId === session.teacherId` | ✅ Token | `true` | `true` |
| Admin | `user.role === "ADMIN"` | ✅ Token | `true` | `true` |
| Teacher (non-owner) | `user.teacherId !== session.teacherId` | 403 | — | — |
| Student (free session) | `session.isFree === true` | ✅ Token | `false` | `true` |
| Student (paid + booked) | `booking.status === "booked"` | ✅ Token | `false` | `true` |
| Student (paid + unbooked) | No valid booking | 403 | — | — |
| Student (no course access) | `canAccessCourse() === false` | 403 | — | — |

---

## Token Permissions
- **Publisher** (Teacher owner / Admin): `canPublish: true`, `canSubscribe: true`
- **Subscriber** (Student with access): `canPublish: false`, `canSubscribe: true`
- Students are **never** granted publish permissions.

---

## Room Identity
- **roomName**: `session.id` (LiveSession primary key)
- **participantIdentity**: `user.id` (never email)
- **participantName**: `${firstName} ${middleName} ${lastName}`.trim()

---

## Expiration Policy
- **TTL**: `(session.durationMinutes + 15) * 60` seconds
- 15-minute safety margin beyond session duration
- No long-lived tokens

---

## Security
- `LIVEKIT_API_SECRET` is **never** exposed in:
  - JSON responses
  - Client bundles
  - Logs
  - Test fixtures
  - Git
- Identity derived from server-side session (`getCurrentUser()`)
- No client-supplied userId, teacherId, or role trusted
- Access control reuses existing `canAccessCourse()` and booking checks
- Missing env vars → 500 with generic error message (no secret leakage)

---

## Environment Variables

| Variable | Scope | Status |
|----------|-------|--------|
| `LIVEKIT_API_KEY` | Server | **PENDING** — must be set in Vercel |
| `LIVEKIT_API_SECRET` | Server | **PENDING** — must be set in Vercel |
| `NEXT_PUBLIC_LIVEKIT_URL` | Public | **PENDING** — must be set in Vercel |

⚠️ **Production will return 500 on token requests until these are configured.**

---

## Tests
**File**: `tests/livekit-token.test.ts`  
**Count**: 20 tests

| # | Test Case | Status |
|---|-----------|--------|
| 1 | Teacher owner → publisher token | ✅ |
| 2 | Admin → publisher token | ✅ |
| 3 | Student with valid course access → subscriber token | ✅ |
| 4 | Booked paid-session student → subscriber token | ✅ |
| 5 | Unbooked paid-session student → 403 | ✅ |
| 6 | Non-subscriber (no course access) → 403 | ✅ |
| 7 | Guest (unauthenticated) → 401 | ✅ |
| 8 | Wrong teacher → 403 | ✅ |
| 9 | Session not found → 404 | ✅ |
| 10 | Correct room name = session.id | ✅ |
| 11 | Teacher has canPublish: true | ✅ |
| 12 | Student has canPublish: false | ✅ |
| 13 | Secret never serialized in response | ✅ |
| 14 | Token TTL = duration + 15 min | ✅ |
| 15 | Participant identity = user.id | ✅ |
| 16 | Participant name from user fields | ✅ |
| 17 | Missing env vars → 500 | ✅ |
| 18 | Free session without courseId → access granted | ✅ |
| 19 | Cancelled booking → 403 | ✅ |
| 20 | LiveKit URL returned in response | ✅ |

---

## Validation Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx eslint src` | ✅ 0 errors (29 pre-existing warnings) |
| `npx vitest run --no-file-parallelism` | ✅ 280/280 (260 existing + 20 new) |
| `npm run build` | ⚠️ Pre-existing failure: `SUPABASE_SERVICE_KEY` missing in local env (unrelated to LIVE-8A). TypeScript compilation passed. |

---

## Files Changed
| File | Action |
|------|--------|
| `package.json` | Modified — added `livekit-server-sdk` |
| `package-lock.json` | Modified — lockfile update |
| `src/app/api/live/[id]/token/route.ts` | **Created** — token endpoint |
| `tests/livekit-token.test.ts` | **Created** — 20 tests |

No other files modified. No schema changes. No migrations.

---

## Git
- **Commit**: `60c2ffa` — `feat: add livekit token foundation`
- **Branch**: `main`
- **Push**: ✅ Pushed to `origin/main`

---

## Vercel Deployment
- Push to `main` completed successfully
- `gh` CLI unavailable locally — cannot verify deployment status programmatically
- **Action required**: Verify deployment at Vercel dashboard
- **Action required**: Set `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL` in Vercel environment variables before the token endpoint will function

---

## Production Verification
- Token endpoint will be deployed at `/api/live/[id]/token`
- **Cannot smoke test** until LiveKit environment variables are set in Vercel
- This phase only establishes token foundation — no live streaming UI yet

---

## Remaining Risks
1. **LiveKit env vars not yet set in production** — endpoint returns 500 until configured
2. **Build failure** (pre-existing) — `SUPABASE_SERVICE_KEY` missing from local build env; unrelated to LIVE-8A
3. **No rate limiting** on token endpoint — consider adding in future phase
4. **No session status check** — tokens can be requested for any session status (scheduled, ended, etc.). Future phases may want to restrict to live/waiting sessions only.

---

## Scope Compliance
- ✅ No schema changes
- ✅ No migrations
- ✅ No session status modifications
- ✅ No start/stop logic
- ✅ No client-side streaming UI
- ✅ Reuses existing auth and access control
- ✅ No changes to existing files beyond package.json

---

## Final Status: **PARTIAL**

Token foundation is complete and tested. Status is PARTIAL because:
- LiveKit environment variables must be configured in Vercel production before the endpoint is functional
- Deployment verification cannot be confirmed without `gh` CLI or Vercel dashboard access
