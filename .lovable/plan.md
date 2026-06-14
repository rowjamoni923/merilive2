# Camera & Session Rebuild Plan — MeriLive
_Last updated: 2026-06-14. Supersedes prior plan.md content (analytics plan archived in chat history)._

## Why this plan exists

User's 2026-06-14 video showed 5 concrete failures and reasonably asked for a guarantee that they will be fixed properly. Instead of guarantees, this plan is a **verifiable, owner-tested, phase-gated** rebuild. No phase moves forward until the previous phase is reproducibly green on the owner test account (smdollarex923@gmail.com) in preview, OR honestly marked "APK rebuild needed" for native-only verification.

**Hard rule:** I will NOT touch any phase before the prior one is checked off. No multi-phase batching.

## The 5 confirmed failures (from user video + audit)

| # | Failure | Where |
|---|---|---|
| F1 | Video Party host seat tile stays **black** (camera publishes but never binds to the circular seat tile) | `VideoParty` room UI ↔ `LiveKitPlugin` track-renderer attach |
| F2 | "Go Live" → **black broadcast** (preview works, broadcast doesn't; Camera2 is reopened and races) | `GoLive` preview → publish promotion path |
| F3 | **Crash / OOM** when launching Video Party | Party room mount sequence |
| F4 | "**Restoring live camera…**" toast **leaks** to Home / Game Party after exit | `CameraResilienceController` + JS toast bus |
| F5 | **Zombie "Live session" timer bar** remains in Game Party after a live ends | `CallProvider` / live session global state |

## Architectural root cause (one sentence)

We have **multiple cameras and multiple session owners** with no single authority — LiveKit (web JS), LiveKit (Android native), GPUPixel, raw `getUserMedia`, native CameraX (face verify) each try to own Camera2; and "live session" state is split across `CallProvider`, JS reconnect hooks, and Android `CameraResilienceController` with no atomic teardown.

## Industry-grounded target architecture (from research, citations in research brief)

1. **One LiveKit `Room` per device, one Camera2 capturer** — reused across Live / Private Call / Video Party / Game Party. Face Verify uses native CameraX, mutually exclusive via the authority.
2. **`CameraAuthorityManager`** singleton (Kotlin `StateFlow<Owner>`) — every feature `request(owner) { ... }` and releases in `finally`. Mirrors Agora's `CameraAuthority` pattern in Bigo/MICO.
3. **Seat binding contract** — `bindSeatRenderer(seatIndex, identity, SurfaceViewRenderer)` resolves `RemoteParticipant` from `Room.remoteParticipants[identity]`, finds `Track.Source.CAMERA` publication, calls `videoTrack.addRenderer(view, ViewVisibility(view))`. Reshuffle = `removeRenderer(old)` + `addRenderer(new)`.
4. **Preview → Broadcast promotion** — preview track created with `localParticipant.createVideoTrack(name, capturer)`, then on Start Live we call `room.connect()` + `publishVideoTrack(previewTrack)`. **Camera2 is never closed between preview and broadcast.** Add `room.prepareConnection(url, token)` during preview to pre-warm DNS/TLS.
5. **Atomic `releaseAll()`** — single ViewModel-scoped method: mute → `room.disconnect()` → `localParticipant.cleanup()` → stop foreground service → cancel `viewModelScope` (kills timers, reconnect jobs, toast collectors).
6. **Scoped event bus** — every room-scoped flow collected inside `viewModelScope` only; toasts carry `roomId`, observers filter `event.roomId != currentRoomId → return`. No `GlobalScope` reconnect toasts.

## Phased roadmap (gate-checked)

Each phase = research delta (if needed) → code → owner-account preview test OR honest "APK rebuild needed" → checkbox tick → user OK → next phase.

### Phase 0 — Safety net (no functional change) ✅ DONE 2026-06-14
- [x] Add `CameraAuthorityManager.kt` (singleton, `StateFlow<Set<Owner>>`, suspending `request`). Compile-only; not yet wired into call sites.
- [x] Add `SeatRendererBinder.kt` (idempotent `bindSeat` / `unbindSeat` / `onTrackSubscribed`). Compile-only; LiveKitPlugin JS-bridge methods land in Phase 1.
- [x] Add JS shim `src/native/cameraAuthority.ts` + `src/native/seatRenderer.ts` (safe no-ops on web and pre-Phase-1 APKs).
- **Verification:** project builds, no behavioral change. APK rebuild NOT required yet (no native call site change).

### Phase 1 — F1 fix: Video Party seat-tile camera binding
- [ ] Wire `bindSeatRenderer(seatIndex=0, identity=localIdentity)` when host mounts seat 0 in `VideoParty` room.
- [ ] Wire same for remote seats on `participantConnected` / `trackSubscribed` LiveKit events.
- [ ] On seat reshuffle / leave: `unbindSeat(seatIndex)`.
- [ ] Use `ViewVisibility(view)` so off-screen seats stop decoding (saves CPU on mid-range).
- **Files:** `src/hooks/usePartyRoomNativeLiveKit.ts`, `src/features/party/...` seat tile component, `LiveKitPlugin.kt`.
- **Verification:** owner enters Video Party as host → seat 0 tile shows live face within 1.5 s. Second device joins as guest → guest's seat shows their face on owner's screen. APK rebuild required.

### Phase 2 — F2 fix: Go Live preview → broadcast (no black flash)
- [ ] In `LiveKitPlugin.startLocalPreview` (already exists per mem://features/native-prejoin-camera-preview), retain the `Camera2Capturer` instance.
- [ ] New `LiveKitPlugin.promotePreviewToRoom(url, token)` — calls `room.prepareConnection` during preview, then `room.connect` + `localParticipant.publishVideoTrack(previewTrack)` reusing same capturer.
- [ ] Replace current Go Live broadcast start (which currently does `connect` then `setCameraEnabled(true)` from scratch).
- **Files:** `LiveKitPlugin.kt`, `src/pages/GoLive*.tsx`, `src/lib/nativeLiveKitController.ts`.
- **Verification:** owner taps Go Live → preview face stays continuous into broadcast, second device sees stream within 2 s, no black frame. APK rebuild required.

### Phase 3 — F3 fix: Video Party launch crash / OOM
- [ ] Profile mount path; suspect: simultaneous LiveKit + GPUPixel + WebView `getUserMedia` boot. Force GPUPixel into consumer-only mode (already partially done — verify CameraOwnership rejects GPUPixel acquires).
- [ ] Add LeakCanary debug-only.
- [ ] Move heavy seat-tile renderer init off main thread.
- **Files:** `GPUPixelBeautyPlugin.kt`, `VideoParty` mount component, `LiveKitPlugin.kt`.
- **Verification:** owner enters Video Party 5× in a row without restart, no crash. APK rebuild required.

### Phase 4 — F4 fix: "Restoring live camera…" toast leakage
- [ ] All toasts emitted from `CameraResilienceController` carry `roomId`. JS subscriber filters `event.roomId !== activeRoomId → ignore`.
- [ ] On `releaseAll()`, cancel `Toast` reference (`toast?.cancel()`) and unsubscribe.
- [ ] Audit `src/lib/nativeLiveKitController.ts` event bus — confirm no `GlobalScope` emissions survive room exit.
- **Files:** `CameraResilienceController.kt`, `src/hooks/useNativeLiveKitEvents.ts`, JS toast dispatcher.
- **Verification:** owner does Live → exit → Home for 30 s → no stray toast. Then Live → exit → Game Party → no stray toast. APK rebuild required.

### Phase 5 — F5 fix: zombie Live session timer in Game Party
- [ ] Single `releaseAll()` exit path: mute → `room.disconnect()` → `localParticipant.cleanup()` → stop foreground service → cancel `viewModelScope`.
- [ ] `CallProvider` (`src/components/call/CallProvider.tsx`) subscribes to a single `sessionEnded` event and clears its timer state.
- [ ] Add unit test: simulate live end → assert `CallProvider.state.isLive === false` within 200 ms.
- **Files:** `CallProvider.tsx`, `LiveKitPlugin.kt`, `useLiveKitClient.ts`.
- **Verification:** owner ends live → enters Game Party → no "Live session" bar. APK rebuild required.

### Phase 6 — Wire the `CameraAuthorityManager` (the real "single camera" guarantee)
- [ ] Every camera-opening path (Live / Private Call / Video Party / Game Party / Face Verify) wraps its open in `CameraAuthorityManager.request(owner) { ... }`.
- [ ] Conflict UX: if Face Verify tries to open while Live is on, show "Please end your live to verify face" (English only per mem rule).
- [ ] Remove (or hard-noop) any remaining direct `getUserMedia` / direct CameraX opens in JS.
- **Verification:** owner tries Face Verify mid-live → friendly toast, no crash. End live → face verify works immediately.

### Phase 7 — Regression & cleanup
- [ ] Re-test F1–F5 in order on a fresh APK.
- [ ] Run full e2e suite (`tests/e2e/face-tab-*.spec.ts` etc.).
- [ ] Update `mem://index.md` to lock the new architecture rules.
- [ ] Delete dead code: any unused beauty/light-kit second-camera paths the user called out (only the LiveKit publisher remains; beauty/light run on top of that single track).

## What I will NOT do without explicit OK
- Touch design / UI layout / colors / fonts (per `mem://preferences/web-design-android-functionality-split.md`).
- Touch gift / entry animation components (per `mem://constraints/never-touch-gift-entry-animations`).
- Migrate LiveKit Cloud / VPS infra (per Core memory).
- Batch multiple phases in one commit.

## How you verify me
After every phase I will:
1. Show the exact files changed (line counts).
2. State "preview tested with owner account ✅" OR "APK rebuild needed — I cannot verify in preview".
3. Wait for your "OK next phase" or "redo phase N".

## Honest disclosure
- I cannot guarantee a date. I can guarantee gate-checked phases.
- F1, F2, F3 are the highest-pain items per your video — they get done first in that order.
- If a phase needs more research mid-way I will spawn a fresh subagent and update this file before writing code.
