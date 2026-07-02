
# Web → Android Full Parity Plan (M1–M12)

**একটাই goal:** Web-এ যা যা আছে হুবহু সেটাই Android (Flutter shell + Native Kotlin bridges) এ থাকবে। Web = single source of truth। কোনো নতুন feature invent হবে না, শুধু যা web-এ working সেটাই Android-এ port।

Honest gap list — সবগুলো missing/incomplete piece A→Z:

---

## M1 — Shared Room Chrome (top bar + bottom bar)

Web-এ Live Stream, Audio Party, Video Party, Game Party, Private Call — পাঁচটাই আলাদা bar। Flutter shell-এ এদের **একটাই canonical** primitive হবে (web pattern মিরর করে):

- `RoomTopBar` — host chip + level + follow + viewer count + close
- `RoomBottomBar` — 3D glass orbs, per-surface slot config

Refactor targets (web + Flutter উভয়ে): `LiveStream.tsx`, `UnifiedPartyRoom.tsx`, `ActiveCallScreen.tsx` এবং তাদের Flutter mirrors।

## M2 — Party mode branching (Audio / Video / Game)

Web `UnifiedPartyRoom.tsx` তিন mode একসাথে handle করে; Flutter `party_room_page.dart`-এ এখন শুধু generic seat grid। Add:

- Audio mode: 1+8 mic-only seats, waveform ring
- Video mode: 1+3 video tiles (LiveKit subscribe) + 4 audio seats
- Game mode: seat strip + WebView game viewport (A10 flow already built, needs mode-switch wiring)

Server-authoritative `party_rooms.mode` read।

## M3 — Live Stream missing pieces

Flutter live viewer parity gaps:

- **Games orb** on bottom bar (web has `LiveGameSelector` + `GlobalGameOverlay`)
- **Report/Block** sheet (web `ReportUserDialog`)
- **Multi-guest co-host** slots (web `MultiGuestSlots` — up to 4 guests, LiveKit subscribe/publish per slot)
- **Beauty filters / stickers** orb (web `BeautyFilterPanel`, `ARStickerPicker`)
- **Broadcast controls** (host-only): End, Mic mute, Camera flip, Beauty, Filters

## M4 — Party Room missing pieces

- **Room settings sheet** (host: rename, background, cover, welcome msg) — web `PartyRoomSettings`
- **Kick / Mute-all / Ban** moderation actions — web `HostControls`
- **Seat request/invite flow** — web uses `seat_requests` + `seat_invitations` tables
- **Music sheet play/queue** (already stubbed, needs playback bridge to native `AudioTrackPlayer`)
- **Party banners / room announcements** — web `party_room_banners`

## M5 — Private Call HUD missing pieces

- **In-call chat overlay** (both sides see messages) — web `CallChat` + `call_chat_messages`
- **End-call summary sheet** (duration, diamonds spent, rate/min) — web `CallSummary`
- **Gift sending inside call** (unified GiftPanel) — currently Flutter HUD has icon but no wiring
- **Random/Match call** rating banner post-call — web `RatingBanner` + `rating_reward_claims`
- **Speaker toggle + Bluetooth route picker** — native audio route bridge

## M6 — Camera system hardening ✅

- Publish LOCK constants mirrored 3-way (web `livekitPublishLock.ts` ↔ Kotlin `LiveKitFlutterPlugin.LOCK_*` ↔ Flutter `LiveKitPublishLock`) — 1440×1920 @ 30 fps @ 6.5 Mbps + 3-layer simulcast VP8. Drift-proof — any future change must update all three files together.
- Kotlin scaffold now routes `setMicEnabled` / `switchCamera` / `setBeautyEnabled` / `getStats` MethodChannel calls (bodies pending APK-side port from Capacitor plugin).
- `setScalingType` handler defaults to `fill` (SCALE_ASPECT_FILL) — no letterbox on portrait viewers.
- Zero-black-frame handoff: `startLocalPreview` docs reinforce reuse of the CameraCapturer in `connect()` — camera flip via `switchCamera` must NOT republish (600 ms base-layer drop).
- Face gate (`can_user_go_live` RPC + `_denyCode == 'face'` branch) verified in `GoLivePlaceholderPage`.


## M7 — Realtime + billing parity ✅

Every web realtime channel now has a Flutter subscriber:

