# LIVE-9B — Student Admission & Waiting Room Report

## Phase
LIVE-9B — Student Admission Requests + Teacher Approval + Waiting Room

Scope executed: LIVE-9B only. No 9C/9D/9E/9F work started.

---

## Problem Statement (not a bug — a missing gate)

Before LIVE-9B the flow was:

```
student opens /live/[id]  →  GET /api/live/[id]/token  →  Subscriber token  →  joins LiveKit
```

Any student who passed the course/booking checks entered the room the instant the page
mounted. The teacher had no say. The required flow is:

```
student opens /live/[id]  →  admission request  →  teacher approves  →  token  →  joins LiveKit
```

The gap was structural, not a defect: **there was no admission state anywhere** — no table,
no route, no policy. Opening the page *was* the authorization. LIVE-9B inserts a
server-enforced gate between "page open" and "token issued" without touching the existing
course-access, booking, subscription, or free-session rules.

---

## Architecture

Four layers, deliberately separated so the policy is testable without React or Prisma:

| Layer | File | Responsibility |
|---|---|---|
| Policy (pure) | `src/lib/live-classroom/admission.ts` (141 lines) | All admission rules as pure functions. No React, no Prisma. |
| Persistence | `src/lib/live-classroom/admission-server.ts` (168 lines) | Prisma reads/writes + `P2021` (table missing) detection. |
| Routes | `src/app/api/live/[id]/admission/**` (4 files, 356 lines) | `GET` state · `POST request` · `POST approve` · `POST reject` |
| UI | `admission-gate.tsx` (193) · `admission-panel.tsx` (236) | Student waiting room · teacher request list |

**Source of truth is the `live_session_admissions` table — never React state.** Both the
page (server component) and the token route read it independently; the client is never
asked what its own status is.

### Session type routing

`isAdmissionManagedSession(url) === !url`. Only LiveKit sessions (no external URL) are
admission-managed. YouTube / Zoom / Meet sessions keep their previous behavior byte-for-byte —
asserted by test 17, which also proves `liveSessionAdmission.findUnique` is never called
for them.

---

## Security Model

**The gate lives in the token route, not the UI.** Bypassing the waiting-room screen buys
nothing: `GET /api/live/[id]/token` performs its own server-side read of the admission row
and returns 403 unless `status === "approved"`.

Authorization ladder in `src/app/api/live/[id]/token/route.ts`:

```
1.  no session cookie                    → 401
2.  session not found                    → 404
3.  non-owner TEACHER                    → 403
3a. canAccessCourse() fails              → 403
3b. paid session without booking         → 403
3c. LIVE-9B: admission !== "approved"    → 403   ← new
    ├─ admission table missing (P2021)   → 503   (fail closed)
    └─ approved                          → Subscriber token
```

Enforced properties:

- **Approve/Reject = owner teacher or ADMIN only.** `canManageAdmission(user, session)`
  compares `user.teacherId` (from the authenticated session) against
  `session.teacherId` (from the database). Client-supplied `teacherId`, `role`, and
  ownership are never read.
- **`decidedBy` is taken from the authenticated user, never the request body.** Test 7b
  posts `decidedBy: "spoofed"` and asserts the persisted value is `"u-teacher"`.
- **Student grants unchanged from LIVE-8C:** `canPublish = false`,
  `canPublishData = false`, `canSubscribe = true`. Asserted individually (tests 15, 16).
- **No `roomAdmin` in any student token** — asserted structurally (test 16b).
- **No camera or microphone permission is requested from the student.** The student remains
  subscriber-only; the gate renders before the viewer mounts.
- **No roster leak.** `GET /admission` returns `{role: "student", status}` to students —
  the `pending` array is omitted entirely and `findMany` is never called (test 20b).
- **Fail closed, everywhere.** If the admission row cannot be read: the token route returns
  503; the page assigns `initialAdmission = "none"` *before* the `try` block, so a read
  failure renders the request card, never the viewer.
- **Attendance is admission-gated** in `live-room-client.tsx`: `if (!url && admissionState !== "approved") return`.

