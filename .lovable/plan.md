## Phase H — 100% parity finish line

Five workstreams, delivered in five sub-messages so each one is atomic and reviewable.

---

### H1 — Full Android module bootstrap (unblocks everything else) ✅ COMPLETE (2026-07-02)

Verified done: `merilive_app/android/` real Flutter module with settings.gradle
(Gradle 8.6 / AGP 8.3.0 / Kotlin 1.9.24), gradle wrapper jar + gradlew fetched,
app/build.gradle with LiveKit 2.23.5 / VAP 1.0.15 / SVGA 2.5.14 / Lottie 6.4.0 /
ML Kit segmentation / Firebase BOM, MainActivity registers all 4 native plugins,
manifest declares CAMERA/RECORD_AUDIO/POST_NOTIFICATIONS/FOREGROUND_SERVICE_*,
IncomingCallService + IncomingCallActivity + FCM MessagingService registered,
stale `android_native/` staging folder deleted so single source of truth.
Developer still supplies `local.properties` (flutter.sdk) + `google-services.json`
(Firebase console) — template committed at `android/app/google-services.json.template`.
GPUPixel dep deferred to H2 (`setBeautyEnabled` is dormant today).


Right now `merilive_app/android_native/*.kt` is a **staging folder** — the plugins aren't in a real Flutter `android/` module, so APK builds get nothing.

- Create `merilive_app/android/` structure (settings.gradle, app/build.gradle, AndroidManifest.xml, MainActivity.kt).
- Move `LiveKitFlutterPlugin.kt`, `NativeEntryAnimationPlugin.kt`, `NativeGiftAnimationPlugin.kt`, `IncomingCall*.kt`, `MeriFirebaseMessagingService.kt` into `android/app/src/main/kotlin/com/merilive/app/`.
- Register all 5 plugins in `MainActivity.configureFlutterEngine`.
- Add gradle deps: LiveKit 2.23.5, SVGA 2.5.14, VAP 1.0.15, Lottie 6.4.0, GPUPixel, Firebase Messaging, Play Integrity.
- Manifest permissions: CAMERA, RECORD_AUDIO, INTERNET, POST_NOTIFICATIONS, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PROJECTION, BLUETOOTH_CONNECT.
- Register `IncomingCallService` + `IncomingCallActivity` in manifest.

Deliverable: `flutter build apk --debug` succeeds, all Phase A methods live.

---

### H2 — Missing native handlers (Kotlin implementations) ✅ AUDITED + PARTIAL COMPLETE (2026-07-02)

Audit revealed the 5 "dormant" handlers are actually wired in `LiveKitFlutterPlugin.kt` — real status:

| Method | Actual status |
|---|---|
| `snapshotVoiceChunk` | ✅ Implemented via `MediaRecorder` AAC 16kHz → base64 (voice moderation ready) |
| `setBackgroundMusic` / `Playing` / `Volume` | ✅ Host-monitor via `MediaPlayer` (Chamet-parity when no music-publish grant). Mixing into published track deferred (needs custom AudioSource swap) |
| `setVirtualBackground` | ⚠️ URL persists but pixel swap dormant (`applied:false, reason:segmentation_pending`) — needs GPUPixel `.so` + MLKit SelfieSegmentation pipeline |
| `setNoiseCancellation` | ✅ `android.media.audiofx.NoiseSuppressor` on session 0 (best-effort, reports `available:false` on unsupported OMX) |
| `audio_focus` EventChannel | ✅ `AudioFocusEventEmitter` with `AudioFocusRequest` API 26+ + legacy fallback |
| `getStats` (Phase I18 blocker) | ✅ **NEW** — now returns `quality: excellent\|good\|poor\|unknown` from LiveKit server-computed `LocalParticipant.connectionQuality` (SFU-smoothed from RTCStats). ConnectionQualityIndicator will now animate live. |

**Remaining real gaps (deferred, need heavy native work):**
1. GPUPixel `libgpupixel.so` + MLKit SelfieSegmentation for real virtual background swap
2. LiveKit `MixerAudioSource` for publishing BGM to remote listeners (currently host-monitor only)
3. GPUPixel beauty filter chain (`BeautyProcessor.pushToNative` no-ops when `.so` missing)

**APK rebuild REQUIRED** for `getStats` quality field to reach ConnectionQualityIndicator.



---

### H3 — E-22 Raise-hand queue ✅ ALREADY COMPLETE (verified 2026-07-02)

Full audit found this shipped in an earlier phase — nothing to build. Actual state:

