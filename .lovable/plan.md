## Sector 4 — Party button (Discover page only)

**Correction accepted:** Party Discovery-এ কোনো live streaming card নেই। শুধু `party_rooms` (video / audio / game) দেখায়। Web source = `src/pages/Discover.tsx` (1000 LOC) — এইটাই ধরব, `PartyRooms.tsx` deprecated (`/` তে redirect)।

Create button আলাদা সেক্টরে (পরে)। এই sector-এ শুধু **Party discovery page** clear করব।

---

### Web behavior (line-by-line audit summary of `Discover.tsx`)

- **Data**: `party_rooms` where `is_active = true` + live participant count from `party_room_participants` (`left_at IS NULL`) + host stitched from `profiles_public` (id, display_name, avatar, user_level, host_level, country_flag, country_code, gender, is_online, is_host, total_earnings, weekly_earnings, max_user_level).
- **Level resolve**: `resolveLevelFromTiers()` per unique host → `getRequiredDisplayLevel(host)` for card border tier (≥40 red, ≥20 amber, else neutral).
- **Realtime**: `subscribeToTables(['party_rooms','party_room_participants'])` with 1.5s debounce + direct `postgres_changes` UPDATE on `party_rooms` for instant-close on host end.
- **Filters**:
  - Tabs: `all / video / audio / game` (segmented).
  - Country chips: All 🌍, BD, IN, PK, NP, PH, ID — filter by host `country_code`.
  - Search: room name, host display_name, or room_code (Hash-prefixed).
- **Sort**: by `current_participants` desc (game tab keeps same sort).
- **Room-code quick-join**: dialog with 6-char code → `party_rooms.select().eq('room_code', code)` → join.
- **Preview-before-enter dialog** (Chamet/Bigo pattern): tap card → dialog with host avatar/name/level, room name, type, participant count, entry fee, min-level, private lock, description, welcome message → "Enter Room" button.
- **Feature gate**: `checkFeatureAccess('join_party', userLevel, isFemaleHost)` before navigate.
- **Nav**: `/party/:id` on confirm.
- **Perf**: `usePersistedCache('discover:rooms')` for instant paint, `useNativeImagePrefetch` on first-24 host avatars via `cdnAvatar(url,180,80)`, `NativePullToRefresh`, `PrewarmDiv` per card (LiveKit connection warmup for the target room).
- **Card visual**: 2-col grid, host avatar as background (CDN-resized 180×80), dark gradient overlay, top-left type badge (Video/Audio/Game color-coded), top-right participants pill, bottom-left game-mode emoji chip (if running), bottom-right private-lock pill, tier-based outer shadow (red/amber/neutral).

---

### Flutter build (`merilive_app/lib/features/party/`)

**PD1 — Data**
- `party_models.dart` — `PartyRoom`, `PartyHost`, `RoomType` enum (`video/audio/game`), `GameMode` enum.
- `party_discovery_repository.dart` — mirrors `fetchRooms`: parallel fetch of `party_rooms` + `party_room_participants`, stitch `profiles_public` hosts, resolve level via existing `levelResolver` port, return `List<PartyRoom>` with `currentParticipants` and `hostDisplayLevel`.
- `party_discovery_realtime.dart` — Supabase channels for `party_rooms` + `party_room_participants` with 1.5s debounce → refresh; direct `UPDATE party_rooms` for instant-close.

**PD2 — Cubit + Page shell**
- `party_discovery_cubit.dart` — state: `rooms, activeTab, selectedCountry, searchQuery, refreshing`. Actions: `refresh`, `setTab`, `setCountry`, `setSearch`, `joinByCode(String)`, `applyRealtime()`. Persistent cache via `shared_preferences` (`discover:rooms`) — instant paint on cold start.
- `party_discovery_page.dart` — deep-purple gradient scaffold (matches web backdrop), safe-area header (back + "Party Rooms" title + refresh), search field + room-code KeyRound button, tab strip (All/Video/Audio/Game) with per-tab active color (indigo/green/blue/purple), country chip strip (BD default from H2 filter).

**PD3 — Card grid**
- `party_room_card.dart` — 2-col grid, 3:4-ish aspect, host avatar (CDN-resized) as background, gradient overlay, type badge (top-left, color-coded), participant pill (top-right), game-mode emoji chip (bottom-left, only if `game_mode != null`), private-lock pill (bottom-right), tier shadow (≥40 red / ≥20 amber / else neutral), room name + host display name below. Tap → preview dialog.
- Empty state: purple gradient orb + "No Active Rooms" + hint line + pulsing accent bar (exact web wording).

**PD4 — Preview-before-enter dialog**
- `party_preview_sheet.dart` — modal bottom-sheet with host avatar-with-frame, display name + level badge, room name, type icon, participants, entry fee (Diamond icon), min-level chip, private-lock indicator, description, welcome message, "Enter Room" CTA + Cancel. Uses `checkFeatureAccess` port before nav.

**PD5 — Room-code quick-join**
- `room_code_dialog.dart` — 6-char uppercase input, "Join" button → `joinByCode`. On success → same preview sheet then nav. On not-found → toast.

**PD6 — Nav glue**
- `auto_route` entry `/party` → `PartyDiscoveryPage`. Enter action pushes `/party/:id` (stub route for now — actual PartyRoom page is a later sector). Bottom-nav "Party" button routes here.

**PD7 — Audit**
- Verify: no live-stream data anywhere; realtime channels disposed on page pop; cache write on every refresh; prefetch top-24 avatars; tab + country + search filters compose correctly; instant-close via UPDATE removes rooms without full refetch; tier shadow matches web thresholds; deep-purple backdrop matches during nav transitions.

---

**Out of scope for this sector:** Create page, GoLive preview, LiveStream, CreateParty, PartyRoom broadcast. Those come next after Party button clears.

**Ready to build PD1→PD7?** "yes" বললে সিরিয়ালে চালাব, বা step-by-step (`PD1` first) — যেভাবে চাও।