---

## Database Change

One new table. **Additive only** — no `ALTER` on any existing table, no column rename, no
retype, no `NOT NULL` added to existing data, no backfill. Reversible with a single
`DROP TABLE`.

```sql
CREATE TABLE "live_session_admissions" (
    "id"          TEXT NOT NULL,
    "sessionId"   TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt"   TIMESTAMP(3),
    "decidedBy"   TEXT,
    CONSTRAINT "live_session_admissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX ... ON ("sessionId", "userId");   -- makes /request idempotent
CREATE INDEX        ... ON ("sessionId", "status");   -- teacher panel query
-- FKs to live_sessions(id) and users(id), both ON DELETE CASCADE
```

The two Prisma back-relations (`User.liveSessionAdmissions`, `LiveSession.admissions`) are
virtual — they generate no columns on `users` or `live_sessions`.

`status` is `TEXT`, not an enum. That is deliberate: LIVE-9C will need a `"kicked"` value,
and a text column accepts a fourth value with **no further migration**.

**`prisma db push` and `prisma migrate reset` were never run.**

---

## Files Changed

### New (10 files, 1,591 lines)

```
prisma/migrations/20260825_add_live_session_admissions/migration.sql    24
src/lib/live-classroom/admission.ts                                   141
src/lib/live-classroom/admission-server.ts                            168
src/app/api/live/[id]/admission/route.ts                              116
src/app/api/live/[id]/admission/request/route.ts                      146
src/app/api/live/[id]/admission/approve/route.ts                       47
src/app/api/live/[id]/admission/reject/route.ts                        47
src/app/(site)/live/[id]/admission-gate.tsx                           193
src/app/(site)/live/[id]/admission-panel.tsx                          236
tests/live-admission.test.ts                                          473
```

### Modified (8 in-scope files, +160 / -4)

| File | Δ | Change |
|---|---|---|
| `prisma/schema.prisma` | +22 | New model + 2 virtual back-relations |
| `src/app/api/live/[id]/token/route.ts` | +51 / -1 | Step 3c admission gate + Arabic denial messages |
| `src/app/(site)/live/[id]/live-room-client.tsx` | +28 / -3 | Gate/panel wiring + attendance guard |
| `src/app/(site)/live/[id]/page.tsx` | +17 | Server-side fail-closed admission read |
| `tests/livekit-token.test.ts` | +11 | Admission mock (see below) |
| `tests/livekit-student-subscribe.test.ts` | +11 | Admission mock |
| `tests/livekit-teacher-publish.test.ts` | +10 | Admission mock |
| `tests/live-camera-screenshare.test.ts` | +10 | Admission mock |

**Why four existing test files were touched.** Each mocks Prisma wholesale and exercises the
token route. Once step 3c existed, their student-token tests would have started receiving
403 — a false regression, since those suites test *grants and course access*, not the
admission gate. Each received `liveSessionAdmission.findUnique → {status: "approved"}` in
`beforeEach` plus a comment naming `live-admission.test.ts` as the gate's real coverage.
**No assertion was changed, relaxed, or deleted.**

### Out of scope, present in the working tree

`CLAUDE.md` (+191) — the Claude Code Skills Policy section from an earlier task. Unrelated to
LIVE-9B and must **not** be part of the LIVE-9B commit (rule §18: no unrelated files).
Commit it separately as a docs change.

---

## Code Review Fixes Applied

`front:frontend-code-review` raised four issues against the first implementation. All four
were fixed before any commit.

**1. Unbounded polling.** The teacher panel polled every 4 s for the whole session even with
zero pending requests — ~1,350 requests × 2 DB queries over a 90-minute class. Replaced with
linear backoff in `nextAdmissionPollDelay(emptyRounds)`: 4 s while requests exist, then
8 → 12 → 16 → 20 s across consecutive empty rounds, **capped at 20 s so polling never
stops**. The counter zeroes on the first visible row, so the burst at session start stays
fast. Failed responses also count as empty rounds, so a 503 no longer hammers the server
every 4 s. Worst-case discovery latency for a new request: 20 s. Roughly 270 requests
worst case instead of 1,350. **No realtime system was added** (rule §11).

