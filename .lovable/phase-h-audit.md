# Phase H+ Deep Parity Audit — Live Streaming (Web → Flutter/Android)

_Last updated: 2026-07-02_

**Honest scope reality:** The web live-streaming stack ships **~150+ files** covering pages, components, hooks, and LiveKit orchestration lib code. The Flutter/Android module today covers **~40 files**. This gap cannot be closed in a single turn; it is being closed phase-by-phase without asking the user to pick priorities.

## Web inventory (source of truth)

| Layer | Count | Location |
|---|---|---|
| Pages | 11 | `src/pages/` (Live, LiveStream, GoLive, LiveFeed, HostDashboard, HostApplication, LiveSessionPage, HostBonusLedger, HostTransferHistory, AgencyHostManagement, ChametStyleGoLive) |
| Components | 50 | `src/components/live/` |
| Hooks | 22 | `src/hooks/useLive*`, `useLiveKit*`, `useNativeLiveKit*`, `useHostCallRate`, `useHostGiftPercent`, `useStreamQualityDirector` |
| LiveKit lib modules | 79 | `src/lib/livekit*`, `src/lib/nativeLiveKit*` |
| **Total** | **~162** | |

## Flutter inventory (current)

| Layer | Count | Notes |
|---|---|---|
| Screens | 2 | `live_feed_page`, `live_stream_page` |
| Widgets | 26 | includes new I1 overlays |
| Data bridges | 11 | chat, host, viewer, viewers, follow, reactions, raise-hand, moderation, 3× PK |
| Services | 3 | audio-focus, face-detection, voice-monitor |
| **Total** | **~42** | |

## Component-level parity matrix

| Web component | Flutter status | Notes |
|---|---|---|
| `AnimatedViewerCount` | ❌ missing | small — port next |
| `AudioUnlockOverlay` | ✅ **I1 ported** | `live_audio_unlock_overlay.dart` |
| `BeautyFilterPanel` | 🟡 `live_beauty_panel.dart` | UI only, native GPUPixel pending |
| `BigoStyleJoinBanner` | ✅ **I2 ported** | `live_bigo_join_banner.dart` |
| `ChametStyleGoLive` | ❌ missing | GoLive rewrite still open |
| `CinematicEntranceOverlay` | ✅ **I1 ported** | `live_cinematic_entrance_overlay.dart` |
| `CoHostPanel` | 🟡 `live_multi_guest_sheet.dart` | partial parity |
| `DisconnectReasonToaster` | ❌ missing | small |
| `EntryBannerAnimation` | 🟡 native VAP path | Kotlin plugin, no Flutter fallback |
| `EntryNameBarAnimation` | 🟡 native VAP path | same as above |
| `EntryNameBarPreview` | ❌ missing | preview screen only |
| `FlyingGiftAnimation` | 🟡 `flying_gift_capsule.dart` | reduced parity |
| `FlyingJoinBanner` | ❌ missing | superseded by Bigo variant |
| `GiftAnimation` | 🟡 native VAP path | Kotlin |
| `GiftComboDisplay` / `GiftComboTracker` | 🟡 `live_gift_combo_bar.dart` | tracker logic missing |
| `GiftPanel` | 🟡 `unified_gift_sheet.dart` | swipe grid missing |
| `GiftSwipeableGrid` | ❌ missing | needed for gift panel parity |
| `HostCallReturnModal` | ❌ missing | private-call return prompt |
| `LiveCaptionsOverlay` | ✅ **I2 ported** | `live_captions_overlay.dart` (stream-driven) |
| `LiveKitVideoPlayer` | 🟡 `livekit_bridge.dart` | remote track render exists; VU meter/PIP missing |
| `LiveTasksCard` | ❌ missing | daily tasks card on live |
| `LocalMicVuMeter` | ❌ missing | small, self-contained |
| `LottieGiftEffects` | ❌ missing | Lottie deps ready in gradle |
| `MusicPlayerPanel` | 🟡 `live_music_sheet.dart` | UI only, no cover art / progress |
| `NewHostBonusCard` | ❌ missing | onboarding bonus |
| `PKBattleActive` | 🟡 `pk_battle_overlay.dart` | 1/4 phases |
| `PKBattlePanel` | 🟡 `live_pk_start_sheet.dart` | start-request UI |
| `PKBattleRequest` | ❌ missing | incoming PK modal |
| `PKBattleResult` | ❌ missing | winner reveal |
| `PKPunishmentOverlay` | ✅ `pk_punishment_overlay.dart` | verify parity |
| `PKRandomMatchNotification` | ❌ missing | matchmaking toast |
| `PictureInPictureButton` | ❌ missing | Android PIP mode |
| `PremiumFlyingGiftBanner` | ❌ missing | premium banner variant |
| `PremiumJoinChatOverlay` | ❌ missing | VIP chat welcome |
| `PremiumViewerProfileCard` | ❌ missing | **HIGH PRIORITY — biggest gap** (637 lines) |
| `PrewarmDiv` | n/a | web-only warmup |
| `ProfessionalChatMessage` | 🟡 `live_chat_overlay.dart` | tier badges missing |
| `ProfessionalHostInfo` | 🟡 `live_stream_page.dart` inline | follow/gift-diamonds inline; not extracted |
| `RoomEntranceNotification` | 🟡 native path | Kotlin |
| `ScreenShareButton` | ❌ missing | native LK screen share |
| `SipDialPadDialog` | ❌ missing | SIP inbound dial pad |
| `StackingJoinNotifications` | ✅ **I1 ported** | `live_stacking_join_notifications.dart` |
| `StickerOverlay` | ❌ missing | receiver side |
| `StickerPanel` | 🟡 `live_sticker_sheet.dart` | send side only |
| `UnifiedEntryAnimation` | 🟡 native path | Kotlin |
| `ViewerListPanel` | 🟡 `live_viewers_sheet.dart` | list only, no kick/mute controls |
| `ViewerProfileCard` | ❌ missing | basic variant of premium card |

