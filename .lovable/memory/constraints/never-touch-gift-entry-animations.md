---
name: Web gift/entry animation block — LIFTED for entry animations
description: As of 2026-06-07 user explicitly authorized web-side viewer ENTRY animation work (entry bar, flying name, welcome message, level/VIP banner). Gift animation web block remains in effect.
type: constraint
---
## Status: PARTIALLY LIFTED (2026-06-07)

User explicitly overrode the entry-animation portion of this rule to fix professional viewer-entry UX (Chamet-style). New permissions:

### ✅ NOW ALLOWED on web (live + party rooms)
- Viewer-join welcome chat message (system message in stream chat)
- Entry name bar / level badge / VIP/Noble banner above message input
- Flying name animation for high-level/VIP entries
- EntryBarAnimation, UnifiedEntryAnimation, useEntryAnimations — touch & fix permitted
- Realtime subscription for join/leave events on `stream_viewers` and `party_room_participants`

### 🚫 STILL FORBIDDEN on web
- **Gift animations** — FullScreenGiftAnimation, FlyingGiftAnimation, GiftEmojiAnimation, VAPPlayer, gift sound, gift panel, public-gift-media. These remain web-forbidden; only Android-native pipeline (Pkg438) handles gifts.
- **Entry SOUND on web** — keep entries silent on web; sound only on Android via Pkg438 GiftAudioMixer.

### Why the change
User repeatedly reported viewers don't see entry effects → unprofessional vs Chamet/TikTok Live. Animation on web (silent, CSS/Motion only, no decoder) does not conflict with the original camera-conflict / OOM reasons that triggered the gift block. Gifts stay native-only because of decoder cost.
