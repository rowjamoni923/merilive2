## Goal
আমাদের `Chat.tsx` + `ChatListView.tsx` কে WhatsApp / Messenger / Imo / TikTok / Bigo / Chamet / Olamet / Popo-class professional inbox-এ তুলে আনব। তিনটা phase, প্রত্যেক phase-এর আগে competitor research → gap analysis → তারপর code। Backend logic / billing / RLS-এ হাত দেব না — শুধু presentation, caching, perceived performance।

---

## Phase 1 — Instant Media (image + video) — সবচেয়ে বড় visible win

### Research first
WhatsApp / Telegram / Signal / Messenger / Chamet inbox media pipeline pattern check:
- Blurhash / LQIP placeholder before real bytes arrive
- Thumbnail (200-400px) inline, full-res only on tap
- Progressive JPEG / WebP, `decoding="async"`, off-main-thread decode
- Persistent disk cache (Cache Storage API + in-memory LRU)
- Video poster frame auto-generated, autoplay muted in viewer only

### What we ship
1. `src/utils/mediaCache.ts` — Cache Storage API wrapper. Image/video thumb URLs cached forever (immutable hash names from R2/Supabase). Second open = 0ms paint.
2. `src/components/chat/SmartImage.tsx` — drop-in `<img>` replacement:
   - Blurhash/dominant-color background instantly
   - Loads `?width=320&quality=70` thumb first, swaps to full-res on tap
   - `loading="lazy"`, `decoding="async"`, `fetchpriority` based on viewport
   - Error → small "🖼️ Tap to retry" tile (no broken-link icon)
3. `src/components/chat/SmartVideo.tsx` — poster-first, lazy-init `<video>`, only attaches `src` when visible (IntersectionObserver), `preload="metadata"`.
4. Inbox list row: if `last_message` is a photo/video/voice, show `📷 Photo` / `🎤 Voice (0:12)` / `🎬 Video` prefix (WhatsApp-style) — no broken thumbnail attempts.
5. Full-screen viewer: pinch-zoom image, swipe-down dismiss, native share via existing `nativeShare.ts`.

### Files touched
`src/utils/mediaCache.ts` (new), `SmartImage.tsx` (new), `SmartVideo.tsx` (new), `MediaUploader.tsx` (use SmartImage for previews), `UnifiedChatMessage.tsx` (swap image/video render), `ChatListView.tsx` (media-type prefix in last message).

---

## Phase 2 — Inbox List Polish (WhatsApp/Messenger-class rows)

### Research first
WhatsApp/Messenger/Chamet inbox list pattern check: pinned section on top, swipe-left for archive/mute/delete, swipe-right for read/unread toggle, typing indicator inline, double-tick read receipt, mute icon, verified badge placement, last-seen, draft prefix.

### What we ship
1. **Pinned chats section** — top of list, separator below. Long-press → Pin/Unpin. Backed by a per-user `pinned_conversations` field already in `conversations` table OR a new lightweight `user_pinned_conversations` table (will confirm during research).
2. **Swipe actions** on row (touch-only):
   - Swipe left → Archive / Mute / Delete (red)
   - Swipe right → Mark read / unread
   - Spring animation, haptic on threshold
3. **Row enrichment**:
   - `typing…` italic green when other party is typing (Realtime presence already in place)
   - Double-tick (gray=delivered, blue=seen) instead of just timestamp
   - 📷 / 🎤 / 🎬 / ↩ Draft prefix in last message
   - Mute 🔕 icon, pin 📌 icon right of timestamp
4. **Search upgrade**: search inside message content (last 30 days) using existing `messages` table, debounced 250ms, highlight match.
5. **Empty state**: branded illustration (not generic icon), CTA "Find people to chat with".

### Files touched
`ChatListView.tsx` (rewrite row + add pinned section + swipe gesture), `chatTypes.ts` (add `is_pinned`, `is_muted`, `typing`, `last_message_type` fields), `Chat.tsx` (load pin/mute state, typing presence aggregator), possibly one migration for `user_pinned_conversations` if no column exists.

---

## Phase 3 — In-thread Chat Polish

### Research first
WhatsApp/Telegram/Messenger thread pattern check: long-press menu (reply, react, copy, forward, delete, info), swipe-right-to-reply, reply quote bubble, message reactions (6 emoji + custom), pinch-zoom image viewer with swipe-between-media gallery, voice waveform with playback scrubber, link previews.
- 2026-06-26 regular text bubble audit: WhatsApp-style timestamp must live inside the bubble bottom-right, with short messages sharing the last line and long messages reserving only end-of-line space (StackOverflow references: “Whatsapp Message Layout - How to get time-view in the same row”, “CSS: Tough time imitating Whatsapp alignment in message bubble”). Messenger research also confirms state/read indicators must be visually tied to the message bubble, not floating as a separate stacked row (Ishadeed, “Facebook Messenger's Chat Bubble”).
- Current gap found in `DirectChatBubble`: message body rendered as a block, then timestamp used `float-right flex`; float + flex caused short messages like “hi” to stack time/checks vertically and look non-native. Fix target: relative bubble, inline text flow, reserved meta spacer, absolute bottom-right timestamp/read receipt.

### What we ship
1. **Long-press menu** — bottom sheet with Reply / React / Copy / Forward / Delete / Info. Haptic on open.
2. **Swipe-right-to-reply** — drag bubble right past threshold → opens composer with quoted reply chip.
3. **Reactions bar** — 6 quick emoji + "+" for picker. Reactions render as small chip below bubble, tap to toggle.
4. **Reply quote rendering** — colored vertical bar + original sender + preview, tap → scroll to original.
5. **Media gallery viewer** — when tapping any photo in a thread, opens a horizontal pager of ALL photos in that thread (Telegram-style), pinch-zoom, swipe to dismiss, share/save buttons.
6. **Voice player upgrade** — already have `VoiceWaveform.tsx`; add scrub-by-drag, 1x/1.5x/2x speed, continue-in-background.
7. **Link previews** — first http link in a message → fetch OG metadata via existing edge fn (or add one), render compact preview card.
8. **System bubbles** (joined group, you blocked, etc.) → centered chip style, no avatar.

### Files touched
`UnifiedChatMessage.tsx`, `MessageBubbleWrapper.tsx`, `Chat.tsx`, `ChatGiftPanel.tsx` (reuse picker pattern), new `MediaGalleryViewer.tsx`, new `LongPressMenu.tsx`, new `LinkPreviewCard.tsx`, possibly new `link-preview` edge function for OG scraping.

---

## Non-goals (this overhaul will NOT touch)
- Backend billing, gift economics, RLS, edge functions unrelated to media/OG
- Group chat business logic (member rules, owner perms) — already shipped
- Android-native plugins (camera, livekit, gift animations) — sacred per memory
- Push notification delivery pipeline — already polished

## English-only UI strings rule
All new labels, toasts, placeholders, errors → English. Bangla শুধু আমাদের chat-এ।

## Phasing & verification
- Each phase shipped independently, owner-account self-test before claiming done
- Performance verification: 500-message thread + 50-conversation inbox on throttled 4x CPU, target 60fps scroll, image first-paint < 200ms on warm cache
- No regression to existing flows (gifts, voice, group, e2ee)

## Approval needed
Confirm phase order (suggest Phase 1 → 2 → 3 — instant media gives biggest perceived "professional" jump first). Reply "start phase 1" and আমি Phase 1 research → implement একসাথে শুরু করব।
