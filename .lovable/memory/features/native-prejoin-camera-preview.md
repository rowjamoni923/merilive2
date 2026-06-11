---
name: Native prejoin camera preview + zero-restart handoff
description: Single-camera lifecycle (Chamet/Bigo pattern) across Live, Video Party, Game Party, Private Call. One Camera2 open, reused LocalVideoTrack via promotePreviewToSession. APK rebuild required.
type: feature
---

# Native prejoin camera preview + zero-restart handoff

**Updated 2026-06-11.** Research brief: `/mnt/documents/preview_to_broadcast_engineering_brief.md` (citations: Agora ILS docs + LiveKit client-sdk-android source).

## The pattern
"Single camera capturer lifecycle" — Agora's `setupLocalVideo → startPreview → joinChannel → publish` translated to LiveKit Android:
1. `startLocalPreview()` opens Camera2 ONCE in a standalone preview `Room`, creates a `LocalVideoTrack` via `localParticipant.createVideoTrack()`, starts capture, mounts `TextureViewRenderer` behind WebView.
2. When the user taps Go Live / Create Party / Accept Call → `connectInternal()` detects the live preview and calls `promotePreviewToSession()` instead of tearing down + rebuilding.
3. Promotion: preview Room becomes the session Room (`room = previewRoom`), `room.connect(url, token)` runs, then `publishVideoTrack(previewTrack, opts)` publishes the SAME track. **Camera2 is never re-opened.** No black flash, no permission re-prompt, no OEM availability wait, no CameraOwnership churn.
4. Mic published independently via `setMicrophoneEnabled(true)` (doesn't touch camera).

## Files
- `android/app/src/main/java/com/merilive/app/plugin/LiveKitPlugin.kt`
  - `connectInternal` (gate at top): promotes when `!isReconnect && args.video && !args.e2eeOn && previewRoom != null && previewTrack != null && room == null`.
  - `promotePreviewToSession(args)`: full promotion path (attachEventListeners, connect, canPublish guard, publishVideoTrack, mic enable, stall sink, foreground service, network callback, etc.).
- `src/pages/GoLive.tsx`: already calls `startLocalPreview` (prior turn).
- `src/pages/CreateParty.tsx`: starts preview on Android video-mode camera grant; preserved across unmount when user taps Create (via `preserveStreamRef`).
- `src/components/call/CallProvider.tsx`: starts preview the moment `incomingCall` arrives or outgoing call enters `calling`/`ringing`; stops on `ended`/`idle`.
- Game Party: voice-only, no preview needed.

## Compatibility gate exclusions (fall through to legacy rebuild)
- Reconnects (always rebuild).
- Audio-only sessions.
- E2EE sessions (key provider must be set at Room create time).
- An existing session is already active.

## APK rebuild REQUIRED
All native handoff lives in `LiveKitPlugin.kt`. React-side wiring works in web preview but the camera reuse only takes effect after `npx cap sync android` + APK rebuild.

## Verification checklist (post-rebuild, on device)
- Go Live: tap → no black flash, logcat shows ONE `Camera2.openCamera` call, `promotePreviewToSession: reusing preview Camera2 + LocalVideoTrack (no restart)` log line present.
- Create Party (video): camera shows in Create screen → tap Create → PartyRoom shows same uninterrupted feed.
- Private Call incoming: modal appears → camera quietly starts → tap Accept → instant 2-way video, no extra second of black on the local tile.
- Private Call decline / missed: logcat shows `stopLocalPreview` shortly after.

## Known follow-ups
- Optional: render the prejoin preview INSIDE the IncomingCallModal as a small PiP (currently it runs invisibly behind the modal — Camera2 is hot but not shown).
- Optional: relax E2EE exclusion by pre-creating the preview Room with E2EE options when an E2EE key is cached.

## Permission primer = once-only (2026-06-11)
GoLive no longer shows the custom "Allow Permissions" popup on every open. Mount now calls `checkPermissionStatus()` (utils/nativePermissions → `MeriPermissions.checkAllPermissions`, real OS state, never prompts). Granted → popup skipped, `permissionsGranted` set, silent auto-start effect (waits for ProCamera arbiter `ready`) runs the SAME pipeline as the Allow button (`startNativePreview` native / `getCameraStream` web). Not granted or auto-start fails → primer falls back as before. Industry pattern: live OS-state check, never persisted-flag-only (Android 11 one-time grants / Settings revokes). Pure WebView change — no APK rebuild needed.