**Score:** 5/50 fully ported, 18/50 partial, 27/50 missing → **~30% widget parity**.

## Hook / lib parity (backend orchestration)

Not enumerated line-by-line because most hooks fold into either `livekit_bridge.dart` (Kotlin) or Supabase realtime subscriptions inside screens. Known missing behaviors:

- `useLiveStreamSwipe` — vertical swipe navigation between streams
- `useLiveStreamLifecycle` — bg/foreground pause/resume of camera and audio
- `useLiveKitPrewarm` / `useLiveKitRpcHandlers` — server RPC ping/pong
- `useStreamQualityDirector` — auto layer/simulcast selection
- `useLiveVoiceMonitor` — server audio-level metadata for chat overlays

## Phase execution plan (no more asking — just doing)

- **Phase I1 (done):** `AudioUnlockOverlay`, `StackingJoinNotifications`, `CinematicEntranceOverlay`
- **Phase I2 (done):** `BigoStyleJoinBanner`, `LiveCaptionsOverlay`
- **Phase I3:** `PremiumViewerProfileCard` (largest single gap) + `AnimatedViewerCount` + `DisconnectReasonToaster`
- **Phase I4:** PK Battle full 4-phase (Request → Active → Result → Punishment already exists) + `PKRandomMatchNotification`
- **Phase I5:** Gift stack — `GiftSwipeableGrid`, `GiftComboTracker`, `PremiumFlyingGiftBanner`
- **Phase I6:** Chat polish — `ProfessionalChatMessage` tier badges, `PremiumJoinChatOverlay`
- **Phase I7:** Screen sharing + PIP + local VU meter
- **Phase I8:** Sticker overlay + Music player cover-art + Live tasks card
- **Phase I9:** ChametStyleGoLive rewrite (host prejoin UX) + Live-stream vertical swipe
- **Phase I10:** Wire everything into `live_stream_page.dart` + Supabase realtime feeds + APK-rebuild handoff

## Truth line

**We are not at 100% parity today.** We are at ~30% widget parity, ~40% bridge parity. Every phase above narrows that gap. Full 100% requires ~8 more focused turns (widget code) + on-device APK verification cycles.
