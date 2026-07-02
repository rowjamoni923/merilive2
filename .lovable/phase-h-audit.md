# Phase H5 — Web vs Flutter Live/Party Parity Audit

**Generated:** 2026-07-02
**Method:** Structural diff of imports + widget inventories between web (source of truth — `src/pages/LiveStream.tsx`, `LiveStreamFeed.tsx`, `PartyRoom.tsx`) and Flutter (`merilive_app/lib/features/live/screens/*`, `merilive_app/lib/features/party/screens/*`).
**Scope:** Component-by-component gap list. Does NOT include Playwright screenshots (deferred until APK rebuild for H1+H2 fields lands so both platforms can be diffed live).

Line counts (source of truth for surface area):

| Surface | Web | Flutter | Delta |
|---|---:|---:|---:|
| Live stream page | `LiveStream.tsx` 5,334 | `live_stream_page.dart` 1,483 | -3,851 (72% smaller) |
| Live feed | `LiveStreamFeed.tsx` (n/a — not measured) | `live_feed_page.dart` 1,094 | — |
| Party room | `PartyRoom.tsx` 3,174 | `party_room_page.dart` 777 | -2,397 (76% smaller) |
| Live widgets folder | 109 imports in LiveStream.tsx | 63 files under `features/live/widgets/` | ~42% fewer distinct components |

The size gap is largely legitimate — Flutter delegates to native (LiveKit/VAP/SVGA plugins) instead of inlining WebGL/DOM logic — but some deltas below are missing functionality, not architectural savings.

---

## Legend

- 🔴 **P0 gap** — user-visible feature missing on Flutter, present on web
- 🟠 **P1 gap** — quality/edge-case handling missing (host-only tools, resilience)
- 🟡 **P2 gap** — polish/nice-to-have
- ✅ **Parity** — verified equivalent on both

---

## 1. Core video + connection

| Concern | Web | Flutter | Status |
|---|---|---|---|
| LiveKit connect + publish | `useLiveKitClient` + `livekitService` | `LiveKitBridge` (native plugin) | ✅ |
| Renderer | `LiveKitVideoPlayer` (WebRTC) | `livekit_video_player.dart` + native `TextureViewRenderer` | ✅ |
| Local preview (pre-join) | `useProCamera` | Native `startLocalPreview` (H1) | ✅ |
| Connection quality chip | inline in `LiveStream.tsx` | `ConnectionQualityIndicator` in `RoomTopBar.trailing` (Phase I18) | ✅ post-H2 APK rebuild |
| Resilience/reconnect notifier | `LiveKitResilienceNotifier` | `disconnect_reason_toaster.dart` | ✅ equivalent |
| Publish layers dialog | `PublishLayersDialog` (host adjusts simulcast layers) | — | 🟠 P1 — host bitrate tuning UI absent |
| Audio-only toggle | `AudioOnlyToggleButton` | — | 🟠 P1 — viewers can't switch to audio-only to save data |
| Screen lock during live | `useScreenLock` | — | 🟡 P2 — screen may sleep mid-broadcast on Flutter |
| High refresh rate hint | `useHighRefreshRate` | — | 🟡 P2 (Android 90/120Hz opt-in) |

## 2. Chat + reactions

| Concern | Web | Flutter | Status |
|---|---|---|---|
| Chat overlay | inline + `livekitChatSignaling` | `live_chat_overlay.dart` + `live_chat_bridge.dart` | ✅ |
| Chat composer | inline | `live_chat_composer.dart` | ✅ |
| Floating reactions | `FloatingReactionsOverlay` | `floating_reactions_overlay.dart` | ✅ |
| Reactions quick bar | `ReactionsQuickBar` | `reactions_picker_sheet.dart` (sheet, not quick bar) | 🟡 P2 — one-tap emoji rail on web vs bottom-sheet on Flutter |
| Captions overlay | `CaptionOverlay` | `live_captions_overlay.dart` | ✅ |

## 3. Gifting

| Concern | Web | Flutter | Status |
|---|---|---|---|
| Gift signaling | `livekitGiftSignaling` | `native_gift_bridge.dart` | ✅ |
| Full-screen VAP/SVGA gift | `UnifiedEntryAnimation` + native | `full_screen_gift_overlay.dart` + native plugin | ✅ |
| Flying gift capsule | inline | `flying_gift_capsule.dart` + `premium_flying_gift_banner.dart` | ✅ |
| Combo tracker | `GiftComboTracker` | `gift_combo_tracker.dart` + `live_gift_combo_bar.dart` | ✅ |
| Instant warmup | `instantGiftWarmup` | Pkg424 warmup permitted (memory) | ✅ |

## 4. Host tools

