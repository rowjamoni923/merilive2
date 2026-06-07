---
name: Phase 0.5 Native Plugin Audit
description: 2026-06-07 dead native plugin cleanup. Deleted Pkg435 NativeAudioEnginePlugin + NativeVideoEnginePlugin + JNI cpp + 2 TS wrappers + CMake. No real duplicates found; layered beauty design confirmed legitimate.
type: feature
---

# Phase 0.5 — Native Plugin Audit + Dead Code Cleanup (DONE 2026-06-07)

## Outcome
Audited all suspect native plugins. Removed 5 confirmed-dead files + CMake/JNI build infrastructure. No legitimate duplicates found — the 3-camera / 3-beauty / multi-audio fear was inaccurate.

## What was deleted
- `android/app/src/main/java/com/merilive/app/plugin/video/NativeVideoEnginePlugin.java` (never registered, no JS callers)
- `android/app/src/main/java/com/merilive/app/plugin/video/NativeAudioEnginePlugin.java` (Pkg435 AEC/NS/AGC wrapper — never registered, no JS callers)
- `android/app/src/main/cpp/native_video_engine.cpp` (JNI for dead VideoEnginePlugin)
- `android/app/src/main/cpp/CMakeLists.txt` (entire `cpp/` directory removed)
- `src/plugins/NativeVideoEngine.ts` (TS wrapper for dead plugin)
- `src/plugins/NativeAudioEngine.ts` (TS wrapper for dead plugin)
- `android/app/build.gradle` `externalNativeBuild { cmake { ... } }` block removed with explanatory comment

## What was KEPT and why (clarification, not duplicates)
- **`NativeCameraPlugin`** (Java) = Pkg272 Face Verification (KYC) only. Arbitrated via `CameraOwnership.kt` against LiveKit. Different concern from RTC camera.
- **`NativeCallPlugin`** (Kotlin) = CallKit-style action bridge (accept/decline/timeout events from native `IncomingCallActivity` → JS via `call-action` event + cold-start queue). Different concern from `LiveKitPlugin` (RTC media).
- **Beauty trio** = layered Bigo/Chamet-standard design:
  - `GPUPixelBeautyPlugin` = JS bridge (only user-facing entry)
  - `BeautyPipelineBridge` = state flag arbiter
  - `video/GPUPixelBeautyProcessor` = LiveKit VideoProcessor implementation
  - `video/VirtualBackgroundProcessor` = separate feature (MediaPipe segmentation)
- **Audio plugins** = scope-separated, not overlapping:
  - `AudioFocusPlugin` = focus arbiter (single)
  - `HeadsetRoutingPlugin` = routing (single)
  - `AudioRecorderPlugin` = voice messages only
  - `GiftAudioMixer` = gift SFX only (Pkg438, SoundPool+MediaPlayer pool)
- **Telecom layer** (`MeriConnectionService` + `TelecomBridge`) = Android OS Telecom API integration only, separate from LiveKit media

## Result
- APK size will drop (dead Java + cpp removed, CMake build skipped)
- Cleaner codebase for Phase 1 (Native LiveKit RTC migration)
- No production risk (zero references existed before deletion)
- `baseline-prof.txt` may have cold references to removed classes — they'll be regenerated on next profile build, no runtime impact

## Next
Phase 1 — Native LiveKit RTC Foundation. Now starts on clean ground.
