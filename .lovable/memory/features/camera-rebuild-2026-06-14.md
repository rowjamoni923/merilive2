---
name: Camera Rebuild 2026-06-14
description: Single-camera architecture lock after Phase 1-7 camera/live rebuild. Arbiter hierarchy, fix map, and what NOT to add.
type: feature
---

# Camera Rebuild — Phases 1-7 (locked 2026-06-14)

## Single-camera arbiter hierarchy (DO NOT add a 4th layer)

1. **JS authoritative — `src/camera/ProCameraEngine.ts` + `useProCamera()` hook.**
   - 5 owners: `live-stream`, `private-call`, `video-party`, `game-party`, `face-verify`.
   - Streaming family (first 4) refcounted, share one LiveKit publisher.
   - `face-verify` is its own family, mutually exclusive with streaming.
   - Throws `CameraConflictError` on cross-family acquire.
   - Wired at: `GoLive.tsx`, `PreJoinDevicesDialog.tsx`, `CallProvider.tsx`, `ActiveCallScreen.tsx`, `CreateParty.tsx`, `PartyRoom.tsx`, `FaceVerification.tsx`.

2. **Native legacy — `android/.../rtc/CameraOwnership.kt`.**
   - Advisory boolean at the JNI boundary. Consumed by `LiveKitPlugin.connect()`, `NativeCamera`, `WebViewPermissionGate`, `PermissionHelper`.
   - Hard-rejects `OWNER_GPUPIXEL` acquisition (GPUPixel is consumer-only).
   - Stays in force. Do not remove.

3. **Native Phase-0 compile-only — `android/.../plugin/CameraAuthorityManager.kt`.**
   - Coroutine-safe suspending arbiter mirroring ProCameraEngine semantics on the JNI side.
   - **NOT wired yet.** No PluginMethods exposed. Wire only in Phase 6b if Crashlytics shows `CAMERA_IN_USE` despite the JS arbiter (i.e. a bypass path is found).

## Fix map (what was actually changed in Phases 1-7)

- **F1/F2 (Live → Game Party reuse, prejoin black):** native `startLocalPreview`/`stopLocalPreview` in `LiveKitPlugin.kt` + `CameraOwnership` rebind paths. APK rebuild required.
- **F3 (Video Party crash/OOM):** Crashlytics non-fatal reporting in `BoundedSurfaceHost.kt` with `seat_mount_stage` + memory snapshot keys. No structural rewrite (already had `runOnUiThread` + `ConcurrentHashMap` + `largeHeap`). APK rebuild required.
- **F4 (stuck "Stabilizing camera…" toast):** `toast.dismiss('lk-live-reconnect')` / `lk-reconnect` / `lk-audio-interrupt` at top of `leaveChannel()` (`useLiveKitClient.ts:1374`) and `cleanup()` (`useLiveKitCall.ts:237`). Preview-testable.
- **F5 (zombie live UI in Game Party):** `LiveStream.tsx` unmount defensively calls `disconnectAllRegisteredRooms()` + `sonnerToast.dismiss('lk-live-reconnect')`. Preview-testable. **Did NOT add** a `CallProvider.state.isLive` subscription — `CallProvider` is private-call-only, no such state exists. Don't reintroduce that speculative plan.
- **F6 (Camera Authority + conflict UX):** `FaceVerification.tsx` captures `useProCamera('face-verify')` result and toasts `"Camera busy — Please end your <holder> session before verifying your face."` + `navigate(-1)` on `CameraConflictError`. English-only per memory.

## Hard rules going forward

- Never add a new `getUserMedia` or Camera2 opener outside the ProCameraEngine arbiter. Audio-only `getUserMedia` (mic monitor, AI chat, phone-detection, AudioRecorder) is exempt — it does not contend for the camera.
- Every native prejoin preview MUST be feature-scoped with `roomScope` (`live` / `party` / `call`). A preview may only promote into a matching session; cross-feature previews must be stopped and restarted, never reused.
- Do not make all `.bg-muted` / `.bg-background` UI surfaces transparent for native media. Transparency must stay contained to root/room shell/native video placeholders so cards, controls, and private-channel UI do not visually break.
- FaceVerification must never blind-stop LiveKit/party/call camera owners. If `ProCameraEngine.currentFamily() === 'streaming'`, show busy UX and exit; only stop its own prior NativeCamera preview.
- `clearNativeMediaSurface()` must only clear `native-media-active`; do not strip `native-face-camera-active` from live/party/call cleanup paths.
- Web fallback camera claims in live/party/call must check the matching `ProCameraEngine.isHeldBy(...)` owner before `claimAndroidWebViewCamera*` / `getUserMedia`.
- Toasts MUST be English (memory rule).
- Beauty / light-kit hooks operate on the single LiveKit publisher track — never let them open a second camera.
- All toast `id`s used with `toast.loading(..., { id })` MUST also be dismissed in the corresponding teardown path. Sonner does not auto-dismiss `loading` toasts.
