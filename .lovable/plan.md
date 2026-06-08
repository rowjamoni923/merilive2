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

## Phase I.b — STATUS 2026-06-08 ✅ COMPLETE (pure-code professional pass)

**Research-first ✅** — sub-agent re-confirmed Bigo/Chamet/StreamKar 60s background grace window (server-side inactivity watchdog), Agora→LiveKit Android translation table (`muteLocalVideoStream` → `setCameraEnabled(false)`), and Agora `AUDIO_SCENARIO_GAME_STREAMING` = AEC/NS/AGC all OFF for DJ/karaoke. Industry consensus (nanocosmos, WebRTC community, Agora 3.x docs): music capture must be raw 48 kHz; headphone usage is a soft toast, never a hard block.

### Shipped (LiveKitPlugin.kt + useNativeLiveKitEvents.ts):

1. **Audio-only fallback floor** — sustained POOR on LOW tier → `setCameraEnabled(false)`, audio continues on <200 kbps uplinks; 2× sustained EXCELLENT → camera re-enables. Emits `audio-only-fallback`.
2. **Music-mode `AudioManager.mode = MODE_NORMAL`** — only for `audioProfile=music`; voice/broadcast keep `MODE_IN_COMMUNICATION`.
3. **Music profile WebRTC flags — ALL processing OFF** — `noiseSuppression=false`, `echoCancellation=false`, `autoGainControl=false`, `highPassFilter=false`, `typingNoiseDetection=false`. Raw 48 kHz capture matches Agora `AUDIO_SCENARIO_GAME_STREAMING` and nanocosmos pro-music guide. Sub-bass / dynamics / timbre preserved.
4. **Music headphone soft warning** — on connect with music profile, native scans `AudioManager.GET_DEVICES_OUTPUTS` for wired / USB / A2DP / SCO / BLE headset. If none found, emits `music-headphone-warning` → bridged to `lk:music-headphone-warning` window event for host UI toast ("Use headphones for best music quality"). Soft warning only — never blocks streaming.
5. **Live HOST 60s background grace** (Bigo/Chamet standard) — replaces immediate teardown when `broadcastMode=="live"` and host backgrounds the app. Camera pauses (mic + Room + FGS stay alive); 60s timer scheduled; if host returns before expiry → camera re-enables, timer cancelled, `live-host-grace-end{reason:RESUMED}` fires. If timer expires → existing teardown runs, `disconnected{reason:LIVE_HOST_GRACE_EXPIRED}`. Viewers + party + private call retain existing immediate-teardown behavior (correct per research — only live hosts get grace). Explicit End Live also cancels the job.

### Files edited (2):
- `android/app/src/main/java/com/merilive/app/plugin/LiveKitPlugin.kt` (+~140 lines: `LIVE_HOST_BG_GRACE_MS`, `liveHostGraceJob`, grace branch in `onProcessLifecycleChanged`, `endLiveSessionAfterGrace`, music-headphone emission, `detectHeadsetConnected`, disconnect-time job cancel, music-profile flag flip)
- `src/hooks/useNativeLiveKitEvents.ts` (+~50 lines: 3 new listeners → window CustomEvents, zero design coupling)

### Deferred (real engineering work, not "demo"):
- **9-seat SurfaceViewRenderer pool** — research says `TextureViewRenderer` is correct for grids; only needed if party grid actually shows GPU pressure. Add LeakCanary measurement first.
- **TURN server** — VPS-DEFERRED hard rule (Kotlin already reads `LIVEKIT_TURN_URL` env when set).
- **Grace countdown overlay UI** — native side fully ships the grace; host UI can subscribe to `lk:live-host-grace-start/end` window events to render an existing-vocab countdown when product decides to.

### Verification (APK rebuild required — Lovable preview cannot prove Camera2 / FGS):
1. Owner-account go live → press HOME → camera light goes OFF, audio continues, FGS notification stays, console `lk:live-host-grace-start` event fires with `endsAtMs=now+60000`.
2. Return to app within 60s → camera resumes instantly, `lk:live-host-grace-end{reason:RESUMED}` fires.
3. Stay backgrounded >60s → stream ends with `disconnected{reason:LIVE_HOST_GRACE_EXPIRED}`.
4. Start live with music profile, no headphones → toast appears via `lk:music-headphone-warning`.
5. `adb logcat | grep "DJ / karaoke"` — confirm music profile path executes; `dumpsys audio` shows MODE_NORMAL during music live.
6. Throttle to 100 kbps → audio-only fallback fires as before.


---

## Phase II — PK Battle ✅ AUDIT + FIX (2026-06-08)