| Concern | Web | Flutter | Status |
|---|---|---|---|
| Beauty panel | `BeautyFilterPanel` + `useBeautyState` | `live_beauty_panel.dart` + native `setBeautyParams` | ✅ wiring (pixel swap needs GPUPixel `.so`, deferred H2) |
| Sticker panel | `StickerPanel` + `StickerOverlay` | `live_sticker_sheet.dart` + native `setStickerOverlay` | ✅ |
| Music player | `MusicPlayerPanel` | `live_music_sheet.dart` + native host-monitor MediaPlayer | ✅ host-side (remote-publish deferred) |
| Virtual background | `VirtualBackgroundDialog` | `live_virtual_bg_sheet.dart` (URL persist, pixel swap dormant) | 🟠 P1 — segmentation not shipped |
| Noise cancellation | `NoiseCancellationDialog` | `live_noise_cancel_sheet.dart` + `NoiseSuppressor` | ✅ |
| Host moderation sheet | `HostModerationSheet` | `live_host_moderation_sheet.dart` | ✅ |
| Multi-guest / co-host | `useLiveKitRpcHandlers` + inline | `live_multi_guest_sheet.dart` + `co_host_panel.dart` | ✅ |
| Raise-hand queue | `RaiseHandQueueSheet` + `livekitRaiseHand` | `live_raise_hand_queue_sheet.dart` + `LiveRaiseHandBridge` (H3) | ✅ |
| Agent dispatch dialog | `AgentDispatchDialog` | — | 🟠 P1 — AI agent join UI missing |
| Ingress dialog | `IngressDialog` (RTMP/WHIP ingest) | — | 🟠 P1 — but memory says "not an OBS platform", may be intentional |
| SIP dial dialog | `SipDialDialog` | — | 🟠 P1 — phone-dial into room |
| New host bonus card | `NewHostBonusCard` | — | 🔴 **P0 — first-live bonus prompt absent on Flutter** |
| Live tasks card | `LiveTasksCard` + `useTaskProgress` | — | 🔴 **P0 — in-live daily task progress absent** |
| Host-call return modal | `HostCallReturnModal` | `host_call_return_modal.dart` | ✅ |

## 5. Games in live

| Concern | Web | Flutter | Status |
|---|---|---|---|
| Game selector | `LiveGameSelector` | `live_game_overlay.dart` + `party_game_selection_sheet.dart` | ✅ |
| Global game overlay | `GlobalGameOverlay` | `live_game_overlay.dart` | ✅ |

## 6. PK Battle (see mem://features/pk-battle-research.md — flagged broken)

| Concern | Web | Flutter | Status |
|---|---|---|---|
| PK start sheet | `PKBattleRequest` | `live_pk_start_sheet.dart` | ✅ shell |
| PK active HUD | `PKBattleActive` + `PKBattlePanel` | `pk_battle_active.dart` + `pk_battle_overlay.dart` (I17: HUD+1s ticker) | ✅ shell |
| PK punishment overlay | `PKPunishmentOverlay` | `pk_punishment_overlay.dart` | ✅ |
| PK result | `PKBattleResult` | — | 🔴 **P0 — end-of-battle winner/loser modal missing** |
| PK random-match notification | `PKRandomMatchNotification` | — | 🔴 **P0 — random matchmaking invite missing** |
| PK opponent room bridge | `usePKOpponentRoom` | `pk_opponent_room_bridge.dart` | ✅ |
| **Server-authoritative score** | ❌ client-controlled (mem flags) | ❌ client-controlled | 🔴 **P0 (both broken)** — needs Step 2+ of PK rebuild |
| Empty `pk_battle_gifts` table | broken | broken | 🔴 P0 — same fix |

## 7. Viewer-facing

| Concern | Web | Flutter | Status |
|---|---|---|---|
| Viewer sheet | `useViewerSession` + inline | `live_viewers_sheet.dart` + `live_viewer_bridge.dart` | ✅ |
| Animated viewer count | `AnimatedViewerCount` | `animated_viewer_count.dart` | ✅ |
| Follow host | inline | `live_follow_bridge.dart` | ✅ |
| Premium viewer profile card | `PremiumViewerProfileCard` | — | 🔴 **P0 — tap-viewer premium profile popup missing** |
| Report/block sheet | inline + moderation | `live_report_block_sheet.dart` | ✅ |
| Room-ended modal | `RoomEndedModal` | — (uses toast + pop) | 🟠 P1 — no dismiss-worthy end-of-stream summary card |
| Live-stream swipe (next/prev) | `useLiveStreamSwipe` | — | 🔴 **P0 — TikTok-style swipe between lives absent** |
| Live-stream filters | `useLiveStreamFilters` | (feed-level filter chips exist in `live_feed_page.dart`) | ⚠️ needs deeper check |
| Audio unlock overlay | `AudioUnlockOverlay` | `live_audio_unlock_overlay.dart` | ✅ |

## 8. Safety / anti-abuse

