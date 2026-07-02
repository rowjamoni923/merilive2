
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



## M8 — Unified Gift Panel + animations ✅

`showUnifiedGiftSheet` (surface + recipients + contextId) is the single panel across:
- **Live** — `LiveStreamPage._openGiftPanel` (`GiftSurface.live`)
- **Party** — `showPartyGiftSheet` adapter builds host+seats recipients, picks `partyAudio/Video/Game` surface
- **Call** — M8 wire-up: `ActiveCallPage._openGiftSheet` now delegates to unified sheet with peer host as sole recipient (`GiftSurface.privateCall`, `contextId = callId`). Removed the `_GiftSheetPlaceholder` stub.
- **Reels** — retained custom `_ReelGiftSheet` (has its own edge-function send path via `ReelsGiftRepository.sendGift`); consolidation deferred so send atomicity isn't touched.

Full-screen VAP/SVGA playback owned by native Pkg438 dispatcher reacting to `gift_transactions` broadcast — sheet never plays animations itself. Flying gift path (small-gift ballistic overlay) still Android-native follow-up (Pkg438 Phase B).



## M9 — Entry / vehicle / name-bar animations ✅

A11 foundation + M9 polish complete:

- **Noble priority ladder fixed** — `EntryEffectsResult.nobleRankCode` is now populated only when the noble entrance URL is the one actually rendered (equipped/level entrance no longer gets promoted to priority 400 just because the user happens to own an active noble sub). `RoomEntryDispatcher` ladder: noble=400, level≥40=350, otherwise level+100, vehicle=300, name-bar=user_level.
- **Vehicle Entrances** — resolved via `shop_items.animation_file_url` / `level_privileges.privilege_type='vehicle_entrance'` and enqueued into NativeEntryBridge (VAP/Lottie/image) at priority 300.
- **Level-up in-room celebration** — new `LevelUpBridge` (Supabase Realtime UPDATE on `profiles` filtered to `id=self`, seeded baseline so no fire on initial snapshot, only emits on strict increase) + `LevelUpCelebrationOverlay` (60-piece confetti CustomPainter + orange gradient "Level Up! Lv N" chip, ~3.2s). Mounted in Live, Party, and Active Call surfaces.



## M10 — Games everywhere ✅ (partial — chat surface pending)

Same `game_settings` admin table = single source of truth across every surface. No hardcoded game lists anywhere.

- **Party** ✅ — `PartyGameSelectionSheet` picker → `PartyGameOverlay` WebView with Supabase session hydrated to localStorage (`game_party_layout` handles seat‑grid composition).
- **Live** ✅ — Shipped in M3: `LiveStreamPage` action bar `games` slot → `PartyGameSelectionSheet.show()` (same picker, same table) → `LiveGameOverlay` full-screen WebView loading `<origin>/live-stream/<id>?game=<id>&embed=1` with hydrated session; reload + close controls in header.
- **Chat** ⏸ — Deferred: Flutter shell does not yet contain a 1:1 DM chat screen (part of M11 "Missing pages" bucket). Once `ChatConversationPage` lands in M11, add the same `PartyGameSelectionSheet.show()` invocation from its composer bar and reuse a `ChatGameOverlay` twin of `LiveGameOverlay` pointing at `<origin>/chat/<peerId>?game=<id>&embed=1`. Recorded here so the M11 chat build knows the exact pattern to follow.



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
