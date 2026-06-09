# Android-Native Pro Pass — 4 Phase Master Plan

ভাই কথা ১০০% clear। নিচে honest, scoped plan। প্রতিটা Phase-এ **research → audit → code → verify** order — memory-locked research-first rule অনুযায়ী।

> **Design rule:** Web React UI (WebView) zero change। শুধু performance/resilience path Android native।
> **Strings rule:** All toasts/labels English।
> **Verify rule:** Owner account (smdollarex923@gmail.com) দিয়ে যেটা Lovable-side verifiable সেটা verify। Android-only changes = "APK rebuild needed" honest tag।

---

## Phase 4 — Private Call (Android, 10 files)

**Scope (already audited in `.lovable/private-call-android-audit.md`):**

| Tag | File / area | Fix |
|---|---|---|
| F-1 | `MeriFirebaseMessagingService.kt` | Avatar bitmap fetch off FCM thread → post notification first, update icon async |
| L-3 | `CallAudioRouter.kt` | Drop deprecated `setSpeakerphoneOn` (API 31+) → `setCommunicationDevice()` with `AudioDeviceInfo` |
| L-4 | `CallAudioRouter.kt` | Bluetooth SCO handover (`registerAudioDeviceCallback` + auto-route on BT connect/disconnect) |
| L-5 | `IncomingCallActivity.kt` | `canUseFullScreenIntent()` check (Android 14+) → fallback to high-priority heads-up |
| L-6 | `PrivateCallForegroundService.kt` | `START_STICKY` → `START_NOT_STICKY` + proper `stopForeground(STOP_FOREGROUND_REMOVE)` (kills ghost notification) |
| L-7 | `PrivateCallActivity.kt` | Camera2 release on `onPause` (not `onDestroy`) — fixes black-screen on resume |
| L-8 | `NativeCallPlugin.kt` | Proximity wakelock leak — release on `onStop` |
| L-9 | `CallNotificationManager.kt` | Notification channel importance + `setAllowBubbles(false)` for stealth |
| L-10 | `CallResilienceController.kt` | Network-loss budget aligned with JS side (15s) + JNI bridge to surface state to React |
| (bonus) | `AndroidManifest.xml` | `USE_FULL_SCREEN_INTENT` runtime gating + `FOREGROUND_SERVICE_PHONE_CALL` for API 34 |

**Research-first (auto):** subagent on Chamet/Bigo/Poppo Android call audio routing + FSI permission patterns (Agora → LiveKit translation).

**Verify:** code-level diff + lint। Real verify = APK rebuild needed (honest)।

---

## Phase 5 — Live Streaming (Android native paths)

**Audit first** — identify which Android files touch LiveKit publisher/subscriber, Camera2, GPUPixel, foreground service for live. Likely files:
- `LiveStreamForegroundService.kt`
- `LiveKitPublisherPlugin.kt` / `LiveKitSubscriberPlugin.kt`
- `Camera2Manager.kt` + GPUPixel beauty pipeline
- `LiveStreamActivity.kt` (if exists)

**Likely fixes (pre-audit guess, confirmed after research):**
1. Publisher: simulcast layers + dynamic bitrate (LiveKit `RoomOptions.publishDefaults`) per Chamet pattern
2. Subscriber: adaptive stream + auto-track-subscription off for hidden viewers (save bandwidth — Chamet-class)
3. Camera2: surface texture pool + GPUPixel preview-frame reuse (no realloc per frame)
4. Foreground service: type `camera|microphone` (API 34 required), proper notification channel
5. Reconnect: exponential backoff aligned with JS `useLiveKitRoom` (currently mismatched)
6. Audio focus: request `AUDIOFOCUS_GAIN` on publisher, transient-may-duck on viewer

**Research-first:** subagent on Bigo/Chamet broadcaster Android stack (Agora pub/sub config → LiveKit `RoomOptions`/`TrackPublishOptions`).

---

## Phase 6 — Party Room (Android native paths)

**Audit first** — likely files:
- `PartyRoomForegroundService.kt`
- `PartyRoomAudioPlugin.kt` (8-seat audio mixer)
- Per-seat audio level metering bridge

**Likely fixes:**
1. 8-seat audio mixer: WebRTC AGC + NS + AEC tuned for music (lower NS aggressiveness)
2. Seat-level VAD events throttled to 200ms (currently every frame)
3. Foreground service type `microphone`
4. Bluetooth headset auto-route for hosts on seat
5. Background music ducking when speaker active

**Research-first:** Bigo Live multi-guest / Poppo party room audio routing.

---

## Phase 7 — Viewer-side Professional Upgrade

**This is biggest research phase.** Scope (cross-cuts Live + Party + Private Call viewer experience):

### 7a — In-screen chat/message option
- How Chamet/Bigo render chat overlay: bottom-anchored, max-height 35vh, gradient mask on top, auto-scroll with "new message" pill
- Pagination: keep last 50 in DOM, virtualize older
- Mention/reply UX, gift-message inline rendering, system messages styling
- **Current state audit** → gap list → JS-only fixes (Phase 7 is mostly React, design preserved as-is unless gap)

