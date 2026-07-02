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

### H4 — Privacy plumbing (Live + Party) end-to-end

Right now `live_streams.live_privacy` and `party_rooms.privacy` exist but plumbing is inconsistent. Fix everywhere:

- **Live feed** (`live_feed_page.dart`): hide `private` streams from public feed, show `password` streams with a padlock badge.
- **Party feed** (matching page): same rules.
- **Join gate**: password prompt sheet before `join_live_stream` / `join_party_room` RPC; incorrect password → 3-strike lockout via existing rate-limit helper.
- **Share sheet**: for private streams, block share button (with toast "Private stream — link disabled"). For password streams, include password only if host explicitly toggles "include password in link".
- **Direct deep link** (`/live-feed/:streamId` route): if private + not invited → deny screen with request-access CTA; if password → prompt sheet.
- **Realtime**: don't leak private stream updates over public channel — filter on `privacy in ('public','password')` for the feed subscription.

Deliverable: 3 privacy modes work identically on Live + Party, viewer + host, feed + deep link + share.

---

### H5 — Deep parity audit report

Side-by-side web (`src/pages/LiveStream.tsx` + `LiveFeed.tsx` + `PartyRoom.tsx`) vs Flutter (`live_stream_page.dart` + `live_feed_page.dart` + `party_room_page.dart`):

- Component-by-component behavior diff (host + viewer)
- Screenshot proof via Playwright on web + APK screenshots (once H1 lands)
- Every deviation logged with file:line + severity
- Written to `.lovable/phase-h-audit.md`

Deliverable: single markdown report the user can walk through row-by-row.

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
