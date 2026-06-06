---
name: Pkg438 Native gift+entry animation Phase B
description: JS dispatcher shim wiring Supabase Realtime gift_transactions + stream_viewers + party_room_participants into NativeGiftAnimation / NativeEntryAnimation plugins on Android. Additive, flag-gated, web pipeline untouched.
type: feature
---
# Pkg438 Phase B — JS Dispatcher Shim (DONE 2026-06-06)

## What ships
- `src/native/giftAssetCache.ts` — resolves `gift_id` → `{url,type,soundUrl,coins}` via cached `gifts` row lookup. Picks svga > lottie > animation_url > icon_url and maps `animation_format`/`detectProfessionalAnimationFormat` → `vap|svga|lottie|mp4|image`. PAG/unknown → skip (WebView handles).
- `src/native/entryAssetCache.ts` — resolves user → equipped entry banner / noble entrance. Priority: noble=500, VIP banner=300, level-banner=min(level,200). 60s profile TTL.
- `src/hooks/useNativeGiftDispatcher.ts` — Supabase Realtime INSERT on `gift_transactions` filtered by URL-derived stream_id (`/live/:id`) or room_id (`/party/:id`). Window event escape hatch: `merilive:native-gift-dispatch` with `{giftId,quantity,...}`.
- `src/hooks/useNativeEntryDispatcher.ts` — Realtime INSERT on `stream_viewers` (uses `viewer_id`, not user_id) and `party_room_participants` (`user_id`). 30s per-user de-dupe, skip self. Window event: `merilive:native-entry-dispatch` with `{userId,force?}`.
- `src/components/common/DeferredAppHooks.tsx` — mounts both hooks (post-auth, non-admin routes).

## Guarantees
- All four files are **net-new**; ZERO edits to forbidden web components (FullScreenGiftAnimation, FlyingGiftAnimation, GiftEmojiAnimation, VAPPlayer, UnifiedEntryAnimation, EntryBarAnimation, useEntryAnimations, PremiumEntryAnimation).
- Full no-op when: flag OFF (default), `Capacitor.getPlatform()!=='android'`, or plugin `isAvailable()` returns false.
- Web preview and iOS unaffected. Existing WebView gift/entry pipeline keeps running in parallel.
- Schema-correct: `gift_transactions.gift_id/quantity/stream_id/room_id/sender_id/receiver_id`, `stream_viewers.viewer_id/stream_id`, `party_room_participants.user_id/room_id`, `profiles.equipped_entry_banner_id/equipped_noble_card_id/current_vip_tier_id/vip_expires_at`, `entry_banners.image_url/animation_url/sound_url/animation_format`, `noble_cards.entrance_animation_url/animation_url/animation_format`, `gifts.{svga_url,lottie_url,animation_url,icon_url,sound_url,animation_format,animation_type}`.

## How to enable (per device)
```js
localStorage.setItem('merilive:nativeGiftAnim','on');
localStorage.setItem('merilive:nativeEntryAnim','on');
```
Requires Pkg438 Phase A APK rebuild. Without Phase A natives, plugin reports unavailable → no-op.

## Next (Phase C)
Real-device QA matrix, LeakCanary, 60fps lock check, GPU overdraw, optional opacity-mute of WebView gift overlay when native confirms `gift:start`, and the Reels heart-burst overlay.
