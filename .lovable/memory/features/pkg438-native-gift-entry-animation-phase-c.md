---
name: Pkg438 Native gift+entry animation Phase C
description: NativeHeartBurst overlay plugin for Reels double-tap like + Reels.tsx double-tap handler + LeakCanary debug dep. Phase A/B foundation closed out.
type: feature
---
# Pkg438 Phase C — Heart-burst + Double-tap + Leak QA (DONE 2026-06-06)

## What ships
- `android/app/src/main/java/com/merilive/app/plugin/NativeHeartBurstPlugin.kt` — fullscreen `FrameLayout` mounted via `WindowManager.addView` (TYPE_APPLICATION, FLAG_NOT_TOUCHABLE) over decorView. Spawns 1-12 heart `TextView` sprites (emoji glyphs ❤♥💖💕💘, randomized) at given viewport (x,y). Animations: pop-in 220ms (scale 0.3→1.25→1 + alpha 0→1) → rise 620ms (translateY -2.6×size, drift ±0.7×size, rotation ±20°, fade out, shrink to 0.7). 16-view pool, lifecycle-safe (`handleOnPause` clears, `handleOnDestroy` removes).
- `src/plugins/NativeHeartBurst.ts` — TS wrapper with `tryHeartBurst(x,y,{count,size})` and `isNativeHeartBurstAvailable()`. No-op on web/iOS/older APKs.
- `src/utils/nativeHeartBurstFlag.ts` — flag `merilive:nativeHeartBurst`. **Default ON on Android** (pure decoration, no Supabase write).
- `MainActivity.java` — registers `NativeHeartBurstPlugin`.
- `android/app/build.gradle` — adds `debugImplementation 'com.squareup.leakcanary:leakcanary-android:2.14'`. Debug-only; zero bytes in release.
- `src/pages/Reels.tsx` — adds `handleVideoTap`: 260ms scheduled single-tap (togglePlay); second tap within 280ms cancels toggle, runs `handleLike(reelId)` if not already liked, and fires `tryHeartBurst(clientX, clientY, {count:7, size:72})`. Replaces `onClick={togglePlay}` on BOTH the native ExoPlayer transparent tap-target and the `<video>` fallback. Uses viewport coords (fullscreen native overlay).

## Guarantees
- All native code is **net-new**; web fallback uses double-tap-to-like UX only (heart-burst no-op).
- Decoration only: no Supabase mutation from the plugin, no JS state changes from the native side. React `handleLike` runs independently.
- No forbidden components touched.
- TYPE_APPLICATION + FLAG_NOT_TOUCHABLE → taps pass through to WebView/ExoPlayer; zero gesture conflict.
- Single-tap toggle is delayed by 260ms (Instagram/TikTok parity); double-tap suppresses toggle entirely so users don't pause when liking.

## Activate per device (rebuild APK first)
```js
localStorage.setItem('merilive:nativeGiftAnim','on');
localStorage.setItem('merilive:nativeEntryAnim','on');
// heart burst is ON by default; disable with:
// localStorage.setItem('merilive:nativeHeartBurst','off');
```

## Out of scope (deferred)
- Real-device QA matrix (user-side).
- WebView gift-overlay opacity-mute on `gift:start` event — needs careful selector audit of forbidden components without editing them; punted to a future Pkg.
- Native event telemetry → `system_error_logs` — punted; reasonable to add only after device QA reveals real failure modes.
