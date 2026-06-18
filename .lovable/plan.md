# Phase 4 — Party Room Mobile-First Polish

Presentation-only pass on the Party Room surface, mirroring the Phase 5 workflow (research → read → polish → verify). Business logic, LiveKit wiring, gift/entry-animation pipelines, and Android-native plugins all stay untouched. English-only strings, design-token usage, safe-area + thumb-zone respected.

## Research summary (Chamet · Bigo · Olamet · Poppo · WeJoy · ZEGOCLOUD UIKit ref.)

| Pattern | Industry standard | Our current state | Gap |
|---|---|---|---|
| Seat grid | 1+8 / 1+11, host top-center larger | 1+8, host center-bigger ✅ | None |
| Speaking ring | Dual pulse, ≤3 concurrent, brand accent | Dual emerald/cyan blur ring ✅ | None |
| Header | Host pill (L) · viewer pill (R) · top-3 gifters | Already implemented ✅ | None |
| Bottom bar | Max 5, thumb-zone, safe-area | Game · Gift · Join/Seat · More + hero gift ✅ | None |
| Chat overlay | **Always-visible** floating bubbles (bottom-left ~65% width, 5–7 lines, auto-fade), tap to expand | Modal slide-up only — no passive overlay | **YES — biggest gap** |
| Long-press seat (host) | Action sheet: Mute · Move · Transfer · Kick seat · Kick room · Lock | Sheets exist (`EmptySeatHostActionsSheet`, `HostModerationSheet`) — coverage uneven | Audit + unify |
| Gift combo banner | Left side, 120×56, slides in, 4s | `BigoStyleJoinBanner` + `FlyingGiftAnimation` — positions OK | Verify z-index only |
| CreateParty form | Bottom-sheet-style mobile form, sticky CTA, thumb-zone | 1150-line page-style form | Mobile polish |

Sources: ZEGOCLOUD UIKit seat/menu docs, Bigo 12-seat guide, livecalls.uk vertical layout guide, Tencent TRTC seat APIs.

## Execution order

### 4A · Passive floating chat overlay (highest impact)
- New presentational component `PartyPassiveChatOverlay.tsx`: bottom-left, ~65% width, 5–7 message tail of existing chat state, per-bubble `rgba(0,0,0,0.45)` background, slide-in-from-left + fade-out after 6 s, tap to open existing `ChametStyleChatPanel`.
- Wire into `PartyRoom.tsx` next to `ChametStyleChatPanel` — same message source, no new state, no new query, no realtime change.
- Mute button + chat input affordance stay where they are; this is a read-only ambient layer.

### 4B · Host long-press seat action sheet
- Audit `ChametStyleSeatGrid` → confirm long-press routes occupied seats into `HostModerationSheet` and empty seats into `EmptySeatHostActionsSheet`.
- If a path is missing, add long-press handler that calls existing host functions (mute / kick / lock / transfer) — wiring only, no new RPC, no schema change.
- Add lock-icon overlay on locked seats if not already shown.

### 4C · CreateParty.tsx mobile-first polish
- Hero section: room name + cover thumbnail picker, big preview tile.
- Mode selector as segmented control (Audio / Video / Game) instead of stacked cards.
- Seat-count picker as horizontal chips (4 / 6 / 8 / 12).
- Settings group: privacy, password, region — iOS-style grouped rows with right-chevron drilldown sheets.
- Sticky bottom CTA "Start Party" pinned to safe-area, full-width gradient.
- Preserve every existing handler / mutation / validation.

## Per-phase workflow
1. **Read** current implementation in full.
2. **Polish** — presentation only; reuse existing components and tokens; English strings; no hardcoded colors that bypass tokens beyond what's already used.
3. **Verify** — tsc passes; spot-check at preview URL with the owner test account (`smdollarex923@gmail.com`).
4. **Stop & confirm** before next sub-phase.

## Non-goals
- No LiveKit / signaling / realtime changes.
- No edits to FlyingGiftAnimation, UnifiedEntryAnimation, EntryNameBarAnimation, VAP, SVGA, Lottie, or any Android-native plugin.
- No schema, migration, edge function, or RLS change.
- No translation / Bangla strings.
- No camera, beauty, or sticker pipeline edits.

## Starting now
Phase 4A (passive floating chat overlay) kicks off as soon as you ack this plan.

## 4D · Gift reliability hotfix — 2026-06-18

### Research summary
- Agora's virtual gifting guidance separates realtime gift signaling from the payment/update flow so room participants receive the gift event immediately: https://docs-legacy.agora.io/en/Real-time-Messaging/faq/rtm_gift_sending
- Tencent TUILiveKit documents virtual gifts as a dedicated live-room interaction surface, reinforcing that gift playback must be non-blocking and room-native: https://intl.cloud.tencent.com/document/product/1071/76785
- Supabase troubleshooting for Edge Functions points to CORS/network/function availability as causes of browser `Failed to fetch`; critical mutations need explicit handling instead of surfacing the raw fetch error: https://supabase.com/docs/guides/troubleshooting/unable-to-call-edge-function
- Supabase retry docs warn retries should only be used for network errors; our RPC is idempotency-key protected, so a single fallback path is safe for dropped Edge responses: https://supabase.com/docs/guides/api/automatic-retries-in-supabase-js

### Verified gaps found
- Chat gift playback was mounting **two fullscreen players for the same asset**: `GiftEmojiAnimation` plus `FlyingGiftAnimation`'s fullscreen `FixedAnimationFrame`. On mobile/WebView this doubles video/SVGA/VAP decode and causes the visible animation freeze/stutter.
- `callGiftService` only used the Edge Function fetch path. If the browser/WebView hit `TypeError: Failed to fetch`, the app refunded and showed `Gift failed: Failed to fetch` even though the DB RPC was already idempotency-safe.

### Fix applied
- Chat now uses the unified `FlyingGiftAnimation` fullscreen player only; duplicate `GiftEmojiAnimation` fullscreen playback is gated off for chat gift events.
- `callGiftService` now keeps the same idempotency key and falls back to `process_gift_transaction` RPC on Edge fetch/network failure and temporary 502/503/504 responses, preventing false failed gifts and duplicate charges.
- SVGA safety fallback now waits native duration + 1.5s grace instead of firing exactly at duration, preventing premature cutoff when WebView callback timing is late.
