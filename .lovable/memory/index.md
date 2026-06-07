# Project Memory

## Core
Chamet-class live streaming app. NEVER use polling/visibility-refresh in place of realtime. LiveKit for in-room, Supabase Realtime for everything else — both stay. Supabase = full backend (Auth/DB/Storage/Edge), never migrate to VPS. **LiveKit SFU ALREADY self-hosted on user's VPS at wss://livekit.merilive.xyz — NOT LiveKit Cloud.** No migration work needed. Always re-verify LIVEKIT_URL before discussing migration/cost.
**VPS work DEFERRED** — do NOT propose VPS docker/ssh/config tasks unless user explicitly asks. Pure Lovable code (React/edge fn/DB) is fine. See mem://preferences/vps-deferred.
**🚫 WEB GIFT animation components remain FORBIDDEN** (FullScreenGiftAnimation, FlyingGiftAnimation, GiftEmojiAnimation, VAPPlayer, gift sound, gift panel, public-gift-media). Gift = Android-native only (Pkg438). **✅ WEB ENTRY animation components UNBLOCKED 2026-06-07** — UnifiedEntryAnimation, EntryBarAnimation, useEntryAnimations, flying name, welcome chat message are now permitted (silent on web). See mem://constraints/never-touch-gift-entry-animations.
**🌐 ENGLISH-ONLY UI STRINGS** — All toasts/labels/messages/errors in app code MUST be English, never Bangla. National app. Reply to user in Bangla in chat but never in code. See mem://preferences/english-only-ui-strings.

## Memories
- [Phase 3 Private Call audit](mem://features/phase3-private-call-audit) — DONE 2026-06-06.
- [Pkg438 Native gift+entry animation Phase A](mem://features/pkg438-native-gift-entry-animation-phase-a) — DONE 2026-06-06. Android-native foundation for gift + entry. Phase B (JS dispatcher) still pending.
- [Pkg425 Trader wallet history + instant UI](mem://features/pkg425-trader-wallet-history-instant) — DONE 2026-06-06.
- [Pkg424 instant-play warmup](mem://features/pkg424-instant-play-warmup) — DONE 2026-06-05.
