# Phase H — Camera Resilience Layer (Native Private Call)

Research-first done. Competitors (Chamet/Bigo/Olamet on Agora) use a tiered watchdog + audio-only fallback with last-frame freeze. We already have most of the plumbing; Phase H wires the missing UX + thermal layer **only inside PrivateCallActivity**. No web design change, no new tables, no edge functions.

## What already exists (DO NOT rebuild)

| Capability | Where | Status |
|---|---|---|
| Local + remote frame watchdog (5s warn / 12s hard) | `LiveKitPlugin.startStallWatchdog` | ✅ |
| Soft recovery: stop+start camera capture | `LiveKitPlugin` line 2640 | ✅ |
| OEM-aware camera retry (MIUI/ColorOS, 1200ms cooldown) | `setNativeCameraEnabledWithOemRetry` | ✅ |
| Hard reconnect with exponential backoff (3/6/12s) | `reconnectWatchdogJob` | ✅ |
| `video-stall` / `video-stall-failed` events to JS | LiveKitPlugin line 2669 | ✅ |
| Thermal status listener (NONE→SHUTDOWN) | `ThermalBatteryPlugin` (Pkg441) | ✅ |
| `thermalChange` event to JS | ThermalBatteryPlugin line 77 | ✅ |

## What Phase H adds (gaps vs. Chamet/Bigo)

### 1. `CameraResilienceController.kt` (NEW, ~220 lines)
A single coordinator owned by `PrivateCallActivity`. Subscribes to the existing native events (no new watchdog — reuses LiveKitPlugin's).

- **State machine**: `HEALTHY → DEGRADED → AUDIO_ONLY → RECOVERING`.
- **`onVideoStall(local=true, sid)`** (from `video-stall` event): enter `DEGRADED`, show subtle "Poor connection" overlay on the affected tile (local or remote).
- **`onVideoStallFailed(local=true)`** (from `video-stall-failed`): enter `AUDIO_ONLY` — freeze last bitmap from `SurfaceViewRenderer` into an `ImageView` overlay, show persistent banner "Camera unavailable — audio only", show "Tap to retry" chip every 30s.
- **`onThermalChange("SEVERE")`** (from `thermalChange`): proactively `setCameraEnabled(false)` + show banner "Phone overheating — camera paused".
- **`onThermalChange("MODERATE")`**: emit new `setVideoQuality("low")` call via existing LiveKit publisher ladder (360p/15fps) — already supported.
- **Retry**: tap "Tap to retry" → call `LiveKit.setCameraEnabled(true)`; on success → `HEALTHY`. On 3 failed retries → permanent audio-only for this call.

### 2. Permission-revoke dialog
When camera restart fails with `SecurityException` / `CameraAccessException.CAMERA_DISABLED`:
- Check `ContextCompat.checkSelfPermission(CAMERA)`.
- If denied → show `MaterialAlertDialog` with deep-link to `Settings.ACTION_APPLICATION_DETAILS_SETTINGS`.
- Do NOT call `requestPermissions` mid-call (auto-denied on MIUI/ColorOS).

### 3. UX layer in `activity_private_call.xml`
- Add `ImageView @id/freeze_overlay` (gone by default, behind local renderer).
- Add `LinearLayout @id/resilience_banner` (gone by default) with icon + text + "Retry" chip.
- Add `ImageView @id/remote_poor_overlay` (gone, spinner on remote tile).

All colors/typography reuse existing `bg_private_call_*` drawables — no design token changes.

### 4. Wire-up in `PrivateCallActivity.kt` (~40-line diff)
- `onCreate`: instantiate `CameraResilienceController(this, binding, viewModel)`.
- `onResume` / `onPause`: forward to controller for lifecycle.
- Controller subscribes to LiveKit + ThermalBattery via `Capacitor.getBridge().getPlugin(...)` callback-style (no JS round-trip — direct Kotlin listener registration on the plugin instance).

### 5. Tiny `LiveKitPlugin.kt` addition (~30 lines)
Expose two Kotlin-callable hooks the controller can subscribe to without going through JS:
- `addNativeVideoStallListener(cb: (local, sid, severity) -> Unit)`
- `addNativeRecoveryListener(cb: (sid) -> Unit)` — fires when frame count resumes after a stall.

These piggyback on the existing JS event emission — same data, second sink. JS path untouched.

## Out of scope (deferred)

- ❌ iOS — Phase H is Android-only (web design sacred).
- ❌ Web — no change. Web preview will continue to show the existing call UI exactly as today.
- ❌ Camera2 direct teardown — current `restartTrack()` + OEM retry is already sufficient per research.
- ❌ LeakCanary wiring — separate QA phase.

## Files

**New (3):**
- `android/app/src/main/java/com/merilive/app/activity/CameraResilienceController.kt`
- `android/app/src/main/res/drawable/bg_private_call_resilience_banner.xml`
- `android/app/src/main/res/drawable/ic_private_call_camera_off.xml`

**Edited (3):**
- `android/app/src/main/java/com/merilive/app/activity/PrivateCallActivity.kt` (+40 lines)
- `android/app/src/main/java/com/merilive/app/plugin/LiveKitPlugin.kt` (+30 lines for native listeners)
- `android/app/src/main/res/layout/activity_private_call.xml` (3 overlays added)

## Verification

- Owner-account test (post-APK-rebuild): start call → enable airplane mode for 6s → resilience banner appears → restore network → call recovers.
- Owner-account test: cover camera lens with finger for 8s → stall fires → restart → if persistent fail → audio-only banner.
- Cannot test in Lovable preview (web has no native LiveKit). **APK rebuild required.**

## Risk

LOW. All paths are additive; existing JS event flow untouched. If controller throws, try/catch swallows and call continues with current (already-good) behavior. If user is on web, the native controller never instantiates.

Want me to build it? Reply **"Build Phase H"** to proceed, or **"Tweak X"** to adjust scope.
