# One Gift Panel Everywhere + Pro Animations

আমাদের এখন **4-5 টা আলাদা gift panel** আছে (ChatGiftPanel, PartyGiftPanel, GlobalCallGiftSheet, live GiftPanel, Flutter party_gift_sheet, reel_gift_sheet)। এগুলো merge করে **একটাই canonical panel** সব জায়গায় mount করব, plus animations (flying + full-screen + entry) সব surface-এ same behaviour দেব।

---

## Scope — যেখানে যেখানে gift panel দেখানো হয়

| Surface | Current panel | After |
|---|---|---|
| Live Stream (viewer) | `GiftPanel` (live) | ✅ same (canonical) |
| Private Call | `GlobalCallGiftSheet` | → `GiftPanel` |
| Chat / DM | `ChatGiftPanel` | → `GiftPanel` |
| Party (audio/video/game) | `PartyGiftPanel` | → `GiftPanel` (with seat-picker addon) |
| Profile Detail | inline | → `GiftPanel` |
| Reels | `reel_gift_sheet` (Flutter) | → same canonical Flutter sheet |
| Flutter party | `party_gift_sheet` (Flutter) | → canonical Flutter sheet |

**Rule:** একটাই source-of-truth panel। যেকোনো section-এ gift button টিপলে **identical** UI, identical categories, identical recipient-picker (context-adaptive), identical send flow।

---

## Steps

### G1 — Canonical `GiftPanel` upgrade (web)
- `src/components/live/GiftPanel.tsx`-কে context-aware বানানো: prop `context: 'live' | 'call' | 'chat' | 'party' | 'profile' | 'reel'` + `recipients: {id, name, avatar, seatNumber?}[]`
- Recipient row conditional: 1 জন হলে auto-select, একাধিক হলে horizontal chip strip (party = seat grid picker, live = host + co-host, chat = single, call = peer)
- Quantity presets (1/10/66/188/520/1314) — already there, verify
- Balance chip + top-up CTA — already there
- Combo tracker integration — already there

### G2 — Legacy panels retire
- `ChatGiftPanel.tsx` — replace call sites with `<GiftPanel context="chat" recipients={[peer]} />`, then delete file
- `PartyGiftPanel.tsx` + `PartyGiftSeatPicker.tsx` — merge seat-picker into canonical `GiftPanel`, replace `PartyRoom.tsx` + `PartyRoomBottomBar.tsx` call sites
- `GlobalCallGiftSheet.tsx` — replace `ActiveCallScreen.tsx` call site
- `ProfileDetail.tsx` — swap inline gift UI for `<GiftPanel context="profile" recipients={[profile]} />`
- Update `src/features/shared/gifting/index.ts` — remove legacy exports

### G3 — Flutter unified sheet
- Rename `merilive_app/lib/features/party/widgets/party_gift_sheet.dart` → `merilive_app/lib/features/gifting/widgets/unified_gift_sheet.dart`
- Add `GiftContext` enum + `GiftRecipient` model
- Rewire `reel_gift_sheet.dart` call sites → `UnifiedGiftSheet(context: reel, ...)`
- Party page, live viewer page, private call page, DM page → all import same sheet

### G4 — Full-screen animation pipeline (rule)
- **Every gift-transaction insert** (via `useRealtimeGiftAnimations`) → route by `coin_cost`:
  - `< 500` → `FlyingGiftAnimation` (small overlay, existing)
  - `≥ 500` → `FullScreenGiftAnimation` (VAP/SVGA/Lottie/MP4/image, fills viewport)
  - `≥ 5000` → full-screen + audio ducking + haptic
- **Universal mount:** create `<GlobalGiftAnimationLayer />` in root layout — active on every gift-capable route. Remove per-page duplicate mounts to avoid double-play.
- Native Android: `NativeGiftAnimationPlugin` already handles VAP/SVGA/Lottie with priority queue — verify all surfaces dispatch through `useNativeGiftDispatcher`

### G5 — Entry animation (Entrance Effects) verification
- `UnifiedEntryEffects` — already exists. Ensure it's mounted in: LiveStream, PartyRoom (all 3 modes), PrivateCall entry, ChatRoom entry, Reel long-view
- Priority: Premium Entry (car/dragon `entry_banners`) > Flying Name Bar (`entry_name_bars`) > Vehicle Entrance > Welcome Chat Message
- VAP MP4 for premium entries; ensure `NativeEntryAnimationPlugin` (single-slot, slide in/out) picks these up on Android
- Web fallback path continues to work (per lifted rule 2026-06-07)

### G6 — Cross-surface QA (owner test account)
Log in as `smdollarex923@gmail.com` and verify **on each surface** that:
1. Gift button opens **exact same panel UI** (same tabs, same grid, same presets)
2. Sending a `coin_cost >= 500` gift plays **full-screen** animation
3. Entry to that surface shows the sender's premium entry effect
4. Balance debit is single-source-of-truth (admin panel `gifts.coin_cost`)
5. No duplicate animation playback (only one layer plays each gift)

---

## Technical notes

- **Admin panel = single source of truth** — never hardcode gift cost/receiver_beans; always read from `gifts` row.
- **Naming lock** — Entrance Effects umbrella; Premium Entry Effects; Standard Entry Effects; Flying Name Bars; Vehicle Entrances; Welcome Chat Message। কখনো "Entry Banner" / "Flying Banner" বলা যাবে না।
- **English-only UI strings** — all labels/toasts English।
- **No design breakage** — panel look identical to current live GiftPanel (user already approves it); we're only widening its reach, not restyling।
- **Realtime source** — `gift_transactions` insert stream drives animations; `NativeGiftAnimationPlugin` on Android, `FlyingGiftAnimation` + `FullScreenGiftAnimation` on web / iOS।
- **APK rebuild** — G3/G4 Android native path changes হলে rebuild দরকার; pure Dart / TS changes হলে না।

---

## Execution order

1. G1 (canonical panel upgrade) → verify on Live Stream (currently uses it, so baseline stays)
2. G2 (retire legacy panels) — 5 files removed, 5 call sites updated
3. G3 (Flutter unified sheet) — parallel to G2
4. G4 (global animation layer) — mount in `App.tsx` / Flutter root
5. G5 (entry effects verification) — audit + fix missing mounts
6. G6 (owner-account QA on all 7 surfaces)

কোন step-টা আগে শুরু করব বলো (G1 default), নাকি পুরো plan একসাথে execute করব?
