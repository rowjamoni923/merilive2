# M14 — Create section: full web-parity, professional, zero placeholder

Goal: Flutter `GoLive prep` এবং `Create Party prep` screen দুটোকে হুবহু আমাদের production web (`src/pages/GoLive.tsx` 2278 lines + `src/pages/CreateParty.tsx` 1240 lines) এর মতো professional করে port করা। কোন option A/B, কোন default, কোন "coming soon" নেই — সব button সব control একদম web parity, live/publish handoff সহ।

---

## Scope (exactly these two prep screens — nothing else)

### 1. Go Live prep (Flutter port of `GoLive.tsx` + `ChametStyleGoLive.tsx`)
Fully replace `GoLivePlaceholderPage` with a professional `GoLivePrepPage`:

- **Header (top row)**
  - Close (X) → confirm dialog + camera teardown
  - Live-privacy pill (Public / Private / Password) → opens privacy sheet
  - Category chip (icon + name, from `live_categories` RPC) → opens category sheet
  - More menu (3-dot) → mirror, grid, sticker, beauty reset, report
- **Full-screen native camera preview** behind everything (already wired via `LiveKitBridge.startLocalPreview`). Grid overlay + mirror toggle honored.
- **Left side rail (vertical stack)**
  - Beauty (Wand icon) → `BeautyFilterPanel` bottom-sheet (smooth/whiten/slim/eye/rosy sliders + presets Natural/Soft/Sweet/Glam), live-applied via existing native beauty channel
  - Sticker (Smile) → `StickerPanel` grid sheet (server-side stickers)
  - Cover (Image) → cover image picker (camera capture / gallery / auto-frame snapshot) → uploads to storage bucket `live-covers`, sets `p_thumbnail_url`
- **Right side rail**
  - Flip camera (front/rear)
  - Mic on/off (native permission + LiveKit local audio track)
  - Mirror toggle
- **Bottom composer bar**
  - Avatar + display name chip
  - Title input (60 char, live counter, emoji-safe)
  - Big gradient "Start Live" CTA with pre-flight probe ("Checking connection…")
- **Gates + modals (web parity)**
  - `can_user_go_live` RPC + full deny mapping (face / host_not_approved / agency_required / account_blocked / banned / already_live / disabled / level / auth) already present — extend with:
    - Level lock modal (matches `LevelLockModal.tsx`) with progress + required level
    - Face verification prompt sheet (routes to `/face-verification`)
    - Already-live confirm → `end_live_stream` + retry
  - `is_user_live_banned` re-check right before publish
- **Publish handoff**
  - `start_live_stream` RPC with title, cover, category_id, live_privacy, password
  - `LiveHostBridge.startAsHost` (already exists) → replace route to `/live/:id`
  - `preservePreviewOnDispose = true` so Camera2 sensor is never torn down

### 2. Create Party prep (Flutter port of `CreateParty.tsx` + `ChametStyleSettingsPanel.tsx`)
Replace `CreatePartyPlaceholderPage` with `CreatePartyPrepPage`:

- **Header**: Close, title "Create Party", settings gear
- **Mode selector (top segmented)**: Video / Audio / Game (each with icon + gradient) — mirrors `PartyMode` enum
- **Full-screen preview**
  - Video mode → native camera preview (front, mirrored) — same LiveKitBridge preview path
  - Audio mode → animated gradient stage + host avatar with pulsing rings, mic level meter
  - Game mode → game preview card with selected game logo (or "Choose game" CTA opening `party_game_selection_sheet`)
- **Left rail**: Beauty (video only), Sticker, Cover
- **Right rail**: Flip cam (video only), Mic, Mirror (video only)
- **Bottom card**
  - Room title (40 char, emoji-safe)
  - Category chip (party_categories)
  - Seat count chip (4 / 6 / 8 / 9-seat, Chamet-standard) — from `party_configs`
  - Entry-fee optional (beans threshold), reads admin `party_settings`
  - Big gradient "Create Party" CTA
- **Gates**: `is_eligible_party_host` (already wired) + level check + face verification recommendation (not required)
- **Publish handoff**
  - `create_party_room` RPC (title, mode, game_id, category_id, seat_count, entry_fee, cover_url)
  - `PartyHostVideoBridge.startAsHost` (for video/game mode) → `/party/:id`
  - Audio mode uses `PartyLiveKitService.connectAudioOnly`

