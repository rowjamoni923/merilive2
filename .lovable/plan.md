# 🎯 MeriLive Professional A-to-Z Migration Plan
**Version:** 2.0 | **Created:** 2026-06-07 | **Status:** Active | **Owner:** smdollarex923@gmail.com

> **🔴 AGENT MANDATORY RULE:** এই file টা **প্রতিবার** live/call/party/RTC/camera/animation/billing/wallet/agency-related কাজ শুরুর আগে পড়তে হবে। কাজ complete হলে relevant checkbox-এ `[x]` mark দিতে হবে। কখনো plan skip করে কাজ করা যাবে না। Non-trivial fix হলে আগে Google research (subagent/websearch) করতে হবে — mem://preferences/google-research-before-fix।

> **📱 ANDROID-ONLY FOREVER:** 99% user Android। Web is NOT a delivery target — preview/dev only। সব RTC/animation/camera/payment SDK Android-native (livekit-android, VAP, Camera2, FCM, Play Billing)। "web-first" / "JS now, native later" — permanent ban। See mem://preferences/android-only-forever।

> **💰 ALL RATES ADMIN-CONFIGURABLE:** Call price, platform cut, agency %, sub-agency %, bonus tiers — সব admin panel DB table থেকে read হবে। কোনো percentage hardcoded না। Agency commission = host এর earned beans এর small % (admin-set), company-র cut থেকে paid — host কে আরো কাটা হবে না। See mem://preferences/admin-configurable-rates।

---

## 📊 Executive Summary

**Vision:** Bigo Live / Chamet / StreamKar / PoPo Live / CrushLive / HiClub / Wejoy-class professional live + call + party app for Bangladesh / SE-Asia market। 10K+ existing users — flop হলে 12 মাসের কষ্ট নষ্ট।

**Two parallel tracks:**
- **Track T (Technical):** Camera/mic/RTC → Native Android plugin (Kotlin + LiveKit Android SDK)। React/WebView শুধু UI shell + non-media UI।
- **Track B (Business):** Per-minute billing, hourly bonus, beans/diamond economy, gift flow, party seat rules, agency system, KYC — all industry-standard formulas locked in DB + edge functions।

