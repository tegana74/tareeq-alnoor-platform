# LIVE-8B — Teacher LiveKit Publishing Flow Report

## Phase
LIVE-8B — Teacher Publishing Flow in the Live Room

## Root Cause / Motivation
LIVE-8A delivered secure LiveKit token generation (`GET /api/live/[id]/token`) but the live room had no actual media layer: teachers could transition session statuses (scheduled → waiting → live → ended) through FIX-7's shell, yet nothing captured or published camera/microphone tracks. LIVE-8B connects the existing shell to LiveKit Cloud using the token foundation, giving the teacher owner a real publish flow while preserving every existing access rule.

---

## Existing Architecture Reused
- **Token endpoint** from LIVE-8A — authorization matrix unchanged (teacher owner/admin = publisher, students = subscribers only)
- **`updateLiveSessionStatusAction`** from FIX-7 — all transitions still validated server-side via `canTransitionSessionStatus`
- **Status polling** (`GET /api/live/[id]/status`, 6s interval) and auto-attendance from FIX-7
- **External-link path** (YouTube embed / Zoom / Meet) preserved untouched — sessions with a `url` continue using the old flow

---

## Dependency Changes
| Package | Version | Purpose |
|---------|---------|---------|
| `livekit-client` | `^2.22.0` | Browser-side Room connection, track capture/publish |

---

## Teacher Publishing Flow
1. Teacher clicks «بدء البث المباشر» → client fetches publisher token from `/api/live/[id]/token`
2. On 401/403 → Arabic authorization error; on other failures → generic token error
3. `Room` initialized (`adaptiveStream`, `dynacast`, `simulcast`) and connected with token + server URL
4. Camera/mic requested via `createLocalTracks` (h720) with mapped Arabic errors:
   - `NotAllowedError` → permission denied message
   - `NotFoundError` → no device connected
   - `NotReadableError` → device busy
5. Local video preview attached (mirrored), tracks published sequentially
6. Only after successful connect + publish → `updateLiveSessionStatusAction(live)`; DB failure disconnects the room (no orphan live state)
7. Auto-connect on page load when session already live (teacher refresh case)

## Controls Implemented
- Camera toggle / mic toggle (`setCameraEnabled` / `setMicrophoneEnabled`)
- Leave room (disconnect, keeps session live)
- End session: stops both tracks first → DB `ended` → disconnect only on success; restores track state if DB write fails
- Connection badge: متصل / جاري الاتصال / جاري إعادة الاتصال / منقطع (incl. reconnect events)

## Security
- Publish rights come exclusively from the server-signed token grant — client never asserts role
- No secrets in client bundle; token endpoint returns only the JWT + public URL
- Status changes still go through the server action with ownership re-validation
- Students remain subscribe-only (enforced server-side in LIVE-8A)

---

## Tests
**File**: `tests/livekit-teacher-publish.test.ts` — 14 tests covering: publisher/subscriber grants, non-owner denial, camera/mic toggles, connect-failure → no live transition, successful waiting→live transition, cancel/end guards against going live, end-session teardown, reconnect retains live state.

Note: connection-failure cases (#6, #13) assert the contract intent (DB must not flip to live) at mock level; full browser-level behavior requires manual verification.

## Validation Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx eslint src` | ✅ 0 errors (29 pre-existing warnings) |
| `npx vitest run --no-file-parallelism` | ✅ 294/294 (280 previous + 14 new) |

---

## Files Changed
| File | Action |
|------|--------|
| `package.json` | Modified — added `livekit-client` |
| `package-lock.json` | Modified — lockfile update |
| `src/app/(site)/live/[id]/live-room-client.tsx` | Modified — LiveKit publisher flow + controls + preview |
| `tests/livekit-teacher-publish.test.ts` | **Created** — 14 tests |

No schema changes. No migrations. No changes to token route or server actions.

---

## Git
- **Commit**: `78fb22a` — `feat: teacher livekit publishing flow in live room`
- **Branch**: `main`
- **Push**: ✅ Pushed to `origin/main`

---

## Deployment Status
- **Production domain**: `https://www.tareeq-alnoor.online`
- GitHub Deployments API confirms `vercel[bot]` deployment for SHA `78fb22a`: **state: success** (Production, deployment id `6074185415`, 2026-08-25T00:45:12Z)
- A newer Production deployment for docs-only follow-up `441578f` (direct descendant of `78fb22a`, contains all LIVE-8B code): **state: success** (id `6074265645`, 2026-08-25T00:53:05Z)
- Domain↔project link verified functionally: the domain serves this application (Next.js on Vercel; `/api/live/[id]/token` and `/api/live/[id]/status` return the codebase's exact Arabic auth errors; homepage title matches). The Vercel *project name* is not retrievable locally (no Vercel CLI/token); it is the project linked to GitHub repo `tegana74/tareeq-alnoor-platform` via the `vercel[bot]` integration.

## Production Verification (2026-08-25)
- **Manual teacher token smoke test — PASSED** (performed by the team, owner-teacher account):
  - Endpoint: `GET /api/live/cmt7obe3l000004ladbinwfrs/token`
  - Result: `HTTP 200`, `hasToken = true`
- **Independent unauthenticated probes** (this verification pass):
  - `GET /api/live/<nonexistent>/token` → `401` JSON `{"error":"يجب تسجيل الدخول"}` — route deployed, auth guard active
  - `GET /api/live/<nonexistent>/status` → `401` JSON — FIX-7 routes intact
- **LiveKit env variables present in Production**: inferred functionally — the token route validates `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL` and returns `500` when any is missing; the observed `200` + issued JWT proves all three exist in the same Production environment. **No secret values were read or displayed** (Vercel env listing requires API credentials we deliberately did not use).
- Not yet exercised in production: a full camera/mic publish session in a real browser (unit tests cover the contracts; the manual test covered the token gate).

---

## Remaining Risks
1. **Full browser-level publish flow not yet exercised in production** — the manual smoke test verified the token gate (HTTP 200); a real classroom session with camera/mic remains to be run naturally
2. **Student subscriber view not implemented yet** — students get tokens but see the placeholder "لم يقم المعلم ببدء إرسال البث بعد"; subscribing UI is LIVE-8C scope
3. **No rate limiting** on token endpoint (carried over from LIVE-8A)
4. **Tokens issuable regardless of session status** (carried over from LIVE-8A)
5. Vercel project name / authoritative env-var listing not retrievable without Vercel credentials — presence verified functionally instead

---

## Scope Compliance
- ✅ No schema changes, no migrations
- ✅ Existing external-provider flows (YouTube embed / Zoom / Meet) untouched
- ✅ Server-side authorization reused, not duplicated
- ✅ No student-facing streaming UI (next phase)

---

## Final Status: **COMPLETE**

Implementation, validation, commit, push, and deployment are complete. The correct production domain (`https://www.tareeq-alnoor.online`) was verified, the deployment serving it contains `78fb22a` (via its direct descendant docs-only deploy `441578f`), LiveKit env variables are proven present in Production (token endpoint issued a JWT for the owner-teacher), and the manual teacher token smoke test passed (HTTP 200). A full camera/mic classroom session will occur naturally in use and remains the only unexercised path — noted under remaining risks rather than blocking completion.

> Correction note: an earlier version of this report claimed the smoke test was blocked on "unknown production URL". That was a local-tooling limitation; the domain above was already in service and manually tested by the team before this verification pass.
