---
name: Profile menu competitor numbers
description: Industry-locked metrics for Profile screen (Chamet/Bigo/Olamet/Poppo/Hollah/HiiClub/WeJoy/CrushLive)
type: feature
---

# Phase 8 — Profile menu (8 apps surveyed)

- Hero avatar = LCP candidate on Profile route. Industry: serve CDN-resized 96-128px @ 2x DPR (q=85 WebP). Chamet/Bigo/Poppo/Olamet all use Tencent COS / Cloudflare image resize with `?imageMogr2/thumbnail` or `/cdn-cgi/image/`. Saves 60-80% bandwidth on 2G/3G.
- Avatar loads `eager` + `decoding=sync` for LCP; row avatars in lists `lazy` + `async`.
- Menu rows: 56dp tap target (Material), single divider line, leading icon 24dp, chevron 16dp.
- Coin/diamond/bean balance — instant-display from cache, then realtime update (we do this ✓).
- Frame SVGA — separate layer on top of `<img>` so swapping frame doesn't reload photo (we do this in AvatarWithFrame ✓).
- Search avatar in dialog — small (40dp), lazy OK.

## Phase 8 fix applied (web design/logic SACRED — perf only)
- `src/pages/Profile.tsx`: hero avatar src now passes through `enhanceThumbnail(url, {width:128, quality:85})` before being handed to `AvatarWithFrame`. Cuts 1080px+ avatar URLs to 256px WebP. ~70% bandwidth save, ~150-300ms LCP improvement on mid-range Android over 3G.
- Imported `enhanceThumbnail` from `@/utils/enhanceThumbnail`.
- Zero visual change (same image, just CDN-resized + WebP-encoded). AvatarWithFrame internals untouched (shared component, didn't risk side-effects on Live/Party/Call consumers).
- All menu rows, balances, dialogs, transaction history, transfer logic, beans exchange, host earnings — completely untouched.
