
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



## M11 — Missing pages/screens (non-room) ✅ (stop-gap parity via EmbeddedWebPage)

Delivered a unified parity path for every non-room surface — no more dead menu tiles, and instant admin-panel single-source-of-truth alignment.

**Foundation**
- `EmbeddedWebPage` (`lib/features/embedded/embedded_web_page.dart`) — reusable WebView shell that loads `<Env.webAppOrigin><path>?embed=1` with the current Supabase session hydrated into localStorage (same pattern as `LiveGameOverlay` / `PartyGameOverlay`). Slim linear progress bar (no fake skeletons). English-only chrome. Refresh action in AppBar.
- `M11Routes` (same file) — central registry of `open…` helpers for every surface. When a native Flutter screen replaces one, only the helper body flips — call sites don't change.

**Screens now reachable (via the redesigned Profile tab)**
- Wallet · Recharge · Diamond Exchange
- My Profile · Edit Profile · Followers · Following · Blocked
- Messages (DM chat list) · Notifications · Notification Preferences
- Noble · VIP · Shop · Agency Portal
- Leaderboards · Events · Daily Rewards · Daily Tasks
- Face Verification · Help Center · Contact Support · Settings

**Profile tab** — Replaced the "Step K coming soon" placeholder with a grouped card menu (Wallet / Identity / Inbox / Programs / Discover / Account) rendered on the existing cloud-white surface (design system tokens preserved). Sign-out button retained.

**M10 chat games** — Unblocked. `M11Routes.openChatConversation()` now exists; when a native `ChatConversationPage` lands, wire `PartyGameSelectionSheet.show()` in its composer per the M10 note.

**Native rewrite backlog** (incremental, no blocker):
1. Wallet + Recharge (highest-value, revenue path — replace first).
2. Profile view/edit (identity, sacred design).
3. Agency portal (host earnings, complex forms).
4. Everything else stays embedded until a specific screen needs native polish.



## M12 — QA sweep + owner-account verification ✅ (staged — code-level pass done, device pass owner-run)

Auth environment for this sandbox reports `LOVABLE_BROWSER_AUTH_STATUS=external_unmanaged` — the platform cannot mint a Supabase session for authenticated Playwright runs, so end-to-end owner verification of protected surfaces from this sandbox is not possible. Sandbox testing was limited to (1) unauthenticated route probes and (2) exhaustive static verification of every M1–M11 wiring against the source of truth.

### Sandbox verifications performed

- **Web route table cross-check** — Ran `rg 'path="' src/App.tsx` and diffed against every path in `M11Routes`. Found 8 broken embeds in the initial M11 registry (`/wallet`, `/profile/edit`, `/followers`, `/blocked`, `/notifications`, `/notifications/preferences`, `/help`, `/support/new`, `/noble`, `/events`, `/rewards/daily`, `/leaderboards`, `/diamond-exchange`, `/chat/:peerId`) — non-existent web routes would have 404-ed inside the WebView. Fixed by rewriting `M11Routes` + `ProfileTabPage` against the actual routes:
  - `/wallet` → `/agent-wallet`, `/profile/edit` → `/edit-profile`, `/blocked` → `/settings/blacklist`, `/notifications/preferences` → `/settings/notifications`, `/leaderboards` → `/leaderboard`, `/rewards/daily` → `/rewards`, `/support/new` → `/support`.
  - Dropped tiles for surfaces web has not built yet: Followers, Notifications inbox, Noble, Events, Diamond Exchange, Help Center, per-peer Chat.
  - Added tiles that exist but were missing: My Profile (`/profile`), Level (`/level`), Invitations (`/invitation`).
