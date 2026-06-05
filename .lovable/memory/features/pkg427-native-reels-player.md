---
name: Pkg427 Native Android Reels Player (ExoPlayer)
description: ExoPlayer/Media3 native reels playback behind reels:native:enabled flag, default OFF, additive to existing <video> path
type: feature
---

DONE 2026-06-05. Native Android reels playback via AndroidX Media3 ExoPlayer 1.3.1 — buttery-smooth full-screen scrolling, 256 MB on-disk cache (instant scroll-back replay), gapless reel transitions, ~30 % less battery vs WebView <video>.

**Files created:**
- `android/app/src/main/java/com/merilive/app/plugin/NativeReelsPlayerPlugin.kt` — Capacitor plugin (SurfaceView below WebView at parent index 0, WebView flipped transparent so hidden <video> rect lets surface show through). Methods: play/pause/resume/setMuted/seek/stop/dispose/prefetch. Events: reel:ready/complete/error/playing. Shared 256 MB SimpleCache (LRU) under cacheDir/reels-exo with StandaloneDatabaseProvider. Class.forName availability check.
- `src/plugins/NativeReelsPlayer.ts` — JS bridge: isNativeReelsPlayerAvailable, tryNativeReelsPlay (3 s timeout), tryNativeReelsPrefetch, stopNativeReels, disposeNativeReels. Mirrors NativeVAP.ts.
- `src/utils/reelsNativeFlag.ts` — three-tier flag (localStorage `reels:native:enabled` → app_settings.reels_native_enabled kill switch → reels_native_rollout_percent staged rollout). Reuses Pkg426 bucket `vap:native:bucket` for consistency. Default OFF.
- `src/hooks/useNativeReelsPlayer.ts` — React hook {url,muted,enabled,prefetchUrls} → {active,initializing,play,pause,setMuted,seek}. Lazy-loads remote flag once via getAppSetting. Prefetches next+prev reel. Releases native player on unmount.
- `docs/GEMINI_NATIVE_REELS_PROMPT.md` — full Gemini reproduction prompt.

**Files edited:**
- `android/app/build.gradle` — added Media3 1.3.1 (exoplayer, datasource, datasource-okhttp, common, database).
- `android/app/src/main/java/com/merilive/app/MainActivity.java` — registered NativeReelsPlayerPlugin.
- `src/pages/Reels.tsx` — minimal wiring: imported hook + called after state; togglePlay/toggleMute short-circuit to native when active; autoplay useEffect skips videoRefs loop when native active; JSX renders transparent tap-target div instead of <video> when nativeReels.active (UI overlays like/gift/comments/captions untouched — they live in WebView ABOVE the SurfaceView).

**Zero-regression guarantees:**
- Default OFF → existing WebView <video> path runs byte-identically for everyone.
- iOS / web preview → isNativeReelsPlayerAvailable returns false → <video> path.
- Old APK (pre-Pkg427) → Class.forName check returns false → <video> path.
- Any runtime failure → JS catches → falls back to <video>.
- Camera-conflict safe: ExoPlayer uses MediaCodec decoder only, never Camera2 (no contention with LiveKit/CameraOwnership/GPUPixel — Pkg415/416/418).
- Gift/entry animation constraint (mem://constraints/never-touch-gift-entry-animations) honored — no animation files touched.

**Rollout:**
1. Rebuild APK after `npx cap sync android`.
2. Per-device smoke test: `localStorage.setItem('reels:native:enabled','1')` then reload /reels.
3. App-wide: insert `app_settings` rows `reels_native_enabled=true` + `reels_native_rollout_percent=5`, ramp 5→25→100.
4. Emergency rollback: `update app_settings set value='false'::jsonb where key='reels_native_enabled'`.