### 7b — Viewer join system
- Soft join (lurker mode) vs broadcast join (system message + entry animation)
- Throttle: ≥level X gets entry animation, others silent (Chamet pattern)
- Server-side dedupe: same user re-join within 60s = no system message
- "Viewer count" debouncing (don't flicker on every join/leave)
- Verify against current `stream_viewers` upsert + Realtime sub

### 7c — Entry animation system
- Industry-standard naming already enforced (Premium Entry / Standard Entry / Flying Name Bar / Vehicle Entrance / Welcome Chat)
- Queue priority + cooldown per user (15s) — prevents spam
- VIP/Noble tier always-show vs normal users one-per-session
- Android native dispatcher (Phase A done) → Phase B JS shim wire-up
- Cross-room consistency: Live + Party + (newly added) Private Call viewer entrance

**Research-first:** subagent on Chamet/Bigo/Poppo/HiiClub viewer overlay UX with screenshots/docs cited.

---

## Phase 8 (last, on user request) — APK build + error iteration

User provides SSH/build access → build → ship to test device → I fix any compile/runtime errors that surface।

---

## Execution rules I'll honor

1. **Each phase: research subagent first** (Chamet/Bigo/Poppo/Olamet citations), update `.lovable/plan.md` with verified numbers, THEN code
2. **No web UI redesign** without explicit ask
3. **English-only strings** in code
4. **Owner account verify** every Lovable-side change; "APK rebuild needed" tag for pure-Android
5. **Honest gap report** at end of each phase — no false "100% done" claims
6. **One phase at a time** — finish + verify, then ask "next?" before starting the following phase

---

## I need your confirm on:

- ✅ **Approve plan as-is** → I start Phase 4 (Private Call 10 Android files) immediately with research subagent
- 🔧 **Re-order** → bolun কোন Phase আগে চান (e.g., Live streaming আগে?)
- ➕ **Add** → কিছু missing থাকলে বলুন

## ✅ Phase 5 — Live Streaming (Android) — DONE 2026-06-09
Research-first audit found `LiveKitPlugin.kt` already implements adaptiveStream, dynacast, AUDIOFOCUS_GAIN, setCommunicationDevice, hard-reconnect, network handoff, adaptive tier ladder, GPUPixel EGL sharing, codec preference (VP8 default). 4 industry-standard gaps closed:

- **F-5.1** Explicit 3-layer simulcast ladder `[H180, H360, +top]` for live rooms (was relying on SDK defaults). Matches WebRTC `simulcast.cc` reference + Bigo/Chamet ladder.
- **F-5.2** `autoSubscribe` plumbed through ConnectArgs — viewer paginated/grid rooms can pass `false` (HiiClub/Olamet pattern); default `true` preserves 1-broadcaster + private call.
- **F-5.3** Tightened hard-reconnect backoff `250/500/1000/2000/4000/8000 ms` with ±100ms jitter (was 3/6/12s — too coarse). 6 attempts in ~16s budget vs old 3 attempts in 21s.
- **F-5.4** `DisconnectReason.TOKEN_EXPIRED` now emits dedicated `token-expired` event and skips blind hard-reconnect (which would re-fail with stale JWT). JS must call `refreshToken()` + `reconnectNow()`.

APK rebuild required for these to ship. Research saved at `.lovable/memory/features/android-call-research-2026-06-09.md`.

## ✅ Phase 6 — Party Room (Android) — DONE 2026-06-09
Research-first audit found ~90% of party-room foundation already shipped: voice/broadcast/music `LocalAudioTrackOptions` with correct AP3 toggles (NS/AEC/AGC OFF for music — Agora MUSIC_HIGH_QUALITY pattern), Opus per-profile bitrates (32/64/128 kbps + DTX/RED), `ActiveSpeakersChanged` emission, `setCommunicationDevice` API 31+, `AudioDeviceCallback` BT handover, AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK plumbing, push-to-talk + spatial audio (Step 35), party-host 60s background grace. 2 industry-standard gaps closed:

- **F-6.1** `setAudioDeviceInternal` now blocks `bluetooth` requests when `audioProfile == "music"` (BT SCO/HFP caps at 16 kHz wideband — music sounds muffled to listeners). Falls back to speaker + emits `audio-route-blocked` event (`reason: music_profile_sco_unsupported`). A2DP output remains usable independently.
- **F-6.2** Added 150ms `Participant.audioLevel` poll loop emitting per-participant `seat-audio-levels` (smooth ring animation — Yalla/MICO/Bigo standard; LiveKit server-side ActiveSpeakers fires only ~1s, too coarse for ring pulse). Also emits `local-vad-changed { speaking, level }` with threshold 0.08f and 500ms silence hold — JS BGM player can duck to -20dB on `speaking:true` and restore on `speaking:false` per Bigo/Hollah ducking curve. Poll started on connect + adopt, stopped on all teardown paths (disconnect, destroy, process-background, live-host-grace).

APK rebuild required. JS-side BGM ducking integration is a follow-up (no native BGM player yet; event fires harmlessly until consumed).