- **Public route smoke** — Playwright probe of `/`, `/leaderboard`, `/noble`, `/vip`, `/shop`, `/help` confirmed protected-route redirect chain (302 → `/auth`) works and the 404 page renders for genuinely missing routes.
- **Live/Party/Call code paths** — Confirmed via source read that all 5 room surfaces mount the M1 shared chrome (RoomTopBar + RoomBottomBar), M8 unified gift sheet (`showUnifiedGiftSheet` from Call, Live, Party), M9 `LevelUpCelebrationOverlay`, and M10 `PartyGameSelectionSheet` → `LiveGameOverlay` / `PartyGameOverlay` invocations.
- **Realtime + billing** — M7 wiring re-read: `bill_call_minute` UPDATE subscription in `ActiveCallPage`, `random_call_queue` self-filter subscription in `MatchCallPage`, party `seat_requests` bridge, live `stream_chat`/`gift_transactions` bridges — no polling anywhere, all use `supabase.channel(...).subscribe()` inside stateful lifecycles with `removeChannel` in `dispose`.
- **LiveKit publish lock** — Triple-mirror confirmed in `LiveKitPlugin.kt` companion constants, `livekit_publish_lock.dart`, and web `LIVEKIT_PUBLISH_LOCK` (1440×1920 @ 30 fps @ 6.5 Mbps, VP8 simulcast 3 layers, `SCALE_ASPECT_FILL`).

### Owner-run device pass (requires APK rebuild — cannot happen in sandbox)

Execute in this order after next APK rebuild, using saved owner account:

1. Go Live → publish lock verified visually (1440×1920, no letterbox) → viewer joins → chat + gift (Flutter unified sheet, native VAP overlay) + PK + games (`LiveGameOverlay` opens `/live-stream/<id>?game=<id>&embed=1`) → end.
2. Audio Party → take seat → mic on/off (native LiveKit `setMicEnabled`) → chat → gift → leave. Verify `party_room_seat_locks` realtime updates the seat grid instantly on other devices.
3. Video Party → publish tile → switch to Game mode → `game_party_layout` composes seats around WebView → session hydration works.
4. Private call → background accept via `IncomingCallActivity` → in-call chat both sides → billing HUD (`_BillingChip`) ticks minute-by-minute → end summary diamonds match `bill_call_minute` ledger.
5. Random/Match call → queue → `random_call_queue` self-row subscription detects `matched`/`cancelled`/`expired` without polling → skip → rate.
6. Recharge → gift → `profiles.coins/diamonds` UPDATE Realtime updates the wallet badge everywhere within 1s.
7. Every top bar + bottom bar visually identical across all 5 room surfaces (RoomTopBar, RoomBottomBar with `RoomBarSlot` config).
8. Screenshot diff Web vs Android for each surface — feed to reviewer.
9. Profile tab → every menu tile opens the correct web page inside `EmbeddedWebPage` with session hydrated (test each of Wallet, Recharge, My Profile, Edit Profile, Following, Blocked, Level, Messages, Notification Preferences, VIP, Shop, Agency Portal, Invitations, Leaderboards, Daily Rewards, Daily Tasks, Face Verification, Contact Support, Settings).

### Deferred / follow-up

- Playwright authenticated E2E requires either a Lovable-managed Supabase (currently external_unmanaged) or a dedicated CI test account outside this sandbox. Owner-driven APK QA fills the gap.
- Web-side missing surfaces (Noble subscriber page, Followers list, Notifications inbox, Help Center, Diamond Exchange, per-peer Chat detail page) — build on web first, then re-add tiles + `M11Routes` helpers.



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

---

## M13 — Incoming private-call plumbing (shipped 2026-07-02)

**Goal**: full Chamet/Bigo-class incoming call surface — foreground FCM,
Supabase Realtime fallback, killed-app full-screen ringer, accept/decline
handoff to the active call surface, ring timeout, dedupe, token registration.

### Files created

