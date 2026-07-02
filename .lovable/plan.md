# Sector 3 — Reels / Discover Tab

Flutter target: `merilive_app/lib/features/reels/` (new). Pixel + behavior parity with `src/pages/Reels.tsx` (1425 lines) plus Chamet/Bigo/TikTok-standard patterns from the background research brief (applied per step).

Web `src/pages/Reels.tsx` stays untouched — Flutter is a parallel implementation.

## Build Order (R1 → R8)

### R1 — Data Layer
- `reels_models.dart` — Reel, Comment, Sound, ReelCategory
- `reels_repository.dart` — feed pagination (cursor by `created_at`), category list, per-reel comments, likes, share increment, view record
- Ports web supabase queries: `reels` join `profiles`, `reel_likes`, `reel_comments`, `reel_categories`, `reel_shares`, `reel_views`, `saved_reels`, `followers`
- Realtime channels for like_count / comment_count patches (parity with web `subscribeToTables`)

### R2 — Vertical Feed Skeleton
- `reels_feed_page.dart` — `PageView.builder(scrollDirection: vertical)` with cached_network_image thumbnails
- Category chips top strip (horizontal) — All / Following / per-category (data from `reel_categories`)
- Empty + error + end-of-feed states (no fake skeletons — real spinner only per project rule)
- Pull-to-refresh via `RefreshIndicator` on the page view wrapper

### R3 — Video Player Core
- `reel_player_widget.dart` using `video_player` + `chewie`-less custom controls
- Preload window: prev-1, current, next-2 (TikTok pattern from research)
- Autoplay muted-off (Chamet default = sound on, unlike TikTok's muted); persist mute across swipes via `ReelsPreferences`
- Single tap = pause/play toggle with center icon flash
- Double tap = like + heart burst (native `tryHeartBurst` bridge already exists on Android)
- Loop, first-frame latency target <300ms, aspect-fit with blurred background fill for non-9:16

### R4 — Right Rail Actions
- Vertical stack: `FramedAvatar` + Follow (+) → Like → Comment → Gift → Share → More
- Counts formatted (1.2K / 3.4M)
- Follow button hides when already following or self-owned
- All buttons debounced 400ms; optimistic like/unlike with rollback on error

### R5 — Bottom Info + Music Ticker
- Username row with level badge, verified check, live-now badge (tap → LiveViewer)
- Caption with expand-on-tap ("more"/"less")
- Music row: spinning cover disc + scrolling title/artist marquee
- Tap music row → SoundDetail sheet (list of reels using that sound) — deferred to R8 stretch

### R6 — Comments Sheet
- `DraggableScrollableSheet` bottom sheet (0.55 → 0.9)
- List with reply threading (1 level), pinned by creator badge
- Realtime append via supabase channel on `reel_comments`
- Send composer with @mention autocomplete disabled for MVP (parity with current web)
- Optimistic insert with pending state

### R7 — Gift + Share + Report/Block
- Gift button opens existing native gift sheet bridge (reuse Home tab wiring if exists; else stub Flutter sheet feeding `gift_transactions` via RPC)
- Share sheet: WhatsApp / Copy Link / Save Video (native share plugin already in pubspec check)
- More menu: Report (categories from web) / Block user / Not interested / Save reel

### R8 — Analytics, Prefetch, Polish
- Fire `reel_views` insert at 3s watched (Chamet threshold from research)
- Watch-time buckets logged to `reel_moderation_log` style event table
- Prefetch next 2 video URLs via `http` head-only + first 512KB range request (mirrors `useReelsPrefetcher`)
- Lifecycle: pause current video when app backgrounds or route changes (integrate with `AppLifecycleState`)
- Wire the tab into `home_shell_page.dart` replacing the placeholder

## Technical Notes

- **New Flutter deps to add** (single `bun-equivalent` install at R3): `video_player`, `visibility_detector`, `share_plus`
- **Native bridges reused** on Android APK build only (no-op on web/iOS): `NativeHeartBurst`, `NativeReelsPlayer` (evaluate whether we invoke it or stay with `video_player` — decision at R3 after research brief lands)
- **Realtime**: `reel_likes` + `reel_comments` per-reel channel opened only for the currently visible reel (± 1) to keep concurrent subscriptions ≤3 — cost-safe
- **Rules honored**: research-first (brief pending before R3 player choices), admin-panel single source of truth (no hardcoded thresholds — read from `app_settings` where a knob exists), English-only UI strings, design-sacred does NOT apply (redesign allowed per 2026-06-18 lift), no fake loading UI
- **Files created**: ~12 new files under `merilive_app/lib/features/reels/{data,bloc,widgets,pages}/`

## Web Side
Zero changes to `src/pages/Reels.tsx` or any web reels files.

## Verification per step
After each R-step: run `flutter analyze` via harness build, log tail for errors, then confirm to user before moving to next.

## Which step first?
Recommend starting R1 (data layer) — foundation for everything else. Ask user to confirm or pick a different starting step.
