---
name: Party/Discover industry numbers
description: Industry-locked specs for Party/multi-host discovery page (Agora/Bigo/Poppo/WePlay/M3/Android). Reference before any Discover.tsx code/design change.
type: feature
---

# Party Discover — Industry-Locked Numbers

Sourced 2026-06-09 from Agora docs, Bigo/Poppo/WePlay teardowns, M3, Android Paging 3, LiveKit SDK.

## Quick reference
```
Grid:              2 columns on 360dp (Agora spanCount=2, padding 7.5dp)
Card ratio:        Video=9:16 portrait; Audio=1:1 square (mic-seat grid); Game=portrait + game logo badge
Card width:        ~161-164dp at 360dp viewport
Featured card:     span=2 full-width OR top-pinned with gold gradient border + pulse
Sort default:      Trending (heat score: viewers + gift rate + join rate last 5min)
Country filter:    Horizontal chip row (NOT dropdown/bottom-sheet) — 8-12 visible, "All"+"Nearby" first
Search debounce:   300ms (djust.org / Rocket.Chat / industry standard)
Search min chars:  2
Recent searches:   Last 5-10 in storage
Pull-to-refresh:   80dp threshold (M3 PullRefreshDefaults), haptic CONTEXT_CLICK at trigger
Page size:         20 items (Agora Channel List default)
Initial load:      2× page (40)
Prefetch:          3 items from bottom
ExoPlayer pool:    3 instances, init on app-start background thread (saves 200ms creation cost)
Preview trigger:   >50% visible + 500-800ms dwell, muted by default
Prewarm gain:      exoPlayer.prepare() pre-viewport → +19% videos <250ms start
RTC join target:   <500ms first-frame after tap (via Agora preloadChannel/LiveKit token warmup)
Pulse dot:         8dp green #00C853, scale 0.8→1.0, 1.2s infinite
Speaking ring:     2dp accent, audioLevel 0.0-1.0 drives opacity
Skeleton:          6 cards (3×2), 1.5s shimmer L→R
```

## Party type visual distinction (industry pattern)
- **Video Party** — full video thumbnail + camera icon top-left
- **Audio Party** — 4×2 mic-seat avatar grid + mic icon, purple/violet tint
- **Game Party** — game logo + colored label strip + "X/N seats filled"

## Game types observed (WePlay/GameParty/Poppo/Lama)
Space Werewolf, Ludo, Truth or Dare, UNO/UMO, Carrom, Domino, Teen Patti, Bingo, Drawing/Pictionary, Jackaroon

## Sources
1. Agora Preload Channels / VideoLoaderAPI — docs.agora.io/en/interactive-live-streaming/best-practices/preload-channels
2. Agora Channel List API — docs.agora.io/en/video-calling/channel-management-api
3. Material 3 Cards + PullRefreshDefaults (80dp)
4. Android Paging 3 (PagingConfig prefetchDistance)
5. ProAndroidDev — Reddit ExoPlayer (pool=3, 200ms creation, 50% visibility, +19% prewarm)
6. LiveKit ParticipantItem.kt (isSpeaking, audioLevel)
7. Poppo Live Party Rooms guide (bittopup.com)
8. Bigo Multi-Guest Room guide
9. WePlay / GameParty Google Play listings
10. djust.org search-as-you-type 300ms

## Phase 5 status (2026-06-09)
- ✅ Card host-avatar CDN-resize 180×2dpr=360px q=80 (saves ~70% bandwidth on 2G/3G)
- ✅ Native Glide prefetch URL aligned with rendered CDN URL (100% cache hit)
- ✅ Entry-preview hero CDN-resize 400px q=82 + eager+sync+fetchpriority=high (LCP fix)
- ✅ Entry-preview avatar CDN-resize 64×2=128px
- ✅ Existing: 1.5s realtime debounce, NativePullToRefresh, video/audio/game type icons+colors, game emoji map, country flag, room_code chip
- ⚠️ Deferred (need bigger work / design decisions, not 1% gaps):
  - Search debounce currently absent (instant filter) — industry 300ms, low-impact for client-side filter, skip unless complaint
  - ExoPlayer card-preview pool — would need native plugin work + dwell logic
  - Skeleton shimmer (currently spinner / null) — minor UX polish
  - Hot keyword chips below empty search
  - "Speaking now" audio-level ring on audio-party cards
  - Featured/Premium card boost UX (animated border / span=2)
  - Page size / infinite scroll — currently loads all rooms client-side; needs RPC change
