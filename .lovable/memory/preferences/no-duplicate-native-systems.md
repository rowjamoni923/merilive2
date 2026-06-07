---
name: No duplicate native systems
description: Single source of truth for camera/audio/video/beauty native pipelines. No parallel plugins doing the same job. Audit and consolidate before adding any new native module.
type: constraint
---

# No Duplicate Native Systems (Camera / Audio / Video / Beauty)

**Locked 2026-06-07 by user explicit instruction.**

## Rule
Each native concern must have **exactly ONE owner plugin/manager**. No two plugins may control the same hardware (camera, mic, audio focus) or the same pipeline (beauty, video encoding, audio mixing).

## Why
- Two plugins opening camera → device lock conflict, blank frames, OEM crashes
- Two audio focus managers → ducking race, stream stuck silent
- Two beauty processors → double GPU pipeline → frame drops + OOM
- Maintenance hell — bug fix in one, other still broken
- 10K+ existing users — production cannot break

## Single-owner mapping (target after consolidation)

| Concern | OWNER (single source) | Forbidden duplicates |
|---|---|---|
| Camera capture | `LiveKitPlugin` (via livekit-android SDK) | `NativeCameraPlugin`, `video/NativeVideoEnginePlugin` (audit & delete or repurpose) |
| Camera ownership state | `CameraOwnership.kt` (single arbiter) | Any other "who owns camera" flag |
| RTC engine | `LiveKitPlugin` (Application-scope singleton via Phase 1) | None |
| Mic capture | LiveKit native audio track | `AudioRecorderPlugin` only for voice messages, NOT for call/live |
| Audio focus | `AudioFocusPlugin` (single arbiter) | Per-plugin local focus requests |
| Audio routing (speaker/headset/BT) | `HeadsetRoutingPlugin` | None |
| Gift/entry SFX | `GiftAudioMixer` (SoundPool + MediaPlayer pool) | No `MediaPlayer.create()` scattered elsewhere |
| Beauty filter pipeline | ONE of `GPUPixelBeautyPlugin` / `BeautyPipelineBridge` / `video/GPUPixelBeautyProcessor` — must consolidate to one | The other two must be deleted |
| Virtual background | `VirtualBackgroundProcessor` (single, integrated into chosen beauty pipeline) | None |
| Call lifecycle | `LiveKitPlugin` + `NativeCallPlugin` consolidated, or one delegates to other — NOT two independent | `MeriConnectionService` + `TelecomBridge` for Telecom API only, must NOT spin its own LiveKit |
| Foreground service | `CallForegroundService` (single) | No per-feature foreground service |
| Gift/entry animation | `NativeGiftAnimationPlugin` + `NativeEntryAnimationPlugin` (Pkg438) | No other VAP/SVGA/Lottie native instantiation |
| Heart burst | `NativeHeartBurstPlugin` | None |
| Reels player | `NativeReelsPlayerPlugin` | None |

## Required process before adding ANY new native plugin
1. List existing plugins under `android/app/src/main/java/com/merilive/app/plugin/` and `plugin/video/`
2. Check if a plugin already covers the concern
3. If yes → extend the existing plugin, do NOT create new
4. If new is justified → document in plan + delete the replaced one in same migration step

## Required process before deleting any native plugin
1. `rg -n "PluginName\|registerPlugin\(PluginName" android/ src/` — find all references
2. `rg -n "PluginName" src/plugins/ src/lib/ src/hooks/` — find JS wrappers
3. Check `MainActivity.java` registration list
4. Verify replacement path works (test via owner account)
5. Only then `rm` the file + remove from registration
6. NEVER blind-delete — 10K+ production users

## Current known duplicate suspects (2026-06-07 audit)
- Camera: `NativeCameraPlugin.java` (Java, legacy) vs `LiveKitPlugin.kt` (Kotlin, RTC) vs `video/NativeVideoEnginePlugin.java` → audit purpose of each, consolidate
- Beauty: `BeautyPipelineBridge.kt` + `GPUPixelBeautyPlugin.kt` + `video/GPUPixelBeautyProcessor.kt` → 3 paths for one concern
- Audio engine: `video/NativeAudioEnginePlugin.java` vs `AudioFocusPlugin.java` + LiveKit audio → audit
- Call: `NativeCallPlugin.kt` vs `LiveKitPlugin.kt` vs `telecom/*` — clarify ownership boundaries

Resolution = Phase 0.5 (pre-Phase 1) consolidation step in `.lovable/plan.md`.