| Web hook | Table | Flutter bridge |
|---|---|---|
| `useLiveChat` | `stream_chat` | ✅ `live_chat_bridge` |
| `useStreamViewers` | `stream_viewers` | ✅ (A4) |
| `useGiftTransactions` | `gift_transactions` | ✅ (A5/A9) |
| `usePKBattle` | `pk_battles` | ✅ (A6) |
| `usePartyMessages` | `party_room_messages` | ✅ (A8) |
| `useSeatRequests` | `seat_requests` | ✅ (M3 live + M4 party) |
| `useCallChat` | `call_chat_messages` | ✅ (M5) |
| `useIncomingCall` | `private_calls` | ✅ |
| `useMatchQueue` | `random_call_queue` | ✅ M7 (`_subscribeQueueRow`) |
| `useRoomBanners` | `party_room_banners` | ✅ (M4) |
| `useEntryEvents` | `stream_viewers` + `party_participants` | ✅ (A11) |

Billing HUD: `ActiveCallPage._statusChannel` now reads `last_billed_minute` + `viewer_rate_per_min` from every `bill_call_minute` tick and re-reads caller balance to compute `remaining_minutes` (surfaced as `_BillingChip`, amber ≤ 3 min). Server RPC stays the single source of truth — no client-side polling.



## M8 — Unified Gift Panel + animations

Web has one `GiftPanel` used everywhere (Live / Party / Call / Chat / Reels). Flutter currently has separate sheets — consolidate into one `UnifiedGiftPanel`:

- Same tabs (All / Popular / Lucky / Combo / Exclusive / Backpack)
- Same combo window (`gift_combo_window` table)
- Same recipient picker (seat occupants for party, peer for call, host for live)
- Native VAP/SVGA renderer for full-screen (already A5)
- Flying gift path (small gifts) — verify Flutter has FlyingGiftAnimation equivalent

## M9 — Entry / vehicle / name-bar animations

Already A11 done. Remaining polish:

- Noble subscription priority ladder verified
- Vehicle Entrances (`vehicle_entrances` table) rendered via native VAP
- Level-up in-room celebration (web shows confetti on level threshold)

## M10 — Games everywhere

Web mounts games in three places: Live, Party, Chat. Flutter has Party ✅. Add:

- Live Stream games (WebView reuse via A10 pattern)
- Chat games button + overlay

Same `game_settings` admin table = single source of truth।

## M11 — Missing pages/screens (non-room)

Web pages that don't exist yet in Flutter shell:

- Wallet / Recharge / Diamond exchange
- Profile view + edit (avatar, frame, bio, level tiers)
- Followers / Following / Blocked list
- Notifications inbox + preferences
- Help center + support ticket
- Agency portal (host view — join agency, earnings, withdrawal)
- Noble / VIP subscription screens
- Shop (avatar frames, chat bubbles, entry effects)
- Leaderboards (daily/weekly/monthly)
- Events / Banners / Popup campaigns
- Daily login rewards + tasks
- Face verification wizard (already partial)
- Settings (language, privacy, blocked, sessions, delete account)

## M12 — QA sweep + owner-account verification

Using saved owner account, walk through:

1. Go Live → 1080p → viewer joins → chat/gift/PK/games → end
2. Audio Party → seat → mic → chat → gift → leave
3. Video Party → publish tile → switch to Game mode → WebView loads
4. Private call → background accept → in-call chat both sides → end summary correct diamonds
5. Random/Match call → queue → connect → skip → rate
6. Recharge → gift → wallet balance updates realtime
7. Every top bar + bottom bar visually identical across all 5 room surfaces
8. Screenshot diff Web vs Android for each surface

---

## Execution order (recommended)

| Step | Blocking? | ETA |
|---|---|---|
| M1 shared chrome | yes — foundation | first |
| M2 party mode branch | yes | next |
| M3 live gaps | | |
| M4 party gaps | | |
| M5 call HUD gaps | | |
| M6 camera hardening verify | | |
| M7 realtime bridges (seat_requests, call_chat, banners) | | |
| M8 unified gift panel | | |
| M9 entry polish | | |
| M10 games everywhere | | |
| M11 non-room pages (largest bucket) | can run parallel with M3–M5 | |
| M12 QA sweep | last | |

---

## Rules honored

- English-only UI strings in code
- Admin panel = single source of truth (no hardcoded rates)
- No fake loading / skeletons
- No VPS work (pure Lovable code + Flutter/Kotlin)
- Research-first before each step (Chamet/Bigo/Olamet patterns, LiveKit translation)
- Web + Android both maintained (test on web, ship on Android APK rebuild)
- Owner account self-test before "done"
- Design SACRED for existing screens — only functionality/parity work
- Never touch: `FlyingGiftAnimation`, `FullScreenGiftAnimation`, `EntryBarAnimation`, `UnifiedEntryAnimation`, `VAPPlayer` internals

## Reply

- **M1** → start with shared chrome (foundation, unblocks M2–M5)
- **M1-M6** → all in-room work
- **M1-M12** → full sprint end-to-end (long-running, many APK rebuilds)
- **Custom** → pick specific milestones