**RTC SDK:** LiveKit self-hosted (wss://livekit.merilive.xyz) — NOT migrating to Agora/ZEGO। LiveKit Android Native SDK ব্যবহার করে Bigo-style native engine।

**Why two tracks parallel:** Tech fix camera blank, Business fix host earnings + user trust — দুটো না হলে app professional হবে না।

---

## 🔬 Industry Research Summary (Cited)

Source: 30+ pages from BitTopup, Buffget, bigo.tv blog, chamet-live.com, poppolive.net, livehosting.xyz, Scribd policy PDFs (2025-2026)।

### Industry Standard Defaults (REFERENCE ONLY — actual values from admin panel)

> ⚠️ এই table শুধু **research reference** — আমাদের app-এ এই কোনো number hardcoded থাকবে না। সব value admin panel-এর config table-এ seed হবে এবং admin চাইলে যেকোনো সময় change করতে পারবে। See mem://preferences/admin-configurable-rates।

| Rule | Bigo | Chamet | PoPo | StreamKar | **OurApp Default Seed (admin-editable)** |
|------|------|--------|------|-----------|-------------------------------------------|
| Per-min call billing | Per-min advance | 70 coins/min fixed | hourly model | not public | **Per-min advance, rate from `call_price_settings`** |
| Min charge | 1 full minute | 1 full minute | n/a | n/a | **Configurable in `app_settings.min_call_minutes`** |
| Connect grace | not published | 0s | n/a | n/a | **Configurable in `app_settings.call_connect_grace_seconds` (seed 8)** |
| Reconnect window | ~30s | none | n/a | n/a | **Configurable in `app_settings.call_reconnect_window_seconds` (seed 15)** |
| Low-balance warn | ~30s before end | none | n/a | n/a | **Configurable in `app_settings.low_balance_warn_minutes` (seed 2)** |
| Pre-call balance check | manual | manual | n/a | n/a | **Configurable in `app_settings.min_balance_minutes_to_start` (seed 3)** |
| Platform cut (gift) | 20-50% | 40% | 30% | not disclosed | **`agency_policy_settings.platform_gift_cut_percent` — admin-set** |
| Platform cut (call) | 50% | 40% | n/a | n/a | **`agency_policy_settings.platform_call_cut_percent` — admin-set** |
| Withdrawal min | $31.90 | $10 | $10 | not public | **`app_settings.min_withdrawal_usd` — admin-set** |
| Withdrawal freq | weekly | weekly Thu 06:00 UTC+8 | weekly Sun cutoff | monthly | **`app_settings.withdrawal_schedule` — admin-set** |
| Bean hold period | 48h | weekly batch | weekly batch | monthly | **`app_settings.bean_hold_hours` — admin-set** |
| KYC required | ID | 3-tier liveness | 1080p face | PAN+Aadhaar | **NID + liveness, tiers from `user_kyc` config** |
| Age gate | 18+ | 18+ | 18+ | 18+ | **`app_settings.min_age` — admin-set** |
| Multi-guest seats | 12 | n/a | n/a | yes | **`party_rooms.max_seats` per room — admin-set, seed 8** |
| PK duration | 10 min | yes | yes | yes | **`pk_battles.duration_minutes` — admin-set, seed 10** |
| Recording private call | NO | NO | NO | NO | **NO (FLAG_SECURE) — hard-coded for legal** |
| Hourly stream bonus | tiered salary | online bonus | 11 tiers 2K-70K coins/hr | gems target | **Tiers from `new_host_live_bonus_settings` table — admin-set** |
| Min hours for bonus | 30h/15days | implied | 4h/week | 40h/15days | **`new_host_live_bonus_settings.min_hours_threshold` — admin-set** |
| Face detection in call | yes (AI) | yes | mandatory >1hr | not disclosed | **`app_settings.face_warn_seconds` / `face_end_seconds` — admin-set** |
| Agency commission | tier | 5-30% (9-tier) | 4-20% (D-S) | deposit-based | **From `agency_level_tiers` table — admin-set per tier, % of host earnings, paid from company cut** |
| Sub-agency commission | tier | yes | yes | yes | **From `sub_agent_commissions` / `agency_level_tiers` — admin-set, paid from agency cut** |

### Business Logic (user-confirmed — locked rules)

**ALL financial systems** (gifts, calls, recharges, agency, sub-agency, host earnings, hourly bonus, withdrawals) = admin panel-controlled. Zero hardcoded values.

1. **Viewer payment flow (gift OR call):**
   - Diamond cost per item / per-min = admin's `gifts` row or `call_price_settings` row
   - Host bean payout % = admin-set; host always receives that exact %
   - Company keeps the rest as VAT — agency/sub-agency commissions paid FROM this VAT pool, never from host

2. **Agency commission (level 1):**
   - Direct agency owner gets admin-set % (e.g. 2-3%) of host's earned beans for every host under them
   - Rate per agency level from `agency_level_tiers.agency_commission_percent`

3. **Sub-agency cascading commission — LEVEL-GATED (CRITICAL, user-locked):**
   - Sub-agent gets the SAME structure on hosts they directly recruit
   - **Upper agent gets override % (admin-set, e.g. 2%) on the host earnings of sub-agents below them — ONLY IF `upper.agency_level > sub.agency_level` (strictly greater)**
   - Same-level → upper gets ZERO
   - Higher-level sub → upper gets ZERO (upward override blocked)
   - Example: Owner L5 → SubA L3 → SubA recruits 10 sub-sub-agents: 5 at L3 (= SubA), 5 at L2 (< SubA). SubA earns override on the 5 at L2 only. Owner earns override on ALL below L5.

4. **Implementation:** DB function `calculate_agency_cascade_commission(host_earning_event)` walks agency tree upward; for each ancestor compares `ancestor.agency_level > recipient.agency_level`; credits only when strictly greater; rate from `agency_level_tiers.upper_override_percent`.

5. **Why this works:** Company keeps majority of VAT; agency/sub-agency get recruitment incentive but level-gated to prevent same-tier exploitation; host's payout never reduced by agency presence. Industry-standard MLM structure used by Bigo/Chamet/PoPo.

### Critical insights for our app

1. **PoPo's agency model = host-friendly:** Commission from platform's cut, NOT from host's. ✅ We're already doing this per user rule above.
2. **Bigo's 48h hold + bean freeze on fraud:** Industry standard for chargeback protection — implement as admin-configurable hold period.
3. **Server-side timer is mandatory** (not client-reported) — prevents fake duration fraud.
4. **No server-side call recording** — universal industry practice for privacy/liability.
5. **Every config value via admin panel** — never code-locked.

---

## 🏆 Honest Gap Analysis: আমরা vs Professional

### 🔴 CRITICAL gaps (blocks professional rating)
- [ ] **Camera blank on re-entry** — root: WebRTC in WebView. Bigo/Chamet use native engine.
- [ ] **No native private call Activity** — currently WebView screen → camera permission loop
- [ ] **No server-side call duration timer** — client-reported = fraud-prone
- [ ] **No 48h bean hold** for fraud window
- [ ] **No face detection during call** — anyone can camera-off and bill host
- [ ] **No KYC liveness check** for withdrawal — chargeback exposure
- [ ] **No `FLAG_SECURE` on private call** — screenshots possible

### 🟠 HIGH gaps
- [ ] **No tiered hourly streaming bonus system** (Bigo/PoPo have explicit tables)
- [ ] **No PK battle system** (10-min split-screen)
- [ ] **No agency commission system** (5-25% 6-tier)
- [ ] **No multi-guest party seats** (8-12 native SurfaceView grid)
- [ ] **No gift velocity / fraud detection** (chargeback freeze)
- [ ] **No top-spender real-time list** for host
- [ ] **No banned-word filter** (Bengali + English keyword blacklist)

### 🟡 MEDIUM gaps
- [ ] No beauty filter pipeline (Agora-style BeautyOptions equivalent)
- [ ] No adaptive bitrate per device tier
- [ ] No PK score / family / level badges UI
- [ ] No host stream-end stats screen

---

## 🛠️ Phase Structure

| Phase | Theme | Days | Track |
|-------|-------|------|-------|
| **Phase 0** | Foundation already done (reference) | — | T+B |
| **Phase 0.5** | 🧹 Native Plugin Audit + Duplicate Consolidation (BEFORE Phase 1) | 1 | T |
| **Phase 1** | Native LiveKit RTC foundation | 1-2 | T |
| **Phase 2** | Camera lifecycle hardening | 1-2 | T |
| **Phase 3** | Native Private Call Activity + business rules | 2-3 | T+B |
| **Phase 4** | Live streaming polish + viewer/chat/anti-fraud | 2 | T+B |
| **Phase 5** | Hourly streaming bonus system | 1-2 | B |
| **Phase 6** | Native Party Room (audio/video/game) | 2-3 | T+B |
| **Phase 7** | Native gift dispatcher (Pkg438 Phase B) | 1 | T |
| **Phase 8** | Wallet hardening — KYC, 48h hold, withdrawal | 2 | B |
| **Phase 9** | Agency / family system (6-tier 5-25%) | 2 | B |
| **Phase 10** | Anti-fraud (face detect, FLAG_SECURE, velocity, keyword) | 2 | T+B |
| **Phase 11** | Production polish — adaptive bitrate, beauty, crash hardening | 1-2 | T |

**Total:** ~18-25 working days for first professional release। Bigo SSS-class polish lifetime journey।

---

## ✅ Phase 0 — Foundation Already Done (Reference)

- [x] Capacitor + Android setup
- [x] LiveKit self-hosted on VPS (wss://livekit.merilive.xyz)
- [x] Supabase backend (Auth/DB/Storage/Edge Functions)
- [x] Existing LiveKitPlugin.kt (partial native — needs Phase 1 major upgrade)
- [x] Pkg438 Phase A: NativeGiftAnimationPlugin + NativeEntryAnimationPlugin
- [x] Phase 3 Private Call audit (2026-06-06) — 5 bugs fixed
- [x] 7-fix camera hotfix (CameraManager.AvailabilityCallback, OEM grace, soft reconnect)
- [x] Pkg425 Trader wallet history
- [x] Pkg424 instant-play warmup

---

## 🧹 Phase 0.5 — Native Plugin Audit + Duplicate Consolidation (Day 0)

**MUST run before Phase 1.** Goal: single-owner native pipeline per concern. Zero parallel camera/audio/beauty paths. See mem://preferences/no-duplicate-native-systems.

### Known duplicate suspects (current audit 2026-06-07)

**Camera concern — 3 candidates:**
- `plugin/LiveKitPlugin.kt` (RTC, Kotlin) — keep as future single camera owner via livekit-android SDK
- `plugin/NativeCameraPlugin.java` (legacy Java) — purpose unclear, audit
- `plugin/video/NativeVideoEnginePlugin.java` — purpose unclear, audit

**Beauty concern — 3 candidates:**
- `plugin/BeautyPipelineBridge.kt`
- `plugin/GPUPixelBeautyPlugin.kt`
- `plugin/video/GPUPixelBeautyProcessor.kt` (+ `VirtualBackgroundProcessor.kt`)
→ Consolidate to ONE pipeline (likely `GPUPixelBeautyPlugin` + processor, drop bridge)

**Audio concern — overlap:**
- `plugin/AudioFocusPlugin.java` (focus arbiter — keep)
- `plugin/AudioRecorderPlugin.java` (voice msg only — keep, scope-limited)
- `plugin/HeadsetRoutingPlugin.kt` (routing — keep)
- `plugin/GiftAudioMixer.kt` (gift SFX — keep, scope-limited per Pkg438)
- `plugin/video/NativeAudioEnginePlugin.java` — audit, likely overlaps with LiveKit audio + AudioFocusPlugin → candidate for removal

**Call concern — overlap:**
- `plugin/LiveKitPlugin.kt` (RTC layer)
- `plugin/NativeCallPlugin.kt` (call lifecycle wrapper)
- `telecom/MeriConnectionService.kt` + `telecom/TelecomBridge.kt` (Android Telecom API integration)
- `service/CallForegroundService.java` (foreground service)
→ Clarify boundaries; NativeCallPlugin should orchestrate, LiveKitPlugin = media only, Telecom = OS call API only

### Phase 0.5 Sub-tasks
- [x] Run `rg -n "NativeCameraPlugin\|NativeVideoEnginePlugin" src/ android/` — reference map complete
- [x] Run `rg -n "BeautyPipelineBridge\|GPUPixelBeautyPlugin\|GPUPixelBeautyProcessor" src/ android/` — confirmed layered architecture (Plugin → Bridge → Processor), NOT duplicates
- [x] Run `rg -n "NativeAudioEnginePlugin" src/ android/` — DEAD (not registered, no JS callers)
- [x] Read `MainActivity.java` registration list — `NativeVideoEnginePlugin` + `NativeAudioEnginePlugin` confirmed unregistered
- [x] Read `src/plugins/*.ts` — `NativeVideoEngine.ts` + `NativeAudioEngine.ts` had ZERO imports
- [x] Produce written audit table presented to user
- [x] User approval received
- [x] Delete confirmed-dead files (5 files + cpp dir + CMake block):
  - `android/app/src/main/java/com/merilive/app/plugin/video/NativeVideoEnginePlugin.java`
  - `android/app/src/main/java/com/merilive/app/plugin/video/NativeAudioEnginePlugin.java`
  - `android/app/src/main/cpp/native_video_engine.cpp` (+ whole `cpp/` dir + CMakeLists.txt)
  - `src/plugins/NativeVideoEngine.ts`
  - `src/plugins/NativeAudioEngine.ts`
  - `android/app/build.gradle` externalNativeBuild block removed
- [ ] APK smoke build verification (next APK rebuild cycle — Phase 1 will trigger anyway)

### ✅ Success Criteria
- [x] Exactly ONE plugin owns camera for live/call (LiveKitPlugin) — `NativeCameraPlugin` scope-limited to Pkg272 Face Verification, arbitrated via `CameraOwnership.kt`
- [x] Beauty pipeline = layered (Plugin → Bridge → Processor), single user-facing entry (`GPUPixelBeautyPlugin`)
- [x] Exactly ONE audio focus arbiter (`AudioFocusPlugin`)
- [x] ZERO dead `.kt` / `.java` in `plugin/video/` directory
- [x] ZERO dead TS wrapper in `src/plugins/`
- [x] MainActivity registration list = 100% active plugins
- [ ] Owner test account verifies live + call + party + gift + entry animation all work (verify after Phase 1 APK rebuild)

### Audit Outcome — NO real duplicates found
The original 3-camera / 3-beauty / multi-audio "duplicate" fear was inaccurate:
- Beauty uses Bigo/Chamet-standard layered design (Plugin/Bridge/Processor)
- `NativeCameraPlugin` ≠ duplicate; it's Pkg272 Face Verification KYC, separate concern, arbitrated by `CameraOwnership`
- `NativeCallPlugin` ≠ duplicate of `LiveKitPlugin`; it's CallKit-style action bridge (accept/decline events)
- Telecom plugins handle Android OS Telecom API only — different concern from media RTC
- Only 2 plugins were actual dead code (Pkg435 NativeAudioEnginePlugin + NativeVideoEnginePlugin) — both now deleted

### ⚠️ Risk (resolved)
- Deleted files had ZERO references — no production crash risk
- Phase 1 APK rebuild will validate clean build (no CMake error, no missing native libs)

---

## 🔄 Phase 1 — Native LiveKit RTC Foundation (Day 1-2)

**Reality check (2026-06-07):** Most of the originally-scoped Phase 1 work was already shipped in earlier sprints — `livekit-android:2.23.4` integrated, native Kotlin Room (`LiveKitPlugin.kt`, 4 460 lines: adaptive bitrate, stall recovery, hard-reconnect, E2EE, PiP, BT routing, audio profiles, RTC stats, beauty bridge), `CameraOwnership` arbiter, `FOREGROUND_SERVICE_CAMERA`/`_MICROPHONE` already declared. Remaining gap = (1) Room ownership tied to Capacitor plugin instance → cannot survive Activity recreation, (2) no native SurfaceView attach/detach that bypasses engine restart, (3) `targetSdk` was 34.

**Professional pattern (Bigo/Chamet engineering):** incremental observer-first extraction, not 4 000-line blind rewrite. 10K live users — no Russian roulette.

### Phase 1A — Application-scope Engine Observer ✅
- [x] `MeriLiveApplication.java` already exists + registered in AndroidManifest (verified)
- [x] `io.livekit:livekit-android:2.23.4` already in `android/app/build.gradle` (verified)
- [x] Create `android/app/.../rtc/RtcEngineManager.kt` — Application-scope singleton, atomic Room holder, `bind/unbind/currentRoom/isConnected/lastConnect`. Observer-only in 1A.
- [x] Init `RtcEngineManager` from `MeriLiveApplication.onCreate` (wrapped in try/catch, non-fatal)
- [x] Observer hooks in `LiveKitPlugin`: `bind` after successful `room.connect()`; `unbind` at all 4 teardown sites (connect-failed, connect-replace, disconnect, destroy)
- [x] Bump `compileSdk` 34 → 35, `targetSdk` 34 → 35 (Android 15 FGS typing enforcement)

### Phase 1A.2 — Migrate Room Ownership (split across 2 turns for safety)

#### Step 1 — Adoption capability ✅ (this turn)
- [x] `RtcEngineManager.setSurviveActivityDestroy(bool)` + `shouldSurviveActivityDestroy()` — one-shot flag, cleared on adoption / unbind
- [x] `RtcEngineManager.adoptCurrentRoom()` — returns `AdoptionHandle(room, summary, boundAtMs)` for the new plugin instance
- [x] `LiveKitPlugin.load()` — calls `adoptCurrentRoom()`; on success: `room = handle.room`, force-claim `CameraOwnership.LIVEKIT`, `attachEventListeners(room)`
- [x] JS API: `getActiveSession(): ActiveSessionInfo { active, url, callType, audioProfile, e2eeEnabled, boundAtMs, ageMs, canHardReconnect }`
- [x] JS API: `setSurviveActivityDestroy({ enabled })`
- [x] `lastConnectArgs` intentionally NOT rebuilt on adoption → `canHardReconnect=false` until JS re-issues `connect()` (documented limitation, transparent to user)

#### Step 2 — Conditional destroy + adoption resume ✅ (this turn)
- [x] `LiveKitPlugin.handleOnDestroy` early-return survival branch: skip `room.disconnect/release`, skip `RtcEngineManager.unbind`, skip `stopCallForegroundService`, skip `abandonAudioFocusInternal`, skip `applyAudioMode(false)`, skip `CameraOwnership.forceRelease`, skip `lastConnectArgs = null`
- [x] In survival branch, DO unregister system listeners that capture `this`: stall+reconnect+stats watchdogs, network callback, audio device listener, headset receivers, MediaSession
- [x] Release Activity-bound `virtualBackgroundProcessor` + `beautyProcessor` + renderers (will rebuild in new plugin)
- [x] `load()` adoption block extended: restart stall watchdog + network callback + audio device listener + headset receivers + MediaSession after `attachEventListeners`
- [x] Normal teardown path 100% unchanged when survival flag is OFF (production behavior preserved)

#### Step 3 — JS-side wiring ✅ (this turn)
- [x] `nativeLiveKitController.connectAndPublish` adoption branch: when `getActiveSession().active && url == opts.url`, skip native `connect()`, just `attachLocal()` + `attachAllRemotes()` (idempotent rebind of renderers, no network handshake)
- [x] `nativeLiveKitController.getActiveSession()` + `setSurviveActivityDestroy(enabled)` JS wrappers — web/iOS safe no-op
- [x] `src/components/native/NativeLiveKitRouteSurvivor.tsx` — single app-root component; on every PUSH/REPLACE route change while a native session is active, calls `setSurviveActivityDestroy(true)` (one-shot, native clears on adoption/unbind). POP (back button) intentionally skipped → real teardown.
- [x] Mounted inside `<BrowserRouter>` above the route tree so it observes /live ↔ /profile ↔ /private-call ↔ /party transitions uniformly — no per-screen wiring required
- [ ] APK rebuild required before owner-test verification (native plugin code from Step 1+2 ships only with new APK)
- [ ] Owner test account verification (post-APK): navigate /live → /profile → /live, camera should appear in <500 ms without re-init; force-rotate device should not blank camera
- [ ] Regression smoke test (post-APK): live broadcast, private call, party room, gift, beauty, BT headset, PiP — all still work; back-button from /live still tears down cleanly (survive flag not set on POP)



### Phase 1B — Camera Ownership State Machine ✅
- [x] `android/app/.../plugin/CameraOwnership.kt` exists with `LIVEKIT | NATIVE_CAMERA | GPUPIXEL-rejected`, OEM 1 200 ms release grace, stale-owner 30 s TTL eviction
- [x] `android/app/.../rtc/SurfaceLifecycleManager.kt` — centralizes `TextureViewRenderer` attach/detach against LiveKit `VideoTrack`s. Slot-keyed (`local` / `remote:<sid>`), idempotent `attachOrReuse` (no engine restart on surface churn), `detach(release=false)` keeps renderer warm, `pruneStaleRemotes(room)` cleans gone participants. Pure View-lifecycle helper — owns no camera/Room state. Ready for Phase 1C `NativeVideoView` to consume; LiveKitPlugin will migrate its inline renderer map to this manager in a follow-up turn (non-breaking, additive scaffold landed first).

### Phase 1C — NativeVideoView React component ✅
- [x] `src/components/NativeVideoView.tsx` — allocates a stable viewId from `useId()`, measures CSS-pixel bounds via `getBoundingClientRect` + `ResizeObserver` + rAF + capture-scroll, pushes them to native; calls `attachLocalSurface` / `attachRemoteSurface` on mount and `detachSurface` on unmount. Web/non-native → empty positioned `<div>` (graceful fallback).
- [x] `src/plugins/NativeLiveKit.ts` extended with `attachLocalSurface({viewId,x,y,width,height,mirror})`, `attachRemoteSurface({viewId,sid,x,y,width,height})`, `updateSurfaceBounds({viewId,x,y,width,height})`, `detachSurface({viewId})` — all idempotent on viewId, never touch the Room.
- [x] `android/app/.../rtc/BoundedSurfaceHost.kt` — new id-keyed registry that mounts `TextureViewRenderer`s at JS-reported CSS-pixel bounds (× display density) into the WebView's parent FrameLayout, binds to local/remote VideoTrack via `Room.initVideoRenderer` + `track.addRenderer`. Force-detaches on full RTC teardown.
- [x] `LiveKitPlugin.kt` — four `@PluginMethod`s (`attachLocalSurface`, `attachRemoteSurface`, `updateSurfaceBounds`, `detachSurface`) on the main thread, plus cleanup hook in `detachAllRenderersInternal(releaseRenderers=true)`.
- [x] WebView already set to `Color.TRANSPARENT` + `LAYER_TYPE_HARDWARE` in the existing `mountBehindWebView` path; `BoundedSurfaceHost.attach` re-asserts both on every new mount. TextureViewRenderer is used (not SurfaceView) — texture-layer composes correctly under a transparent WebView; no `setZOrderMediaOverlay` needed.
- [ ] APK rebuild required before any `<NativeVideoView />` consumer (LiveStream / private-call / party-room) can render frames; web preview will silently no-op until then.

### Phase 1D — Permissions + Manifest ✅
- [x] `FOREGROUND_SERVICE_CAMERA` + `FOREGROUND_SERVICE_MICROPHONE` already in AndroidManifest
- [x] `targetSdk` 35

### ✅ Success Criteria
- [x] Phase 1A observer foundation in place, APK rebuild required to validate
- [ ] Owner test account: host joins live → camera renders without re-init on Activity recreate (after 1A.2)
- [ ] Navigate /profile → /live → camera shows in <500ms (after 1B SurfaceLifecycleManager)
- [ ] CPU <20% on Pixel 4a-class at 720p
- [ ] No regression vs current 4 460-line LiveKitPlugin behavior (smoke test all: live, private call, party, gift, beauty, BT headset, PiP)

### ⚠️ Risk
- LiveKit Android SDK `Room.disconnect()` vs `Room.release()` semantics — `Room.release()` makes Room un-reconnectable; only call on final teardown
- SurfaceView Z-order under WebView — `setZOrderMediaOverlay(false)` + WebView transparent bg
- Phase 1A.2 must NOT unbind on every `handleOnDestroy` — Activity restart (orientation, dark-mode toggle, OEM trim) destroys plugin but should NOT kill Room

---

## 🔄 Phase 2 — Camera Lifecycle Hardening (Day 3-4)

**Pre-task research:** Android 12+ background camera restriction; Android 16 WebView permission loop (Chamet had this exact bug — documented at bittopup.com Dec 2025). Fix = native ProcessLifecycleOwner + WebView permission gate.

### Phase 2A — Process-level Lifecycle ✅
- [x] `android/app/.../rtc/AppLifecycleObserver.kt` — singleton wrapping `ProcessLifecycleOwner` (~700 ms debounced ON_START/ON_STOP, true-bg only — ignores permission sheets, notification shade, PiP, WebView focus). Lazy attach on first subscription, detach on last unsubscribe. Replays current state on subscribe so callers don't race the first transition.
- [x] `androidx.lifecycle:lifecycle-process:2.7.0` + `lifecycle-common-java8:2.7.0` added to `android/app/build.gradle`.
- [x] `LiveKitPlugin.load()` subscribes via `AppLifecycleObserver.addListener`; sets `processInBackground` and routes through new `onProcessLifecycleChanged(foreground)` funnel. Emits `app-foreground { foreground: boolean }` JS event for Phase 2C overlay consumption.
- [x] On true app bg → `setNativeCameraEnabledWithOemRetry(r, false, "process-bg")` (only when opt-in `pauseCameraOnBackground=true`; CameraDevice/foreground-service stay alive, only the publisher track is muted).
- [x] On true app fg → resume via the same code path when `cameraOnBeforeBackground` was set.
- [x] Removed the duplicate camera-toggle from `handleOnPause` / `handleOnResume` — Activity-level events kept only for renderer detach/restore (GPU saving). Eliminates the historic "camera flapping during permission sheets" regression that forced the JS `useNativeLiveKitLifecycle` to be a no-op.
- [x] Cleanup hook in both survival and normal `handleOnDestroy` branches — `unsubscribeAppLifecycle?.invoke()` so the dying plugin instance does not leak its `this` into the observer's `CopyOnWriteArrayList`.
- [x] JS plugin interface (`NativeLiveKit.ts`) extended with `addListener('app-foreground', cb)` overload.
- [ ] APK rebuild required to validate; pair with Phase 2C overlay to surface the state to users.

### Phase 2B — WebView Permission Gate (Chamet bug fix) ✅
- [x] `android/app/.../rtc/PermissionHelper.kt` — central substring list of native-owned media routes (`/live`, `/go-live`, `/private-call`, `/call/`, `/party`, `/stream`, `/face-verification`). One place to update when routes change.
- [x] `android/app/.../rtc/WebViewPermissionGate.kt` — subclasses Capacitor's `BridgeWebChromeClient`; overrides `onPermissionRequest`. For `VIDEO_CAPTURE` / `AUDIO_CAPTURE` requests, when the current WebView URL is a native-owned media route AND `CameraOwnership.owner()` is `LIVEKIT` / `NATIVE_CAMERA` → `request.deny()` with a TAG'd warn log. All other permission requests (notifications, geolocation, mic on non-call routes) fall through to super. Eliminates the Chamet-class Android-16 permission loop where the WebView fights LiveKitPlugin for the same Camera2 handle.
- [x] Installed in `MainActivity.onCreate` after `super.onCreate` via `getBridge().getWebView().setWebChromeClient(...)`, wrapped in try/catch so a Bridge init race never crashes the app.
- [ ] APK rebuild required to validate (verify on Android 16 device: `adb logcat | grep WebViewPermGate` should show DENY entries when the WebView attempts getUserMedia on /live, and `CameraManager` should NOT show a permission loop).

### Phase 2C — JS Lifecycle Sync ✅
- [x] `src/hooks/useRtcLifecycle.ts` — thin React hook around `NativeLiveKit.addListener('app-foreground', ...)`. Returns `{ foreground, hasBackgrounded }`. Safe no-op on web/iOS (defaults to `foreground:true`). One source of truth so call sites don't duplicate Capacitor listener boilerplate.
- [x] `src/components/CameraPausedOverlay.tsx` — absolute-positioned overlay (z-40, `bg-background/90 backdrop-blur-sm`) with `VideoOff` icon + "Camera paused" / "Return to the app to resume." copy. English-only strings (project rule). Props: `pauseOnBackground` (default true; set false on Live host to keep streaming while backgrounded), `label`, `hint`. Uses design tokens only — no raw colors.
- [x] Only triggers AFTER first true bg transition (`hasBackgrounded` gate) so it never flashes on initial mount; fades out in 200 ms when foreground returns.
- [ ] Mount on `/private-call` viewport (Phase 3A native Activity will own this; until then keep the WebView screen safe).
- [ ] APK rebuild required to validate end-to-end (web preview stays in `foreground:true`).

### ✅ Success Criteria
- [ ] Lock screen 2min → unlock → camera resumes <500ms ✓
- [ ] App switch (recents) → return → no blank ✓
- [ ] Android 16 device: `adb logcat | grep CameraManager` shows NO permission loop ✓
- [ ] Test using mem://preferences/test-account.md account on owner's device

### ⚠️ Risk
- `muteLocalVideoStream` still sends black frames to remote — server-side "camera paused" Realtime state

---

## 🔄 Phase 3 — Native Private Call Activity + Business Rules (Day 5-7)

**Pre-task research:** Bigo/Chamet private call = dedicated full-screen Activity, NOT WebView screen. Per-minute server-side timer (not client). 8s connect grace, 15s reconnect window, 1-min minimum charge, balance check pre-call.

### Phase 3A — Native PrivateCallActivity (Technical)
- [ ] Create `android/app/.../privatecall/PrivateCallActivity.kt` — full-screen native, NOT React route
- [ ] Create `android/app/src/main/res/layout/activity_private_call.xml` — SurfaceView local (PIP) + SurfaceView remote (fill)
- [ ] Create `android/app/.../privatecall/CallStateMachine.kt` — IDLE→RINGING→ACCEPTED→ACTIVE→ENDED
- [ ] Create `android/app/.../privatecall/CallForegroundService.kt` — Android 14+ `FOREGROUND_SERVICE_MICROPHONE` + `FOREGROUND_SERVICE_CAMERA`
- [ ] Create `android/app/.../privatecall/PrivateCallPlugin.kt` — Capacitor bridge methods
- [ ] Modify existing `MeriLivePushService.kt` — on FCM `type=private_call_invite`, launch via full-screen notification intent
- [ ] Add `FLAG_SECURE` on PrivateCallActivity window (screenshot block — Bigo standard)
- [ ] Replace `src/pages/PrivateCall.tsx` to redirect to native via `PrivateCallPlugin.startOutgoingCall(targetUserId)`

### Phase 3B — Server-Side Per-Minute Billing (Business)
- [ ] Create `supabase/migrations/<ts>_private_call_billing.sql`:
  - `private_calls` table columns: `started_at`, `connected_at` (after 8s grace), `last_billed_minute`, `total_minutes_billed`, `viewer_rate_per_min`, `host_rate_per_min`, `platform_cut_percent` (default 35)
  - DB function `bill_call_minute(call_id)` — atomic: deduct viewer coins, credit host beans, increment counter
  - Trigger or scheduled edge function to call every 60s
- [ ] Create edge function `supabase/functions/call-billing-tick/index.ts` — runs every 30s, finds active calls, bills due minutes
- [ ] Create edge function `supabase/functions/call-start/index.ts` — pre-call balance check: reject if viewer balance < (rate × 3 minutes)
- [ ] Add `connect_grace_seconds` config (default 8) to a `system_config` table or edge function env

### Phase 3C — Low-Balance Warning + Reconnect
- [ ] Add Realtime channel `private_call:{call_id}:billing` — host/viewer subscribe
- [ ] Edge function emits `low_balance_warning` event when viewer has <2 min remaining
- [ ] Edge function emits `balance_depleted` → native CallActivity auto-ends call
- [ ] Reconnect window: if `connected_at` exists and disconnect detected, allow 15s grace before marking ENDED — don't double-bill that minute

### Phase 3D — Face Detection Bridge (defer ML to Phase 10, just stub here)
- [ ] PrivateCallPlugin: hook to report frames per minute (placeholder for Phase 10 ML)
- [ ] Add `face_detection_warnings` column to `private_calls`

### Phase 3E — Call End — Earnings Summary
- [ ] On CallStateMachine.ENDED: edge function `call-end` finalizes — total minutes, viewer diamonds spent, host beans earned, platform cut
- [ ] Native UI shows "Call ended. Duration: 12:34. Earned: 1,500 Petals" toast
- [ ] DB: `call_ended_at`, `final_status` (completed/disconnected/insufficient_balance/face_violation)

### ✅ Success Criteria
- [ ] Incoming call full-screen shows when app backgrounded (Android 10+ full-screen intent) ✓
- [ ] Camera <300ms on accept ✓
- [ ] Lock/unlock during call → camera stays ✓
- [ ] **Re-enter private call after exit → camera works first time** (user's reported bug) ✓
- [ ] Server-side billing — even if user kills app, last started minute charged ✓
- [ ] Low balance (<2 min) → warning toast ✓
- [ ] Insufficient balance → call ends, no overcharge ✓
- [ ] Test using mem://preferences/test-account.md on real device

### ⚠️ Risk
- Android 10+ background activity launch — MUST use full-screen notification intent
- Token renewal during long calls (LiveKit `onTokenExpiring`)
- DB race condition on parallel billing tick + call end — use SELECT FOR UPDATE
- Per-min cron precision — use 30s tick interval, idempotent on `last_billed_minute`

---

## 🔄 Phase 4 — Live Streaming Polish + Viewer/Chat/Anti-Fraud (Day 8-9)

**Pre-task research:** Bigo viewer list = real-time WebSocket, top spender real-time, 200K+ banned words, 1-3 msg/sec rate limit, AI moderation. Server-side viewer count (no client lies).

### Phase 4A — Native Camera in Live Stream (extends Phase 1)
- [ ] Modify `src/pages/LiveStream.tsx` — use `<NativeVideoView>` for host preview (drop WebRTC `<video>`)
- [ ] Verify Phase 1 SurfaceView lifecycle works in /live route
- [ ] Add `FLAG_SECURE` to LiveStream when host is streaming (Bigo standard for premium hosts — optional flag)

### Phase 4B — Real-Time Viewer Count + List
- [ ] DB: `live_room_viewers` table with `joined_at`, `last_seen_at`, `total_gifts_in_session_diamonds`
- [ ] Realtime channel `live_room:{room_id}:viewers` — push on join/leave
- [ ] Top spender computed view (top 10 by `total_gifts_in_session_diamonds`)
- [ ] Native UI overlay on host side: viewer count badge + top spender avatars (existing React component, just wire Realtime)

### Phase 4C — Chat Rate Limit + Keyword Filter
- [ ] Edge function `chat-send` — enforce: max 3 msg/sec/user (rate limit via DB or Redis)
- [ ] Create `banned_words` table — seed with 500+ Bengali + English keywords (start small, grow weekly)
- [ ] Edge function `chat-send` — reject if message contains banned word (case-insensitive substring match)
- [ ] Auto-mute user for 5 min after 3 banned-word attempts in 10 min

### Phase 4D — Anti-Fraud Hooks (foundations for Phase 10)
- [ ] Add `viewer_join_velocity_check` — block if same device joins >5 rooms in 1 min (bot signal)
- [ ] Log all gift sends with `ip`, `device_id` for later analysis

### ✅ Success Criteria
- [ ] Viewer count updates <500ms on join/leave ✓
- [ ] Top spender list visible to host, updates real-time ✓
- [ ] Spam message (10/sec) → 4th onwards rejected ✓
- [ ] Banned word in chat → rejected, toast to sender ✓
- [ ] Test using mem://preferences/test-account.md as host + secondary device as viewer

### ⚠️ Risk
- Banned-word list false positives — start small, manual curation
- Realtime channel scaling — Supabase Realtime handles 100s of subscribers per channel; for 1000+, partition by region

---

## 🔄 Phase 5 — Hourly Streaming Bonus System (Day 10-11)

**Pre-task research:** PoPo's 11-tier explicit table = most transparent. Bigo's monthly tier salary = aspirational. We start with 6 tiers, expand later. Min 30h/15days for bonus eligibility.

### Phase 5A — Tier Definition (Business)
- [ ] Create `supabase/migrations/<ts>_host_bonus_tiers.sql`:
  - `host_bonus_tiers` table — `tier_name`, `min_hours_monthly`, `min_petals_monthly`, `base_salary_usd`, `petals_per_hour_bonus`
  - Seed 6 tiers (Bronze/Silver/Gold/Platinum/Diamond/Crown) — values per "OurApp Target" column in research summary
  - `host_monthly_progress` table — `host_id`, `month`, `total_streaming_seconds`, `total_petals_earned`, `effective_days`, `current_tier`
  - `host_bonus_payouts` table — historical record

### Phase 5B — Streaming Time Tracker
- [ ] Edge function `stream-start` / `stream-end` — record session duration
- [ ] Aggregate daily via scheduled function (UTC+6 midnight = Bangladesh time)
- [ ] "Effective day" = streamed >= 1 hour that day

### Phase 5C — Monthly Tier Calculation + Payout
- [ ] Scheduled edge function `monthly-bonus-payout` — runs 1st of each month UTC+6
- [ ] For each host: determine tier from `total_streaming_seconds` + `total_petals_earned` + `effective_days`
- [ ] Credit base salary as Petals to host wallet
- [ ] Penalty: missed targets → 50% salary cut (NOT removal in v1 — softer than Bigo)
- [ ] Record in `host_bonus_payouts` with `payout_status = pending → completed`

### Phase 5D — Host UI — Progress Dashboard
- [ ] Create `src/pages/HostDashboard.tsx` — current tier, hours streamed this month, Petals earned, days remaining, next-tier requirement
- [ ] Real-time progress bar (Realtime subscription on `host_monthly_progress`)
- [ ] **English-only UI strings** (mem://preferences/english-only-ui-strings)

### Phase 5E — PK Battle Bonus (foundation)
- [ ] DB: `pk_battles` table for future Phase (PK feature itself is Phase 6+)
- [ ] +200 Petals per PK win logged here

### ✅ Success Criteria
- [ ] Host streams 30h across 15 days → next month receives Bronze base salary in Petals wallet ✓
- [ ] Dashboard shows accurate progress ✓
- [ ] Tier upgrade automatic — no manual admin step ✓

### ⚠️ Risk
- Cron precision — test in staging DB first
- Wallet transactions atomicity — use existing wallet transfer function (Pkg425)
- Disputes — log every calculation step in `host_bonus_calculation_logs`

---

## 🔄 Phase 6 — Native Party Room (Audio/Video/Game) (Day 12-14)

**Pre-task research:** Bigo Multi-Guest = 12 seats native SurfaceView grid. Audio party = Clubhouse-style. Game room = native voice + WebView H5 game panel. Seat states: empty/reserved/occupied/muted/locked. Roles: owner > co-host > seat > audience.

### Phase 6A — Native SeatGridView
- [ ] Create `android/app/.../partyroom/SeatGridView.kt` — custom RecyclerView, 8 seats (expand to 12 via config)
- [ ] Create `android/app/.../partyroom/SeatItemView.kt` — per-seat: avatar + mic indicator + SurfaceView (video mode)
- [ ] Create `android/app/.../partyroom/MultiSeatRtcManager.kt` — bind/unbind LiveKit participant tracks per seat

### Phase 6B — Seat State (Supabase Realtime, NOT polling per mem://index core rule)
- [ ] DB: `party_room_seats` table — `room_id`, `seat_index`, `user_id`, `is_muted`, `is_locked`, `is_video_on`, `taken_at`
- [ ] Realtime channel `party_room:{id}:seats` — bidirectional state sync
- [ ] DB unique constraint `(room_id, seat_index)` to prevent double-take race
- [ ] DB function `take_seat(room_id, seat_index, user_id)` — atomic check + insert

### Phase 6C — Role Hierarchy + Permissions
- [ ] DB: `party_room_members` table — `role: owner | co_host | member | guest`
- [ ] Edge function `party-room-action` — validates role permission for take/leave/lock/mute/kick
- [ ] Owner can transfer ownership to another member

### Phase 6D — Gift to Seat vs Room (Business)
- [ ] Existing gift flow extended: `target_type: seat | room`
- [ ] Gift to specific seat: 100% to that user (minus 35% platform cut)
- [ ] Gift to room: 50% owner, 50% split equally among occupied seats
- [ ] DB function `process_room_gift(room_id, target_type, target_id, gift_id, sender_id)` atomic

### Phase 6E — Capacitor Plugin Bridge
- [ ] Create `android/app/.../partyroom/PartyRoomPlugin.kt` — methods: `joinPartyRoom`, `takeSeat`, `leaveSeat`, `muteSeat`, `lockSeat`, `kickFromSeat`, `transferOwner`
- [ ] `src/components/PartyRoomNative.tsx` — only chat overlay, gift UI, room title, action sheets, seat name labels (native renders seat grid + video)

### Phase 6F — Audio Party Mode
- [ ] Detect room.mode === 'audio' → native publishes audio only, no SurfaceView allocated
- [ ] CPU optimization: 8-seat audio room target <15% CPU

### Phase 6G — Game Party Mode (foundation)
- [ ] Add `room.mode === 'game'` flag
- [ ] Below seat grid: 40% screen bottom WebView panel for H5 game (placeholder URL for now)
- [ ] JS bridge: game ↔ seat state (mute/kick from game UI)
- [ ] **Game room cannot have real-money gambling** (App Store policy) — play points only

### Phase 6H — Room Entry Controls
- [ ] Optional password (text field, hashed in DB)
- [ ] Level requirement (default Level 3)
- [ ] Entry fee in Coins (deduct on join, refund on leave within 30s)

### ✅ Success Criteria
- [ ] 8-seat audio party: CPU <25%, clear audio ✓
- [ ] 4-seat video party: all feeds render, no blank frames ✓
- [ ] Take/leave seat <300ms (Realtime) ✓
- [ ] Lock/mute/kick visible to all <500ms ✓
- [ ] Phone rotation → seat state survives ✓
- [ ] Gift to seat: 65% Petals to that user; to room: 50% owner + 50% split ✓
- [ ] Test using mem://preferences/test-account.md on owner device + secondary as seat-taker

### ⚠️ Risk
- Multiple SurfaceViews → GPU pressure; tier video to top 4 publishers only on <4GB RAM device
- Simultaneous seat-take race — DB unique constraint catches it
- Audio echo on speakerphone — LiveKit AEC handles, verify on test device

---

## 🔄 Phase 7 — Native Gift Dispatcher (Pkg438 Phase B) (Day 15)

**Pre-task research:** Pkg438 Phase A done — NativeGiftAnimationPlugin + NativeEntryAnimationPlugin exist. Phase B = JS dispatcher shim that routes gift events to native when flag enabled. **Per mem://constraints/never-touch-gift-entry-animations — DO NOT edit existing FlyingGiftAnimation, FullScreenGiftAnimation, EntryBarAnimation, UnifiedEntryAnimation, VAPPlayer components.** Build NEW shim files only.

### Phase 7A — Dispatcher Shim (NEW files only)
- [ ] Create `src/lib/nativeAnimationDispatcher.ts` — on gift/entry event: if `nativeGiftAnimFlag.isEnabled()` → call NativeGiftAnimation, else fall through to existing path
- [ ] Create `src/hooks/useGiftAnimationBridge.ts` — Subscribe Realtime gift channel → dispatch
- [ ] Wire dispatcher in App.tsx as a passive listener (no UI change)

### Phase 7B — Asset Prefetcher
- [ ] Create `android/app/.../animation/GiftAssetPrefetcher.kt` — pre-download VAP/SVGA/Lottie to disk cache
- [ ] Modify `NativeGiftAnimationPlugin.kt` — add `prefetchAsset(url, type)` method
- [ ] Trigger prefetch on app start + on gift catalog update

### Phase 7C — Per-Device Flag QA Rollout
- [ ] Create `src/components/admin/GiftAnimationDeviceFlag.tsx` — admin UI for per-device flag toggle
- [ ] Default OFF, enable for owner test account first

### ✅ Success Criteria
- [ ] Flag OFF → existing WebView path works unchanged (ZERO regression) ✓
- [ ] Flag ON → native VAP plays 30fps during active camera, no drop ✓
- [ ] 5 consecutive gifts queue & play ✓
- [ ] 3GB RAM device: no OOM ✓

### ⚠️ Risk
- VAP/SVGA asset format mismatch — strict spec doc
- Audio mixer (Pkg438 GiftAudioMixer) collision with LiveKit audio — verify ducking works

---

## 🔄 Phase 8 — Wallet Hardening: KYC + 48h Hold + Withdrawal (Day 16-17)

**Pre-task research:** Bigo 48h hold + bean freeze on fraud is universal. Chamet 3-tier KYC (Basic $50/day → Fully $10K/day). PoPo requires Level 5 + 1080p face for withdraw. BD market = NID + liveness.

### Phase 8A — 48h Bean Hold
- [ ] DB: extend `wallet_transactions` — `available_after timestamptz` column
- [ ] Petals from gift/call → `available_after = NOW() + 48h`
- [ ] DB view `host_withdrawable_balance` = sum where `available_after <= NOW()`
- [ ] Withdrawal request validates against `host_withdrawable_balance` not raw balance

### Phase 8B — KYC Tiers
- [ ] DB: `user_kyc` table — `tier: none | basic | semi | full`, `nid_number`, `nid_verified_at`, `liveness_verified_at`, `daily_withdraw_limit_usd`
- [ ] Edge function `kyc-submit-nid` — validates Bangladesh NID format (10 or 17 digit)
- [ ] Edge function `kyc-liveness-check` — accepts video, calls external liveness API (placeholder — integrate later)
- [ ] Tier limits: none=$0, basic=$50, semi=$500, full=$5000/day

### Phase 8C — Withdrawal Flow
- [ ] DB: `withdrawal_requests` table — `amount_petals`, `amount_usd`, `method (bkash/nagad/rocket/bank)`, `status (pending/approved/paid/rejected)`, `requested_at`, `paid_at`
- [ ] Edge function `withdrawal-request` — validates: KYC tier OK, balance available, weekly limit not exceeded
- [ ] Min withdrawal: $5 equivalent
- [ ] Schedule: weekly Thursday batch (configurable)
- [ ] Admin UI: approve/reject pending withdrawals

### Phase 8D — Fraud Freeze
- [ ] DB: `wallet_freezes` table — `user_id`, `reason`, `frozen_at`, `released_at`, `admin_notes`
- [ ] Chargeback received (manual admin trigger) → freeze related host beans
- [ ] Velocity check: same NID multiple accounts → freeze
- [ ] Frozen balance excluded from `host_withdrawable_balance`

### Phase 8E — Wallet History UI (English-only)
- [ ] Use existing Pkg425 wallet history — extend with `available_after` indicator (locked vs available)
- [ ] Show "Available in: 2h 15m" countdown for held balance

### ✅ Success Criteria
- [ ] Host receives 1000 Petals → cannot withdraw for 48h ✓
- [ ] NID submission without liveness → withdrawal capped at $50/day ✓
- [ ] Min $5 enforced; weekly batch only on Thursday ✓
- [ ] Admin freeze blocks withdrawal ✓

### ⚠️ Risk
- Real BD NID validation API integration deferred (placeholder for v1)
- Liveness check vendor TBD — Microsoft Face / AWS Rekognition / open-source MediaPipe

---

## 🔄 Phase 9 — Agency / Family System (Day 18-19)

**Pre-task research:** PoPo's model (commission from platform's cut, NOT host's) = host-friendly. Chamet (commission from host's share) = toxic. We copy PoPo. 6-tier 5-25%.

### Phase 9A — Agency DB Schema
- [ ] DB: `agencies` table — `name`, `owner_user_id`, `security_deposit_usd`, `tier`, `created_at`
- [ ] `agency_hosts` table — `agency_id`, `host_user_id`, `joined_at`, `left_at`
- [ ] `agency_commission_tiers` table — `tier_name`, `min_30day_revenue_usd`, `commission_percent`
- [ ] Seed 6 tiers (5%/8%/12%/16%/20%/25%) at $500/$2K/$10K/$50K/$150K/$500K thresholds

### Phase 9B — Monthly Commission Payout
- [ ] Scheduled edge function `agency-commission-payout` — runs 1st each month
- [ ] Calculate 30-day rolling team revenue → determine tier
- [ ] Commission paid FROM platform's 35% cut, NOT from host's 65% — copy PoPo
- [ ] Credit agency owner's Petals wallet

### Phase 9C — Family System (lighter, no commission)
- [ ] DB: `families` table — owner + members, social grouping only
- [ ] Weekly leaderboard view — top families by total gifts received (member-level aggregate)
- [ ] Family badge displayed in chat / viewer list

### Phase 9D — Admin UI
- [ ] `src/pages/admin/AgencyManagement.tsx` — approve agencies, view tier, manual override

### ✅ Success Criteria
- [ ] 5 hosts → agency tier 1 = 5% commission ✓
- [ ] Commission deducted from platform's cut, host earnings unchanged ✓
- [ ] Family leaderboard updates weekly ✓

---

## 🔄 Phase 10 — Anti-Fraud (Face Detect, FLAG_SECURE, Velocity, Keyword) (Day 20-21)

**Pre-task research:** Bigo runs face detection ~1fps via ML; no face 90s → warning, 3min → end call. FLAG_SECURE blocks screenshots. Gift velocity = 10 large gifts/day from single user to single host. New-account cooling = no large gifts <7 days.

### Phase 10A — Face Detection in Private Call
- [ ] Add Google ML Kit Face Detection dependency (`com.google.mlkit:face-detection`)
- [ ] In PrivateCallActivity: sample LiveKit local video track at 1fps, run face detection on bitmap
- [ ] Track `consecutive_no_face_seconds`
- [ ] No face 90s → native warning toast + log to DB
- [ ] No face 180s → auto-end call, mark `final_status = face_violation`
- [ ] Host gets full credit for billed minutes, no extra penalty
- [ ] User can complain → admin review

### Phase 10B — FLAG_SECURE on Sensitive Activities
- [ ] PrivateCallActivity: `window.setFlags(FLAG_SECURE, FLAG_SECURE)`
- [ ] Optionally LiveStream when host enables "private mode"
- [ ] Wallet/withdrawal screens: FLAG_SECURE

### Phase 10C — Gift Velocity Limits
- [ ] Edge function `gift-send` — count today's large gifts (>= $5 equivalent) from sender to receiver
- [ ] Reject if >10 in 24h
- [ ] Reject if sender account <7 days old AND gift > $10 equivalent

### Phase 10D — Keyword Filter Expansion
- [ ] Expand `banned_words` from Phase 4C to 5000+ Bengali + English words
- [ ] Categories: profanity, sexual, hate speech, solicitation, competitor names
- [ ] Admin UI to add/remove words

### Phase 10E — Device/IP Velocity
- [ ] Track `device_id` per session in DB
- [ ] If single device_id linked to >5 accounts → flag all for review
- [ ] If single IP creates >3 accounts/day → cooldown

### ✅ Success Criteria
- [ ] Cover camera 90s during call → warning toast ✓
- [ ] Cover camera 3min → call ends, billing correct ✓
- [ ] Screenshot during private call → black image only ✓
- [ ] 11th large gift from same user same day → rejected ✓

### ⚠️ Risk
- Face detection battery cost — sample 1fps not 30fps
- False positives on dark skin / bad lighting — adjust ML Kit thresholds, allow user dispute

---

## 🔄 Phase 11 — Production Polish (Adaptive Bitrate, Beauty, Crash) (Day 22-23)

**Pre-task research:** Bigo/Chamet adaptive bitrate per device tier — HIGH=1080p30 2Mbps, MED=720p30 1.2Mbps, LOW=480p24 600kbps, MIN=360p15 300kbps. ProGuard rules critical for release crashes.

### Phase 11A — Device Tier Detection
- [ ] Create `android/app/.../media/DeviceCapabilityDetector.kt` — RAM + CPU benchmark → tier
- [ ] LiveKit `VideoCaptureOptions` per tier
- [ ] Adaptive on poor network: downgrade automatically

### Phase 11B — Beauty Filter
- [ ] Evaluate FaceUnity Lite (free <1M MAU) vs GPUImage custom shader
- [ ] Integrate as LiveKit video preprocessor
- [ ] Create `src/components/BeautyFilterSheet.tsx` — smoothness/whitening/ruddy sliders

### Phase 11C — Network Quality Monitor
- [ ] LiveKit `ConnectionQuality` callback → JS event
- [ ] `src/components/NetworkQualityIndicator.tsx` — signal bars overlay

### Phase 11D — Crash Hardening
- [ ] `android/app/proguard-rules.pro` — keep rules for LiveKit, VAP, native plugins
- [ ] Firebase Crashlytics — verify integration, baseline crash rate
- [ ] R8 release build smoke test

### Phase 11E — Capacitor Config
- [ ] `capacitor.config.ts`: `backgroundColor: '#000000'`, disable `webContentsDebuggingEnabled` in production

### ✅ Success Criteria
- [ ] 720p30 on Redmi Note 11 (3GB) — CPU <30%, 29-30fps ✓
- [ ] Network drop → indicator <500ms → auto-downgrade ✓
- [ ] Cold start deeplink → live room <2.5s ✓
- [ ] Crash rate <0.1% Crashlytics ✓
- [ ] APK size increase <25MB total ✓

---

## 📋 Per-Task Workflow (MUST follow every single time)

1. **Open `.lovable/plan.md`** — find the phase + sub-phase
2. **Read pre-task research note** at top of the phase
3. **Read referenced memory files** (e.g., mem://preferences/test-account.md, mem://preferences/english-only-ui-strings, mem://constraints/never-touch-gift-entry-animations)
4. **Non-trivial work?** → spawn Google research subagent OR `websearch--web_search` first (mem://preferences/google-research-before-fix)
5. **Implement** — touch ONLY files listed in the sub-phase
6. **Test** — verify success criteria using mem://preferences/test-account.md account in preview / real device
7. **Mark `[x]`** on completed checkbox in this file
8. **Update `mem://index.md`** if architecture/rule changed (e.g., new core decision)
9. **Save phase completion note** to `mem://features/<phase-name>` if substantial
10. **Report to user**: what's done + which checkbox ticked + what's next

---

## 🚧 Explicitly Out-of-Scope (NOT in this plan)
- Pure native (Jetpack Compose) full UI rewrite — too big, Bigo-level polish takes years
- Migration from LiveKit to Agora/ZEGO — costly, self-hosted LiveKit works
- iOS native parity — Android first; iOS via Capacitor WebView until Android proven (~6 months later)
- VPS / docker / livekit-server config changes — DEFERRED (mem://preferences/vps-deferred)
- Real money gambling / casino games (App Store ban)
- Server-side recording of private calls (privacy/liability — industry never does)

---

## 🎯 North Star

12 phases শেষে আমাদের app হবে:
- **Tech-side:** Chamet-class (80-90% native), Bigo-class architecture পেতে আরো 3-6 মাস
- **Business-side:** PoPo-tier transparency + Chamet-tier agency + Bigo-tier fraud protection
- **BD market:** No competitor matches NID+bKash+Bengali keyword combo

10K+ existing users protect, agency onboarding শুরু → next 12 মাসে 100K users target।

**Honest:** Bigo SSS-tier ($23K/month hosts) এক বছরে impossible। কিন্তু Chamet/StreamKar-tier 4-6 মাসে absolutely achievable এই plan follow করলে।
