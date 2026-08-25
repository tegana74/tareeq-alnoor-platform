# LIVE-8C — Student LiveKit Subscription Report

## Phase
LIVE-8C — Student Live Subscription (Viewer-only)

## Root Cause / Motivation
LIVE-8B gave the teacher a real publish flow, but authorized students still saw a static placeholder («يرجى الانتظار، لم يقم المعلم ببدء إرسال البث بعد») when the session went live without an external URL. LIVE-8C closes that gap: the student now receives a Subscriber token, joins the existing LiveKit room, and watches/hears the teacher's real broadcast — with zero publish capability.

---

## Existing Architecture Preserved
- **FIX-7 shell**: all five session states (scheduled/waiting/live/ended/cancelled), 6-second status polling, teacher controls — untouched
- **LIVE-8A token foundation**: same `GET /api/live/[id]/token` endpoint reused; no second token system
- **LIVE-8B publishing**: teacher flow unchanged
- **Booking/subscription authorization**: server-side `canAccessCourse()` + booking checks reused as-is
- **Attendance**: same `POST /api/live/[id]/attend` endpoint, same server-side guards
- **YouTube / Zoom / Meet sessions**: sessions with a `url` never touch LiveKit

## Student Access Model
| Rule | Enforcement |
|------|-------------|
| Authenticated only | Server-side via `getCurrentUser()` |
| Session exists | Server-side lookup |
| Course access OR valid booking | Server-side (`canAccessCourse` + `booking.status === "booked"`) |
| canPublish | **false** (explicit in grant) |
| canPublishData | **false** (explicit in grant — added this phase) |
| canSubscribe | true |
| No client-supplied identity/booking/subscription trusted | Identity derived from session cookie |

## Subscriber Token
The single change to the token endpoint: `canPublishData` is now explicitly set for both roles (teacher/admin = true, student/other = false) and included in the grant. Previously it was left `undefined` for students. Teacher grants verified unchanged by regression tests.

## Remote Video & Audio
- `attachRemoteTrackHandlers()` listens to `TrackSubscribed` / `TrackUnsubscribed` / `ParticipantDisconnected` — no hard-coded publisher identity; any remote participant's tracks are shown
- Video track → attached to `<video autoPlay playsInline>`; audio track → attached to hidden `<audio autoPlay>`
- Pre-existing tracks handled: on join, already-published remote tracks are attached immediately (late-joiner support)
- Track stop or participant leave shows the waiting state again — **never** treated as session ended
- Reconnect events (`Reconnecting`/`Reconnected`) update the badge only — room stays connected, session status untouched

## Connection States (student-facing)
جاري الاتصال... · متصل · جاري إعادة الاتصال... · الاتصال منقطع (+ زر إعادة المحاولة)

## External URL Compatibility
`shouldUseLiveKitViewer(status, url)` returns true **only** when `status === "live" && !url`. YouTube embeds and external-link cards keep their exact previous rendering path.

## Attendance Integration
- The viewer fires the existing attendance POST **once**, when the first remote track actually arrives (`firstTrackArrived` flag prevents duplicates)
- Page-open alone no longer implies watching a LiveKit session for URL-less sessions; external-URL sessions keep the old behavior untouched
- No heartbeat added (LIVE-8D scope); the attend route's server-side guards (live status, time window, booking) are unchanged and remain the authority
- Zero modifications to the attend API route were needed

## Autoplay Handling
If the browser blocks autoplay of the remote audio, playback rejection is caught and a clear full-width button appears: «اضغط لتشغيل الصوت» — not treated as a LiveKit failure. No microphone/camera permission is ever requested.

## UI
Student sees: video area, hidden audio element, live badge (مباشر الآن / بانتظار البث), connection indicators, «جاري انتظار المعلم لبدء إرسال البث...» before first remote track. Teacher controls and camera/mic buttons are rendered only for `isManager` — structurally unreachable for students.

## Security
- Publish capability impossible: token grant denies `canPublish`/`canPublishData` server-side; the client component contains zero capture/publish code paths
- No stack traces shown; errors mapped to fixed Arabic messages
- Secrets untouched; no new env vars; no logging of tokens

## Reload Behavior
On refresh during a live session the page remounts, re-fetches a fresh subscriber token, reconnects, and reattaches to existing remote tracks (late-joiner path). Unmount cleanup: detach all remote tracks → `room.disconnect()` (wrapped so cleanup never throws) → handlers unregistered. `LiveSession.status` is never modified by the student path.

---

## Tests
**File**: `tests/livekit-student-subscribe.test.ts` — **25 tests**

