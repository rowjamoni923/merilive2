# Phase 1 — Host Go Live Professionalization

**Date:** 2026-06-18
**Status:** Research complete, awaiting user approval before code
**Protocol:** Research-first mandatory (mem://preferences/research-first-mandatory.md)
**Test account:** smdollarex923@gmail.com / Sazzad017@ (mem://preferences/test-account.md)
**Design:** SACRED — no UI changes unless explicitly asked; functionality professionalized only

---

## Infrastructure Locked ✅

| Component | Version | Status |
|---|---|---|
| LiveKit Server | v1.8.4 (pinned) | Running on VPS 194.233.66.70 |
| LiveKit Egress | v1.12.0 (pinned) | Running |
| LiveKit Ingress | :latest | Running (not critical for go-live) |
| Caddy / Redis | stable | Running |

Pin completed via `/opt/livekit/docker-compose.yaml` sed edit + `docker compose up -d`. Zero downtime.

---

## Research Summary

### Competitor pattern (Chamet/Bigo/Olamet/Poppo/TUILiveKit reference)

5-stage canonical flow:
1. **Pre-join setup** — camera preview + title + cover + category + beauty toggle + audience type
2. **Permission gate** — OS dialog, deep-link to Settings on denial
3. **Token fetch** — JWT with role/grants/TTL
4. **RTC connect + track publish** — sequential, then DB row creation AFTER connect success
5. **Live UI** — viewer count, gift ticker, controls, end-confirm dialog → stats screen

### Industry-standard encoding (verified)
- Base layer: **1280×720 @ 30fps, 1.5 Mbps, H.264** (hardware encoder on mobile)
- Simulcast layer 2: 640×360 @ 20fps, 500 Kbps
- Simulcast layer 3: 320×180 @ 15fps, 150 Kbps
- Audio: DTX on (save bandwidth in silence), RED on (recovery from packet loss)
- `dynacast: true` to auto-pause unused layers
- Sources: docs.livekit.io/transport/media/advanced.md, kb.livekit.io optimal video quality, Tencent TUILiveKit

### Critical timing benchmarks
- Agora `joinChannel` → first frame: ~200–400ms
- LiveKit `connect` → `TrackPublished`: ~300–600ms (no official benchmark, instrument ourselves)
- Reconnect window: Agora auto-retries 20min, LiveKit token expiry does NOT block reconnect

---

## Audit Findings — Top 5 Gaps

| # | Severity | Issue | File |
|---|---|---|---|
| 1 | 🔴 Critical | Beauty filter completely broken on published track | `useBeautyState.ts:3`, `GoLive.tsx:213` |
| 2 | 🔴 Critical | `live_streams.status` never transitions `'starting'` → `'live'` | migration `20260510161831` |
| 3 | 🔴 Critical | No simulcast by default — weak network viewers buffer | `useLiveKitClient.ts:627–628` |
| 4 | 🟠 High | Orphan `live_streams` row when `room.connect()` fails | `GoLive.tsx:880–937` |
| 5 | 🟠 High | Camera-off keeps track published — viewers see frozen frame | `useLiveKitClient.ts:1545` |
| — | 🟡 Med | Missing category + cover photo on pre-join | `GoLive.tsx:884–886` (hardcoded null) |

### Already working ✅ — DO NOT TOUCH
- Token issuance: 6h TTL, role binding, race-safe (`livekit-token/index.ts`)
- Pre-join native camera preview (June 11 fix intact)
- Camera switch (`switchActiveDevice` web, native in-place Android)
- Reconnect (bounded retries 800/1800/3500/6500ms, token refresh at TTL-600s)
- Follower push notification (`live_started` → `merilive_live` FCM topic)
- End-live stats screen (duration / viewers / gift earnings)

---

## 6-Step Fix Order (Phased by Test-ability)

### 🟢 Phase 1A — Pure DB + Edge Function (Lovable-testable, NO APK rebuild)

**Step 1: `status` transition `'starting'` → `'live'`**
- Modify `update_stream_heartbeat` RPC: on first heartbeat where `status='starting'`, transition to `'live'`
- OR: add transition inside `livekit-webhook` `room_started` event handler
- Owner test: go live → check `live_streams.status` in DB within 5s → should be `'live'`

**Step 2: Orphan-row cleanup on connect failure**
- Wrap `room.connect()` call in `GoLive.tsx` try/catch
- On failure: call `close_live_stream_now(p_id)` RPC to mark row `is_active=false, status='failed'`
- Surface user-facing error toast (English): "Couldn't start your live. Please try again."
- Owner test: kill VPS network temporarily → tap Go Live → verify row marked `failed`, no ghost stream in feed

### 🟢 Phase 1B — Web/React Code (Lovable-testable, NO APK rebuild)

**Step 3: Enable 3-layer simulcast by default**
- In `useLiveKitClient.ts` web `RoomOptions.publishDefaults`: always set
  ```typescript
  simulcast: true,
  videoSimulcastLayers: [VideoPresets.h360, VideoPresets.h180],
  videoEncoding: { maxBitrate: 1_500_000, maxFramerate: 30 },
  dtx: true, red: true,
  ```
- Keep host-tier override logic, but default = professional 3-layer
- Owner test: open live on 2 devices (one throttled to 3G via DevTools), verify smooth viewer experience on weak side

**Step 4: Camera-off → unpublish + avatar placeholder (web path)**
- In `useLiveKitClient.ts` web toggle: on `setCameraEnabled(false)` → call `unpublishTrack(videoTrack)`
- On `setCameraEnabled(true)` → republish
- Viewer side: when `Track.Source.Camera` publication absent, show host avatar fullscreen (already a component in codebase: search for `HostAvatarPlaceholder` or create)
- Owner test: go live → tap camera off → on viewer device, verify avatar shows (not frozen frame) → tap camera on → verify live resumes

### 🟡 Phase 1C — Optional UX additions (Lovable-testable, design-touching → ASK USER)

**Step 5: Category select + cover photo on pre-join**
- Only if user approves design touch (memory says design SACRED → MUST ASK)
- Add 2 fields to GoLive pre-join: category dropdown (from `live_categories` table) + cover image upload (Supabase Storage)
- Pass `p_category_id` + `p_thumbnail_url` to `start_live_stream` RPC (already accepts them)

### 🔴 Phase 1D — Native Android beauty filter (APK REBUILD REQUIRED, deferred)

**Step 6: GPUPixel integration in native Camera2 pipeline**
- Reinstate GPUPixel as `VideoSource` between Camera2 and LiveKit publish
- Pre-warm during `startLocalPreview` (no first-frame delay)
- Toggle via existing `NativeBeauty.setEnabled()` plugin method
- **CANNOT BE TESTED IN LOVABLE PREVIEW** — requires APK rebuild
- Honest disclosure: user must rebuild APK after this step

---

## Owner Test Plan (Phase 1A + 1B)

After Steps 1–4 land:
1. Log into preview as `smdollarex923@gmail.com`
2. Go to `/go-live` → tap Go Live
3. Verify console: no errors, `RoomEvent.Connected` fires
4. Check Supabase `live_streams` row: `status='live'` within 5s
5. Open second tab (incognito) → join stream as viewer
6. Throttle viewer tab to "Slow 3G" in DevTools → verify smooth playback (simulcast working)
7. Host tab: tap camera off → viewer should see avatar (not frozen frame)
8. Host tab: tap End Live → verify stats screen → DB row `is_active=false`
9. Cleanup test: open new tab, tap Go Live, immediately kill network → verify no orphan row

If any step fails → fix before next phase.

---

## Files Touched (planned)

### Phase 1A
- `supabase/migrations/<new>.sql` — `update_stream_heartbeat` status transition OR `livekit-webhook` patch
- `src/pages/GoLive.tsx` — wrap `room.connect()` in try/catch + cleanup call

### Phase 1B
- `src/hooks/useLiveKitClient.ts` — simulcast defaults, camera-off unpublish
- `src/components/LiveStream/HostAvatarPlaceholder.tsx` (NEW or reuse existing) — viewer-side fallback

### Phase 1C (only if approved)
- `src/pages/GoLive.tsx` — add category + cover fields

### Phase 1D (deferred, needs APK)
- `android/app/src/main/java/com/merilive/app/livekit/NativeLiveKitPlugin.kt`
- `android/app/build.gradle` — GPUPixel dependency

---

## Non-goals (explicitly OUT of scope for Phase 1)

- ❌ ANY design changes (design sacred per memory)
- ❌ Phase 2/3/4 areas (Watch, Private Call, Party Room) — separate phases
- ❌ VPS work (deferred per mem://preferences/vps-deferred)
- ❌ PK Battle (separate effort per mem://features/pk-battle-research.md)
- ❌ Ingress :latest → pinned (not needed for go-live, separate maintenance)

---

## Decision needed from user

**Q1.** Approve Phase 1A + 1B (Steps 1–4) for immediate implementation?
**Q2.** Phase 1C (category + cover on pre-join) — design touch, want it included or skip?
**Q3.** Phase 1D (native beauty filter) — schedule now (with APK rebuild) or defer to a later batch?

---

# Phase 2 — Viewer (Live Watch) Professionalization

**Date:** 2026-06-18
**Status:** Audit + competitor research complete, awaiting user approval
**Design rule:** SACRED — no UI changes; functionality + reliability only (loading text + "Camera is off" pill already approved in Phase 1B style — same pattern reused)

---

## Audit summary

**Audited:** `src/pages/LiveStream.tsx`, `src/hooks/useLiveKitClient.ts`, `src/services/liveStreamPreloader.ts`, `src/components/live/LiveKitVideoPlayer.tsx`
**Findings:** 16 gaps — 5 HIGH, 7 MEDIUM, 4 LOW

### HIGH severity (must-fix)

| # | Gap | File | Impact |
|---|---|---|---|
| H1 | Preloaded room missing `TrackMuted`/`ConnectionStateChanged`/reconnect listeners | `useLiveKitClient.ts:1052-1168` | Camera-off avatar broken + no hard-reconnect on preloaded path |
| H2 | `enter_live_stream` RPC + token fetch sequential (3 RTTs cold start) | `LiveStream.tsx:2406`, `useLiveKitClient.ts:1171` | First frame 800–1500ms slower than needed |
| H3 | 10s `qualityEnforcer` overwrites network-aware quality cap | `useLiveKitClient.ts:1026-1042` | Weak-network viewers forced back to HIGH every 10s → stall + data burn 🚨 |
| H4 | Native Android viewer has no bounded reconnect curve | `useLiveKitClient.ts:233`, `useNativeLiveKitEvents` | APK viewers get stuck on flaky network |
| H5 | `visibilitychange→hidden` instantly fires `leave_live_stream_viewer` w/o re-enter on return | `LiveStream.tsx:582` | Notification-shade swipe wrongly drops count; viewer present in room but absent from DB |

### MEDIUM severity

| # | Gap | Fix |
|---|---|---|
| M1 | `consumePreloadedStream` discards room if videoTrack hasn't arrived yet | 300ms poll before declaring unusable |
| M2 | Preloaded rooms keep `adaptiveStream: false / dynacast: false` after handoff | Re-init flags on consume |
| M3 | `stallProbe` 3s threshold too loose; no re-subscribe escalation | 1.5s threshold + call `retrySubscription` directly |
| M4 | `revealWatchdog` 450ms only reveals — no escalation if decoder stalls | Add 2s second-tier watchdog → `onVideoStalled` |
| M5 | Viewer hard-reconnect fires at 2.5s, kills LiveKit's own ICE-restart (3–8s) | Extend to 6–8s |
| M6 | No "Connecting…" text in blurred-avatar fallback while `isJoined && !remoteVideoTrack` | Add small pill (same Phase 1B style) |
| M7 | Dual end-stream detection (LiveKit event + Realtime row) can fire modal twice | Sync `streamEndedRef` guard in Realtime handler |

### LOW severity

L1. `Disconnected` auto-rejoin doesn't check `streamEndedRef` → wastes RPC
L2. `RoomEndedModal` only has "Exit" — no "Browse Live" / "Follow host" CTA
L3. LiveKit SFU viewer count not reconciled against DB `viewer_heartbeat` response
L4. `leave_live_stream_viewer` idempotency unconfirmed when `left_at` already set (open question)

---

## Competitor pattern → LiveKit translation (key validations)

| Chamet/Bigo/Agora pattern | Our current state | LiveKit equivalent |
|---|---|---|
| `preloadChannel` on list scroll | ✅ `liveStreamPreloader` does this | `room.prepareConnection` + `autoSubscribe:false` |
| Wildcard pre-fetched token | ❌ token fetched per-stream sequentially | **H2 fix** — parallel fetch w/ RPC |
| `setRemoteSubscribeFallbackOption(AUDIO_ONLY)` on poor net | ❌ qualityEnforcer overrides | **H3 fix** — respect `QualityHint`, add audio-only step at `ConnectionQuality.lost` |
| 20-min retry cap, then give up | ❌ LiveKit retries forever (no cap) | Add app-layer 20-min timer → show "Connection lost" sheet |
| Wall-clock freeze watchdog (Jitsi pattern: `framesDecoded` delta) | ⚠️ partial (`currentTime` only) | **M3+M4 fix** — escalation ladder: re-attach → re-subscribe → reconnect |
| Pause video on background, keep audio | ❌ video keeps decoding | Pause `<video>` on `visibilitychange→hidden`; grace-timer leave (H5) |
| "Stream ended" sheet w/ Follow + Next-stream CTA | ⚠️ only Exit | **L2 fix** — add Browse Live + Follow host |
| Gift overlay `pointer-events: none` z-30 above video | ✅ already correct | No change |
| Thumbnail blur + host card from cached room-list before connect | ⚠️ host card flickers null on deep-link/refresh | **M-gap 7.2 fix** — pre-fetch host profile in preloader |

---

## Phase 2 implementation plan (priority order)

### **Phase 2A — HIGH-severity reliability (no UI change)**
Step 1. **H3 fix first** (highest user impact, smallest change) — gate `qualityEnforcer` behind `preferredVideoQualityRef === HIGH`, so network-aware throttle is preserved
Step 2. **H1 fix** — extract `wireRoomEvents(room)` helper, call for both new + preloaded room (no divergence)
Step 3. **H2 fix** — parallelize `enter_live_stream` RPC with `warmLiveKitToken` (Promise.all), cache token result in `joinChannel`
Step 4. **H5 fix** — 25s grace timer on `visibilitychange→hidden` before firing `leave_live_stream_viewer`; cancel on `visible`; pause `<video>` element immediately for battery
Step 5. **H4 fix** — mirror web reconnect curve in native viewer disconnect handler (bounded retries, expo backoff, hard-cap)

### **Phase 2B — MEDIUM stall/freeze/reconnect (no UI change)**
Step 6. **M3+M4** — freeze escalation ladder in `LiveKitVideoPlayer`: 1.5s currentTime stagnation → re-attach; 3s → `setSubscribed(false)`+`true`; 6s → full reconnect
Step 7. **M5** — extend `viewerHardReconnectTimerRef` 2.5s → 7s
Step 8. **M1+M2** — preloader handoff: 300ms wait for `videoTrack`, re-init adaptiveStream/dynacast flags on consume
Step 9. **M7** — sync `streamEndedRef` guard in Realtime end-stream handler

### **Phase 2C — Tiny additive UI (Phase 1B-style minimal)**
Step 10. **M6** — "Connecting…" pill in blurred-avatar fallback (same glass+gradient as Phase 1B "Camera is off")
Step 11. **L2** — `RoomEndedModal`: add "Browse Live" + "Follow host" CTA buttons (use existing button styles)

### **Phase 2D — LOW (cleanup, optional)**
Step 12. L1 — guard auto-rejoin with `streamEndedRef`
Step 13. L3 — reconcile viewer count from `viewer_heartbeat` RPC response
Step 14. L4 — verify `leave_live_stream_viewer` idempotency via SQL

---

## Out of scope for Phase 2

- ❌ PiP (Picture-in-Picture) — needs APK rebuild + native module
- ❌ Auto-redirect to next stream on end — needs recommendation API (separate phase)
- ❌ VOD/replay — infrastructure phase, deferred
- ❌ Any design overhaul (SACRED rule)

---

## Decision needed from user

**Q1.** Approve **Phase 2A (Steps 1–5, HIGH severity)** for immediate implementation? এগুলোই real user-impact ফিক্স (data burn, count drop, slow first-frame, native reconnect)।

**Q2.** Phase 2B (Steps 6–9, MEDIUM) — সাথে সাথে যাবে নাকি 2A test করে আলাদা batch?

**Q3.** Phase 2C (Steps 10–11) — minimal additive UI ("Connecting…" pill + ended-modal CTAs) — চাস কিনা?

**Recommendation:** **2A + 2B একসাথে** (all reliability, zero UI) → test → তারপর 2C আলাদা। 2D defer।
