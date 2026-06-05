---
name: Pkg425 VAP/MP4 instant fullscreen
description: Pkg424 follow-up. Cache API persistence + higher warmup caps so VAP/MP4 play instantly like SVGA. Pure additive warmup — playback flow untouched.
type: feature
---
DONE 2026-06-05. Follow-up to Pkg424 instant-play warmup. User mandate: VAP/MP4
animations must play instant + fullscreen on first frame just like SVGA does
(SVGA uses prewarmPopularAssets + Cache API "svga-binary-v1" → 0ms cold start).

**Two changes, both purely additive (NO change to VAPPlayer/EntryVAPPlayer/render
loop/shader/audio/preload/<video> element):**

1. `src/utils/vapWarmup.ts` — added persistent **Cache API layer** mirroring
   SVGA pattern. New cache `vap-binary-v1`. `warmupVapUrl` now:
   - Checks `caches.match(url)` first; if hit, re-primes HTTP cache via
     `clone().arrayBuffer()` then marks done (0ms second-session start).
   - On network fetch, tees ArrayBuffer into `cache.put(url, Response)` when
     within byte budget (HIGH priority warms get 32 MB budget, default 16 MB,
     bumped from 12 MB). `persist` option default `true`; callers can opt out.
   - `MAX_DONE` bumped 400→800 to cover full popular catalog.
   - `warmupSelectedVapUrls` + `warmupEntryAnimationPayload` both persist now.

2. `src/utils/giftAnimationPrewarm.ts` — warmup volume bumped to match SVGA's
   prewarmPopularAssets aggressiveness:
   - **App boot** (`prewarmGiftAnimations`): top 3 → **top 15** videos get
     HIGH-priority persistent warm; tail 25 get low-priority HTTP-cache warm
     (was: top 3 only).
   - **Gift panel open** (`prewarmGiftAssets`): top 2 → **top 10** videos get
     HIGH-priority persistent warm; tail 20 low-priority.

**Constraint preserved:** mem://constraints/never-touch-gift-entry-animations
still applies for shaders/render-loop/audio. Only preload+warmup +
warmup-storage are permitted. NO files touched besides vapWarmup.ts +
giftAnimationPrewarm.ts. NO change to VAPPlayer.tsx, EntryVAPPlayer.tsx,
FullScreenGiftAnimation, FlyingGiftAnimation, GiftEmojiAnimation,
UnifiedEntryAnimation, EntryBarAnimation, useEntryAnimations, PremiumEntryAnimation.

**Result:** Popular VAP/MP4 gift + own entry animation now plays instantly
on first frame (HTTP cache + Cache API double-buffered) and survives reload
(persistent Cache API), matching SVGA cold-start behaviour.
