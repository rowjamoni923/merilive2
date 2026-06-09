---
name: Home page competitor numbers (Phase 3)
description: Industry-locked numbers for live-streaming home/discovery — search/tabs/grid/thumbnail/country/leaderboard/refresh/scroll/perf/TTI.
type: feature
---
# Home / Discovery — Industry-Locked Numbers (researched 2026-06-09)

10 apps surveyed: Chamet, Bigo, Olamet, Poppo, Hollah, HiiClub, WeJoy, Crush Live, TikTok Live, Likee.

## Search bar
- Top fixed, **48–56 dp** Material touch target
- Debounce **300–500 ms** typeahead
- Recent searches: up to **5** in SharedPreferences/Room
- Some apps (TikTok, Likee, Hollah, Crush Live) use icon-only that expands or navigates

## Tab/filter chips
- Popular / Live / New / Following / Country — horizontal scrollable chips
- **Sticky on scroll** universally
- ~60% use underline indicator (Material), ~40% pill chips (trending 2024+)

## Live grid
- **2 columns** (Bigo/Chamet/Poppo/Olamet/WeJoy/Hollah). TikTok 1+2, Likee 3
- Aspect: **3:4** dominant, 9:16 for stream-exact (Olamet/Crush)
- Animated preview: **6-10s silent MP4 loop** in Bigo/Chamet/WeJoy
- Preview trigger: ≥50% visible AND scroll-paused **800-1200 ms** dwell
- Off-screen → instant pause/release (TikTok VisibilityTracker)

## Hero card
- Single full-width 16:9 (Bigo) OR carousel **3-5 s interval** (Chamet/WeJoy/Poppo)

## Country filter
- **Bottom-sheet picker** universal (4-col flag grid, searchable)
- Last selection persisted

## Leaderboard
- Daily / Weekly / Monthly nested tabs
- Top-3 podium with animated avatar frames (Lottie/GIF)

## Pull-to-refresh
- Custom branded lottie spinner (Bigo/Chamet/WeJoy) or Material stock (Poppo)
- Threshold **72-88 dp**; up to 100 dp for custom
- Haptic `VIRTUAL_KEY` at threshold

## Infinite scroll
- Page size **20-30** items (10 rows × 2 col)
- Prefetch trigger: **3-5 screen heights** from bottom
- `initialPrefetchItemCount` tuned to 4-5
- Shimmer skeletons same aspect as live tile
- **BlurHash** placeholders decoded OFF UI thread

## Performance
- CDN resize per-card: `?w=360&h=480&q=75` WebP
- RecyclerView `setItemViewCacheSize(5-10)`, shared `RecycledViewPool`
- Glide `Priority.HIGH` visible / `LOW` prefetched
- ExoPlayer **pool size 2-3**, `bufferForPlaybackMs=1000` → -11.9% load time
- SurfaceView > TextureView for GPU efficiency
- AV1 skipped on G35 (no HW decode) — H.264 MP4 for previews
- Baseline Profiles + R8 → up to 50% startup improvement (Reddit case)

## TTI on Helio G35
- Play Vitals "good" cold start: < 5 s
- Pro live apps target: < 3.5 s; realistic on G35 = 3.5-5.5 s with optimization

## Citations
- developer.android.com/stories/apps/tiktok
- developer.android.com/stories/apps/sharechat
- proandroiddev.com/improving-video-playback-with-exoplayer-7ac55e9bd0af
- android-developers.googleblog.com (Reddit baseline profiles 2024)
- engineering.cred.club/implementing-multi-video-playback-in-recyclerview
- nanoreview.net/en/soc/mediatek-helio-g35
- m3.material.io specs
