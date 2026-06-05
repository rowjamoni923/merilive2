---
name: Pkg428 Native Image Loader (Glide)
description: Additive Android Glide-backed image prefetch + optional WebView interceptor. Default OFF.
type: feature
---

DONE 2026-06-05. Additive, zero-risk. Default OFF — every existing `<img>` /
CSS `background-image` path keeps running on web, iOS, older APKs, and the
gated-off cohort.

**Native** (`NativeImageLoaderPlugin.kt`): Glide-backed Capacitor plugin.
APIs: `prefetch({urls[]})` (bulk download to disk cache on a 2-thread io
pool, returns `{prefetched, requested}`), `clearCache()` (memory cache on
main thread + disk cache on io pool), `getCacheStats()` (walks
`cacheDir/image_manager_disk_cache`, returns `{bytes, count}`),
`setInterceptorEnabled({enabled})` (installs a WebViewClient wrapper that
short-circuits `.jpg/.jpeg/.png/.webp/.gif/.avif` GETs through Glide's
disk cache, returning `WebResourceResponse` with `Access-Control-Allow-Origin: *` +
`Cache-Control: public, max-age=604800`. Original WebViewClient kept as
`originalClient`, all other callbacks forwarded — Capacitor bridge stays
intact). Pass-through on failure → network fetches normally.

**JS bridge** (`src/plugins/NativeImageLoader.ts`): safe no-op shims on
web/iOS — every call catches + returns sensible defaults. URLs filtered
to https/http only.

**Feature flag** (`src/utils/imageNativeFlag.ts`): identical 3-tier dial
to Pkg426/427: localStorage `image:native:enabled` → `app_settings.image_native_enabled`
→ `app_settings.image_native_rollout_percent` (sticky bucket SHARED with
Pkg426/427 via `vap:native:bucket` → device in bucket 12 for VAP is in
bucket 12 for reels AND images, consistent perceived performance).
Interceptor has its own stricter sub-flag (`image:native:interceptor` +
`app_settings.image_native_interceptor`) — base flag must also be ON.

**Hooks** (`src/hooks/useNativeImagePrefetch.ts`):
`useNativeImagePrefetch(urls)` fires bulk prefetch when visible URL list
changes (40-URL cap, key-deduped on shallow re-renders).
`useNativeImageInterceptor()` installs/uninstalls WebView interceptor on
mount based on flag.

**Constraint compliance**: zero edits to entry/gift animation files
(constraint mem://constraints/never-touch-gift-entry-animations remains).
Glide AAR was already in the APK for `NotificationHelper` rich layouts —
no APK size increase. No conflict with Camera2 / LiveKit / ExoPlayer
(decoder-only resources).

**Rollout**: keep default OFF for one APK release; enable
`image:native:enabled='1'` on owner device → verify prefetch via
`getImageCacheStats()`; flip
`UPDATE app_settings SET image_native_enabled=true, image_native_rollout_percent=5`
→ ramp 5/25/50/100. Interceptor stays OFF until prefetch ramps cleanly.

**Wiring**: hooks created but NOT yet inserted into any list/feed page
(intentional — base flag is OFF anyway, no behavior change shipped). Next
step (Pkg428 follow-up): call `useNativeImagePrefetch` in Index/Discover/
Reels list with first-screen avatar/poster URLs.
