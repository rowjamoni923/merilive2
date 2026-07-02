# Phase H — Deep Parity Audit (Flutter ⇄ Web-truth)

**Date:** 2026-07-02  
**Scope:** Merilive Flutter live-streaming stack vs `src/pages/{GoLive,LiveStream,LiveFeed,PartyRoom,Discover}.tsx` web-truth.  
**Method:** File-by-file comparison against the phased matrix (A–H) recorded in `.lovable/plan.md`; row-level cross-check of Dart bridges / widgets against their web counterparts; migrations + edge functions read from Supabase.

Legend: ✅ full parity · 🟡 partial / dormant-safe · ❌ missing.

---

## H1 — Android module bootstrap
| Concern | Status | Notes |
|---|---|---|
| `android/` gradle scaffold | ✅ | `settings.gradle`, root + app `build.gradle`, `gradle-wrapper.properties`. |
| LiveKit 2.23.5 / SVGA / VAP / Lottie / MLKit deps | ✅ | Added to `app/build.gradle`. |
| Manifest permissions (CAMERA, RECORD_AUDIO, POST_NOTIFICATIONS, FGS_PHONE_CALL, etc.) | ✅ | `AndroidManifest.xml`. |
| `MainActivity` transparent surface + plugin registration | ✅ | 4 plugins wired (LiveKit, Gift, Entry, IncomingCall). |
| Kotlin files moved out of `android_native/` staging | ✅ | Now under `com.merilive.app.plugins.*`. |
| APK actually built end-to-end | 🟡 | Not run in-sandbox. Requires local `flutter build apk --debug`. |

## H2 — Native handlers (`LiveKitFlutterPlugin.kt`)
| Method | Status |
|---|---|
| `snapshotVoiceChunk` (MediaRecorder → base64 AAC) | ✅ |
| `setBackgroundMusic` / `Playing` / `Volume` (MediaPlayer + duck) | ✅ |
| `setNoiseCancellation` (AudioFx `NoiseSuppressor`) | ✅ |
| Audio-focus EventChannel (`app.merilive/audio_focus`) | ✅ |
| `setVirtualBackground` | 🟡 stub — returns `segmentation_pending`; GPUPixel segmentation pipeline still to land. |

## H3 — Raise-hand queue (E-22)
| Layer | Status |
|---|---|
| `live_raise_hand_queue` table + FIFO index + RLS + realtime publication | ✅ |
| `LiveRaiseHandBridge` (watch / raise / lower / approve / reject, realtime cache) | ✅ |
| Viewer button in `LiveMoreSheet` (`raise_hand`) | ✅ |
| Host queue sheet `LiveRaiseHandQueueSheet` (`raise_queue`, host-only) | ✅ |
| Approve → auto-invite to seat | 🟡 approve resolves queue row only; final seat promotion still uses existing `LiveMultiGuestSheet` flow. |

## H4 — Privacy plumbing
| Surface | Status |
|---|---|
| `live_streams.live_privacy` filter in Flutter `live_feed_page` (`.neq('private')`) | ✅ |
| `LiveStreamPage` bootstrap blocks non-host on `live_privacy='private'` | ✅ |
| Password prompt for `live_privacy='password'` streams | ❌ web has `p_password` on `join_live_stream_viewer`; Flutter viewer bridge still passes only `p_stream_id`. Next patch: add optional `password` param + prompt. |
| `PartyRoom.hasPassword` derived from `password_hash IS NOT NULL` | ✅ |
| Party card padlock badge | 🟡 model field ready; card widget needs the badge render (UI-only follow-up). |
| Party join password prompt | ❌ Flutter party-room join screen doesn't yet call `enter_party_room` with `p_password` (screen currently ships without join RPC wiring — web-parity gap independent of privacy). |
| Share link excludes password | ✅ share only sends URL, no secret. |
| Deep-link block for private streams | ✅ falls through the same `_bootstrap` gate above. |

## Row-by-row parity summary (Phases A–G recap, unchanged since Phase G)
| Row | Feature | Host | Viewer |
|---|---|---|---|
| A-1..A-11 | Preview→Publish zero-gap, chat, gifts, follow, level entry | ✅ | ✅ |
| B-1..B-6 | Bean HUD, capsule, category chips | ✅ | ✅ |
| C-1..C-9 | Call/HUD, beauty, moderation | ✅ | ✅ |
| D-1..D-6 | Cinematic banners, share, ended overlay | ✅ | ✅ |
| E-19..E-22 | Voice safety / audio focus / raise hand | ✅ (E-22 now DB-backed) | ✅ |
| F-24 | PK cross-room audio bridge + punishment overlay | ✅ | ✅ |
| G-25..G-28 | Floating reactions, music/vbg/noise sheets | ✅ (native handlers dormant-safe until APK ships H2) | ✅ |

## Known post-Phase-H gaps (ranked)
1. **Live password prompt** — add `password` param to `LiveViewerBridge.joinAsViewer` + a `LivePasswordPromptSheet`. (~30 LOC.)
2. **Party join RPC wiring** — Flutter party room page needs `enter_party_room` + password prompt sheet, mirroring `PartyRoom.tsx` L1760+. (~120 LOC.)
3. **Party card padlock badge** — add `if (room.hasPassword) LockIcon()` to `PartyRoomCard`.
4. **Virtual background** — GPUPixel segmentation pipeline (native) still stubbed.
5. **Raise-hand → auto-seat promotion** — call `LiveHostBridge.promoteToSpeaker` inside `approve()`.
6. **Owner-account end-to-end test** — cannot run inside Lovable preview; needs APK on device.

## Deliverable index
- `.lovable/phase-h-audit.md` — this file.
- Migrations: `live_raise_hand_queue`.
- Dart added: `live_raise_hand_bridge.dart`, `live_raise_hand_button.dart`, `live_raise_hand_queue_sheet.dart`.
- Dart edited: `party_models.dart`, `live_feed_page.dart`, `live_stream_page.dart`, `live_action_bar.dart`.
- Android: full `merilive_app/android/` tree + `LiveKitFlutterPlugin.kt` Phase-H handlers.
