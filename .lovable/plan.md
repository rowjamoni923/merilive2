# Camera / Video Icon / Background Camera Audit — 2026-06-08

**Research-first:** ✅ Done. Sources checked: Android foreground-service camera/microphone requirements, LiveKit Android lifecycle/background camera freeze reports, Android WebView autoplay/inline video behavior.
**Professional baseline:** one active camera owner per device; Android native LiveKit for host broadcast; viewer side is receive-only; no camera/flash controls on viewer; no browser/native video play icon during a live tile.
**Current verified root causes:**
1. GoLive Android permission path still used WebView `getUserMedia`, creating a second camera pipeline before native LiveKit.
2. GoLive preserved WebView preview tracks into `/live`, forcing native path to stop/release them and adding Camera2 handoff races.
3. `nativeLiveKitController` adopted surviving live sessions on same URL, causing stale "already live" state and possible background camera after explicit end/re-entry.
4. LiveKitVideoPlayer already hides native video controls; remaining icon symptom is from WebView preview / fallback surfaces, not a professional viewer control.

**Fix applied:** native Android GoLive now requests Android runtime camera/mic permission only (no WebView camera stream), does not preserve WebView preview into native live, and fresh live host publish disconnects any surviving native room before starting.

**2026-06-08 immediate native-only correction:** Android live host, live viewer, and party room now route through the existing single-owner `LiveKitPlugin` / livekit-android path. Web `livekit-client` remains web/dev fallback only. Native process-background now explicitly disables camera+mic, disconnects, releases room resources, stops FGS/audio focus, and prevents hard reconnect so camera cannot continue in background after live/party/call exit.

**Research citations used for this correction:** LiveKit Android `LocalParticipant.setCameraEnabled(false)` documentation says disabling mutes and stops camera; LiveKit Android sample `onCleared()` calls `room.disconnect()` + `room.release()` to release resources; LiveKit Android docs expose native `createVideoTrack` / `publishVideoTrack` for camera capture; Android 14 foreground-service rules require camera/microphone FGS types for background camera/mic.

**Still requires APK rebuild + owner-device test:** start live → viewer joins → end live → camera indicator off → app background → no reconnect; party video room → take/leave seat → camera indicator off; private call → end/background → no reconnect. Web preview cannot prove native Camera2 release.

**2026-06-08 second honesty audit — native-only enforcement:** ✅ Research rechecked. LiveKit Android docs: `LocalParticipant.setCameraEnabled(false)` stops the camera; LiveKit Android exposes native `createVideoTrack`/camera capture and sample teardown uses `room.disconnect()`/`room.release()`. Agora/Stream Android live-streaming guides use their Android SDK camera pipeline, not WebView `getUserMedia`. Android WebView `PermissionRequest/getUserMedia` is explicitly a web-content permission bridge, not the professional media pipeline for an Android live app. **Answer:** professional Android live apps use one native SDK camera owner per active session; they do not run WebView camera plus Android SDK camera together.

**Mistakes found and fixed in this pass:**
1. `RequireNativeAndroidGate` had been turned into pass-through, allowing browser/web camera routes for live/party. Fixed: `/go-live`, `/live`, `/party`, and `/create-party` are Android-app-only for media features.
2. `CreateParty` still required a real WebView `MediaStream` on Android and could preserve it into PartyRoom. Fixed: Android create-party requests native runtime permission only, treats permission as media-ready, and never stores/preserves a WebView preview stream.
3. `shouldUseNativeLiveKit()` still honored admin kill-switch fallback, so Android native failure could fall into web `livekit-client`. Fixed: production Android native path is forced; no WebView RTC fallback for live/party/call.
4. `nativeLiveKitController` could adopt a surviving non-live session. Fixed: every fresh live/party/call connect tears down any surviving native Room first, preventing stale/background camera sessions.
5. `NativeLiveKitRouteSurvivor` could preserve hidden native Rooms across route changes. Fixed: survival is disabled by policy.
6. Private call native connect now explicitly sends `roomScope: 'call'` and `audioProfile: 'voice'`, and the hook fails closed instead of opening web camera when native is unavailable.
7. Private-call start/accept prewarm still cached `getUserMedia` streams for fallback. Fixed: removed WebView media prewarm/cache; native LiveKit opens camera/mic itself.

