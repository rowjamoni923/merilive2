# 🎯 MeriLive Professional Migration Plan
**Version:** 1.0 | **Created:** 2026-06-07 | **Status:** Active

> **AGENT RULE:** এই file টা প্রতিবার live/call/party-related কাজ শুরু করার আগে পড়তে হবে। কাজ complete হলে relevant checkbox-এ `[x]` mark দিতে হবে এবং memory update করতে হবে। কখনো plan skip করে কাজ শুরু করা যাবে না।

---

## 📊 Executive Summary

Research করে দেখা গেছে — Bigo, Chamet, PoPo, CrushLive, CoMeet, StreamKar, HiClub সব **professional live apps ~85-95% native Android (Kotlin + C++) + ~5-15% WebView for non-media UI only**। কেউই camera-কে WebView-এর ভেতরে চালায় না। আমাদের current architecture (Capacitor + React + WebView + LiveKit-in-WebView) **মৌলিকভাবে ভুল** — এই কারণেই blank camera, re-entry issue, Android 16 permission loop হচ্ছে।

**Target architecture:**
- **Native Kotlin layer** (NEW): Camera capture, RTC engine, SurfaceView rendering, gift animation, seat management, private call Activity
- **React/WebView layer** (existing): Navigation, profile, store, chat text, leaderboards, seat name overlays, action sheets

