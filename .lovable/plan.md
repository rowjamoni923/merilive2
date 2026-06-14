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

### Phase 1 — F1 fix: Video Party seat-tile camera binding ✅ DONE 2026-06-14
**Actual root cause (deeper than original plan):** Architecture was already correct — `NativeVideoView` → `attachLocalSurface` / `attachRemoteSurface` → `BoundedSurfaceHost` mounts a `TextureViewRenderer` behind the WebView and calls `videoTrack.addRenderer(renderer)`. `RoomEvent.TrackSubscribed` already triggered `BoundedSurfaceHost.rebindForRoom()` for late-arriving REMOTE tracks. **But there was NO `RoomEvent.LocalTrackPublished` handler** — so when the host's seat `NativeVideoView` mounted before the local camera track published (the normal race on room join), the renderer stayed unbound and the tile was permanently black.

**Fix (1 file, ~30 lines):** Added `RoomEvent.LocalTrackPublished` case in `attachEventListeners` that calls `BoundedSurfaceHost.rebindForRoom(r)` on the UI thread when a local VIDEO track publishes. Industry parity: Agora's `onLocalVideoStateChanged(PUBLISHING)` is where Bigo/MICO trigger local VideoCanvas binding; LiveKit's `RoomEvent.LocalTrackPublished` is the direct equivalent. Also emits a `local-track-published` JS event for future React-side observers.

**Files:** `android/app/src/main/java/com/merilive/app/plugin/LiveKitPlugin.kt` (one event-handler case added, no other behavior touched).
**Verification:** APK rebuild REQUIRED (Kotlin change). After rebuild, owner enters Video Party as host → seat 0 tile should bind camera within 1.5 s of room join, no black tile. Same fix applies to Go Live host seat and Private Call self-view.

**Note:** Phase 0's `SeatRendererBinder.kt` and `src/native/seatRenderer.ts` are NOT wired — `BoundedSurfaceHost` is already the production seat binder and works correctly once the missing event handler is in place. Phase 0 files remain as forward-looking infrastructure (e.g. for explicit identity-based seat APIs in future PK Battle work) but are dead code today. Safe to leave.

### Phase 2 — F2 fix: Go Live preview → broadcast (no black flash) ✅ DONE 2026-06-14
**Actual root cause:** `promotePreviewToSession()` (the proper Agora-style `setupLocalVideo→joinChannel` LiveKit translation that reuses the same Camera2 + `LocalVideoTrack` for prejoin preview and live broadcast) was already implemented in `LiveKitPlugin.kt` (line 1454). But its eligibility gate excluded sessions where a bounded `<NativeVideoView />` was mounted (`!boundedSurfacesActive`). The modern `LiveStream.tsx` page mounts a bounded `<NativeVideoView kind="local" />` for the host the moment it renders — BEFORE `useLiveKitClient.connectAndPublish()` fires. So the gate always failed for the modern Go Live path → fell through to the legacy cold-start: `stopLocalPreviewInternal` (release Camera2) → 650 ms OEM grace → `awaitFrontCameraAvailable` (up to seconds) → reopen Camera2 → connect → publish. That sequence produced the 1–3 s black flash, occasionally permanent on slow OEM HALs.

**Fix (1 file, ~16 effective lines):** Removed the `!boundedSurfacesActive` clause from the promotion gate. Safe because Phase 1 just added a `RoomEvent.LocalTrackPublished` handler that calls `BoundedSurfaceHost.rebindForRoom(r)` — any already-mounted bounded local surface resolves the promoted track immediately. The fullscreen preview renderer continues painting its last frame until `attachLocalSurface` removes & releases the legacy renderer as part of its existing handover (line ~2385). Party-room gate (`args.roomScope != "party"`) kept intact (Video Party has no prejoin preview to promote from).

