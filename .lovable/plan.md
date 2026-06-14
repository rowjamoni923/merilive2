# Camera & Surface Architecture Rebuild — Master Plan
**Created:** 2026-06-15 · **Owner-approved:** pending
**Goal:** Match Chamet/Olamet/Bigo pattern — persistent camera, UI-only swap, seat-bounded party tile, separate private-call Activity.

---

## Industry Pattern (from owner video + competitor research)

1. **Go Live:** preview camera == published camera. Same `LocalVideoTrack`, same renderer instance. Only UI overlay swaps (warning banner, gift widgets, chat bar appear on top).
2. **Party Room:** seat-1 (host) camera renders inside a **bounded tile** (~half width, square aspect). Purple background + 3 empty seat slots remain visible around it. "Let's Party" tap only swaps bottom controls — camera tile content unchanged.
3. **Private Call:** completely **separate Android Activity**. Never injected into main React tree. Returning from call brings user back to prior screen untouched. Main UI's React state preserved, never visually leaked.

---

## Current State — Honest Audit

| Area | Status | Root Cause |
|---|---|---|
| Go Live happy path | 🟢 Already correct | `promotePreviewToSession()` reuses preview track + renderer |
| Go Live error path | 🔴 Black flash on retry | `disconnect()` in retry loop kills preview track |
| Go Live lifecycle | 🟡 Camera/mic run in background | No `handleOnPause/Resume()` in plugin |
| Party seat-bound camera | 🔴 Fullscreen instead of seat tile | `boundedOnly` flag ignored in Kotlin; `SeatRendererBinder` is dead code (0 callers) |
| Party seat tile visual | 🔴 Empty avatar | React `<LiveKitVideoPlayer>` has no `localStream` on native path |
| Private Call surface | 🔴 Renders in main React tree | `ActiveCallScreen` is `{children}` sibling under `CallProvider`; CSS `display:none` hack |
| IncomingCall Accept | 🔴 Bounces through MainActivity (WebView) | `IncomingCallActivity` launches `MainActivity`, not `PrivateCallActivity` |
| Plugin method surface | 🟡 10+ dead methods (silent fail via Proxy) | Old 6252-line plugin deleted, JS callers never cleaned |

---

## Phase 1 — Party Seat-Bound Camera (HIGH priority)

**Why first:** most visible bug. Matches owner's video pattern exactly. Foundation for all multi-party features (Game Room, PK Battle, future co-host on live).

### Changes

#### 1.1 — `LiveKitPlugin.kt` — honor `boundedOnly` flag
- In `startLocalPreview()`, read `boundedOnly` boolean (default false)
- If `true`, skip `ensureRendererAttached()` entirely; `previewTrack` stays alive but **no fullscreen SurfaceViewRenderer mounts**
- Renderer ownership transfers to seat binder

#### 1.2 — `LiveKitPlugin.kt` — add 3 new `@PluginMethod`s
```kotlin
@PluginMethod fun bindSeatRenderer(call: PluginCall)
  // args: { seatIndex: Int, identity: String, anchorRect: { x, y, w, h } in px }
  // Creates TextureViewRenderer sized to anchorRect, adds to FrameLayout overlay
  // behind WebView at exact coords, calls SeatRendererBinder.bindSeat(...)

@PluginMethod fun updateSeatRendererRect(call: PluginCall)
  // args: { seatIndex, anchorRect }
  // Repositions existing TextureView (scroll/resize handler)

@PluginMethod fun unbindSeatRenderer(call: PluginCall)
  // args: { seatIndex }
```
- Track renderers per seatIndex in `ConcurrentHashMap<Int, TextureViewRenderer>`
- On `disconnect()` / `teardownAll()`: clear all via `SeatRendererBinder.clear()`

#### 1.3 — `LiveKitPlugin.kt` — wire `LocalTrackPublished` event
- In `observeRoomEvents()`, on `RoomEvent.LocalTrackPublished` with video track → `SeatRendererBinder.onLocalTrackPublished(localIdentity, track)`
- Same for `RoomEvent.TrackSubscribed` → `onTrackSubscribed(identity, track)`
- And `RoomEvent.TrackUnpublished` → `onTrackUnpublished(identity)`