Implementation detail: the loop is a self-rescheduling `setTimeout` with `emptyRounds` as an
**effect-local variable, not React state** — state would restart the effect on every change.
`tick()` wraps `load()` in `try/catch` and reschedules on every path, so no unexpected
rejection can silence the panel permanently.

**2. Stale in-flight poll restoring a decided row.** A poll that departs *before* an
approve/reject can land *after* it, carrying the decided row and making it reappear.
Fixed with `decidedRef: Set<string>` keyed `userId@requestedAt`, filtered out of every
response, and pruned of keys the server no longer returns so it cannot grow unbounded.
`approvedCount` is additionally skipped when the response is detected as stale, otherwise
it would tick backwards by one. **Approve/reject semantics unchanged** — the ref only
filters what the *poll* restores.

The key includes `requestedAt`, not just `userId`. Keying by `userId` alone would have
permanently hidden any student who re-requests after rejection: `/request` sets
`status: "pending"` **and refreshes `requestedAt`** on `reset-to-pending`
(`request/route.ts:117`), so a re-requesting student *is* returned as pending — the prune
loop would never drop them and they would stay filtered forever. With `requestedAt` in the
key the new request carries a different key and appears immediately.

**3. Dead exports in `admission.ts`.** Removed `ADMISSION_LABELS` (the gate's Arabic copy
belongs with the gate — a flat per-state string map fit heading/body/button roles badly),
`FUTURE_ADMISSION_STATUSES`, and `ADMISSION_DECISIONS`. `AdmissionDecision` became a literal
union type: un-exporting the const while keeping it to derive the type produced a *new* lint
warning (`assigned a value but only used as a type`). The `FUTURE_ADMISSION_STATUSES` **doc
comment was kept** — rule §14 says document `kicked`, don't implement it.

**4. JSX formatting artifact** in `admission-panel.tsx` — a collapsed `<div>`/`<h3>` line
split correctly.

---

## Tests

**File**: `tests/live-admission.test.ts` — **30 tests**

Prisma fully mocked; `livekit-server-sdk` replaced by `FakeAccessToken` recording constructor
calls, so *"no token was ever minted"* is asserted structurally, not merely inferred from an
HTTP status. The `beforeEach` fixture is the **most permissive** case — authorized student,
free LiveKit session, course access granted, no admission row — so every 403 in the token-gate
block is attributable to admission alone, with all earlier gates passing.

| Group | n | Coverage |
|---|---|---|
| `POST /admission/request` | 8 | happy path · guest 401 · no course access 403 · unbooked paid session 403 · duplicate idempotent (no second row) · persisted as `pending` · `ended` 400 · `cancelled` 400 |
| `POST /admission/approve` | 4 | owner approves · **`decidedBy` from session not client** · non-owner teacher 403 · admin approves |
| `POST /admission/reject` | 2 | owner rejects · non-owner 403 |
| Manager-only | 2 | student approve **and** reject → both 403, no write · student cannot read others' pending requests |
| `GET /token` admission gate | 10 | rejected 403 · pending 403 · **never-requested 403** · approved 200 + `canSubscribe` · `canPublish false` · `canPublishData false` · **no `roomAdmin`** · external-url unaffected + no admission query · teacher owner unaffected · **503 fail-closed on P2021** |
| Poll cadence | 4 | fast cadence at 0 empty rounds · monotonic 8/12/16 s · capped at 20 s for 4–10,000 rounds · immediate return to fast cadence |

Baseline maintained: **383/383 passing (353 baseline + 30 new)**. No existing test deleted,
skipped, or weakened.

---

## Validation Results

