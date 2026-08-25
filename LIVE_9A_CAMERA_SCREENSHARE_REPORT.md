# LIVE-9A — Camera Recovery & Screen Sharing Report

## Phase
LIVE-9A — Camera OFF→ON Recovery + Teacher Screen Sharing

## Camera Root Cause (verified against installed SDK, not assumptions)
Verified directly in the installed `livekit-client@2.22.0` source (`dist/livekit-client.esm.mjs`):

1. **Camera OFF is a real unpublish** — `setTrackEnabled(Source.Camera, false)` calls `unpublishTrack()` (line ~29821) and stops device capture. Unlike the microphone (which only `mute()`s), the camera track is gone from the room.
2. **Camera ON creates a brand-new track** — with no existing publication, `setTrackEnabled` runs `createTracks({video:true})` (line ~29755), producing a new `LocalVideoTrack` object.
3. **Stale React state** — `live-room-client.tsx` stored the initial track in `useState(localVideoTrack)` and never listened to `RoomEvent.LocalTrackPublished/LocalTrackUnpublished`. After OFF→ON the state still pointed at the dead old track.
4. **Attach effect never re-ran** — the effect keyed on `[localVideoTrack]`; the value hadn't changed and element-ref changes don't re-trigger effects, so the fresh track was never attached → permanent black preview despite the button showing ON.
5. **Optimistic toggles lied on failure** — `cameraEnabled` was flipped *before* awaiting the SDK.

## Camera Fix
- New pure module `src/lib/live-classroom/publisher-media.ts`: `bindPublisherTrackEvents()` derives camera/screen-share UI state exclusively from `LocalTrackPublished` / `LocalTrackUnpublished` — single source of truth, no optimistic writes.
- `toggleCamera`/`toggleMicrophone` now set state only **after** the SDK call resolves; failures show Arabic messages without touching state.
- Preview attach effect keys on `[cameraTrack, cameraEnabled]`; it detaches the old track and attaches the new one across the OFF→ON cycle (no duplicate attach, no dead element).
- Spec-mandated state separation: `cameraEnabled` (button intent) vs `cameraTrack` (actually published track) — one never assumed from the other.

## Screen Share Implementation (teacher only)
- Button «مشاركة الشاشة» / «إيقاف مشاركة الشاشة» using the official v2 API `localParticipant.setScreenShareEnabled(enabled, {audio: true})`.
- Supports entire screen / application window / browser tab — the picker is provided by the browser via `getDisplayMedia` (SDK-internal); nothing custom to maintain.
- **Audio optional by design**: requested when supported; if the browser yields none, sharing continues video-only. No audio-capture failure can fail the share.
- Active-state badge «جاري مشاركة الشاشة» derived from `LocalTrackPublished`, cleared on `LocalTrackUnpublished`.
- **Browser "Stop sharing" button handled**: livekit-client documents that pressing the browser's End control also fires `LocalTrackUnpublished` — one event covers both stop paths. State clears, camera/mic/session untouched.
- Failure mapping (`describeScreenShareFailure`): unsupported browser → Arabic message; picker dismissal/denial → **non-fatal cancelled** (no red banner, per spec); anything else → generic Arabic message. No stack traces ever shown.
- No LiveSession.status writes, no attendance interaction, no server changes — screen share rides the existing publisher token grant.

## Browser Compatibility Notes
- `getDisplayMedia` required (all modern desktop browsers). Mobile browsers typically lack it → SDK throws `DeviceUnsupportedError` → mapped Arabic message; session unaffected.
- Tab/window/screen surfaces follow browser capabilities (Chrome/Edge full support incl. tab audio; Safari/Firefox vary) — degradation is graceful by design, never fatal.

## Student Behavior
- Viewer rewritten around two persistent `<video>` elements (no conditional mounting that loses refs):
  - **Main stage**: screen share when active, otherwise teacher camera.
  - **Picture-in-picture**: teacher camera while screen share leads.
  - Badge «يشارك الشاشة الآن» while share is active; stage returns to camera automatically when it stops.
- Routing uses `track.source === "screen_share"` classification (`isScreenShareRemoteTrack`) — late-joiner pre-existing tracks classified identically.
- Heartbeat/attend semantics untouched: first remote track of any kind still triggers the same idempotent attend POST.
- Students never request capture permissions; publish capability remains structurally absent (subscriber token unchanged).