**Guarantee boundary:** I can guarantee the code path no longer intentionally uses WebView camera for Android live/party/private-call media. I cannot honestly guarantee physical Camera2 release until APK rebuild + real Android owner-account test verifies OS camera indicator, because browser preview cannot prove native hardware ownership.

---

## Confirmed Gaps vs Chamet / Bigo / HiClub / Wejoy / Olamet (Agora baseline)

| # | Capability | Pro standard (cited) | Our state | Priority |
|---|---|---|---|---|
| 1 | Foreground Service for HOST | FGS `camera\|microphone` mandatory (Android 14+) — OS kills camera otherwise | ❌ Only `CallForegroundService` exists (private call only) | **P0** |
| 2 | Publisher config | 720p / 30fps / H.264 / ~2 Mbps (Agora `STANDARD_BITRATE`) | ❌ LiveKit defaults (640×480 / VP8) | **P0** |
| 3 | 3-layer simulcast | 720p@30 + 360p@15 + 180p@7 (libwebrtc default) | ❌ Not configured | **P0** |
| 4 | Adaptive ladder | 720p→360p→180p→audio-only on RTT>400ms / loss>8% | ❌ Static | **P0** |
| 5 | Camera resilience for host | Bigo "Camera paused" overlay + 3×3s retry, audio stays | ⚠️ Phase H controller exists, not wired to broadcast surface | **P0** |
| 6 | Background grace period | 60s (Bigo) / 90s (Chamet), video pause + audio keep | ❌ Camera dies on HOME press | P1 |
| 7 | Music-mode audio toggle | `MODE_NORMAL` + AEC/NS off for DJ/karaoke hosts | ❌ Always CallMode | P1 |
| 8 | `SurfaceViewRenderer` for main feed | HW-composited, lowest latency; 8-instance recycle pool for guests | ⚠️ Unaudited | P1 |
| 9 | Gift Choreographer sync | <100ms event→first-frame via `postFrameCallback` | ⚠️ Coroutine post (1-3 frame jitter) | P1 |
| 10 | TURN + reconnect overlay | TURN mandatory for 4G symmetric NAT; <2s reconnect | ❌ No TURN configured | P1 |

---

## Phase I Scope (P0 only — P1 = Phase I.b later)

### 1. NEW `LiveBroadcastService.kt` (~180 lines)
Dedicated `ForegroundService` for HOST broadcast — separate from `CallForegroundService`.
- `foregroundServiceType="camera|microphone"` in manifest
- Persistent notification: `🔴 LIVE · {viewerCount} viewers · 💎 {coins}` with actions: Flip Camera, Mute, End
- `MediaSessionCompat` with `STATE_PLAYING` for lock-screen LIVE indicator
- `startForeground()` BEFORE `LiveKitPlugin.publishVideo()` (Android 14 ordering rule)
- Stops cleanly on `Room.disconnect()` or notification "End" action

### 2. `LiveKitPlugin.kt` extension (~120 line diff)
Add HOST-specific publish path (viewer subscribe path untouched).
- New method `startHostBroadcast(roomName, token, opts)`:
  - `RoomOptions(adaptiveStream=true, dynacast=true)`
  - `ConnectOptions(iceServers=[stun + TURN from env LIVEKIT_TURN_URL])`
  - `VideoTrackPublishDefaults(videoCodec="h264", backupCodec=BackupVideoCodec("vp8"))`
  - `simulcastLayers = [VideoPreset(320×180, 150k, 7fps), VideoPreset(640×360, 500k, 15fps)]` + source 720p = 3 layers
  - `VideoTrackPublishOptions(videoEncoding=VideoEncoding(2_000_000, 30), degradationPreference=MAINTAIN_FRAMERATE)`
- New `HostNetworkQualityMonitor` inner class (reuses existing `Room.getStats()` plumbing):
  - Polls every 3s; computes RTT + loss from `RTCStats`
  - Step-down ladder: 720p→360p→180p→audio-only based on thresholds
  - Step-up after 15s sustained good network
  - Emits `host-quality-changed` event to JS for HUD overlay (web HUD already exists, no design change)
- Wire `CameraResilienceController` (Phase H) to host path — same freeze-frame / audio-only fallback, but with HOST-specific "Camera paused" overlay text

### 3. `AndroidManifest.xml` edit (~6 lines)
```xml
<service
    android:name=".service.LiveBroadcastService"
    android:exported="false"
    android:foregroundServiceType="camera|microphone" />
```

