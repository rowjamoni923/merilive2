# Live Streaming A→Z Parity Plan — Web vs Flutter

Two parallel subagents audited `src/` (web, production reference) and `merilive_app/` (Flutter port). This plan lists every gap and the phased order to close them to 100% parity.

---

## Comparative gap matrix

| # | Section | Web reference | Flutter status | Gap |
|---|---|---|---|---|
| 1 | **LiveKit Kotlin plugin** | Camera2 + LiveKit SDK, publish/subscribe, attach renderer | `LiveKitFlutterPlugin.kt` — every method is a no-op TODO | 🔴 **BLOCKER** — nothing on Android actually streams |
| 2 | **Native entry-animation plugin** | Native SVGA/VAP/Lottie pipeline (`useNativeEntryDispatcher`) | `merilive/entry_animation` channel referenced but **no Kotlin plugin exists** | 🔴 All premium entrance videos silently downgrade |
| 3 | **Native gift-animation plugin** | Native VAP/SVGA/Lottie/MP4 with priority queue + audio mixer | `merilive/gift_animation` channel referenced but **no Kotlin plugin exists** | 🔴 No VAP alpha, no audio, no priority |
| 4 | **Beauty params bridge (Kotlin)** | GPUPixel real-time filter (5 sliders + presets) | Dart calls `setBeautyParams` but Kotlin `onMethodCall` doesn't dispatch it → `notImplemented()` crash | 🔴 |
| 5 | **`setStickerOverlay` + `snapshotLocalPreview` Kotlin dispatch** | GLSurface sticker + JPEG snapshot | Missing from Kotlin dispatch → `MissingPluginException` on cover snapshot | 🔴 Cover-snapshot flow crashes |
| 6 | **Host chat compose** | Host uses `RoomChatOverlay` composer identically to viewers | Composer gated `if (!_isHost)` — host can't send text | 🔴 UX broken |
| 7 | **In-stream `LiveBeautyPanel` per-slider push** | Sliders push to `openBeautyPanel()` native bridge live | Sliders UI-only, only `setBeautyEnabled(bool)` wired | 🟠 |
| 8 | **Gift combo bar** | `GiftComboTracker` + `GiftComboDisplay` (max 3 lanes, 4s window, right edge) | Completely missing | 🟠 Core engagement missing |
| 9 | **Flying gift capsule stack** | `FlyingGiftAnimation` (vertical stack ≤3, count-up, tier gradient) | Only full-screen queue exists; no capsule stack | 🟠 |
| 10 | **Go Live mode switch** (video/audio/game) | Segmented control in `GoLive.tsx` | Missing entirely | 🟠 |
| 11 | **Seat picker at prep stage** | Multi-guest seat count picker | Missing | 🟠 |
| 12 | **`/face-verification` route** | Real face-verify page | Deny CTA pushes `/face-verification` — route not registered → crash | 🟠 |
| 13 | **Live feed viewer controls** | Mute (speaker), share, category chips, country filter | All missing on Flutter feed | 🟠 |
| 14 | **Animated entry name-bar SVGA/Lottie render** | `EntryNameBarAnimation` renders SVGA with dynamic slots (avatar/name/level composited into timeline) | Only gradient pill; `animationUrl` field ignored | 🟠 Premium name-bars invisible |
| 15 | **Cinematic entrance (Duke/King/Marquis)** | `CinematicEntranceOverlay` full-screen rank cinematic | Missing branch in dispatcher | 🟡 |
| 16 | **Share sheet** (host, feed tile, more menu) | Native share API | Every share = snackbar stub | 🟡 |
| 17 | **Host coin/bean earnings HUD** | Live-updating bean counter in top bar | Fetched from DB but not rendered | 🟡 |
| 18 | **Reactions, Music, Tasks, Top-Up, Stickers (in-stream)** | Real sheets | All are snackbar stubs in more menu | 🟡 |
| 19 | **Bigo/Chamet join banner (`BigoStyleJoinBanner`)** | Left-slide capsule, tier gradient, pulse ring, shine sweep | Only chat system-message; no animated capsule | 🟡 |
| 20 | **Welcome coalescer** ("Alice and 3 others entered") | `createJoinMessageCoalescer` 500ms window | Missing — every join = separate row | 🟡 |
| 21 | **PK punishment overlay** | `PKPunishmentOverlay` (pig nose / dunce hat AR mask) | Missing | 🟡 |
| 22 | **PK opponent cross-room audio bridge** | `usePKOpponentRoom` subscribes to opponent LiveKit room | Missing — no cross-room audio | 🟡 |
| 23 | **`useLiveVoiceMonitor`** (F6 contact detector on mic transcripts) | ElevenLabs 20s chunks, `useContentModeration` | Missing | 🟡 |
| 24 | **`useLiveFaceDetection` + `useLiveFrameMonitor`** | Face-loss auto-close, verify.merilive.com external scan | Missing | 🟡 |
| 25 | **`useAudioFocusAutoMute`** | Auto-mute on incoming phone call | Missing | 🟡 |
| 26 | **Raise-hand queue** | `raiseHand`/`lowerHand` LiveKit RPC, live queue view | Missing | 🟡 |
| 27 | **Level-up celebration overlay** | Already parity | ✅ Present | — |
| 28 | **PK Battle overlay/sheet/moderation** | Full flow | ✅ Present | — |
| 29 | **Viewers sheet / report / block / multi-guest** | Full sheets | ✅ Present | — |

