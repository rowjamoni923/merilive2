
# CREATE BUTTON — Web-Truth Master Plan (Web → Kotlin → Flutter parity)

Everything below is **scanned from our actual codebase**, not guessed. Numbers, gates, and rules are the ones already running in production Web. Kotlin + Flutter must match this byte-for-byte.

---

## 0. What "Create" opens (already implemented — Web)

File: `src/components/layout/BottomNavigation.tsx`

The center Create button opens a 3-card action panel. **No sheet, no confirmation** — direct navigation with route prefetch:

| Card | Route | Prefetches | Icon/Color |
|---|---|---|---|
| **Go Live** | `/go-live` | `LiveSessionPage` | red gradient, camera |
| **Create Party** | `/create-party` | `PartySessionPage` | purple gradient, users |
| **Match Call** | `/match-call` | `MatchCall` | cyan gradient, video |

Every gate is enforced **inside the destination screen** so the user always sees the specific reason they're blocked (never a silent nav failure).

---

## 1. Admin Panel — single source of truth (already wired)

All numeric thresholds come from admin tables. **Zero hardcoding.**

| What | Admin table | Column read | Consumer |
|---|---|---|---|
| Level needed to Go Live | `feature_level_requirements` where `feature_key='go_live'` | `min_level_user`, `min_level_host` | `useFeatureLevelCheck` |
| Level needed to Create Party | `feature_level_requirements` where `feature_key='create_party'` | same | `useFeatureLevelCheck` |
| Level needed for Match Call | `feature_level_requirements` where `feature_key='match_call'` | same | `useFeatureLevelCheck` |
| Random-call rate & rules | `random_call_settings` (id=1) | `diamond_price_per_minute`, `min_billable_seconds`, `free_trial_seconds`, `ring_timeout_seconds`, gender/language/country filters | `MatchCall.tsx`, `settle_random_call()` |
| Private-call rate per host | `profiles.private_call_rate` | — | `usePrivateCall` |
| Face verification requirement | `app_settings` + `can_user_go_live()` RPC | — | `GoLive` |
| Party mode capacities | Fixed by mode (video=4, audio=10, game=4) — from `seatConfig` in `CreateParty.tsx` | — | `CreateParty` |
| Party backgrounds | `party_room_backgrounds` | full row | Create Party form |
| Categories | `categories` (party), `live_categories` (live) | full rows | pickers |

Admin edits → **`admin-table-update` window event** or Supabase Realtime → all clients (Web + Flutter) invalidate cache instantly. Confirmed in `useFeatureLevelCheck.ts` lines 64–75.

---

## 2. GO LIVE — exact behavior per role

**Server truth:** RPC `can_user_go_live(user_id)` — enforces the same rules server-side. Client mirrors it in `isApprovedLiveHost()` (line 60, `GoLive.tsx`).

### 2.1 Gate matrix

| Profile state | What user sees | Path |
|---|---|---|
| `is_host=true` **AND** `host_status='approved'` **AND** face verified | Full setup screen, "Go Live" enabled | happy path |
| `is_host=true` **AND** `host_status!='approved'` | "Host application pending" card | wait for admin approval |
| `is_host=false` **AND** face verified | Level check → if `user_level >= feature_level_requirements.go_live.min_level_user` → full setup; else level card | admin-controlled |
| `is_host=false` **AND** face NOT verified | Full-screen face-verification gate → CTA `/face-verification` | admin flow |
| `gender='female'` (auto-host per Chamet convention) | Treated as host for level bypass; still needs face verify | same |

Realtime subscribes to `profiles`, `face_verification_submissions`, `host_applications` — gate auto-dismisses the moment admin approves. (`GoLive.tsx` line 762.)

### 2.2 Setup screen (verified host, ready to publish)
- Native full-screen camera preview via `LiveKitPlugin.startLocalPreview` (Kotlin) — transparent WebView on top
- 1080p locked, 3-layer simulcast (`livekitPublishLock.ts`)
- `SCALE_ASPECT_FILL` — no letterbox, no over-zoom
- Overlays: avatar+level chip, verified check (green if verified), flip cam, beauty, background, sticker, music, PK toggle, category chip, title input (3–40 chars), cover photo (auto = face-verification image), red "Go Live"
- ScreenLock kept awake (`useScreenLock(true)`)
- Audio focus: Spotify/YouTube auto-paused (`useNativeAudioFocus`)