## Reconnect Behavior
- Reconnecting/Reconnected handling preserved verbatim; DB status writes remain impossible from client paths (structural tests reassert this).
- If a reconnect drops an active screen share, the event-derived state simply shows stopped («إيقاف مشاركة الشاشة» state clears) — teacher restarts manually; camera recovery is automatic via the same published-track events. Nothing fakes liveness.

## Tests
**File**: `tests/live-camera-screenshare.test.ts` — **16 tests**

1–6: publisher state machine — camera ON sets track · OFF clears safely · **OFF→ON delivers a fresh track** `[old, null, new]` · mic events don't cross-contaminate · screen-share toggles exactly once each way · unbind detaches listeners.
7–9: failure mapping — picker dismissal = non-fatal cancelled · unsupported → Arabic message · generic failure leaks no internals.
10–12: viewer classification — screen vs camera routing · deterministic source coverage · `shouldUseLiveKitViewer` regression guard.
13–16: server guarantees — student token stays subscriber-only (contract intact) · guest 401 · screen-stop writes no DB rows · reconnect writes no status.

No existing test deleted or weakened. Baseline maintained: **353/353 passing (337 baseline + 16 new)**.

## Validation Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx eslint src` | ✅ 0 errors (29 warnings = exact pre-existing baseline) |
| `npx vitest run --no-file-parallelism` | ✅ **353/353** (30 files) |
| `npm run build` | ⚠️ Pre-existing failure reproduced: ✓ Compiled successfully + ✓ Finished TypeScript, then fails collecting page data for `/api/files/[filename]` — local `SUPABASE_SERVICE_KEY` missing (`supabaseKey is required`). Storage code untouched by LIVE-9A. Build success not claimed. |

## Git
- **Commit**: `86f0a9b` — `fix: restore camera and add screen sharing`
- **Branch**: main · **Push**: ✅ origin/main (`b52d5ff..86f0a9b`)
- Diff review: 4 files only (2 in-scope modified + 1 new lib + 1 new test). No secrets, no schema, no migrations, no auth/storage/token/attend/heartbeat changes.

## Vercel Deployment
See Production Verification below.

## Production Verification (www.tareeq-alnoor.online, post-deploy of `86f0a9b`)
- Vercel deployment id `6076853618` for SHA `86f0a9b`: **state: success** (Production, 2026-08-25T05:06:42Z) — via public GitHub Deployments API (`gh` CLI unavailable locally, same as prior phases)
- Homepage → **200**
- `/api/live/<id>/token` guest → **401** `{"error":"يجب تسجيل الدخول"}` ✓ route healthy
- `/api/live/<id>/status` guest → **401** ✓ FIX-7 routes intact
- Full camera/screen-share flows require real accounts + hardware (manual checklist §Browser E2E)

## Browser E2E (standing manual item)
Requires signed-in teacher + student with hardware:
1. Start broadcast → camera ON → OFF → **ON → video actually returns**, no duplicate video
2. Start screen share (screen / window / tab as permitted) → student sees share + camera PiP + badge
3. Stop via app button **and** via browser Stop-sharing control → both recover to camera view
4. Camera + microphone keep working after share stops; session stays live throughout
5. Brief network drop → reconnect → camera state correct

## Remaining Risks
1. **Manual browser E2E pending** (accounts/hardware) — contracts covered at unit level
2. Screen-share layout is fixed PiP (bottom-right, ~22% height) — no user-resizable layout (out of scope)
3. Screen-share audio plays through the same hidden audio element; if a browser mixes it oddly with mic audio, no separate volume control exists yet
4. On mobile browsers without `getDisplayMedia`, the share button shows an Arabic unsupported error — no capability-based button hiding (could be added later)
5. Carried over: no rate limiting on token/heartbeat endpoints

## Scope Compliance
- ✅ LIVE-9A only — no 9B–9F work started (no admission, no roomAdmin grants, no chat, no moderation, no schema)
- ✅ Token route, attend, heartbeat, actions, types, auth, storage: byte-for-byte untouched
- ✅ External YouTube/Zoom/Meet paths untouched
- ✅ Existing tests preserved (337 → 353)

## Final Status: **COMPLETE**

Implementation, 353/353 tests, all validation gates, commit, push, deployment verification, and production probes done. The manual hardware E2E remains documented as a standing item, consistent with how 8B–8D were closed.