All gates re-run 2026-08-26 against the final code:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0, 0 errors |
| `npx eslint src` | ✅ 0 errors, 29 warnings — **exact pre-existing baseline** |
| `npx vitest run --no-file-parallelism` | ✅ **383/383** (31 files, 34.6 s) |
| `npx vitest run tests/live-admission.test.ts` | ✅ **30/30** |
| `git diff --check` | ✅ exit 0 — no whitespace errors (all 10 new files checked separately against `/dev/null`, also clean) |
| `npm run build` | ⚠️ **Not claimed.** Pre-existing local failure: compiles and finishes TypeScript, then fails collecting page data for `/api/files/[filename]` — `supabaseKey is required` from `src/lib/storage.ts:3` because local `SUPABASE_SERVICE_KEY` is empty. Reproduced before LIVE-9B; builds fully with a dummy value. Storage code untouched (rule §17). |

---

## Skills Used

| Skill | Why |
|---|---|
| `frontend-design` | Designed the 4-state student gate card (not requested / pending / approved / rejected) and the teacher request panel, matching the room's existing `rounded-2xl` bordered-card style in Arabic RTL. |
| `front:frontend-testing` | Authored the 30-case Vitest suite for the admission routes and the modified token route in the existing node-environment, fully-mocked-Prisma convention. |
| `front:frontend-code-review` | Reviewed the whole phase for authorization correctness and client-trust violations. Produced the four fixes above. |
| `playwright` | **NOT RUN.** See Browser E2E below. |

The LIVE-9B row of the Skills Policy requires `playwright` as well. It was not executed.

---

## Browser E2E

**Implementation complete, browser E2E pending.**

Not run. The following require a signed-in teacher and a signed-in student against a deployed
build and cannot be substituted by Vitest:

1. Student opens a live LiveKit session → **does not enter** → sees the request card
2. Student sends request → sees «في انتظار موافقة المعلم» with the pending state
3. Teacher's panel shows the request within one poll cycle (≤ 20 s idle, 4 s while busy)
4. Teacher approves → student's gate flips to approved → LiveKit viewer mounts → video plays
5. Teacher rejects → student **never** joins, no token issued, re-request path works
6. Two students, one approved one rejected, in the same session simultaneously
7. Panel behavior across approve → immediate poll (the stale-response fix, item 2 above)
8. Student is never prompted for camera or microphone permission at any point

Items 1–8 are covered at unit level for the *server contract*; what is unverified is the
*browser wiring* — specifically that the panel effect feeds `emptyRounds` correctly
(`admission-panel.tsx:89,113`) and that the gate's `onStateChange` reaches
`live-room-client.tsx`. Those two paths are currently verified by reading only.

---

## Git

**Not committed. Not pushed.** Held at explicit user instruction («لا تعمل commit أو push بعد»).

Working tree: 9 modified tracked files (+347 / −4, including the unrelated `CLAUDE.md` +191)
and 10 untracked files.

Planned commit (rule §19), **excluding `CLAUDE.md`**:

```
feat: add student admission and waiting room
```

Diff reviewed file by file with the user before this report. No secrets, no service keys, no
`roomAdmin` grant, no client-trusted identity, no changes to auth, storage, exams, or the
heartbeat.

---

## Database Migration Status

**Applied to production.** Run by the user (per the agreed split: schema approved by review,
migration executed by the user — `prisma migrate deploy` was never run from this session).

Verified two independent ways on 2026-08-26:

```
$ npx prisma migrate status
Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-flat-wave-...eu-central-1.aws.neon.tech"
6 migrations found in prisma/migrations
Database schema is up to date!

$ echo 'SELECT 1 FROM "live_session_admissions" LIMIT 1;' | npx prisma db execute --stdin
Script executed successfully.        # read-only existence probe, no rows written
```

Earlier in the session this same command reported `20260825_add_live_session_admissions` as
pending; it is now recorded as applied and the table is queryable. No drift block was
emitted at any point.

The ordering is the safe one: **table exists in production before the code that reads it
ships.** There is no window in which deployed code queries a missing table.

---

## Vercel Deployment

**Not deployed.** Nothing has been pushed, so no deployment exists for this work. Production
currently runs `2738c3c`, which predates LIVE-9B and contains no admission code.

---

## Production Verification

**NOT PERFORMED — and not performable yet.** The code is not deployed, so the rule §20 probes
against `https://www.tareeq-alnoor.online` cannot test LIVE-9B behavior:

| Probe | Expected | Status |
|---|---|---|
| Guest → `GET /api/live/<id>/token` | 401 | Pending deploy (401 is pre-existing behavior; proves nothing about 9B) |
| Pending student → token | 403 | Pending deploy |
| Approved student → token | 200 + subscriber grants | Pending deploy |

No production success is claimed for LIVE-9B.

---

## Remaining Risks

1. **Browser E2E not run** (highest). The server contract is well covered; the React wiring
   of the panel's backoff counter and the gate's `onStateChange` callback is verified by
   reading only.
2. **`attend` route has no admission check.** `POST /api/live/[id]/attend` was left untouched.
   A pending student who calls it directly gets an attendance row. This is a
   *record-integrity* gap, not an access breach — no token is issued, no LiveKit join
   occurs, no video is seen. Deliberately not fixed: outside the four approved review fixes
   and outside LIVE-9B scope. Natural LIVE-9C candidate.
3. **Requests can accumulate invisibly before a session starts.**
   `REQUESTABLE_SESSION_STATUSES` includes `scheduled`, but the panel renders only on
   `waiting || live`. Nothing is lost — rows persist and appear ordered by `requestedAt`
   once the session moves to `waiting` — but a teacher checking a `scheduled` session sees
   no panel.
4. **20 s worst-case discovery latency** for a new request when the panel has been idle.
   This is the deliberate trade for a ~5× reduction in query volume, and the counter resets
   to 4 s on the first visible row.
5. **Approval is not revocable in 9B.** No Kick (rule §14). An approved student who leaves
   rejoins immediately without a new request — correct for a dropped connection, but there
   is no way to eject someone until LIVE-9C adds `"kicked"`.
6. **No rate limiting** on `/admission/request`. A student can re-request in a loop; the
   unique index means no row growth, but each call is a DB round-trip. Carried over from
   prior phases (token/heartbeat have the same gap).
7. `npm run build` cannot be verified locally until `SUPABASE_SERVICE_KEY` is set in `.env`
   (pre-existing, unrelated to this phase).

---

## Scope Compliance

- ✅ LIVE-9B only — no 9C (participant management / kick / mute), no 9D (chat / raise hand),
  no 9E, no 9F
- ✅ No new token route — `GET /api/live/[id]/token` extended in place
- ✅ Teacher/Admin token behavior unchanged (test 17b)
- ✅ Student grants unchanged: `canPublish false`, `canPublishData false`, `canSubscribe true`
- ✅ No `roomAdmin` in any student token
- ✅ No camera/microphone permission requested from students
- ✅ No new WebSocket or realtime infrastructure — lightweight polling only
- ✅ External YouTube / Zoom / Meet sessions untouched
- ✅ Course access, booking, subscription, and free-session rules preserved
- ✅ Exactly one new test file; 353 → 383, nothing deleted
- ✅ No `prisma db push`, no `prisma migrate reset`
- ✅ No secrets in code, responses, logs, or fixtures

---

## Final Status: **PARTIAL**

Implementation, security model, database migration, and every local validation gate are
complete and verified:

- ✅ Implementation complete (10 new files, 8 modified in scope)
- ✅ All four code-review fixes applied, plus two defects found and fixed by self-audit
- ✅ `tsc` 0 errors · `eslint` 0 errors / 29 baseline warnings · **383/383 tests**
- ✅ Migration applied to production and verified twice
- ❌ Git commit — held at user instruction
- ❌ Push / Vercel deployment — not done
- ❌ Production smoke test — not performable until deployed
- ❌ Browser E2E — not run

**Not COMPLETE**, and deliberately so: rule §10 states a phase is not complete merely
because TypeScript, ESLint, and Vitest pass, and for LiveKit/browser-dependent work Browser
E2E is part of the required completion evidence. Three of the four required skills were used;
`playwright` was not.

To reach COMPLETE: commit (excluding `CLAUDE.md`) → push → verify the Vercel deployment →
run the three §20 production probes → execute the Browser E2E checklist above.
