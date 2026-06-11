---
name: Native prejoin camera preview (Go Live)
description: 2026-06-11 fix for black Go Live preview — LiveKitPlugin.startLocalPreview/stopLocalPreview standalone Camera2 preview behind WebView; APK rebuild required
type: feature
---

# Go Live black-screen root cause + fix (2026-06-11)

## Root cause (ranked, from codebase trace)
1. `GoLive.tsx startNativePreview` was a dead stub (`return false`) — no camera ever opened on the prejoin screen; `nativePreviewActive` stayed false → black.
2. Native plugin had NO preview-only method — local camera existed only after `connect()` + `attachLocal()`.
3. WebView transparency (`native-media-active`) only applied after a real LiveKit connect, never during preview.

## Fix shipped
- **LiveKitPlugin.kt**: new `startLocalPreview` / `stopLocalPreview` plugin methods + `stopLocalPreviewInternal`. Standalone never-connected `Room` (LiveKit.create) used as track factory: `localParticipant.createVideoTrack()` → `startCapture()` → TextureViewRenderer (`setMirror(front)`) → `mountBehindWebView`. CameraOwnership: acquires OWNER_LIVEKIT, honors OEM release grace + `awaitFrontCameraAvailable`. `connectInternal()` and `disconnect()` both call `stopLocalPreviewInternal` (connect path keeps WebView transparent; disconnect restores opaque). If a real session is active, `startLocalPreview` falls through to `attachLocal`.
- **NativeLiveKit.ts / nativeLiveKitController.ts**: bridge + `startLocalPreview()` (returns false on old APK/web → caller shows "update app" toast) and `stopLocalPreview()`. `connectAndPublish` also calls `stopLocalPreview` first (double safety, swallowed on old APKs).
- **GoLive.tsx**: `startNativePreview` now calls the controller; invoked from `handleAllowPermissions` native branch after permission grant. `stopNativePreview` releases the native camera. Existing handoff (`handleGoLive` → `stopNativePreview` → navigate → LiveStream native connect) unchanged.

## Same-day companion fix
- `RoomWelcomeBanner.tsx` restyled to professional system-notice (compact `w-fit` muted black/35 pill, 10px white/60 text, no gradient/pulse) per Chamet/Bigo compliance-notice standard. Used by LiveStream + UnifiedPartyRoom via RoomChatOverlay `adminBannerRoomType`.

## ⚠️ APK rebuild REQUIRED
Web preview cannot exercise native preview. Old APKs: startLocalPreview throws → GoLive shows English toast "Camera preview unavailable. Please update the app to the latest build."

## Still-open suspects for in-room black screens (not yet verified on device)
- `detachAllRenderersInternal` resets WebView to opaque 0xFF000000 — a failed connect between detach and re-mount leaves WebView black.
- `useLiveKitClient.localVideoTrack` never set on native path — any UI gated on `useLiveKit && localVideoTrack` won't render on Android (native surfaces use `nativeActive` instead).
Need adb logcat from device if black screen persists after rebuild.