#### 1.4 — `src/native/seatRenderer.ts` — finalize JS API
- Already stubbed; add `anchorRect` calculation helper `domRectToDevicePx(el, dpr)`
- Add `useSeatRendererBinding(seatIndex, identity, anchorEl)` React hook:
  - Calls `bindSeatRenderer` on mount
  - `ResizeObserver` + `scroll` listener → `updateSeatRendererRect`
  - `unbindSeatRenderer` on unmount

#### 1.5 — `ChametStyleVideoRoom.tsx` — mount native seat renderer
- For each seat tile div, attach `ref` + call `useSeatRendererBinding(seatIndex, occupantIdentity, ref)` when `isNativeMediaActive`
- Keep existing `<LiveKitVideoPlayer>` for web fallback (gated by `!isNativeAndroidApp()`)
- **NO design changes** — same JSX structure, same Tailwind classes

#### 1.6 — `CreateParty.tsx` cleanup
- Already passes `boundedOnly: true` — verify Kotlin now honors it
- Remove `setNativeMediaSurface(true)` for party scope (no fullscreen renderer means WebView must stay opaque, purple bg shows through)

### Verification
- Owner login → Create Party → camera shows in seat-1 tile only, 3 empty seats visible with purple bg around
- "Let's Party" tap → tile unchanged, bottom bar swaps
- Reshuffle seats → camera follows seat without restart
- APK rebuild **REQUIRED**

---

## Phase 2 — Private Call Separate Activity (HIGH priority)

**Why second:** affects every call, currently leaks call UI over Home/Profile in fallback paths.

### Changes

#### 2.1 — `IncomingCallActivity.java` — Accept goes directly to `PrivateCallActivity`
- Replace `MainActivity` intent in btnAccept handler with `PrivateCallActivity.newIntent(...)` + `FLAG_ACTIVITY_NEW_TASK`
- JS still gets the `acceptCall()` signal via `getLastAction()` and connects LiveKit; result delivered to the already-foregrounded `PrivateCallActivity` via `onNewIntent`
- Caller-side: `startCall()` (CallProvider) launches `PrivateCallActivity` BEFORE LiveKit connect (Activity renders its own "Calling…" ringing UI)

