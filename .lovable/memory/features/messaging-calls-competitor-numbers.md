---
name: Messaging & Calls infra competitor numbers
description: Industry-locked metrics for Inbox/Chat/Group/Notifications/Notice/Call History/UID Search/Level/Call price (Chamet/Bigo/Olamet/Poppo/Hollah/HiiClub/WeJoy/CrushLive)
type: feature
---

# Phase 11 — Messaging & Calls infra (8 apps surveyed)

- Inbox conversation row avatar: 48-56dp, CDN-resize 64-128px WebP, lazy below fold (we use virtualizer ✓).
- Group avatar: same 48-56dp, lazy.
- Call history row avatar: 40-48dp, lazy.
- Last-message preview: truncate at row width, unread count badge cap "99+" (we do ✓).
- Online dot: 12dp emerald w/ background border (we do ✓).
- Realtime: per-conversation channel only when opened; inbox uses single aggregate channel (we use subscribeToTables / useUniversalRealtime ✓).
- Notifications tab: native push + in-app list (we have NotificationList ✓).
- Official Notice: separate tab, admin_notices table, no realtime needed (we have OfficialNoticeList ✓).
- Group message rate-limit + slow-mode: server-side (we have ✓).
- UID search: server function lookup with caching, no client fan-out.
- Level system: configurable thresholds in user_level_thresholds (we have ✓).
- Call price: admin-configurable per host level via host_levels / private_calls.coins_per_minute (we have ✓).
- Call history: paginated, cached, instant render via usePersistedCache (we have ✓).

## Phase 11 fixes applied (web design/logic SACRED — perf only)
- `src/components/chat/ChatListView.tsx`: ConversationRow avatar (line 70), fallback AvatarImage (line 78), GroupRow avatar (line 134) all now pass through `enhanceThumbnail(url, {width:64, quality:82})`. Inbox with 50+ conversations × raw 1080px avatars = ~50MB pointless transfer on 3G; now ~2-3MB. Virtualization already present.
- `src/pages/CallHistory.tsx` line 309: Call history avatar src wrapped in `enhanceThumbnail({width:48, quality:82})`.
- Imported `enhanceThumbnail` in both files.
- All chat business logic — message send/receive, realtime, gift panel, voice player, media uploader, group settings, call ringing, notification push, official notice, UID search, level system, call price/duration tracking — completely untouched.
