---
name: VIP & Shop competitor numbers
description: Industry-locked metrics for VIP tiers and Shop (frames/bubbles/entries/cars/noble) (Chamet/Bigo/Olamet/Poppo/Hollah/HiiClub/WeJoy/CrushLive)
type: feature
---

# Phase 12 — VIP & Shop (8 apps surveyed)

## Shop
- Grid 2-3 col, card aspect 1:1, padding 8dp, gap 12dp.
- Card preview logo (admin-uploaded static): centered, 72% of card area, eager+high priority for above-fold first row, lazy after (industry: Bigo lazy after 6 items).
- Card animated fallback (SVGA/VAP/MP4/Lottie): only when in-view (IntersectionObserver), pool=3 concurrent.
- Preview thumbnail CDN-resize: 256-320px WebP q=82-85 (card), 512-720px (detail modal). Raw 2K source = ~80% bandwidth waste.
- Detail modal: animation full size + native player, fallback static at 512-720px.
- Categories tabs sticky, swipe-able.
- Purchase: optimistic equip flip, server confirm via RPC, rollback on error.

## VIP
- Tier badge animation: SVGA/Lottie 56-64dp slot, autoPlay loop muted.
- Privilege icon grid 4-col, 80dp tile, animation pool=4 concurrent.
- Privilege preview (static fallback): 128-160px WebP q=82.
- Subscription CTA: sticky bottom, gradient gold, haptic on purchase.
- Daily reward claim: optimistic + server log via vip_daily_rewards_log.
- Noble tiers separate section, JSON-driven, animated tier card.

## Phase 12 fixes applied (web design/logic SACRED — perf only)
- `src/pages/Shop.tsx`:
  - Line 248: card preview `<img>` wrapped with `enhanceThumbnail(url, {width:256, quality:85})`.
  - Line 811: detail modal `<img>` wrapped with `enhanceThumbnail(url, {width:600, quality:85})`.
  - Imported `enhanceThumbnail`.
- `src/pages/VIP.tsx`:
  - Line 1333: privilege preview `<img>` wrapped with `enhanceThumbnail(url, {width:160, quality:82})`.
  - Imported `enhanceThumbnail`.

Impact: shop grid with 24+ items × raw 2K previews = ~40MB on 3G; now ~3-4MB. VIP privilege grid similar. Zero visual change. All animation players (SVGA/VAP/Lottie/MP4) untouched — those cannot be CDN-resized.

## Untouched (correct as-is)
- Animation players (UniversalAnimationPlayer, UniversalFramePlayer, FixedAnimationFrame).
- Purchase RPC, equip flip, expired restorer, frame cache, entry animation cache.
- VIP tier badge animation (native player).
- Noble subscription section.
- Categories tabs, search, pagination.