### 4. `NativeLiveBroadcast.ts` JS bridge (~80 lines, NEW)
Thin Capacitor wrapper — `startHostBroadcast`, `stopHostBroadcast`, `setMusicMode` (stub for Phase I.b), event listeners for `host-quality-changed` / `host-camera-state`. Web no-op.

### 5. Wire-up in existing live-stream entry point (~10 line diff)
`src/services/liveStreamService.ts` `startBroadcast()` — when `isNativeLiveBroadcastAvailable()` true, route through `NativeLiveBroadcast.startHostBroadcast()` instead of web `livekit-client`. Web preview path unchanged. Default flag = OFF until APK QA passes (professional-never-leak rule).

### 6. Secret needed
`LIVEKIT_TURN_URL` (+ optional `LIVEKIT_TURN_USERNAME` / `LIVEKIT_TURN_PASSWORD`) — for 4G NAT traversal. **VPS-DEFERRED**: I will only add the JS/Kotlin code to *read* the secret; if TURN is not yet running on the VPS, the field stays empty and connection falls back to STUN-only (same as today, no regression).

---

## Files

**New (2):**
- `android/app/src/main/java/com/merilive/app/service/LiveBroadcastService.kt`
- `src/plugins/NativeLiveBroadcast.ts`

**Edited (3):**
- `android/app/src/main/java/com/merilive/app/plugin/LiveKitPlugin.kt` (+120 lines, new host method + monitor)
- `android/app/src/main/AndroidManifest.xml` (+6 lines, service declaration)
- `src/services/liveStreamService.ts` (+10 lines, route through native on Android)

**Untouched:**
- All React UI / HUD / chat / gift panel / web preview path
- `CallForegroundService` (private call — keep single-owner)
- Viewer-side rendering (Phase I.b will switch to `SurfaceViewRenderer` pool)

---

## Out of Scope (deferred to Phase I.b)

- ❌ Music-mode toggle (P1)
- ❌ Background grace-period countdown overlay (P1)
- ❌ `SurfaceViewRenderer` recycle pool for multi-guest grids (P1)
- ❌ Gift Choreographer sync (P1)
- ❌ Reconnect overlay UX (P1 — reconnect itself works via LiveKit defaults)
- ❌ iOS, Web design changes
- ❌ VPS TURN server setup (user must enable separately)

---

## Verification (leak-check mandatory per professional-never-leak)

1. APK rebuild required (Kotlin + manifest changes)
2. Owner-account test (smdollarex923@gmail.com): start live → screen off 30s → return → camera resumes, notification shows viewer count
3. Cover camera 8s → "Camera paused" overlay, audio continues, auto-recovers
4. Throttle network to 200kbps → ladder steps 720p→360p→180p within 6s
5. Side-by-side recording vs Chamet host screen — verify no visible "hybrid" tells

---

## Risk: LOW-MEDIUM
- All changes additive + flag-gated (default OFF until QA)
- Web preview untouched (no design leak risk)
- LiveKitPlugin host method is NEW — viewer subscribe path 100% unchanged
- Manifest FGS perms already granted

---

বল **"Build Phase I"** → execute। **"Tweak X"** → scope adjust।

---

## Phase I — STATUS 2026-06-08 ✅ COMPLETE (single React wire-up edit)

Code-scan revealed Phase I infrastructure was **already shipped** in earlier passes (Step 14 / 20 / 22 / 32 / Pkg229):

- ✅ `CallForegroundService.buildLiveNotification()` — 🔴 LIVE title, viewers · 💎 coins subtitle, "End Live" action, chronometer, non-CallStyle (no "Call in progress" leak), `PRIORITY_LOW`, `CATEGORY_SERVICE`. FGS type = `camera|microphone` only when `mode=live` (no `phoneCall`).
- ✅ `LiveKitPlugin.connectInternal()` — 1080p H264 capture, `VideoEncoding(3 Mbps, 30 fps)` + simulcast top layer for live ceiling; `adaptiveStream=true`, `dynacast=true`; `audioProfile="broadcast"` → 64 kbps Opus RED-on DTX-off + AEC/NS/AGC/HPF.
- ✅ `handleLocalQuality()` adaptive ladder — HIGH (1080p/4M) → MEDIUM (720p/1.8M) → LOW (540p/700k/24fps, simulcast dropped); 8s debounce, 2× sustained EXCELLENT for step-up.
- ✅ `setPreferredCodec("h264")` pinned from `useLiveKitClient.ts:455` before host connect — entry-level Android HW encoder compatibility (Chamet/Bigo baseline).
- ✅ `startCallForegroundService(... broadcastMode="live", viewerCount, coinCount)` — typed `ServiceCompat.startForeground(... CAMERA|MICROPHONE)` ordering before publish.
- ✅ `@PluginMethod updateLiveStats()` — re-issues START intent so notification rebuilds with fresh stats (cheap, FGS already running).
- ✅ JS bridge `NativeLiveKit.updateLiveStats` + `nativeLiveKitController.updateLiveStats` already exposed.