**RTC SDK decision:** LiveKit self-hosted (wss://livekit.merilive.xyz) **রাখা হবে** — Agora/ZEGO-তে migrate করা হবে না (cost + already deployed)। LiveKit Android Native SDK (`io.livekit:livekit-android`) ব্যবহার করে native plugin বানানো হবে — যেভাবে Bigo Agora native ব্যবহার করে সেভাবে।

---

## 🏆 Industry Comparison (Honest Gap Analysis)

| Dimension | Pro apps (Bigo/Chamet/ZEGO) | আমাদের current | Gap |
|-----------|---------|---------|-----|
| Camera owner | Native C++ engine | WebRTC-in-WebView | 🔴 CRITICAL |
| Blank on re-entry | 0ms (surface rebind only) | 1-3s or permanent | 🔴 CRITICAL |
| RTC lifecycle | Application singleton | JS heap | 🔴 CRITICAL |
| Video render | SurfaceView/TextureView | `<video>` DOM | 🔴 HIGH |
| Encoding latency | 20-80ms | 80-200ms+ | 🟠 HIGH |
| Gift animation | VAP on GLSurfaceView | CSS/Lottie in DOM | 🟡 MED |
| Android 12+ bg camera | Explicit handling | Silent death | 🔴 CRITICAL |
| Android 16 permission | Single permission ctx | Dual ctx → loop | 🔴 CRITICAL |
| Battery (1hr) | 15-22% | 28-40% | 🟠 HIGH |
| Cold start to room | <2s | 4-8s | 🟠 HIGH |

---

## 🛠️ Phased Migration Plan (6 phases × ~1-2 days each)

> **Philosophy:** পুরো app rewrite করা হবে না। শুধু **camera + mic + RTC + render** native-এ migrate হবে। UI shell, navigation, store, profile, chat — সব React/WebView-এ থাকবে।

---

### ✅ Phase 0 — Foundation Already Done (Reference)
- [x] Capacitor + Android setup
- [x] LiveKit self-hosted on VPS (wss://livekit.merilive.xyz)
- [x] Supabase backend (auth/DB/edge functions)
- [x] Existing LiveKitPlugin.kt (partial native) — needs major upgrade
- [x] NativeGiftAnimationPlugin + NativeEntryAnimationPlugin (Pkg438 Phase A)
- [x] 7-fix camera hotfix applied (CameraManager.AvailabilityCallback, OEM grace, soft reconnect)

---

### 🔄 Phase 1 — Native LiveKit RTC Foundation (Day 1-2)
**Goal:** LiveKit Android Native SDK দিয়ে full native RTC engine। Camera ownership 100% Kotlin-এ। JS-এর কাজ শুধু command pass করা।

#### Files to Create / Modify
- [ ] `android/app/build.gradle` — Add `io.livekit:livekit-android:2.x.x` (full native SDK, not just our partial)
- [ ] `android/app/src/main/java/com/merilive/app/rtc/RtcEngineManager.kt` (NEW) — Application-scope singleton holding `Room` object; survives Activity lifecycle
- [ ] `android/app/src/main/java/com/merilive/app/rtc/CameraOwnership.kt` (NEW) — Single source of truth: who owns Camera2 (NATIVE_RTC | WEBVIEW_PHOTO | NONE)
- [ ] `android/app/src/main/java/com/merilive/app/rtc/SurfaceLifecycleManager.kt` (NEW) — Surface attach/detach without engine restart (the KEY blank-camera fix)
- [ ] `android/app/src/main/java/com/merilive/app/plugin/LiveKitPlugin.kt` (MAJOR REFACTOR) — Thin Capacitor bridge; delegate all camera/RTC to RtcEngineManager
- [ ] `android/app/src/main/java/com/merilive/app/MainActivity.kt` — Init RtcEngineManager in Application class, NOT Activity
- [ ] `android/app/src/main/java/com/merilive/app/MeriLiveApplication.kt` (NEW) — Application subclass for engine init
- [ ] `android/app/src/main/AndroidManifest.xml` — Register Application, add FOREGROUND_SERVICE_CAMERA / FOREGROUND_SERVICE_MICROPHONE (Android 14+)
- [ ] `src/plugins/NativeLiveKit.ts` — Extend interface: `nativeJoinRoom`, `nativeLeaveRoom`, `attachLocalSurface(viewId)`, `attachRemoteSurface(uid, viewId)`, `enableLocalVideo(bool)`
- [ ] `src/components/NativeVideoView.tsx` (NEW) — React wrapper that allocates a viewId and lets Kotlin position a SurfaceView at its bounds

#### Success Criteria
- [ ] Host joins live room — camera renders in native SurfaceView (NOT `<video>` element)
- [ ] Navigate to /profile → return to /live → camera shows in **<500ms** (no re-init)
- [ ] CPU < 20% on Pixel 4a-class device at 720p

#### Risk
- LiveKit Android SDK lifecycle differs from JS SDK — needs careful study of `Room.disconnect()` vs `Room.release()`
- SurfaceView Z-order with transparent WebView above — must set `setZOrderMediaOverlay(false)` and make WebView background transparent

---

### 🔄 Phase 2 — Camera Lifecycle Hardening (Day 3-4)
**Goal:** Blank camera on re-entry **100% eliminated**। Android 12+ background restriction, Android 16 permission loop — সব handle।

#### Files to Create / Modify
- [ ] `android/app/.../rtc/AppLifecycleObserver.kt` (NEW) — `ProcessLifecycleOwner` based; NOT Activity-level. App background → `enableLocalVideo(false)`, foreground → `enableLocalVideo(true)` + rebind surface
- [ ] `android/app/.../rtc/PermissionHelper.kt` (NEW) — Centralized camera/mic permission; explicitly DROP WebView permission on /live, /call, /party routes
- [ ] `android/app/.../plugin/LiveKitPlugin.kt` — Add `onUserLeaveHint()` override → mute video stream, keep CameraDevice alive
- [ ] `android/app/src/main/java/com/merilive/app/WebViewPermissionGate.kt` (NEW) — Block WebView's `getUserMedia` when native owns camera (the Chamet fix)
- [ ] Modify `MainActivity.kt` — `onWindowFocusChanged` → coordinate with RtcEngineManager
- [ ] `src/hooks/useRtcLifecycle.ts` (NEW) — Listen to `onCameraPaused`/`onCameraResumed` events
- [ ] `src/components/CameraPausedOverlay.tsx` (NEW) — Show "paused" UI when backgrounded

#### Success Criteria
- [ ] Lock screen 2min → unlock → camera resumes <500ms ✓
- [ ] App switch (recents) → return → no blank screen ✓
- [ ] Android 16 device: `adb logcat | grep CameraManager` shows NO permission loop ✓
- [ ] Chamet-class black screen DOES NOT reproduce on user's test devices ✓

#### Risk
- `ProcessLifecycleOwner` requires `androidx.lifecycle:lifecycle-process` — check Capacitor compat
- `muteLocalVideoStream` still sends black frames — server-side "camera paused" state needed (Phase 2.5 ext)

---

### 🔄 Phase 3 — Native Private 1-1 Call Activity (Day 5-6)
**Goal:** Private call পুরোপুরি native Activity-তে (NOT WebView screen)। FCM-driven full-screen incoming call। আজকের সমস্যা: re-enter করলে camera blank — সম্পূর্ণ fix।

#### Files to Create / Modify
- [ ] `android/app/.../privatecall/PrivateCallActivity.kt` (NEW) — Full-screen native, NOT a React route
- [ ] `android/app/src/main/res/layout/activity_private_call.xml` (NEW) — SurfaceView local (PIP) + SurfaceView remote (full)
- [ ] `android/app/.../privatecall/CallStateMachine.kt` (NEW) — IDLE→RINGING→ACCEPTED→ACTIVE→ENDED
- [ ] `android/app/.../privatecall/CallForegroundService.kt` (NEW) — Android 14+ FOREGROUND_SERVICE_MICROPHONE+CAMERA for active calls
- [ ] `android/app/.../privatecall/PrivateCallPlugin.kt` (NEW) — `@PluginMethod startOutgoingCall`, `acceptIncomingCall`, `endCall`
- [ ] Modify `MeriLivePushService.kt` (existing FCM) — On `type=private_call_invite`, launch PrivateCallActivity via full-screen intent
- [ ] `src/lib/privateCall.ts` — Replace existing WebView-based call screen with `PrivateCallPlugin.startOutgoingCall(targetUserId)` → native takes over
- [ ] Keep `src/pages/PrivateCall.tsx` only as fallback / pre-call contact picker

#### Success Criteria
- [ ] Incoming call full-screen shows when app backgrounded (Android 10+ full-screen intent) ✓
- [ ] Camera appears <300ms on accept ✓
- [ ] Lock/unlock during call → camera stays alive ✓
- [ ] App killed by system → call survives via foreground service ✓
- [ ] **Re-enter private call after exit → camera works first time** (the bug user reported) ✓

#### Risk
- Android 10+ background activity launch restriction → MUST use full-screen notification intent
- Foreground service permissions require runtime check on Android 14+
- LiveKit token renewal during long calls — implement `onTokenExpiring` callback

---

### 🔄 Phase 4 — Native Party Room (Audio / Video / Game) (Day 7-8)
**Goal:** Party room-এর seat grid native RecyclerView। প্রতি seat-এর video native SurfaceView। Game panel-ই শুধু WebView।

#### Files to Create / Modify
- [ ] `android/app/.../partyroom/SeatGridView.kt` (NEW) — Custom RecyclerView, 8-12 seats
- [ ] `android/app/.../partyroom/SeatItemView.kt` (NEW) — Per-seat: avatar + mic indicator + SurfaceView (if video)
- [ ] `android/app/.../partyroom/MultiSeatRtcManager.kt` (NEW) — Manages map<seatIndex, SurfaceView>; bind/unbind LiveKit participant tracks per seat
- [ ] `android/app/.../partyroom/SeatStateManager.kt` (NEW) — Sync via Supabase Realtime (we already use it for seats)
- [ ] `android/app/.../partyroom/PartyRoomPlugin.kt` (NEW) — `joinPartyRoom`, `takeSeat`, `leaveSeat`, `muteSeat`, `lockSeat`, `kickFromSeat`
- [ ] `src/components/PartyRoomNative.tsx` (NEW) — Renders ONLY: chat overlay, gift send UI, room title, action sheets, seat name labels. Seat grid = native.
- [ ] Modify `src/pages/PartyRoom.tsx` — Branch: native mode (Android) vs web mode (web fallback)
- [ ] Game room: keep H5 game in WebView panel (40% height bottom), audio above stays native

#### Success Criteria
- [ ] 8-seat audio room — CPU <25%, clear audio ✓
- [ ] 4-seat video party — all feeds render, no blank frames ✓
- [ ] Seat take/leave <300ms via Supabase Realtime ✓
- [ ] Phone rotation → seat state survives ✓
- [ ] New joiner sees correct seat state immediately ✓

#### Risk
- Multiple SurfaceViews can cause GPU pressure on low-end devices — implement seat tier (only top N publish video)
- Realtime race condition on simultaneous seat take — implement DB-level unique constraint + optimistic UI

---

### 🔄 Phase 5 — Native Gift / Entry Animation Bridge (Day 9-10)
**Goal:** Pkg438 Phase A তে already foundation আছে। Phase B-তে JS dispatcher add করতে হবে — gift/entry events native plugin-এ dispatch হবে, WebView DOM bypass।

> ⚠️ NEVER edit existing FlyingGiftAnimation/FullScreenGiftAnimation/EntryBarAnimation/UnifiedEntryAnimation/VAPPlayer components — see mem://constraints/never-touch-gift-entry-animations। শুধু NEW dispatcher shim তৈরি করব।

#### Files to Create / Modify
- [ ] `src/lib/nativeAnimationDispatcher.ts` (NEW shim) — On gift/entry event, if `nativeGiftAnimFlag.isEnabled()` → call NativeGiftAnimation, else fall through to existing WebView player
- [ ] `src/hooks/useGiftAnimationBridge.ts` (NEW) — Subscribe to Supabase Realtime gift channel → dispatch to native or web
- [ ] `android/app/.../animation/GiftAssetPrefetcher.kt` (NEW) — Pre-download VAP/SVGA/Lottie files to disk cache
- [ ] Modify `android/app/.../animation/NativeGiftAnimationPlugin.kt` — Add `prefetchAsset(url, type)` method
- [ ] `src/components/admin/GiftAnimationDeviceFlag.tsx` (NEW admin UI) — Per-device flag toggle for QA rollout

#### Success Criteria
- [ ] Gift animation plays at 30fps native, NO drop during active camera ✓
- [ ] 5 consecutive gifts queue and play ✓
- [ ] On 3GB RAM device: no OOM ✓
- [ ] Per-device flag OFF → existing WebView path works (zero regression) ✓

#### Risk
- VAP/SVGA file format mismatch — strict asset spec needed
- GL context sharing — VAP runs in its own EGL context (handled by lib)

---

### 🔄 Phase 6 — Production Polish, Beauty, Network Adaptation (Day 11-12)
**Goal:** Bigo/Chamet-class polish। Beauty filter, adaptive bitrate, device tier detection, error recovery, crash hardening।

#### Files to Create / Modify
- [ ] `android/app/.../media/DeviceCapabilityDetector.kt` (NEW) — RAM/CPU based tier → HIGH (1080p30 2Mbps) / MED (720p30 1.2Mbps) / LOW (480p24 600kbps) / MIN (360p15 300kbps)
- [ ] `android/app/.../media/AdaptiveBitrateConfig.kt` (NEW) — LiveKit video preset per tier
- [ ] `android/app/.../media/BeautyFilterManager.kt` (NEW) — LiveKit doesn't have built-in beauty → integrate FaceUnity Lite (free tier) OR keep simple GPUImage shader
- [ ] `android/app/.../media/NetworkQualityMonitor.kt` (NEW) — LiveKit `ConnectionQuality` callback → notify JS
- [ ] `android/app/proguard-rules.pro` — Add LiveKit + VAP + native plugin keep rules
- [ ] `src/components/NetworkQualityIndicator.tsx` (NEW) — Signal bar overlay
- [ ] `src/components/BeautyFilterSheet.tsx` (NEW) — Beauty slider UI (smoothness/whitening/ruddy)
- [ ] `capacitor.config.ts` — Set `backgroundColor: '#000000'`, disable webContentsDebugging in production

#### Success Criteria
- [ ] 720p30 stream on Redmi Note 11 (3GB) — CPU <30%, stable 29-30fps ✓
- [ ] Network drop → indicator shows <500ms → auto-downgrade quality ✓
- [ ] Cold start deeplink → active room: <2.5s ✓
- [ ] Crashlytics crash rate <0.1% ✓
- [ ] APK size increase <25MB total ✓

#### Risk
- Beauty filter SDK licensing — FaceUnity Lite is free up to 1M MAU
- ProGuard rules critical — missing rules = release-only crashes

---

## 🚧 Out-of-Scope (NOT in this plan)
- Pure native (Kotlin Compose) UI rewrite — too big, not needed
- Migration away from LiveKit to Agora/ZEGO — costly, current self-hosted LiveKit works
- iOS native parity — Android first; iOS via Capacitor WebView until Android proven
- VPS / docker / livekit-server config changes — DEFERRED per mem://preferences/vps-deferred

---

## 📋 Per-Task Workflow (MUST follow every time)

1. **Read this plan first** — find which phase + task
2. **Read referenced memory files** (e.g., `mem://constraints/never-touch-gift-entry-animations`, `mem://preferences/english-only-ui-strings`, `mem://preferences/test-account.md`)
3. **Implement** — edit only files listed in the phase
4. **Test** — verify success criteria using `mem://preferences/test-account.md` credentials in preview if applicable
5. **Mark `[x]`** on completed checkbox in this file
6. **Update `mem://index.md`** if architecture/rule changed
7. **Report to user** with what's done + what's next

---

## 🎯 Final North Star

User Bigo/Chamet-class quality চায় → এই 6 phases শেষ হলে **80-90% সেই quality** পাওয়া যাবে। 100% পেতে full native rewrite লাগবে (3-6 months) — কিন্তু সেটা business value-এ worth না। এই plan অনুযায়ী 12 working days-এ professional-grade live + call + party deliverable।