### 2.3 Publish flow
1. Insert `live_streams` row (status=`preparing`) → `stream_id`
2. Edge fn `livekit-token-issue` → publisher token, room `live_<stream_id>`
3. `LiveKitPlugin.connect(url, token, mode='publish')`
4. Update `live_streams.status='live'` + `stream_viewers` insert (host self)
5. Handoff (no navigation): if inside `<LiveSessionProvider>` swap phase → in-room; otherwise navigate `/live-stream?stream_id=...&role=host`. WebView never unmounts — camera track stays alive.

---

## 3. CREATE PARTY — exact behavior per role

### 3.1 Gate matrix
`isEligiblePartyHost` (line 57, `CreateParty.tsx`) → `is_host=true` OR `host_status='approved'` OR `gender='female'`.

Then `checkFeatureAccess('create_party', currentLevel, isHost)`:
- `currentLevel = max(realtime_level, user_level, host_level, max_user_level)`
- If `result.canAccess=false` → **`LevelRequiredCard` overlay** with:
  - Big current level badge
  - Progress bar toward required level (`result.requiredLevel` from admin)
  - "How to level up" list (recharge, gifting, daily tasks)
  - CTA "Recharge to level up" → `/wallet`

Verified hosts almost always have `min_level_host=0` in admin → they pass instantly.

### 3.2 Mode picker (line 175)
Three cards, `seatConfig`:
- **Video Party** → 4 seats, 2×2 grid, cameras on
- **Audio Party** → 10 seats, 2×5 grid, no camera opened (`useProCamera` disabled)
- **Game Party** → 4 seats + game picker (games from `game_configs`)

### 3.3 Configuration form
- Cover image (default from `party_room_backgrounds`, upload optional)
- Title (max 30)
- Category (from `categories`)
- Optional entry fee (`roomEntryFee`) — **password locking fully removed** per current implementation ("Party rooms are always public — Chamet/Bigo/Poppo standard")
- Announcement / welcome message
- Country auto-detected

### 3.4 Create flow
1. Native LiveKit prejoin camera acquired via `useProCamera` ref-counted arbiter — **same LocalVideoTrack** reused into PartyRoom (no Camera2 re-open)
2. Insert `party_rooms` row with mode + capacity
3. Edge fn `party-room-token` → publisher token
4. Auto-take seat 0
5. Phase swap to `InRoomPhase` (no route nav) so prejoin preview persists

---

## 4. MATCH CALL — exact behavior per role

File: `src/pages/MatchCall.tsx`. Phases: `prep → searching → matched → error`.

### 4.1 Gate
- Balance ≥ `random_call_settings.diamond_price_per_minute` × 1 minute
- (Level gate optional — read from `feature_level_requirements.match_call` if row exists)
- Face verify required only for **hosts receiving** calls, not for callers

### 4.2 Prep screen
- Self-camera preview, mirrored
- Filters: language[], country, host_gender — all read from `random_call_settings`
- Balance pill: coins + rate/min
- Hosts-online counter: `get_online_global_hosts` RPC + Realtime on `profiles`/`host_match_availability`/`host_match_stats`/`live_streams` (line 66)
- Instant mode: `?instant=1` skips prep, auto-fires

### 4.3 Searching
- `AnimatedGlobeBackdrop`, elapsed timer, cancel
- Server-authoritative min-billable + free-trial in `settle_random_call()` — client only displays
- Skip counter enforced via `random_call_skip_counters`

### 4.4 Matched → routes to `ActiveCallScreen` with `mode='random'`. Post-call → `PostCallRatingSheet` → writes `random_call_ratings`.

---

## 5. Verified Host vs Regular User — behavior summary

| Action | Regular verified user | Verified host (`host_status=approved`) |
|---|---|---|
| Go Live | Needs `min_level_user` from admin | Level bypass (`min_level_host` usually 0) |
| Create Party | Needs `min_level_user` | Level bypass |
| Match Call — caller | Any level, needs balance | Same |
| Match Call — receiver | Not eligible | Auto-enrolled in `host_match_availability` |
| Private Call — caller | Needs balance | Same |
| Private Call — receiver | Not eligible | Rings on native `IncomingCallActivity` even from background (FCM high-priority, `ring_timeout_seconds` from admin) |
| Face verify | Optional for join-only actions | **Mandatory** — server `can_user_go_live` blocks otherwise |

---

## 6. Consumption surfaces — recap (already audited earlier)

