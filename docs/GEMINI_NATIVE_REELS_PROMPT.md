# Pkg427 — Native Android Reels Player (ExoPlayer / Media3)

> Drop-in prompt for Gemini (or any other code-gen agent) to **re-create
> the exact same native Reels player infrastructure** if it's ever lost
> or needs to be reproduced in a sibling project. This is a faithful
> mirror of what Lovable shipped on 2026-06-05 in package Pkg427.

---

## Mission

Replace the WebView `<video>` tag inside `src/pages/Reels.tsx` with a
hardware-accelerated AndroidX Media3 ExoPlayer surface, but do it
**zero-risk additive**: the existing `<video>` path must continue to
work byte-identically for web, iOS, and any user where the feature flag
is OFF. No regression is acceptable.

Why ExoPlayer instead of WebView `<video>`:

- Hardware MediaCodec decoder → 30 % less battery, locked 60 fps
  scrolling.
- 256 MB on-disk cache keyed by URL → swiping back to a previously-
  watched reel is instant (zero network).
- Gapless transitions between reels (the WebView path stutters because
  every new `<video>` element re-negotiates decoder + HTTP).
- No conflict with Camera2 / LiveKit / GPUPixel — ExoPlayer uses the
  MediaCodec **decoder** only, never the encoder or camera.

---

## Files to create

1. **`android/app/src/main/java/com/merilive/app/plugin/NativeReelsPlayerPlugin.kt`**
   Capacitor plugin exposing `play`, `pause`, `resume`, `setMuted`,
   `seek`, `stop`, `dispose`, `prefetch`, plus events `reel:ready`,
   `reel:complete`, `reel:error`, `reel:playing`. Implementation notes:
   - SurfaceView added at index 0 of the WebView's parent → renders
     BELOW the WebView so JS UI overlays still appear on top.
   - WebView background flipped to transparent so the hidden `<video>`
     rect lets the surface show through.
   - Shared 256 MB `SimpleCache` (LeastRecentlyUsed) under
     `cacheDir/reels-exo`, with `StandaloneDatabaseProvider`.
   - `Class.forName("androidx.media3.exoplayer.ExoPlayer")` availability
     check so older APKs cleanly report `available:false`.
   - `handleOnDestroy()` releases the player.

2. **`src/plugins/NativeReelsPlayer.ts`**
   Thin JS bridge exporting `isNativeReelsPlayerAvailable`,
   `tryNativeReelsPlay` (with 3 s timeout), `tryNativeReelsPrefetch`,
   `stopNativeReels`, `disposeNativeReels`. Mirrors `NativeVAP.ts`.

3. **`src/utils/reelsNativeFlag.ts`**
   Three-tier feature flag:
   - Per-device `localStorage` override (`reels:native:enabled`).
   - Global `app_settings.reels_native_enabled` kill switch.
   - Sticky staged rollout via `app_settings.reels_native_rollout_percent`
     (reuses the Pkg426 bucket `vap:native:bucket` for consistency).
   Default: OFF.

4. **`src/hooks/useNativeReelsPlayer.ts`**
   React hook that takes `{url, muted, enabled, prefetchUrls}` and
   returns `{active, initializing, play, pause, setMuted, seek}`.
   Lazy-loads the remote flag once per session via
   `getAppSetting('reels_native_enabled')` and
   `getAppSetting('reels_native_rollout_percent')`. Prefetches the
   next + previous reel into the disk cache. Releases the native
   player on unmount.

---

## Files to edit

1. **`android/app/build.gradle`** — add Media3 deps:
   ```gradle
   def media3Version = '1.3.1'
   implementation "androidx.media3:media3-exoplayer:${media3Version}"
   implementation "androidx.media3:media3-datasource:${media3Version}"
   implementation "androidx.media3:media3-datasource-okhttp:${media3Version}"
   implementation "androidx.media3:media3-common:${media3Version}"
   implementation "androidx.media3:media3-database:${media3Version}"
   ```

2. **`android/app/src/main/java/com/merilive/app/MainActivity.java`** — register:
   ```java
   registerPlugin(com.merilive.app.plugin.NativeReelsPlayerPlugin.class);
   ```

3. **`src/pages/Reels.tsx`** — wire (only ~50 lines changed):
   - Import `useNativeReelsPlayer`.
   - Call the hook after `currentIndex` / `reels` state, passing the
     current reel URL, the current `isMuted` value, and next/prev URLs
     as `prefetchUrls`.
   - In `togglePlay`: short-circuit to `nativeReels.play()` /
     `.pause()` when `nativeReels.active`.
   - In `toggleMute`: short-circuit to `nativeReels.setMuted(next)`
     when `nativeReels.active`.
   - In the autoplay `useEffect`: skip the videoRefs loop when
     `nativeReels.active`; just force `setIsPlaying(true)` so the
     play-icon overlay stays hidden.
   - In the JSX: replace `<video ... />` with a ternary —
     `nativeReels.active ? <transparent tap-target div /> : <video />`.
   - **Do not touch** any other Reels UI (like / gift / comments /
     captions / gradients / safe-area). Those keep rendering on top of
     the native surface because they live in the WebView, which is
     painted ABOVE the SurfaceView.

---

## Rollout (zero-risk)

1. Rebuild APK (Media3 AAR ships inside). Old APKs report
   `available:false` and continue using the `<video>` path.
2. Per-device test: in DevTools console
   `localStorage.setItem('reels:native:enabled','1')` then reload `/reels`.
3. Insert app-wide kill / rollout dials:
   ```sql
   insert into app_settings (key, value) values
     ('reels_native_enabled', 'true'::jsonb),
     ('reels_native_rollout_percent', '5'::jsonb)
   on conflict (key) do update set value = excluded.value;
   ```
4. Watch crash-free rate + reel start latency; ramp 5 → 25 → 100.
5. Emergency rollback:
   ```sql
   update app_settings set value = 'false'::jsonb
   where key = 'reels_native_enabled';
   ```

---

## Constraints (must not violate)

- Existing `VAPPlayer.tsx`, `FullScreenGiftAnimation.tsx`,
  `EntryVAPPlayer.tsx`, and all gift/entry animation files are
  **off-limits** (mem://constraints/never-touch-gift-entry-animations).
- iOS path is unchanged — the plugin is Android-only; JS bridge
  reports `available:false` on iOS so Reels.tsx silently keeps the
  `<video>` path.
- No new realtime channels. No polling. No visibility-refresh.
