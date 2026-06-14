# Continuous Camera Flow — Preview → Publish → Close

## Goal

Camera opens **once** in the preview screen (Go Live prejoin / Create Party setup / Private Call ringing), stays open without interruption when user taps "Go Live" / "Create Party" / "Accept Call", and is released **only** when the user closes the live stream, leaves the party room, or ends the call.

No black frames. No double-open. No race between preview track and publish track.

## Industry Pattern (Bigo/Chamet/Olamet)

```text
[Preview Screen]
   │  open camera → LocalVideoTrack (T1) → render in preview SurfaceView
   │
   │  user taps "Go Live"
   ▼
[Publish]
   │  create LiveKit Room → connect() → publishTrack(T1)   ← SAME track, no reopen
   │  swap render surface from preview → in-room view
   ▼
[Session active]
   │  T1 keeps streaming
   │
   │  user closes stream / leaves party / ends call
   ▼
[Teardown]
   │  unpublish(T1) → stop(T1) → release Camera2 → null Room
```

Key invariant: **one `LocalVideoTrack` instance from preview start to session end.**

## Implementation Plan (Android-only — WebView stays unchanged)

### Step 1 — Native plugin: re-add preview + handoff (`LiveKitPlugin.kt`)

Add these methods to the existing minimal plugin (~120 new lines):

- `startLocalPreview({lens, resolution, mirror})` — uses LiveKit SDK's `LocalVideoTrack.createCameraTrack()` with a standalone never-connected `Room` as the capturer factory. Attaches to a `SurfaceViewRenderer` positioned behind the WebView (transparent WebView so preview shows through).
- `stopLocalPreview()` — detaches renderer, stops + releases the track, nulls the standalone room.
- `connect()` — modified: if a preview track exists, **republish that exact track** to the new Room instead of calling `setCameraEnabled(true)` (which would open Camera2 a second time). Falls back to fresh `setCameraEnabled(true)` only when no preview track is held.
- `disconnect()` — unpublishes but does **not** stop the track if `keepPreview: true` is passed (rare, normally we just release everything).

Track ownership lives in a `private var previewTrack: LocalVideoTrack?` inside the plugin — single source of truth, no external arbiter.

### Step 2 — JS controller (`nativeLiveKitController.ts`)

Already calls `startLocalPreview` / `stopLocalPreview` / `connect` from GoLive, CreateParty, CallProvider — no React changes needed. Just wire the new native methods (the Proxy currently silently no-ops them).

Ensure `connect()` is **not** preceded by `stopLocalPreview()` so the handoff works. Existing `mediaSurfacesAudit.test.ts` already enforces this guardrail.

### Step 3 — React WebView fallback (web preview / older APK)

Keep current `useLiveKitClient` web SDK path untouched. On web it uses `getUserMedia` → preview shows in `<video>` → on Go Live the same `MediaStreamTrack` is published via `livekit-client`. Already works this way. No change.

### Step 4 — Lifecycle guarantees

- App backgrounded mid-session → SDK pauses publish, camera stays bound (LiveKit SDK default).
- Preview cancelled (user backs out without going live) → `stopLocalPreview()` releases Camera2 immediately.
- Session ends → `disconnect()` unpublishes and releases Camera2.
- Switch camera (front/back) → `LocalVideoTrack.switchCamera()` reuses the same track object.

### Step 5 — Verification

- Lovable preview: web fallback path → unchanged, still works.
- Android APK rebuild required.
- Owner-account test plan (after APK rebuild, user-side):
  - Go Live screen → preview face visible → tap Go Live → no flicker → visitor sees host face.
  - Create Party → preview face visible → Create → enter room → host slot shows continuous face.
  - Incoming call ring screen → preview face visible → Accept → ActiveCallScreen continues same face.
  - End each session → camera LED off immediately.

## Files to change

- `android/app/src/main/java/com/merilive/app/plugin/LiveKitPlugin.kt` — add `startLocalPreview`, `stopLocalPreview`, modify `connect()` to reuse preview track. ~120 lines added.

## Files NOT changed

- Any React component (GoLive, CreateParty, CallProvider, LiveStream, ActiveCallScreen, PartyRoom) — wiring is already in place from earlier work.
- UI / CSS / copy — zero design changes.
- Web `livekit-client` path — already correct.
- Face Verification — separate CameraX path, unaffected.

## Risk

- OEM Camera2 HAL quirks (Samsung/Xiaomi) during preview→publish handoff — mitigated by reusing the exact track object (no second `openCamera` call).
- Requires APK rebuild; web preview will continue working via the existing JS fallback.

## What this does NOT do

- No new React files, no design changes, no DB changes, no edge function changes.
- Does not touch gift/entry animation system.
- Does not reintroduce the deleted `CameraOwnership` arbiter — single-owner-by-construction is enough.