- **Live Stream** — host bar (flip/beauty/sticker/music/PK/co-host/gift-earned/settings/end) vs viewer bar (chat/gift/like/share/follow/report/leave). Shared overlay stack: entry banners, flying names, VAP/SVGA/Lottie via `GlobalGiftOverlay` FIFO, chat stream, top-gifters, animated viewer count.
- **Party Room** — mode-aware grid (2×5 audio / 2×2 video / 2×5+game). Seat sheet with role-specific actions (kick/mute/invite/lock/leave/request/gift).
- **Private Call** — full-bleed remote + PIP self; bar (mute/cam/flip/speaker/gift/chat/end); bi-directional call chat (`call_chat_messages`); per-minute billing via `process_billing_tick()` reading admin rates.
- **Match Call** — same as Private Call + Next button + 40s min-billable indicator + free-trial pill.

All 4 surfaces share the **one Gift Panel** (G6/G7/G8 done) and the **single full-screen gift overlay**.

---

## 7. Kotlin (Native Android) — parity checklist

| Component | Purpose | File |
|---|---|---|
| `LiveKitPlugin.kt` | Publisher/subscriber, `startLocalPreview`, `attachLocal`, `SCALE_ASPECT_FILL`, 1080p lock, simulcast | ✅ exists |
| `NativeGiftAnimationPlugin.kt` | VAP/SVGA/Lottie/MP4/image, priority queue, 3 slots, lifecycle | ✅ exists |
| `NativeEntryAnimationPlugin.kt` | Entry banners, flying names | ✅ exists |
| `GiftAudioMixer.kt` | SoundPool + MediaPlayer ducking | ✅ exists |
| `IncomingCallActivity` | Fullscreen incoming call over lock screen | ✅ exists |
| FCM high-priority handler | Ring under Doze | ✅ exists |
| MethodChannel `flutter_livekit_bridge` | Expose all above to Flutter | ⚠️ **Phase C2 pending** |

---

## 8. Flutter (`merilive_app/`) — parity checklist

| Screen | Web mirror | Status |
|---|---|---|
| Home / Discover / Reels / Party tab | done in earlier sectors | ✅ |
| Create bottom action | 3 cards → routes | ⏳ C1 |
| Native camera preview bridge | MethodChannel → `LiveKitPlugin` | ⏳ C2 |
| Go Live screen (gates + setup + publish) | `GoLive.tsx` | ⏳ C3–C4 |
| Create Party screen | `CreateParty.tsx` | ⏳ C5 |
| Party Room handoff (seat 0) | `PartyRoom.tsx` | ⏳ C6 |
| Match Call prep + searching + hosts-count | `MatchCall.tsx` | ⏳ C7 |
| Live/Party/Call/Match viewer+host UIs | `LiveStream.tsx`, `PartyRoom.tsx`, `ActiveCallScreen.tsx` | ⏳ C8 |
| Unified gift panel + `GlobalGiftOverlay` | done | ✅ G6–G8 |
| Cross-surface QA (owner account) | — | ⏳ C9 |

---

## 9. Non-negotiable execution rules

1. **Web = source of truth.** Any Flutter/Kotlin drift = bug.
2. **Admin panel = single source of truth for numbers.** No hardcoded levels, rates, timers, capacities. Read tables listed in §1.
3. **English-only UI strings** in all layers.
4. **Design SACRED.** This plan changes only Flutter/Kotlin missing pieces + occasional Web parity fixes discovered during audit — no cosmetic redesign.
5. **Research-first per phase.** Before each C-phase I run a Chamet/Bigo/Olamet parity check (Agora → LiveKit translation) and update this doc.
6. **Owner test account** (`smdollarex923@gmail.com`) verification required before I claim a phase done.
7. **APK rebuild honesty.** Any Kotlin change = I state "APK rebuild needed" explicitly.

---

## 10. Suggested execution order (I stop at each ✋ for your approval)

1. **C1** — Flutter Create action + routes (safe, no plugin)
2. **C2** — Kotlin MethodChannel bridge (biggest unlock; APK rebuild)
3. **C3** — Flutter Go Live gates (face + host + admin level)
4. **C4** — Flutter Go Live publish + handoff to Live Stream
5. **C5+C6** — Flutter Create Party + Party Room seat-0 handoff
6. **C7** — Flutter Match Call prep + searching
7. **C8** — Flutter consumption surfaces (viewer+host) for all 4 rooms
8. **C9** — Full owner-account QA + parity report

---

## 11. Your call

Reply with **the phase number to start** (e.g. "start C1") or ask me to adjust any gate/rule above before we begin. Nothing gets coded until you approve.
