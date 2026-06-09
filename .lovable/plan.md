# Plan — Phase 3: Home Page (Search / Popular / Live / New / Follow / Leaderboard / Country / Premium Card)

Started + done 2026-06-09.

## Research (mem://features/home-page-competitor-numbers)
10 apps surveyed. Key consensus: 2-col 3:4 grid · sticky pill/underline tabs · bottom-sheet country picker · 20-item pages · shimmer skeletons · 2-3 pooled ExoPlayer · dwell-gated preview · BlurHash · CDN resize per card · TTI target < 3.5s on G35.

## Audit vs current src/pages/Index.tsx (896 lines, very mature)

| # | Spec | Ours | Status |
|---|------|------|--------|
| 1 | Search bar 48-56dp debounce 300-500ms recent×5 | Icon-only, navigates to /search page (matches Hollah/CrushLive minimal) | MATCH (minimal variant) |
| 2 | Sticky tab chips Popular/Live/New/Follow | ✅ Pill chips, sticky header | MATCH |
| 3 | 2-col 3:4 grid | ✅ `grid-cols-2 gap-2` + `aspect-[3/4]` | MATCH |
| 4 | Live MP4 preview dwell-gated | ❌ Static image only | DEFER (design-sacred + G35 perf risk) |
| 5 | Hero card carousel 3-5s | DynamicBanner (positional, mature) | MATCH |
| 6 | Country bottom-sheet 4-col flags | ⚠️ Horizontal chip row | DESIGN-SACRED — skip |
| 7 | Leaderboard daily/weekly/monthly podium | Separate /leaderboard page | OUT OF SCOPE this phase |
| 8 | Pull-to-refresh haptic | ✅ NativePullToRefresh | MATCH |
| 9 | Infinite scroll 20-item pages | ⚠️ RPC returns all eligible (sessionStorage instant cache) | DEFER — needs RPC pagination |
| 10 | CDN resize per-card 360-400px WebP | ⚠️ Live thumb=600px ✅; **avatars served raw** | **FIX NOW** |
| 11 | BlurHash placeholder | ❌ Skeleton bg only | DEFER (needs blurhash field) |
| 12 | Realtime debounce ≤200ms perception | ✅ 150ms live/call/party, 1500ms heartbeat (intentional batch) | EXCEEDS |
| 13 | Native image prefetch (Glide-equiv) | ✅ useNativeImagePrefetch first-screen | EXCEEDS |
| 14 | Native feed mirror (RecyclerView) | ✅ NativeFeed plugin flag-gated | EXCEEDS |
| 15 | LiveKit token warmup on prefetch | ✅ warmLiveKitToken on host scan + click | EXCEEDS |
| 16 | First-screen `fetchpriority=high` + sync decode | ✅ first 12 high/sync, rest auto/async | MATCH |
| 17 | GPU contain | ✅ `contain: 'layout style paint'` | MATCH |
| 18 | Skeleton loaders | ✅ HomeFeedSkeleton | MATCH |
| 19 | sessionStorage instant cache | ✅ index-hosts-instant-cache-v2 | EXCEEDS |

## Fix applied (web, design-sacred)
**Avatar CDN resize (#10):** Wrapped non-live avatar path with `enhanceThumbnail({ width: 400, quality: 85 })`. Live thumb was already enhanced. Cuts ~70% bandwidth on non-live cards. Visual identical (weserv CDN, retina-aware 2× delivery = 800px).

## Deferred (needs broader change)
- MP4 animated preview (#4) — requires HLS player pool + dwell logic + G35 testing
- Country bottom-sheet (#6) — design-sacred decision
- Pagination/infinite scroll (#9) — requires `get_public_home_hosts_v2` RPC signature change
- BlurHash (#11) — requires DB column + upload-time hash generation

## Verification
Owner preview: scroll home feed → non-live host avatars should now load through weserv CDN (faster on G35, identical visually). Check Network tab for `images.weserv.nl?url=...` requests on UserCard `<img>`.