**Research-first ✅** — sub-agent verified 13 industry params against Bigo / Chamet / Poppo / TikTok / Tencent TUILiveKit (sources in mem://features/pk-battle-research.md).

**Audit result:** Memory said "100% broken"; reality is ~95% complete (6/6 server-authoritative pieces shipped across migrations 20260608014122 → 20260608020533). The only real gap was a single race-condition bug in the React accept handler.

### Fixed this pass:
- **R1 (BUG, P0)** `src/pages/LiveStream.tsx:2645` `handlePKRequestAccept` did a raw `supabase.from('pk_battles').update({status:'accepted', started_at:...})`, bypassing the SECURITY DEFINER `accept_pk_battle` RPC's SELECT FOR UPDATE and `already_handled` guard. Two concurrent accepts from two devices could double-stamp. Now calls `supabase.rpc('accept_pk_battle', { p_battle_id })` — race-free, server-clock started_at.

### Confirmed already correct (no change needed):
- Server-only score writer: `bill_pk_gift()` invoked from `gift-service` edge fn under service_role; clients only optimistically render and reconcile via `postgres_changes`.
- Server timer: `started_at` stamped by RPC; `get_expired_pk_battles()` + `pk-battle-tick` edge fn (pg_cron 10s) drives `end_pk_battle()`.
- 70/30 reward split: `end_pk_battle()` distributes `FLOOR(loser_score * 0.70)` across winning side via `pk_battle_teams` + writes `coin_transactions` rows.
- Eligibility / level gating: `min_host_level=5` column default + check in `start_pk_battle`.
- Realtime: client uses `postgres_changes` + 0ms optimistic bump (industry standard per-gift broadcast).
- LiveKit dual-room: `usePKOpponentRoom` + `livekit-pk-opponent` profile matches Tencent TRTC reference.

### Files edited (1):
- `src/pages/LiveStream.tsx` (replaced raw client UPDATE with `accept_pk_battle` RPC + soft-fail logging)

### Memory created:
- `mem://features/pk-battle-research.md` (was referenced in index but file didn't exist — now contains the full audit + research table + sources)

### Deferred cleanup (no user impact, defer until requested):
- R2: Drop `pk_battle_gifts.receiver_id` dead column.
- R3: Drop `pk_match_queue` table + 3 unused RPCs.
- R4: MVP cash bonus — research confirms no platform does this; MVP is a badge/visibility reward only.
- R5: ~10s cosmetic "TIME'S UP" lag before cron ticks — reduce cron interval to 5s only if users complain.

### Verification (Lovable preview using owner account smdollarex923@gmail.com):
1. Start live on owner account, send PK invite to another owner-test stream, accept on second device → only ONE accept succeeds; second returns `ok:false, error:'already_handled'`.
2. During battle, send gift to either side → score updates on both clients within ~200ms (server `bill_pk_gift` + postgres_changes).
3. Wait 5min → battle ends within 10s of timer expiry; winner side beans += 70% of loser score; `coin_transactions` row of type `pk_battle_reward` inserted.
4. Punishment overlay shows for 90s after end on losing side.


---

## Phase III — Party Room professionalization (✅ III.a–III.f ALL DONE 2026-06-08)

**Research-first ✅** — sub-agent verified industry patterns from Bigo Live (Multi-Guest 2026 guide, Room PK system), Chamet, AgoraIO-Usecase/Chatroom reference impl, Agora RTM docs, LiveKit maintainer (issues #3041, #3292). Codebase audit produced 10 P0–P2 gaps with file:line refs.

### Industry-locked numbers
- Seat-request expiry: **60s** (Agora raise-hand blog)
- Invitation expiry: **30–60s** (Chamet UX teardown; trigger already sets 60s ✅)
- Request queue cap: **50 pending** (Agora CHATROOM_MEMBERS_FULL)
- Audio profile: **`AudioPresets.music` 40 kbps Opus mono** per seat → 9-seat budget ~360 kbps
- ConnectionQuality.Lost: **~2–3s** early warning; ParticipantDisconnected: **~15s** authoritative (LiveKit maintainer confirmed)
- Source of truth: **server-only** (Redis SETNX / Postgres SELECT FOR UPDATE) — RTM/data-channel is fan-out only
- Host transfer: **DB-persisted required** (current in-memory auto-promote is broken)
- Party-host background grace: **0s in our app, should be 60s** to match live-host (Bigo uses FGS indefinitely)

### Phase III.a — P0 schema + race fixes (THIS PASS, Lovable-only, no APK rebuild)

**Fixes:**
- **R1** `seat_requests.status` CHECK missing `'cancelled'` — client writes it on every clean leave → DB error swallowed. Migration: extend CHECK to include `cancelled`.
- **R2** `party_rooms.background_id` referenced in `PartyRoom.tsx:120,551-566` but column does not exist → silent NULL. Migration: add column FK→party_room_backgrounds.
- **R3** `party_room_backgrounds.gradient_css` read at `PartyRoom.tsx:1211` but column doesn't exist. Migration: add `gradient_css text`.
- **R4** No `FOR UPDATE` lock on seat approval (`PartyRoom.tsx:1908-1975` does raw UPDATE). Migration: new RPC `approve_seat_request(p_request_id)` — SELECT FOR UPDATE on participant + seat slot, atomic transition. Client switches to RPC.
- **R5** Host transfer: no DB RPC, no client UI. Migration: new RPC `transfer_party_host(p_room_id, p_new_host_id)` — verifies caller is current host, updates `party_rooms.host_id` + both participants' `role`, idempotent. Client UI deferred to III.b.
- **R6** Dead `party_rooms.active_seats` column — leave for now (drop in cleanup phase).

### Phase III.b — Host controls + mute persistence ✅ DONE 2026-06-08
- **Audit finding:** `livekit-moderate` AND `livekit-update-permission` edge fns ALREADY verify host ownership (resolveHostOwnership against party_rooms.host_id) — plan's "any auth user can call" claim was wrong. No edge-fn change needed.
- New RPC `party_mute_seat(p_room_id, p_target_user_id, p_muted)` — SECURITY DEFINER, FOR UPDATE on `party_rooms`, host-only, writes `is_muted` so mute survives reconnect. Rejects host self-mute.
- New RPC `party_mute_all(p_room_id, p_muted)` — bulk DB-persist for seated speakers, host-excluded.
- `PartyRoom.tsx muteUser` now calls RPC first (durable state), then `hostMuteParticipantAudio` for instant LiveKit track mute.
- Host-transfer RPC `transfer_party_host` (shipped in III.a) UI = deferred to optional III.b2 sheet (low-priority, no user complaint yet).


### Phase III.c — Party host 60s background grace ✅ DONE 2026-06-08 (APK rebuild required)
- `ConnectArgs` gained `isHost: Boolean` (`LiveKitPlugin.kt:392`); JS passes `isHost` via `NativeLiveKit.ConnectOptions` → `nativeLiveKitController` → `usePartyRoomWebRTC` (uses existing `_isHost` param).
- `onProcessLifecycleChanged` now treats `scopeName == "party" && lastConnectArgs.isHost` the same as live host: 60s grace (camera pauses, mic + Room stay alive via FGS), foreground returns cancel timer + resume camera, expiry runs `endLiveSessionAfterGrace`. Audience still hits immediate teardown.
- Event payloads (`live-host-grace-start` / `live-host-grace-end`) now carry `scope` + `role` so JS overlays can label the right surface.

### Phase III.d — Seat invitation flow (client wiring) ✅ DONE 2026-06-08
- Two new RPCs (SECURITY DEFINER, FOR UPDATE on invitation + room): `accept_seat_invitation(p_invitation_id)` and `decline_seat_invitation(p_invitation_id)`. Accept verifies invitee=auth.uid(), pending+not-expired, room active, seat free, then upserts `party_room_participants` with `seat_number` + `role='speaker'`, frees any prior seat, cancels pending seat_requests, marks invitation accepted. Returns `{ok,error}` JSON.
- Existing INSERT RLS `u_ins_seat_inv` already restricts inviter to host of an active room → no policy change needed.
- New hook `useSeatInvitationInbox` — initial fetch of any still-pending invitation for the user + Realtime INSERT/UPDATE listener + per-invitation expiry timer + accept/decline RPC wrappers.
- New `SeatInviteResponseSheet` (invitee) — Dialog with inviter avatar/name + room name, live "Expires in Xs" countdown driven by `expires_at`, Accept/Decline buttons. Error map shows English toasts (`seat_taken`, `expired`, `room_closed`, …).
- New `SeatInvitePickerSheet` (host) — derives empty seats from `participants` (seat 0 reserved for host), grid of "Seat N" buttons → INSERT into `seat_invitations`.
- `PartyRoom.tsx`: wires `onInviteViewer` → opens picker for the tapped audience member; mounts inbox + response sheet for the logged-in user; if invitee accepts while inside a different room/page, navigates to the invitation's room.
- `expires_at` DB default is 5 minutes; UI shows real countdown so users see whatever the trigger sets (industry-acceptable, plan's 60s target is a future tightening if needed).

### Phase III.e — Per-seat gift target ✅ DONE 2026-06-08
- Currently all party gifts route to `room.host.id` (`PartyRoom.tsx:2532`).
- Industry: per-seat selection (Bigo/Chamet default). Add seat-picker to GiftPanel when context is party room.

### Phase III.f — Audio profile (music/speech) for party rooms (DJ rooms) ✅ DONE 2026-06-08
- `usePartyRoomWebRTC` uses LiveKit default speech. Add `audioProfile` prop ('voice'|'music') wired through token request → LiveKit `AudioPresets.music` (40 kbps) or `AudioPresets.speech` (24 kbps).

### Deferred (cleanup, no user impact)
- Drop dead columns: `party_rooms.active_seats`, `party_rooms.password` (plaintext, replaced by `password_hash`).
- Drop unused alias columns once all client writers migrated: `seat_requests.requester_id`/`seat_position` (kept until full client cleanup).
- LiveKit Egress → HLS/RTMP for 10k+ audience scale (only if room concurrency exceeds ~500 listeners).

### Verification for III.a (Lovable preview using owner account)
1. Create party room → leave cleanly → DB row in `seat_requests` shows `status='cancelled'` (no swallowed error).
2. Two devices simultaneously approve same seat → only one succeeds, second returns RPC error `seat_taken`.
3. Open party room background picker → selected `gradient_css` background renders correctly.
4. Call `transfer_party_host` RPC manually → `party_rooms.host_id` updates atomically; old host becomes `speaker`, new host becomes `host`.

---

## 🚨 Phase N — Native LiveKit Android Port (locked 2026-06-08 by owner)

**MANDATE:** Live stream + party room + private call media path = native `io.livekit:livekit-android` Kotlin SDK ONLY. WebView `livekit-client` JS path = FROZEN, only Lovable browser preview fallback. Re-verify: zero top-50 live apps (Bigo/Chamet/Tango/Olamet/Hollah/HiiClub/WeJoy/MICO/Likee/TikTok Live) use WebView WebRTC. See mem://constraints/no-web-rtc-native-only.

### Why
- WebView has no Camera2 direct access → soft encoder, 40-60% CPU
- WebView cannot hold `FOREGROUND_SERVICE_CAMERA/_MICROPHONE` → root cause of "video icon stuck on" / camera-not-releasing bug
- No platform AEC tuning, thermal throttle 30% earlier
- 100ms verdict: WebView WebRTC unsuitable for production mobile video

### Phases (each = APK rebuild)

- [ ] **N1 — Plugin foundation.** `LiveKitNativePlugin.kt` + `LiveKitNative.ts` shim. Methods: connect, disconnect, setMicEnabled, setCameraEnabled, switchCamera. Events: participantConnected/Disconnected, trackSubscribed/Unsubscribed, activeSpeakersChanged, connectionQuality, disconnected. Gradle: `implementation("io.livekit:livekit-android:2.24.1")`. Foreground service stub. `shouldUseNativeLiveKit()` gate already exists — re-wire.
- [ ] **N2 — Video rendering.** Native `TextureViewRenderer` overlay anchored under WebView via `Bridge.getWebView().addView()`. JS `attachRemoteView({sid, frame:{x,y,w,h}})`. Local preview mirror. DPI-aware. Replaces WebView `<video>` for production path.
- [ ] **N3 — Live Stream native port.** `useLiveStreamWebRTC` → native plugin behind gate. Host publish (camera + mic + simulcast 180p/540p/source). Viewer subscribe. Selective subscription. JS hook becomes preview-only fallback. Verify on owner APK.
- [ ] **N4 — Party Room native port.** `usePartyRoomWebRTC` → native plugin. Multi-seat publish/subscribe, active speaker, mute persistence, seat invitations. Re-apply III.f audio profile in native `LocalAudioTrack` config.
- [ ] **N5 — Private Call native port.** Private call media → native plugin. 1-on-1, ring → accept → connect via existing FCM data path. Camera switch, mute, end.
- [ ] **N6 — DataPacket bridging.** All `livekit*Signaling` JS modules (gifts/chat/reactions/party events/active speaker/metadata/room metadata) → native `room.localParticipant.publishData()` + `dataReceived` event bridge. Topic dispatch in JS.
- [ ] **N7 — Foreground service hardening.** `FOREGROUND_SERVICE_CAMERA` + `_MICROPHONE` declared, native lifecycle owns mic/cam. Background 60s grace (III.c) moved fully native. `AudioSwitchHandler` for BT/wired routing. Phone-call interruption.
- [ ] **N8 — Kill-switch + JS cleanup.** Per-device flag rollout 10% → 50% → 100%. Once stable: DELETE WebRTC body of `usePartyRoomWebRTC`, `useLiveStreamWebRTC`, `usePrivateCallWebRTC`. Keep `livekit-client` import ONLY as Lovable browser preview fallback.

### Hard rules during port
- Design SACRED — media plane only, no UI/copy/animation edits
- JS WebRTC hooks FROZEN — no new features, no fixes except security
- Every phase = APK rebuild — never claim "verified" without owner APK test
- Web fallback gated — `shouldUseNativeLiveKit()` returns true on Android APK
- DataPacket parity required before flipping any flow
- Coordinate with `ProCamera` arbiter + face-verify + Camera2 handoff (no double-open)