### 3. Shared sheets (create once, reuse both screens)
Under `merilive_app/lib/features/create/widgets/`:
- `beauty_filter_sheet.dart` — 5 sliders + 4 presets + reset, persists via `SharedPreferences` key `beauty_settings_v2` (parity with web `useBeautyState`)
- `sticker_picker_sheet.dart` — loads `live_stickers` table, applies via native `NativeStickerOverlay` channel (falls back to Flutter overlay if channel missing)
- `cover_picker_sheet.dart` — camera / gallery via `image_picker` + auto-snap current preview frame via `LiveKitBridge.snapshotLocalPreview()` (new bridge method), uploads to Supabase Storage `live-covers/{uid}/{ts}.jpg`
- `privacy_picker_sheet.dart` — Public / Private / Password (password → 4-digit numeric)
- `category_picker_sheet.dart` — realtime grid from `live_categories` (icon + name)
- `game_picker_sheet.dart` — reuses existing `party_game_selection_sheet`
- `pre_join_devices_sheet.dart` — camera + mic device list (native `LiveKitBridge.listDevices()`, new bridge method)

### 4. Native bridge additions (Kotlin `LiveKitPlugin`)
Purely additive PluginMethods, all safe no-ops on non-Android:
- `snapshotLocalPreview` → returns base64 JPEG from current `SurfaceViewRenderer` bitmap
- `listDevices` → returns `{cameras: [...], mics: [...]}` via Camera2 + AudioManager
- `setCameraDevice(deviceId)` and `setAudioInputDevice(deviceId)` — LiveKit RoomOptions restart-track
- `setBeautyParams({smooth, whiten, slim, eye, rosy})` — routes to existing GPUPixel filter chain
- `setStickerOverlay({stickerId|null, x, y, scale})` — routes to existing native sticker layer

Dart wrappers added in `LiveKitBridge`. All new methods `try/catch` returning `pending:true` so web + old APKs no-op cleanly.

### 5. Routing + wiring
- `app_router.dart`: replace `GoLivePlaceholderRoute` / `CreatePartyPlaceholderRoute` with `GoLivePrepRoute` / `CreatePartyPrepRoute`
- `create_action_sheet.dart`: swap route targets
- Old placeholder classes stay in file (marked `@Deprecated`) for one release so any deep-link still works
- `build_runner` regen for auto_route

### 6. Testing checklist (owner account `smdollarex923@gmail.com`)
- [ ] Go Live prep: preview visible within 500ms on Android, front cam mirrored
- [ ] All 5 beauty sliders live-apply, persist across close/reopen
- [ ] Cover: camera snapshot + gallery upload both save + preview
- [ ] Category + Privacy + Password gate all round-trip through RPC
- [ ] Start Live → LiveStream page lands with camera already publishing (zero re-init)
- [ ] End → back to home cleanly, no black flash
- [ ] Create Party: Video / Audio / Game mode swap without camera reopen
- [ ] Party create → Party room lands with seat, mic, cover intact
- [ ] Owner-account run all above, mark ✅/❌ in plan.md

---

## Technical section

**Files created**
- `merilive_app/lib/features/create/screens/go_live_prep_page.dart`
- `merilive_app/lib/features/create/screens/create_party_prep_page.dart`
- `merilive_app/lib/features/create/widgets/{beauty_filter_sheet,sticker_picker_sheet,cover_picker_sheet,privacy_picker_sheet,category_picker_sheet,pre_join_devices_sheet}.dart`
- `merilive_app/lib/features/create/data/{live_categories_repository,party_configs_repository,beauty_state.dart}`

**Files edited**
- `merilive_app/lib/core/native/livekit_bridge.dart` (+5 methods)
- `merilive_app/android_native/LiveKitPlugin.kt` (+5 PluginMethods)
- `merilive_app/lib/core/router/app_router.dart`
- `merilive_app/lib/features/home/widgets/create_action_sheet.dart`
- `merilive_app/lib/features/home/screens/action_placeholders.dart` (deprecate old classes)
- `merilive_app/pubspec.yaml` (add `image_picker`, `shared_preferences` if missing)

**RPCs / Storage (already exist — verified)**
- `can_user_go_live`, `is_user_live_banned`, `start_live_stream`, `end_live_stream`
- `create_party_room`, `is_eligible_party_host`
- Tables: `live_categories`, `party_categories`, `live_stickers`, `party_settings`
- Storage bucket: `live-covers` (create migration if missing)

**Rebuild note**
Native bridge additions require **APK rebuild** to take effect. All Dart-only changes hot-reload immediately in preview.

---

## Delivery order (single continuous run, no option prompts)
1. Bridge additions (Kotlin + Dart wrapper stubs)
2. Shared sheets (6 files)
3. GoLivePrepPage + wire routing
4. CreatePartyPrepPage + wire routing
5. Storage bucket migration if `live-covers` missing
6. Owner-account walkthrough report

আমি approve পেলে এক টানে 1→6 ship করব, কোন "option A/B" জিজ্ঞেস করব না।