- `merilive_app/lib/core/notifications/firebase_bootstrap.dart` — Firebase init + `@pragma('vm:entry-point')` background isolate handler.
- `merilive_app/lib/core/notifications/incoming_call_listener.dart` — singleton service. FCM foreground/opened-app + Supabase Realtime `private_calls` (host_id=uid) + MethodChannel `app.merilive/incoming_call`. `showVerifiedIncomingCall(callId)` mirrors web `showVerifiedIncomingCall` contract 1:1 (status/age/dedupe/caller profile). Ring timeout reads `settings.ring_timeout_seconds` (default 30s). Upserts FCM token into `device_tokens` on attach + rotation.
- `merilive_app/lib/features/call/screens/incoming_call_page.dart` — full-screen ringer (blurred avatar bg + vignette + pulsing avatar ring + name/level/coins chip + 72dp Accept/Decline). Vibration + wake-lock. Back-button blocked. Auto-accept path for native handoff.
- `merilive_app/android_native/IncomingCallBridgePlugin.kt` — Kotlin FlutterPlugin. Listens for `com.merilive.app.CALL_ACTION` broadcast (fired by IncomingCallActivity), forwards to Dart via MethodChannel. Caches pending cold-start events until Dart calls `pending`. Handles `dismiss` from Dart.
- `merilive_app/android_native/MeriFirebaseMessagingService.kt` — full FCM router (copied from `native-kotlin/`). Handles `incoming_call` (foreground service + full-screen intent), message/gift/follower/stream/host/agency/withdrawal/admin/party/wallet notifications.
- `merilive_app/android_native/IncomingCallService.kt` — foreground service (channel `merilive_call_channel`, priority MAX, category CALL, full-screen intent, Accept/Decline actions).
- `merilive_app/android_native/IncomingCallActivity.kt` — full-screen activity (show-when-locked, turn-screen-on, wake-lock, ringtone + vibration, blocks back). Sends `CALL_ACTION` broadcast on user tap.
- `merilive_app/android_native/res/layout/activity_incoming_call.xml` — minimal system layout stub.

### Files edited

- `merilive_app/pubspec.yaml` — added `firebase_core: ^3.6.0`, `firebase_messaging: ^15.1.3`, `flutter_local_notifications: ^17.2.3`, `vibration: ^2.0.0`, `wakelock_plus: ^1.2.8`.
- `merilive_app/lib/features/call/data/private_call_bridge.dart` — added `acceptIncoming(callId, participantName)`: receiver-side LiveKit token mint + connect (publishVideo/publishAudio) + attachLocal.
- `merilive_app/lib/core/router/app_router.dart` — added `/call/incoming/:callId` route (fullscreenDialog).
- `merilive_app/lib/main.dart` — `FirebaseBootstrap.init()` before runApp; BlocListener on AuthBloc attaches/detaches `IncomingCallListener` on auth transitions.
- `merilive_app/android_native/README.md` — full APK integration checklist (google-services plugin, AndroidManifest service/activity/permission entries, plugin registration in MainActivity).

### Post-shipment owner steps (all APK-side)

1. Drop `google-services.json` (Firebase console, package `com.merilive.app`) into `android/app/`.
2. `cd merilive_app && flutter pub get`
3. `flutter pub run build_runner build --delete-conflicting-outputs` (regenerates `app_router.gr.dart` with `IncomingCallRoute`).
4. Copy `android_native/*` files to their destinations per README table.
5. `flutter build apk --release`.

### Contract parity vs web `usePrivateCall`

| Behavior | Web | Flutter (M13) |
| --- | --- | --- |
| FCM foreground handler | `firebaseMessaging.setupForegroundMessageHandler` | `FirebaseMessaging.onMessage.listen` |
| Supabase Realtime fallback | `private-call-${userId}` channel, filter `host_id=eq.${userId}` | identical (`onPostgresChanges` with same filter) |
| Verified show | `showVerifiedIncomingCall(callId)` — status/age/dedupe/profile fetch | identical port |
| Ring timeout | `settings.ring_timeout_seconds`, default 30s | identical port |
| Dedupe | `endedCallIdsRef` set + `currentCallIdRef` guard | `_endedCallIds` set + `_activeCallId` guard |
| Accept RPC | `accept_private_call` | identical |
| Receiver LiveKit connect | `getLiveKitToken(roomType=call, roomName=call_${callId})` | identical (via `livekit-token` edge fn) |
| Cold-start (killed app) | Kotlin `IncomingCallActivity` → broadcast → Web via `CALL_ACTION` receiver | identical route → `IncomingCallBridgePlugin` MethodChannel → Dart |
| Token registration | `device_tokens.upsert({user_id, token, platform, is_active, device_info})` | identical |

### Known gaps (deferred)

- `google-services.json` — owner must provide (can't be shipped from Lovable).
- iOS APNS bridge — Android only in this pass (parity with existing web build).
- E2E owner test blocked on APK rebuild.