#### 2.2 — `PrivateCallActivity.kt` — own the ringing → connected → ended lifecycle
- Accept ringing state via intent extras (callId, peer info)
- Render native ringing UI (avatar + name + cancel) until JS broadcasts `call:connected` with LiveKit URL/token
- Connect LiveKit using its OWN Room instance (not the WebView's)
- Mount TextureViewRenderer for remote + local PiP in native FrameLayout
- On `call:ended` event from JS, finish Activity → back stack returns user to prior screen

#### 2.3 — `CallProvider.tsx` — remove in-tree `ActiveCallScreen` for native path
- On Android native: `startCall` / `acceptCall` triggers Activity launch, NEVER renders `<ActiveCallScreen />` in React
- Web fallback only: keep `createPortal(<ActiveCallScreen/>, document.body)` (escape stacking context)
- Delete `body.call-overlay-active` CSS hack
- `{children}` (main app) keeps running untouched — no display:none, no z-index war

#### 2.4 — `ActiveCallScreen.tsx` — strip native-path code
- File becomes web-only call surface
- Remove `openInCallActivity`, `nativeInCallOpen` state, transparent portal placeholder
- Cleaner ~200-line web fallback component

#### 2.5 — Bridge messages JS ↔ Activity
- New Capacitor plugin events: `call:state-changed` (state: ringing/connecting/connected/ended)
- New plugin method: `notifyCallActivity({ state, livekitUrl?, livekitToken? })`
- `PrivateCallActivity` listens via LocalBroadcastManager

### Verification
- Owner → call peer → `PrivateCallActivity` opens immediately, native ringing UI shown
- Peer accepts → LiveKit connects, video frames appear in native renderer
- Press Home → Activity goes to background, back button returns to it (not Home)
- Hang up → Activity finishes, returns to original screen (Home/Profile/Chat) untouched
- APK rebuild **REQUIRED**

---

## Phase 3 — Go Live Error-Path Hardening (MEDIUM priority)

**Why third:** happy path already works (80% of users fine). This eliminates the 20% black-flash edge cases.

### Changes

#### 3.1 — `LiveKitPlugin.kt` — add `disconnectSessionOnly()`
```kotlin
@PluginMethod fun disconnectSessionOnly(call: PluginCall)
  // room?.disconnect()
  // isConnected = false
  // DO NOT touch previewTrack, previewRenderer
```

#### 3.2 — `LiveKitPlugin.kt` — lifecycle pause/resume
- Override `handleOnPause()` → if `isConnected`, call `localParticipant.setMicrophoneEnabled(false)` + `setCameraEnabled(false)` (or just `track.pauseCapture()` if SDK supports)
- Override `handleOnResume()` → reverse
- Skip pause when `pauseCameraOnBackground == false` in connect opts

#### 3.3 — `useLiveKitClient.ts` retry loop
- Replace full `disconnect()` between attempts with `NativeLiveKit.disconnectSessionOnly()`
- 2nd connect attempt now hits `promotePreviewToSession()` happy path (preview still alive)

#### 3.4 — `GoLive.tsx` — `nativePreviewActive=false` guard
- If native preview never started, do NOT navigate; either retry `startNativePreview()` inline or surface clear error toast
- Prevents cold-camera startup flash in LiveStream

### Verification
- Force connect failure (kill VPS briefly) → owner sees ringing/retry without camera black flash
- Background app during live → camera + mic mute; resume → restore
- APK rebuild **REQUIRED**

---

## Phase 4 — Plugin Method Surface Cleanup (LOW priority)

**Why last:** non-blocking, just removes silent-fail tech debt.

### Changes
- Audit every `NativeLiveKit.*()` call site in `nativeLiveKitController.ts` and `useLiveKitClient.ts`
- For each method NOT in current `LiveKitPlugin.kt`:
  - Either implement in Kotlin (if needed) OR
  - Remove from JS (if dead)
- Replace Proxy silent-swallow with explicit capability check (`isAvailable()` returns `{ methods: string[] }`)
- Dead methods list: `getActiveSession`, `detachAll`, `attachLocal`, `attachAllRemotes`, `setPreferredCodec`, `setSurviveActivityDestroy`, `reconnectNow`, `updateLiveStats`, `sendData`

### Verification
- TypeScript build green
- Runtime camera-stall recovery now uses real implemented methods only

---

## Cross-Cutting Constraints

- **WEB DESIGN SACRED:** zero changes to React JSX structure, Tailwind classes, copy, icons. Only refs/hooks added.
- **English UI strings** for any new toasts/errors.
- **APK rebuild needed** for Phases 1, 2, 3. Web preview cannot verify native rendering — owner test on real device required at each phase end.
- **No VPS work.** Pure Lovable code only.
- **Research-first satisfied:** Bigo (Agora `VideoCanvas` per uid) / Chamet (Agora `setupRemoteVideo`) / Olamet patterns all map 1:1 to LiveKit `videoTrack.addRenderer(textureView)` per identity. SeatRendererBinder design already follows this.

---

## Execution Order

```
Phase 1 (Party) → APK test → Phase 2 (Call) → APK test → Phase 3 (Go Live hardening) → APK test → Phase 4 (cleanup)
```

Each phase is independently shippable. Owner approves each phase end before next starts.

---

## Open Risks

- **LiveKit Android SDK pre-connect track creation** (Gap B in audit): unclear if pre-connect `createVideoTrack()` survives `Room.connect()`. May need to refactor `startLocalPreview` to use standalone `CameraXCapturer` not bound to Room, then attach to Room on connect. Investigate during Phase 1 implementation.
- **TextureView z-order on some OEM (Vivo/Oppo):** may need `setZOrderMediaOverlay(true)`. Will test on Vivo during Phase 1 APK QA.
- **`PrivateCallActivity` cold start vs JS `acceptCall()` race:** Activity may foreground before JS connects LiveKit. Mitigation: native ringing UI shown until `call:connected` broadcast received.