---

## Phased implementation (locked order)

**Phase A — Blockers (nothing works without these).** Kotlin native layer.
1. `LiveKitFlutterPlugin.kt`: real Camera2 preview, LiveKit `Room.connect`, publish/subscribe, `attachLocal` renderer mount, `switchCamera`, `setMicEnabled`, `setVideoVisible`, `setMirror`, `setScalingType`, `getStats`.
2. Add `setBeautyParams` / `setStickerOverlay` / `snapshotLocalPreview` cases to Kotlin dispatch.
3. Ship `NativeEntryAnimationPlugin.kt` (SVGA/VAP/Lottie with priority queue + audio mixer). Register `merilive/entry_animation` channel.
4. Ship `NativeGiftAnimationPlugin.kt` (same, for gifts). Register `merilive/gift_animation`.

**Phase B — Host-side UX parity in Dart.**
5. Remove `!_isHost` gate on `LiveChatComposer`.
6. Wire `LiveBeautyPanel` sliders → `LiveKitBridge.setBeautyParams` on every change.
7. Add host bean/coin counter widget in `RoomTopBar`, subscribe realtime to `gift_transactions`.
8. Add `GiftComboBar` widget (3 lanes, 4s window) driven by LiveKit data-packet + gift feed.
9. Add `FlyingGiftCapsule` stack widget (≤3, 44px gap, count-up, tier gradient).
10. Add `BigoStyleJoinBanner` widget + welcome coalescer (500ms window).
11. Add `CinematicEntranceOverlay` branch for Duke/King/Marquis in dispatcher.
12. Render SVGA/Lottie in `_EntryBannerCard` via new `EntryAnimationFrame` widget (Lottie plus MP4/VAP fallback; native path preferred on Android).

**Phase C — Go Live prep parity.**
13. Add mode switch (Video / Audio / Game) segmented control with seat picker for Party mode.
14. Register `/face-verification` route with a real page (deep-link to web verify iframe until native captured).
15. Wire sticker overlay UI → `LiveKitBridge.setStickerOverlay`.

**Phase D — Live feed viewer parity.**
16. Add category chip row + country filter to `LiveFeedPage`.
17. Add speaker mute toggle on each tile + share button (using `share_plus`).
18. Instant-close realtime subscription already exists; polish tile ended-state.

**Phase E — Content safety + call-focus (Chamet-mandatory).**
19. `useLiveVoiceMonitor` Dart port (mic chunk → server transcript → contact regex).
20. `useLiveFaceDetection` (MLKit face-detect on preview stream, auto-close on prolonged loss).
21. `useAudioFocusAutoMute` (Android AudioFocus listener → mute mic).
22. Raise-hand queue Dart port (LiveKit RPC + list view sheet).

**Phase F — PK+moderation depth.**
23. `PKPunishmentOverlay` (AR mask via native sticker overlay).
24. Cross-room opponent audio bridge (secondary LiveKit `Room` subscribe-only).

**Phase G — Stub replacements.**
25. Real share sheet (native `share_plus`), music player sheet, reactions palette, top-up route, tasks sheet, stickers in-stream sheet, virtual background, noise cancellation toggle.

---

## Delivery model

- Every phase = one message with all its file writes in parallel.
- After each phase I'll state exactly which files were touched, native rebuild status, and what remains.
- No "APK rebuild required" surprises — every phase either lands Dart-only or ships a fully-wired Kotlin plugin, never half.
- Phases A–B are 60% of the perceived value (host stream actually broadcasts, chat works, beauty works, animations look premium). Phase C–D land Go Live + feed parity. E–G is safety + polish.

## Technical notes

- Native Kotlin plugins will follow the existing `IncomingCallBridgePlugin.kt` structure (FlutterPlugin, MethodChannel, cleanup on detach).
- LiveKit Android SDK `2.23.5` (per staging README). Camera2 through LiveKit's `CameraCapturerUtils` — no custom capturer needed.
- SVGA rendering on native: `com.opensource.svgaplayer:2.5.14` (already used in existing app path).
- VAP on native: Tencent `com.tencent.qgame:vap:1.0.15`.
- Lottie: `com.airbnb.android:lottie:6.4.0` (already in pubspec earlier).

## What I need before Phase A

Nothing — the plan can start immediately with Phase A native Kotlin plugin work. Every phase is independent enough that we can also reorder if you want (e.g. skip A and do Dart-only phases B/C/D first if the native rebuild pipeline is slow).

**Confirm and I'll begin Phase A.**
