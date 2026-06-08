# Plan: Native PrivateCallActivity — Chamet-grade rewrite

**Locked: 2026-06-08** · Audience: 99% Android users + Android hosts · Goal: 100% professional, on par with Chamet/Bigo/Olamet/Poppo.

Research source: subagent report `sub_70q7kvzm` (Stream Video SDK, LiveKit docs, Android 14/15 platform docs, Exodus Bigo analysis, LiveKit issue #545/PR #900).

---

## Why a native in-call Activity

Today the in-call surface is a React component (`src/components/call/ActiveCallScreen.tsx`) running inside Capacitor WebView. Pro apps render the in-call screen as a pure native Activity hosting a `VideoTextureView` directly. WebView path causes:

- Extra JS thread between media frame and render → micro-jank
- Higher memory (WebView + LiveKit JS + DOM) → OOM risk on low-RAM hosts
- No real `FLAG_SECURE` over the video surface (WebView leaks frames to MediaProjection in older Android)
- No proximity sensor, no audio-routing restore, no proper PIP

Native rewrite fixes all of the above and unlocks the LiveKit `VideoProcessor` chain for our existing beauty filter.

---

## What already exists (DO NOT rewrite)

| Component | File | Status |
|---|---|---|
| Ring-screen Activity | `android/.../activity/IncomingCallActivity.java` | Production |
| Capacitor bridge | `android/.../plugin/NativeCallPlugin.kt` | Production |
| Foreground service + CallStyle notif | `android/.../service/CallForegroundService.java` | Production |
| Self-managed Telecom (BT/audio routing) | `android/.../telecom/{TelecomBridge,MeriConnectionService}.kt` | Production |
| LiveKit engine | `android/.../plugin/LiveKitPlugin.kt` (4724 lines) | Production |
| Beauty pipeline | `android/.../plugin/{GPUPixelBeautyPlugin,BeautyPipelineBridge}.kt` | Production |
| Per-minute server billing (Step 1-3) | `supabase/functions/call-billing-tick/` + RPCs | Shipped today |
| Low-balance banner (web fallback) | `src/components/call/LowBalanceBanner.tsx` | Shipped today |

---

## Scope — six phases

Order is chosen so each phase ships a usable improvement, and APK rebuild only happens once per phase (not per fix).

### Phase A · Foundation (Kotlin scaffold)
1. `PrivateCallActivity.kt` — `ComponentActivity`, `singleTask`, `showWhenLocked`, `turnScreenOn`, `excludeFromRecents`, `FLAG_SECURE` set before `setContentView`, `KEEP_SCREEN_ON` window flag.
2. `PrivateCallViewModel.kt` — holds `Room`, `LocalParticipant`, `RemoteParticipant`, billing `StateFlow`. Cleared in `onCleared()` with `room.disconnect()`.
3. `activity_private_call.xml` — full-screen `VideoTextureView` for remote, PiP `VideoTextureView` for local (top-right, draggable), top overlay (host name + balance + duration), bottom action bar (mute / camera-flip / beauty / gift / end), low-balance banner slot.
4. AndroidManifest entry with `android:foregroundServiceType="camera|microphone|phoneCall"`, `android:configChanges="orientation|screenSize|keyboardHidden"`.

### Phase B · LiveKit integration
1. Token fetch reused from existing `LiveKitPlugin` token endpoint (`livekit-token-issue` edge fn).
2. `Room` connected with `adaptiveStream=false`, `dynacast=false`, `autoSubscribe=true` (1:1 settings per LiveKit best-practice).
3. `RoomEvent.ParticipantDisconnected` observer — if remote identity matches host, start 5s grace timer, then auto-end.
4. **Wifi-reconnect patch** for LiveKit Android #545 — register `ConnectivityManager.NetworkCallback`, on `onAvailable` + `room.state == DISCONNECTED` call `room.connect()` manually.
5. `withTimeout(15_000)` wrap on `room.connect()`; on timeout show "Connection failed" + auto-finish.

### Phase C · Camera/mic/beauty
1. Local preview rendered via `room.localParticipant.getTrackPublication(Track.Source.CAMERA)?.track`.
2. Beauty filter wired through LiveKit `ChainVideoProcessor` — chain into existing `GPUPixelBeautyPlugin` so frames flow Camera → processor → encode (no second camera open).
3. Camera-flip = `localParticipant.setCameraPosition(BACK/FRONT)` — no track republish.
4. Mic mute = `setMicrophoneEnabled(false)` — no re-negotiation.
5. Camera-hijack recovery — listen for `LocalVideoTrack` errors, overlay "Camera unavailable", retry after 3s.

### Phase D · Billing + low-balance UX (server-authoritative)
1. Realtime channel `private_calls:{callId}` subscribed in `PrivateCallViewModel`.
2. Display balance from server tick (never local). UI shows: balance coin count + per-minute rate + duration.
3. Three warning tiers (research-locked): **60s yellow toast → 30s orange banner → 10s red countdown dialog with Recharge CTA**.
4. On `ended_reason == INSUFFICIENT_BALANCE` → show recharge-first end-screen.
5. **Atomic accept CAS** — Supabase RPC `accept_private_call(call_id)` does `UPDATE private_calls SET accepted_by=$uid WHERE id=$cid AND accepted_by IS NULL RETURNING *`; loser silently declines.

### Phase E · Audio + system integration
1. `AudioManager.MODE_IN_COMMUNICATION` set before `room.connect()`, restored to `MODE_NORMAL` in `onDestroy()`.
2. Proximity sensor + `PROXIMITY_SCREEN_OFF_WAKE_LOCK` — only when camera is back-facing OR audio-only call.
3. PiP-on-background — when user presses Home, enter PIP mode (16:9, remote feed only).
4. Bluetooth headset routing relies on existing `TelecomBridge` (already self-managed).
5. End-of-call screen Activity (`PrivateCallEndActivity.kt`) — duration, coins spent, gifts sent, 5-star rating, "Send gift", "Follow", recharge CTA if low-balance ended the call.

### Phase F · Anti-fraud + observability
1. `FLAG_SECURE` already set in Phase A; add Android 14 `setScreenshotDetectionCallback` for analytics logging only.
2. Android 15 `REQUIRE_SECURE_ENV` flag where API ≥ 35.
3. `face/identity check` — server already runs face verification on first call of session; client just trusts the gate.
4. In-call chat overlay — regex-strip phone/email/social handle before render (server already does too; client = defense-in-depth).
5. Memory leak guard — Room only ever held by ViewModel, never static; LeakCanary debug-build verification.
6. Crash reporting — wrap `room.connect()` and `setupVideo()` in try/catch reporting to `system_error_logs` table.

---

## What stays web

- Outgoing-call initiation flow (host list, send call request) — already fine.
- Wallet recharge — already a full-screen Capacitor screen.
- Settings, history, etc.

The native takeover is ONLY the active in-call surface (after both sides accept, until `ended`).

---

## Retirement of `ActiveCallScreen.tsx`

Keep the React component as a **web-only fallback** for older APKs that don't have `PrivateCallActivity`. Native Capacitor bridge gets a new method `NativeCall.openInCallActivity({callId, role, token})`. JS path:

```ts
if (await NativeCall.hasInCallActivity()) {
  await NativeCall.openInCallActivity({...});
} else {
  navigate('/call/active', { state: {...} });  // existing web path
}
```

Older APKs return `hasInCallActivity = false` → web fallback. No breakage.

---

## Owner-account testability matrix

| Phase | Lovable test possible? | APK rebuild required? |
|---|---|---|
| A — Kotlin scaffold | ❌ | ✅ once |
| B — LiveKit integration | ❌ | ✅ same APK |
| C — Beauty/camera | ❌ | ✅ same APK |
| D — Billing/low-balance | ⚠️ Web fallback path testable in preview | ✅ for native UI |
| E — Audio/PIP/end-screen | ❌ | ✅ same APK |
| F — Anti-fraud + leak verify | ❌ device-required | ✅ same APK |

**Strategy:** Ship Phase A–F as **one APK bump** (e.g., Pkg500 PrivateCallActivity). Every phase = code commit + plan tick; you rebuild APK ONCE at the end, not six times.

---

## Order of execution

Starting with **Phase A** (scaffold). Each phase = its own message + file batch. No premature claims of "tested" — I'll say "ready for APK rebuild" honestly.

---

## Open questions before code

1. Audio-only calls — supported now? (manifest `microphone` only, skip camera)
2. PIP mode — required Phase 1 or defer to a Phase G polish?
3. Beauty filter level — load user's last setting from `profiles.beauty_level`, or default to "natural"?

(Answer if you want, otherwise I'll assume: 1=yes, 2=Phase E, 3=load saved.)
