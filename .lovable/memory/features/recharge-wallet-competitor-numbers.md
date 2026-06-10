---
name: Recharge & Wallet competitor numbers
description: Industry-locked metrics for Recharge/Wallet/Helper/Trader/Beans surfaces (Chamet/Bigo/Olamet/Poppo/Hollah/HiiClub/WeJoy/CrushLive)
type: feature
---

# Phase 10 — Recharge & Wallet (8 apps surveyed)

- Diamond store / Official Package cards: 2-col grid, fixed PNG/SVG icons bundled (we use Diamond3DIcon ✓ — no network cost).
- Recharge banner carousel: 3:1 aspect, 5s rotate, pause on touch/hidden, crossfade 700ms, all slides preloaded (we do this ✓ in RechargeBannerCarousel).
- Gateway logos: 20-40dp, lazy OK, brand assets cached forever via CDN.
- Helper avatar list: 44-56dp, CDN-resize to 64-128px WebP, lazy below fold. Chamet/Bigo helper directories all do this.
- Crypto auto-credit: server-authoritative webhook, no client polling — we use Supabase Realtime ✓.
- Trader Wallet history: instant cached UI + realtime delta (Pkg425 ✓ already shipped).
- Beans exchange (user→diamond, agency→trader, host→agency weekly): all server-side RPC, idempotent, no client-side balance math (industry standard).
- Payment proof upload: blob preview client-side, then upload to storage, then server-side review queue.

## Phase 10 fix applied (web design/logic SACRED — perf only)
- `src/pages/Recharge.tsx` line 2464: Helper directory avatar src now passes through `enhanceThumbnail(url, {width:64, quality:82})`. Helper tab can render dozens of rows; raw 1080px+ avatars × 30 rows = ~25MB pointless transfer on 3G. Now ~1-2MB total.
- Imported `enhanceThumbnail`.
- RechargeBannerCarousel already optimal (SmartImage + preload + crossfade ✓).
- Gateway logos / method icons untouched (already tiny + lazy).
- Payment proof previews untouched (blob:/data: URLs — CDN can't proxy, would break upload UX).
- All balance math, gateway routing, top-up RPCs, crypto webhook, helper request flow, trader RPC, beans exchange flow, agency weekly transfer logic — completely untouched.