**Files:** `android/app/src/main/java/com/merilive/app/plugin/LiveKitPlugin.kt` (gate clause removed, comment + log message updated, no other behavior touched).
**Verification:** APK rebuild REQUIRED (Kotlin change). After rebuild, owner taps Go Live → preview face stays visible into broadcast with no black frame; second device confirms it sees the stream within 2 s. If still black on host: check logcat for `promotePreviewToSession` log line — its absence means a different gate failed (most likely `previewRoom/previewTrack==null` because user skipped prejoin preview or it crashed earlier; that's a separate fix).

### Phase 3 — F3 fix: Video Party launch crash / OOM ✅ DONE 2026-06-14 (diagnostic-first)
**Audit result — most planned mitigations were already in place:**
- ✅ **GPUPixel consumer-only enforced** — `CameraOwnership.acquire()` hard-rejects `OWNER_GPUPIXEL` (lines 75–78). The old "everyone opens Camera2" race cannot recur.
- ✅ **LeakCanary** already wired (`debugImplementation 'com.squareup.leakcanary:leakcanary-android:2.14'` in `android/app/build.gradle:177`).
- ✅ **Heavy renderer init thread-safety** — `BoundedSurfaceHost.attach`/`detach`/`updateBounds` are always invoked via `activity?.runOnUiThread { … }` from `LiveKitPlugin`'s `@PluginMethod`s; `entries`/`ownedRemoteSids` use `ConcurrentHashMap`. `rebindForRoom` is also wrapped in `withContext(Dispatchers.Main)` at every call site. `android:largeHeap="true"` already set in `AndroidManifest.xml:105`. `TextureViewRenderer` construction MUST stay on UI thread (it's a `View`); moving it off would crash, not help.

**What was actually missing — the data:** when a seat *did* fail, the catch blocks were silent (`catch (_: Exception) {}`), so we had no Crashlytics signal from the field. Without a real stack we were guessing the root cause. **Fix:** added `reportNonFatal(tag, throwable)` in `BoundedSurfaceHost.kt` that forwards seat-mount exceptions to Firebase Crashlytics with custom keys `seat_mount_stage`, `used_mem_mb`, `max_mem_mb`, `bounded_entries`. Wired into both `addRenderer` failures and `initVideoRenderer` failures. Diagnostics themselves are try/catch-wrapped so they never escalate the original failure.

**Files:** `android/app/src/main/java/com/merilive/app/rtc/BoundedSurfaceHost.kt` (3 catch blocks upgraded + 1 helper added, ~25 lines).
**Verification:** APK rebuild REQUIRED. After rebuild, the next Video Party crash/OOM at owner-account repro surfaces in Firebase Crashlytics with the seat-mount stage, device memory snapshot, and bounded-entry count. If no crash occurs over 5 launches in a row, Phase 3 is empirically green. If a crash does appear, we now have the stack to fix it surgically rather than re-architect blind.
**Honesty:** I cannot reproduce a Video Party crash inside the Lovable preview (no Android runtime). This phase intentionally trades a speculative rewrite for a real diagnostic signal — industry standard practice (Sentry/Crashlytics-first triage) before structural changes.

### Phase 4 — F4 fix: "Restoring live camera…" toast leakage ✅ DONE 2026-06-14
**Actual root cause (different from the plan's initial guess):** the leaking toast does NOT come from `CameraResilienceController.kt` — that controller only drives in-Activity banner views (`resilienceBanner`, `resilienceText`), no Sonner toasts. The real source is JS-side:
- `useLiveKitClient.ts:272/291/298` → `toast.loading('Stabilizing live camera…', { id: 'lk-live-reconnect' })`
- `useLiveKitCall.ts:157/187/195` → `toast.loading('Stabilizing call camera…', { id: 'lk-reconnect' })`

`toast.loading(...)` with a fixed id has **no auto-dismiss**. The `'reconnected'` success path replaces it with a 1.5s auto-dismissing toast, but if the user exits *during* a recovery attempt, no success/failure event ever fires → the sticky loading toast survives the route change and bleeds into Home / Game Party / wherever they land. `useNativeLiveKitEvents` already filters events by `{scope, id}` so the events themselves don't leak — only the unmounted toast.

**Fix (2 files, ~10 lines):**
- `src/hooks/useLiveKitClient.ts` `leaveChannel()` (line 1374): `toast.dismiss('lk-live-reconnect')` at the very top, before any teardown.
- `src/hooks/useLiveKitCall.ts` `cleanup()` (line 237): `toast.dismiss('lk-reconnect')` + `toast.dismiss('lk-audio-interrupt')` at the top of cleanup. Both cleanups already fire from the main effect's unmount return.

**Files:** `src/hooks/useLiveKitClient.ts`, `src/hooks/useLiveKitCall.ts`.
**Verification:** PREVIEW-TESTABLE in browser (no APK required — pure JS). Owner does Live → force network blip via DevTools → exit before reconnect → navigate to Home / Game Party → no stray "Stabilizing live camera…" toast. Same for Private Call. APK rebuild is *not* required for this fix; the native `CameraResilienceController` was correctly scoped to PrivateCallActivity and detached in `detach()` (already verified).

**Note on the original plan items:** `roomId`-tagged events were already in place (`useNativeLiveKitEvents` third arg = `{scope, id}` filter). `nativeLiveKitController.ts` event bus uses per-listener handles with no `GlobalScope` survivors. Those items are ✅ verified — no code change needed there.



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