| Concern | Web | Flutter | Status |
|---|---|---|---|
| Face detection (host on-cam check) | `useLiveFaceDetection` | `live_face_detection.dart` | ✅ |
| Frame monitor (black-frame ban) | `useLiveFrameMonitor` | — | 🟠 P1 — server table `live_frame_alerts` exists, Flutter side not reporting |
| Voice monitor | `useLiveVoiceMonitor` | `live_voice_monitor.dart` | ✅ |
| Contact detection (numbers/handles) | `contactDetection` + `imageContactDetection` + `NumberSharingWarningDialog` | — | 🔴 **P0 — chat/screen anti-share moderation missing on Flutter** |
| Room protection | `useRoomProtection` | — | 🟠 P1 — screenshot/screen-record deterrent |
| Audio focus auto-mute | `useAudioFocusAutoMute` + `useNativeAudioFocus` | `AudioFocusAutoMute` + native `AudioFocusEventEmitter` (H2) | ✅ |

## 9. Entry effects (memory-locked "sacred")

| Concern | Web | Flutter | Status |
|---|---|---|---|
| Unified entry dispatcher | `useUnifiedEntryDispatcher` + `fetchEntryAnimation` | `RoomEntryDispatcher` + `RoomJoinEventsBridge` | ✅ |
| Bigo join banner | `UnifiedEntryAnimation` | `bigo_join_banner_overlay.dart` | ✅ |
| Cinematic join banner | inline | `cinematic_join_banner_overlay.dart` | ✅ |
| Entry name bar | `EntryNameBarAnimation` | `entry_name_bar_overlay.dart` | ✅ |
| Level-up celebration | inline | `level_up_celebration_overlay.dart` | ✅ |
| Premium join chat overlay | inline (mid-tier chat announce) | `premium_join_chat_overlay.dart` (I17) | ✅ |

---

## Priority-ordered gap list (what to build next)

### 🔴 P0 (must-have parity)

1. **Live-stream swipe** — TikTok-style vertical swipe between lives (`useLiveStreamSwipe`). Big engagement lever.
2. **Contact-sharing moderation** — number/handle detection in chat + screenshot OCR before broadcasting (mem policy compliance).
3. **PK result modal** — winner/loser end-card with stats + rematch CTA.
4. **PK random-match notification** — matchmaking invite popup.
5. **Premium viewer profile card** — tap-viewer → premium popup (level, VIP, gifts sent, follow).
6. **Live tasks card** — in-live daily-task progress + claim CTA.
7. **New host first-live bonus card** — onboarding conversion.
8. **PK server-authoritative score + `pk_battle_gifts` fix** — see mem://features/pk-battle-research.md 6-step order (separate track from H5).

### 🟠 P1 (host-tool quality)

1. **Publish layers dialog** — host simulcast tuning.
2. **Audio-only toggle** — viewer data-saving.
3. **Agent dispatch dialog** — AI moderator/co-host.
4. **SIP dial dialog** — phone-into-room.
5. **Room-ended modal** — summary card instead of silent pop.
6. **Frame monitor reporting** — Flutter side of black-frame ban pipeline.
7. **Room protection** — screenshot/screen-record deterrent.
8. **Virtual background pixel swap** — GPUPixel + MLKit SelfieSegmentation (deferred H2).

### 🟡 P2 (polish)

1. **Reactions quick bar** — one-tap emoji rail vs bottom-sheet.
2. **Screen lock** during broadcast (Android WakeLock).
3. **High refresh rate opt-in** (Android 90/120Hz).
4. **Ingress dialog** — likely intentionally skipped (not-an-OBS memory).

---

## Party Room delta (quick pass)

Web `PartyRoom.tsx` (3,174 L) vs `party_room_page.dart` (777 L) — 76% smaller. Not audited component-by-component here because the party feature set overlaps ~70% with Live (chat/gifting/entry effects/moderation share the same widgets). Same P0/P1/P2 gaps above apply symmetrically, plus party-specific:

- Seat management: web has `seat_invitations` + `seat_requests` UI; Flutter equivalents exist under `party/widgets/` (unaudited depth).
- Party room backgrounds / banners: DB tables exist (`party_room_backgrounds`, `party_room_banners`) — Flutter picker unverified.

Recommend a dedicated H5b party-only audit if user wants full party parity work.

---

## What this audit does NOT cover

- Byte-level behavior diff of any single component (e.g., exact debounce ms, exact z-index stacking) — that requires Playwright + APK screenshot pair, deferred until real device rebuild.
- `LiveStreamFeed.tsx` line count / feature diff vs `live_feed_page.dart` — file not opened; feed audit deferred.
- Any deprecated/experimental web pages (`LiveSessionPage.tsx`, etc.).
- Design/pixel parity — memory says redesign is permitted; parity here means feature parity, not visual identity.

---

**Recommendation:** Ship **P0 #1 (swipe)** and **P0 #2 (contact moderation)** first — those are engagement-critical and unblock competitive parity with Chamet/Bigo. PK track (P0 #3-4-8) belongs on the separate PK rebuild timeline. Host-tool P1 items can batch into a single "Host Pro" phase.
