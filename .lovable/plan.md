## Goal
Make VAP (MP4+alpha), SVGA, Lottie, WebP — all professional animation formats — work end-to-end across **Gifts**, **Entry Animations** (entry effects / entry banners / entry name bars / vehicle entrances), and **Shop items** (avatar frames / role frames / chat bubbles / party backgrounds). One unified upload system in admin panel, one unified player on the user side. Chamet / Bigo / MICO standard.

## What we already have (re-use, don't rebuild)
- `VAPPlayer.tsx` — VAP (MP4 + vapc.json) renderer with alpha support
- `SVGAPlayer.tsx` + `SVGAPlayerWithAudio.tsx`
- `UniversalAnimationPlayer.tsx` (auto-detect SVGA/Lottie/MP4/WebP/GIF) — used by gifts already
- `UniversalFramePlayer.tsx` — used by frames/shop
- `lucide` storage, `gift-media` / `gift-animations` buckets
- Tables: `gifts`, `avatar_frames`, `role_frames`, `chat_bubbles`, `entry_effects`, `entry_banners`, `entry_name_bars`, `vehicle_entrances`, `shop_items`, `party_room_backgrounds`

## What's missing (this is the work)

### 1. Database — single migration
Add 2 columns to every animation-bearing table:
- `animation_format` text — enum-like: `svga | vap | lottie | webp | png | gif | mp4`
- `animation_config_url` text — for VAP only (`vapc.json` path)

Tables touched: `gifts`, `avatar_frames`, `role_frames`, `chat_bubbles`, `entry_effects`, `entry_banners`, `entry_name_bars`, `vehicle_entrances`, `shop_items`, `party_room_backgrounds`, `level_animations`.

Add `CHECK` constraint that when `animation_format='vap'` then `animation_config_url IS NOT NULL`.

Existing RLS / GRANT untouched.

### 2. Shared admin upload component
New `src/components/admin/AnimationUploader.tsx`:
- Format dropdown: SVGA / VAP / Lottie / WebP / PNG / GIF / MP4
- Single file picker for normal formats
- When VAP selected → second file picker for `vapc.json` (mandatory)
- Live preview using `UniversalAnimationPlayer`
- Size limits per format (VAP ≤ 8MB, SVGA ≤ 3MB, Lottie ≤ 500KB, WebP/PNG/GIF ≤ 2MB, MP4 ≤ 5MB)
- Uploads to existing `gift-animations` bucket via existing storage flow
- Returns `{ animation_url, animation_config_url, animation_format }` to parent

### 3. Wire uploader into admin pages
Drop the `AnimationUploader` into:
- `AdminGifts` (gift create/edit modal)
- `AdminEntryEffects` / `AdminEntryBanners` / `AdminEntryNameBars` / `AdminVehicleEntrances`
- `AdminAvatarFrames` / `AdminRoleFrames` / `AdminChatBubbles`
- `AdminShopItems` / `AdminPartyBackgrounds`

Save the three returned fields. Existing fields/columns untouched.

### 4. Sender side — make every player VAP-aware
- `UniversalAnimationPlayer`: when `format='vap'` route to `VAPPlayer` with `configUrl` prop
- `UniversalFramePlayer`: same routing
- `FullScreenGiftAnimation`, `FlyingGiftAnimation`, `EntranceAnimation`, `EntryBarAnimation`, `UnifiedEntryAnimation`, `VehicleEntranceAnimation`, `Shop.tsx`, frame previews — already use the universal players, so they inherit the fix automatically. We only patch the 2 universal players + verify the data prop is passed through.

### 5. VAPPlayer hardening
Current `VAPPlayer.tsx` plays the MP4 but expects `configUrl`. Verify:
- Accepts both inline config object and remote URL
- Falls back gracefully (renders MP4 as-is) if config missing
- GPU-accelerated, autoplay muted, loops controllable
- Releases video element on unmount (memory leak protection for low-end Android — your 10k Play Store users)

### 6. APK rebuild?
**No.** Everything is pure JS/TS/CSS + DB columns. No native plugin change, no Capacitor sync. Existing APK picks it up via Lovable hot-update on next app open.

## What this does NOT do
- Doesn't change pricing, RLS, or any gift/shop business logic
- Doesn't touch LiveKit, camera, beauty, billing
- Doesn't migrate existing rows — they keep working as-is (format defaults to auto-detect from URL extension, same as today)

## After deployment, designer workflow
1. Open admin → any animation section (Gifts / Entry / Shop)
2. Select format = VAP
3. Upload `gift.mp4` + `gift_vapc.json` (designer exports both via Tencent's vap-tool)
4. Preview plays inside the modal
5. Save → instantly live on every user's app, no APK rebuild

## Approve to proceed?
If yes I'll execute in this order:
1. DB migration (single file)
2. `AnimationUploader.tsx` + tighten `VAPPlayer.tsx`
3. Patch `UniversalAnimationPlayer` + `UniversalFramePlayer` routing
4. Wire uploader into the ~10 admin pages (parallel edits)
5. Type-check verify