- ✅ **Table** `live_raise_hand_queue` (10 cols) with `UNIQUE(stream_id, viewer_id)` + FIFO index `(stream_id, status, raised_at)`
- ✅ **RLS**: viewer-manages-own-row + host-reads/updates-own-stream (via `live_streams.host_id = auth.uid()`)
- ✅ **Realtime publication** enabled on `supabase_realtime`
- ✅ **`LiveRaiseHandBridge`** (264 L): raise/lower/isRaised (viewer), approve/reject (host), seed-from-REST + Realtime `postgres_changes` FIFO sort, **auto-promotes approved viewer via `livekit-update-permission` edge fn** (PROMOTE_TO_SPEAKER: camera+mic+screen sources)
- ✅ **UI**: `LiveRaiseHandButton` (90 L) + `LiveRaiseHandQueueSheet` (176 L), wired in `live_stream_page.dart` `_toggleRaiseHand` and `live_action_bar.dart` (`raise_hand` viewer entry + `raise_queue` host entry)
- ✅ Uses existing `livekit-update-permission` edge fn instead of a new `live-raise-hand` fn — simpler, less surface area, matches web-truth `src/lib/livekitRaiseHand.ts` promote flow

**No APK rebuild needed** (pure Dart + DB + existing edge fn).



---

### H4 — Privacy plumbing (Live + Party) 🚫 OBSOLETE — DO NOT IMPLEMENT (locked 2026-07-02)

Superseded by memory constraint **🔓 LIVE + PARTY = ALWAYS PUBLIC** (mem://constraints/live-party-always-public.md). Chamet/Bigo/Poppo/Olamet all keep live streams + party rooms fully public — no password prompts, no private-mode toggles, no padlock badges. DB columns `live_streams.live_privacy` + `party_rooms.privacy` + `password_hash` are legacy dead code; `GoLive.tsx` hardcodes `'public'` + `null`. Confirmed: no Flutter file currently references these columns → nothing to remove either.

**Action taken:** None. Any future work on privacy modes requires explicit user override of the locked constraint.



---

### H5 — Deep parity audit report ✅ COMPLETE (2026-07-02)

Written to `.lovable/phase-h-audit.md` — 9-section component-by-component gap list (video/chat/gifting/host tools/games/PK/viewer/safety/entry effects) comparing web (5,334 L `LiveStream.tsx` + 3,174 L `PartyRoom.tsx`, source of truth) vs Flutter (1,483 L + 777 L).

**Findings summary:**
- **8 P0 gaps** — ~~live-stream swipe~~ ✅ 2026-07-02, ~~contact-sharing moderation (text)~~ ✅ 2026-07-02 (`core/moderation/contact_detection.dart` + `contact_moderation.dart` + `NumberSharingWarningDialog`, wired into `LiveChatBridge.sendMessage` → `process_contact_violation` RPC. Image OCR deferred), PK result modal, premium viewer profile card, live tasks card, new-host bonus card
- **8 P1 gaps** — host tools mostly (publish layers, audio-only toggle, agent dispatch, SIP dial, room-ended modal, frame monitor reporting, room protection, virtual bg pixel swap)
- **4 P2 gaps** — reactions quick bar, screen lock, high refresh rate, ingress dialog (likely intentionally skipped per not-an-OBS memory)
- **Entry effects, gifting, chat, moderation core, raise-hand (H3), noise cancel (H2), audio focus (H2), face detection all at ✅ parity**

Playwright screenshot diff deferred until H1+H2 APK rebuild lands so both platforms diff live. Party-only deeper audit (H5b) available on request.


---

## Delivery order

```
H1 (Android bootstrap)  →  H2 (native handlers)
                       ↘
H4 (privacy — Dart-only, parallel to H1/H2)
H3 (raise-hand — Dart + DB, parallel)
                       ↘
H5 (audit report — after H1–H4 land, produces final gap list)
```

H1+H4+H3 can ship in parallel (independent files). H2 needs H1 to be real. H5 is the closer.

## Technical notes

- No design changes anywhere — pure functional/native plumbing.
- Every native method stays dormant-safe (Dart bridge unchanged; Kotlin just replaces the missing method).
- Privacy migration touches only column semantics + edge fn logic; no destructive schema changes to `live_streams` / `party_rooms`.
- APK rebuild required after H1 + H2. H3/H4/H5 are pure Dart/DB/edge-fn — no rebuild needed.

## What I need from you

**Approve this plan or edit any section** (e.g. drop H5 if you don't want the report; combine H3 into H4 if you'd rather ship one privacy+raise-hand phase; skip H1 if you already have an Android module you'll drop in).