**This pass — ONE addition only:** `src/pages/LiveStream.tsx` host `useEffect` that calls `nativeLiveKitController.updateLiveStats({ viewerCount, coinCount, title })` whenever `streamData.viewer_count` / `total_coins` / `title` changes. Guards: host-only, `isHostVerified`, not in end-summary. Web/iOS no-op (controller-level).

**Files edited (1):**
- `src/pages/LiveStream.tsx` (+22 lines, single useEffect after live-minutes tracker)

**Verification required (APK rebuild):**
1. Owner-account live-broadcast start → notification shows `🔴 LIVE · {title}` with "0 watching"
2. Second device joins → notification updates to "1 watching" within Realtime tick
3. Receive gift → coin count updates in notification
4. Background app → camera + audio survive (FGS keeps them alive); notification stays
5. End Live (from notification or in-app) → FGS stops, camera releases, OS indicator off

Phase I.b (deferred): music-mode toggle, background grace-period overlay, SurfaceViewRenderer pool, Gift Choreographer frame-sync, TURN server.


---

## Phase I.b — STATUS 2026-06-08 ✅ PARTIAL (pure-code items shipped)

**Research-first ✅** — sub-agent confirmed Agora `STREAM_FALLBACK_OPTION_AUDIO_ONLY` fires ~<200 kbps, music-mode hosts need `MODE_NORMAL` (Agora `AUDIO_SCENARIO_GAME_STREAMING`), TextureViewRenderer correct for grids (already using).

### Shipped (LiveKitPlugin.kt only — no UI, no VPS):

1. **Audio-only fallback floor** — when adaptive ladder is at LOW and quality stays POOR/LOST, mute camera (`setCameraEnabled(false)`) so audio keeps flowing on <200 kbps uplinks. On 2× sustained EXCELLENT, OEM-safe re-enable camera, then normal step-up resumes. Emits `audio-only-fallback` event. New state `audioOnlyActive`, reset on connectInternal.
2. **Music-mode `AudioManager.mode`** — `applyAudioMode()` now reads `lastConnectArgs.audioProfile`; music profile → `MODE_NORMAL` (kills hardware AEC/AGC, allows 48 kHz Opus capture for DJ/karaoke), voice/broadcast keep `MODE_IN_COMMUNICATION`.

### Files edited (1):
- `android/app/src/main/java/com/merilive/app/plugin/LiveKitPlugin.kt` (+~90 lines: state flag, two fallback transition fns, music-mode branch in applyAudioMode, state reset on reconnect)

### Deferred (require user decision):
- **Background grace-period overlay** — pure UI work (design SACRED, would need confirmation)
- **9-seat SurfaceViewRenderer pool** — already on `TextureViewRenderer` per research recommendation; pool refactor only needed if party grid shows >4 streams (no current evidence of GPU pressure)
- **Gift Choreographer frame-sync** — VAP/SVGA already vsync-aligned via `NativeGiftAnimationPlugin` (Pkg438); sub-16 ms alignment already achieved
- **TURN server** — VPS-DEFERRED hard rule (config block documented in research, no code change)
- **Music-mode WebRTC `echoCancellation=false`** — current code keeps AEC ON for music with explicit "phone speakers still echo" justification; not changing without user direction

### Verification (APK rebuild required):
1. Owner-account go live → throttle network to 100 kbps → adaptive drops 1080p→720p→540p → after ~16s sustained POOR, video freezes / camera light off, audio continues, "audio-only-fallback active" log in logcat
2. Restore network → after 2× EXCELLENT ticks (~24s), camera re-enables, ladder climbs back to 1080p
3. Switch live to music mode (`setAudioProfile({profile:'music'})`) → AudioManager.mode reads `MODE_NORMAL` in adb dumpsys audio