Covering all required cases: subscriber grants (#1–3 incl. explicit canPublishData=false), unauthorized/unbooked/cancelled-booking/guest denials (#4–6, 5b), connect flow using the real token route through mocked fetch (#7, 7b), video/audio routing (#8–9), unsubscribed/participant-disconnected wiring + handler detachment (9b), **zero calls** to createLocalTracks/publishTrack/setCameraEnabled/setMicrophoneEnabled (#10–11), reconnect keeps room + DB untouched (#12), disconnect cleanup detaches then disconnects (#13), viewer eligibility across every session status and external-URL combinations (#14–18, 18b), plus two regression guards (teacher grants intact after canPublishData addition; attendance route untouched).

## Validation Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx eslint src` | ✅ 0 errors (29 warnings = exact pre-existing baseline) |
| `npx vitest run --no-file-parallelism` | ✅ **319/319** (294 baseline + 25 new; none deleted) |
| `npm run build` | ⚠️ Pre-existing failure reproduced on a clean tree (stash round-trip): `SUPABASE_SERVICE_KEY` missing locally breaks `/api/files/[filename]` + `/api/upload` page-data collection. TypeScript compilation inside build passed (✓ Compiled successfully + Finished TypeScript). Not caused by LIVE-8C; storage/files code untouched. |

## Browser Production Test
⚠️ **Not executed from this session.** A real browser test requires signed-in teacher + student accounts with camera/mic hardware — available only to the team manually. Required manual checklist:
1. Teacher starts broadcast on a URL-less session (camera + mic visible in own preview)
2. Authorized student opens same session → auto-connects as viewer, **no permission prompts**, sees/hears teacher
3. Toggle network briefly → reconnecting badge → recovery without session ending
4. Unauthorized student → token request rejected (no viewer)
Unit tests cover these contracts at mock level; production probes below confirm deployment health only.

## Production Probes (post-deploy, www.tareeq-alnoor.online)
- Homepage → 200
- `/api/live/<id>/status` unauthenticated → `401 {"error":"يجب تسجيل الدخول"}` ✓
- `/api/live/<id>/token` unauthenticated → `401` ✓ (route healthy post-deploy)

## Files Changed
| File | Action |
|------|--------|
| `src/lib/live-classroom/student-subscriber.ts` | **Created** — React-free subscribe logic (connect, eligibility, track handlers) |
| `src/app/(site)/live/[id]/student-live-viewer.tsx` | **Created** — student viewer UI + one-shot attendance trigger |
| `src/app/(site)/live/[id]/live-room-client.tsx` | Modified — render viewer for non-manager on URL-less live sessions; recording/archived placeholders |
| `src/app/api/live/[id]/token/route.ts` | Modified — explicit `canPublishData` in grants (student=false, publisher=true) |
| `tests/livekit-student-subscribe.test.ts` | **Created** — 25 tests |
| `LIVE_8B_TEACHER_PUBLISH_REPORT.md` | Modified — carried-over documentation fix from prior verification step |

No schema changes. No migrations. No changes to auth, storage, exam engine, attend route, or teacher-live actions.

## Git
- **Commit**: `523a177` — `feat: add student livekit subscription`
- **Branch**: `main` · **Push**: ✅ origin/main

## Vercel
- Deployment id `6074851852` for SHA `523a177`: **state: success** (Production, 2026-08-25T01:51:17Z)
- Domain verified serving the app: `https://www.tareeq-alnoor.online` (probes above)

## Remaining Risks
1. **Manual browser E2E pending** — the definitive student-sees-teacher check requires human accounts/hardware (checklist above)
2. Late-joiner pre-existing-track attach uses non-null element refs at mount time; if the effect races video element mounting in an unforeseen way the fallback is the normal TrackSubscribed event (low risk)
3. Single attendance call per viewer mount — a student who reloads mid-session re-registers once more (upsert semantics make this idempotent)
4. Carried over: no token-endpoint rate limiting; tokens issuable regardless of session status

## Scope Compliance
- ✅ LIVE-8C only — no LIVE-8D work started (no heartbeat, no realtime polish, no multi-teacher)
- ✅ Same token endpoint, same authorization, same attendance, same shell
- ✅ External-URL sessions byte-for-byte preserved

## Final Status: **COMPLETE**

All implementation, tests, validation gates, commit, push, and deployment verification succeeded. The only unexercised item is the manual browser E2E with real accounts — documented as remaining risk #1 rather than blocking, consistent with how LIVE-8B was closed.
