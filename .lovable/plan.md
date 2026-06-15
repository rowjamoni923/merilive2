## Goal
Bring the LiveStream / PartyRoom / PrivateCall in-room overlay to Bigo/Chamet-grade by fixing the **2 warning banners' placement**, **chat-zone geometry**, **entry-animation + join-row ordering**, **instant gift counting**, and **viewer header** — without touching the gift/entry animation engines themselves (those follow the locked rules).

## Current state (audit)

Read from code + your reference video frames (5, 10, 15, 30, 40, 45):

| Surface | Pro pattern (video) | Our current code | Gap |
|---|---|---|---|
| Warning + Welcome banner | True TOP of screen, compact yellow pill, ONE line, scrolls below status bar | Rendered inside `RoomChatOverlay` top — but overlay itself is bottom-anchored, so warnings appear **right above bottom buttons** | Detach from chat column → move to true top zone |
| Chat list | bottom-LEFT, ~60% width, 5–7 rows visible, ends ~12% above bottom buttons (never overlaps) | Same anchor but warnings eat top of zone; `maxHeight` not always clearing the action bar | Reserve real estate above bottom action bar |
| Join messages | Inline chat row with badge ("Lucky_ joined the room ✨") in same scroll list as chat | Already inline via `JoinNotificationItem` ✅ | OK — keep |
| Entry animation order | Fires the **instant** user joins (top-anchored sliding banner), join chat row appears in parallel | `useUnifiedEntryDispatcher` already does this ✅ | OK — verify timing only |
| Gift in chat | Instant "X send Y 🎁 x1" row, combo counter updates in place (x1 → x12 → x77) | Inline row exists; combo aggregation per-sender per-gift needs verification | Verify combo merge window |
| Viewer header | Top: host avatar capsule + live viewer count + scrolling avatar stack of recent viewers | `UnifiedViewerPanel` + viewerCount exist; recent-viewer avatars rendered in header ✅ | OK — verify scroll/refresh |
| Scroll-to-bottom FAB | Present in Bigo (down arrow above input) | Already present in `ScrollToBottomButton` ✅ | OK |

**Root issue user is complaining about: warning banners sitting above bottom buttons.** This is real — confirmed in `RoomChatOverlay.tsx` lines 499–518.

## Changes

### 1. Detach warnings from chat overlay (the main complaint)
- Remove `RoomWelcomeBanner` + `WelcomeMessage` from the **top of `RoomChatOverlay`**.
- Add a new `RoomTopNoticeStack` slot rendered by the parent screens (LiveStream / PartyRoom / ActiveCallScreen) **at the true top of the room**, below the header avatar bar.
- Style: single-line pill, `bg-black/35 backdrop-blur-sm`, auto-collapses after 6s for welcome (admin rule banner stays sticky like pro apps).

### 2. Chat zone geometry
- `RoomChatOverlay` `maxHeight` formula → `min(45vh, viewport - header - bottomBar - 16px)` so chat **never** runs into the action bar.
- Width clamp: `max-w-[68%]` mobile (matches video frame 5/45 measurement).
- Keep `flex-col-reverse` (newest at bottom) — already correct.

### 3. Verify + tighten gift instant counting
- `gift_combo_window` table already exists. Confirm `ChatMessageItem` merges same `senderId+giftId` within combo window into one row with live `xN` count instead of stacking new rows.
- Add a defensive client-side dedup if server window misses.

### 4. Verify entry-animation + join-row timing
- `useUnifiedEntryDispatcher` already fires animation on viewer-join LiveKit event. Add a console-traced timing assertion (animation start ≤ 200ms from join, join chat row ≤ 500ms) — log only, no UX change.

### 5. Apply same overlay contract to PartyRoom + ActiveCallScreen
- Same `RoomTopNoticeStack` slot wired into both.
- Same chat geometry props passed to `RoomChatOverlay`.

## Out of scope
- No edits to FlyingGiftAnimation / FullScreenGiftAnimation / EntryBarAnimation engines (locked).
- No DB schema changes (uses existing `room_welcome_messages`, `stream_chat`, `party_room_messages`, `gift_combo_window`).
- No backend / edge-function changes.
- VPS work deferred (per project memory).

## Files

```text
src/features/shared/room/RoomChatOverlay.tsx          (edit — remove top notice slot)
src/components/room/RoomTopNoticeStack.tsx            (new — true-top notice container)
src/components/room/RoomWelcomeBanner.tsx             (edit — auto-collapse welcome after 6s)
src/pages/LiveStream.tsx                              (edit — mount RoomTopNoticeStack at top)
src/pages/PartyRoom.tsx                               (edit — mount RoomTopNoticeStack at top)
src/components/call/ActiveCallScreen.tsx              (edit — mount RoomTopNoticeStack at top)
.lovable/plan.md                                      (edit — record audit + decisions)
```

## Verification
- Owner test account (smdollarex923@gmail.com) → enter own live → confirm yellow warning at TOP (not above bottom buttons), chat ends above action bar, send gift x12 → combo merges into ONE row counter.
- Repeat in Party Audio + Private Call.
- APK rebuild **not** required (pure React/CSS).

## Open question for you before I start
The reference video shows the warning at the **true top** (just under status bar / above host avatar capsule). Our app has the host header capsule at top — should the warning go (a) **above** the host header capsule, or (b) **below** the header but above the video? Bigo uses (b). Confirm and I'll execute.
