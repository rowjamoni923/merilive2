# Private Call Android – Gap Audit Report
**Date:** 2025-06  
**Scope:** PrivateCallActivity, PrivateCallViewModel, PrivateCallBeautySheet, PrivateCallEndActivity, IncomingCallActivity, CallAudioRouter, NativeCallPlugin, LiveKitPlugin (private-call methods), MeriFirebaseMessagingService, MeriConnectionService, TelecomBridge, CallActionReceiver, AndroidManifest.xml  
**Standards:** Chamet / Bigo / Olamet professional call grade; Android 14/15 BAL / FSI / FGS policy

---

## Legend
| Symbol | Meaning |
|--------|---------|
| BUG | Confirmed defect; wrong runtime behaviour |
| RACE | Concurrency hazard |
| MISSING | Required feature/guard absent |
| WEAK | Deprecated API or fragile coupling |
| ⚠️ APK | Fix requires APK rebuild |

---

## Area 1 – FCM Data-Only Payload & Wake-from-Doze

### F-1 **BUG** — `MeriFirebaseMessagingService.java:172` — Synchronous bitmap network fetch on FCM dispatch thread ⚠️ APK
`handleIncomingCall` calls `loadBitmapFromUrl(callerAvatar)` (up to 5 s + 5 s timeouts) **synchronously** on the FCM `onMessageReceived` thread. FCM's background processing window is 20 s; a slow CDN exhausts it before the notification posts, causing the incoming-call notification to never appear on slow networks.  
**Repro:** Trigger a call push while the device has cellular signal of ≤ -105 dBm; observe notification never fires.  
**Severity: P0**

### F-2 **MISSING** — `MeriFirebaseMessagingService.java` — No FCM high-priority (`priority: high`) enforcement guard ⚠️ APK
The code does not verify `remoteMessage.getPriority() == RemoteMessage.PRIORITY_HIGH` before treating a message as a call push. If the FCM payload is mis-sent at normal priority (e.g., a backend bug), Android will **not** wake the device from Doze, and no call UI appears. A guard + log allows detecting backend mis-sends.  
**Repro:** Send an `incoming_call` data push with `priority: normal`; on Doze device, no ringtone.  
**Severity: P2**

---

## Area 2 – Background Activity Launch (BAL) / Full-Screen-Intent

### B-1 **BUG** — `MeriFirebaseMessagingService.java:241` — Direct `startActivity` from background violates Android 10 BAL restrictions ⚠️ APK
```java
try { startActivity(fullScreenIntent); } catch (Exception ignored) {}
```
On API 29+ (Android 10+), launching an Activity from a background context without a foreground-service exemption is silently blocked. The FCM service is **not** a foreground service. The correct mechanism is the `setFullScreenIntent` PendingIntent already attached to the notification — that path already works. The explicit `startActivity` call is dead code on modern Android and should be removed; swallowing the exception means failures are invisible.  
**Repro:** On Android 10+ device in screen-off state, receive a call push; IncomingCallActivity never appears via this path. FSI path still fires via notification.  
**Severity: P1**

### B-2 **MISSING** — `AndroidManifest.xml` — `USE_FULL_SCREEN_INTENT` runtime grant not checked on Android 14 ⚠️ APK
Android 14 (API 34) restricted `USE_FULL_SCREEN_INTENT` to apps in the ROLE_DIALER or ROLE_EMERGENCY allowlist, or apps that explicitly hold the grant. No code path verifies `NotificationManager.canUseFullScreenIntent()` before posting the FSI notification. On non-exempt apps the FSI is silently downgraded to a heads-up, which may be missed on locked screens.  
**Repro:** Install on a stock Pixel running Android 14 without granting FSI permission; incoming call on locked screen shows no full-screen UI.  
**Severity: P1**

---

## Area 3 – ConnectionService / Telecom Integration

### C-1 **BUG** — `MeriConnectionService.kt:103` — `onCreateIncomingConnectionFailed` dispatches `"decline"` ⚠️ APK
When Telecom rejects the incoming connection (another call in progress, no registered PhoneAccount, OEM policy), the code dispatches `NativeCallPlugin.dispatch(..., "decline")` which triggers the JS `declineCall` path — paying the server API cost and recording a user-initiated rejection. The correct signal is a distinct `"busy"` or `"failed"` action.  
**Repro:** Place a PSTN call, then receive a MeriLive call push; Telecom rejects it; JS records a user-declined call incorrectly.  
**Severity: P1**

### C-2 **RACE** — `TelecomBridge.kt:37,61` — `registered` flag is not guarded against concurrent `ensurePhoneAccount` calls ⚠️ APK
`@Volatile` prevents stale reads but does not prevent two threads both seeing `registered == false` simultaneously and calling `tm.registerPhoneAccount()` twice. The double-registration is harmless in Telecom but the `registered = true` write after each call creates a tiny window where the second call proceeds unnecessarily.  
**Repro:** FCM push arrives during app cold-start while JS also calls `registerPhoneAccount`; race window ~1 ms.  
**Severity: P2**

### C-3 **MISSING** — `MeriConnectionService.kt:107-128` — Outgoing connection stub never reaches `setActive` ⚠️ APK
`onCreateOutgoingConnection` sets the connection to `setDialing()` and adds it to the `active` map, but no code path ever calls `setActive()`. The Telecom connection stays in `STATE_DIALING` indefinitely; system call log shows the call as never connected; BT End button fires `onDisconnect` against a dialing connection (unexpected state).  
**Repro:** Caller side places an outgoing call; connection stays DIALING in Telecom's state machine until process death.  
**Severity: P1**

---

## Area 4 – Foreground Service

### S-1 **BUG** — `CallForegroundService.java:115` — `START_STICKY` restarts service with `null` intent after OS kill ⚠️ APK
`onStartCommand` returns `START_STICKY`. When the OS kills the service (memory pressure, battery optimiser), Android restarts it with `intent == null`. All extras (callerName, callId, mode) become null/empty, and the service re-posts a generic "Call in progress" ongoing notification for a **dead call** that can never be dismissed by normal call flow.  
**Repro:** Start a call; force-stop via `adb shell kill <pid>`; notification reappears with no way to dismiss it.  
**Severity: P1**

### S-2 **MISSING** — `CallForegroundService.java` — `ACTION_STOP` path calls deprecated `stopForeground(true)` ⚠️ APK
`stopForeground(true)` is deprecated since API 33. Should use `stopForeground(STOP_FOREGROUND_REMOVE)` with version guard. Minor on older APIs but triggers lint error on API 33+ targets.  
**Severity: P2**

---

## Area 5 – Background Activity Launch — PrivateCallActivity

### PA-1 **BUG** — `NativeCallPlugin.kt:475` — `context.startActivity(intent)` from Capacitor plugin context may fail on Android 10+ ⚠️ APK
`openInCallActivity` calls `context.startActivity(intent)` where `context` is the Capacitor plugin context (not an Activity). On Android 10+, starting an Activity from a non-Activity, non-foreground-service context is BAL-restricted. `CallForegroundService` must be running before calling this; otherwise the launch silently fails. No check is present.  
**Repro:** JS calls `openInCallActivity` when `CallForegroundService` is not running; PrivateCallActivity never appears.  
**Severity: P1**

---

## Area 6 – Lifecycle & Resource Cleanup

### L-1 **BUG** — `PrivateCallActivity.kt:191-213` — `attachResilienceController` function body missing closing `}` (compile error) ⚠️ APK
The `try { … } catch { }` block closes at line 211, but the enclosing `private fun attachResilienceController()` function is never closed before `private fun registerCloseReceiver()` begins at line 214. This is a Kotlin syntax error that will prevent compilation of the `activity` module in its current form.  
**Repro:** `./gradlew :app:compileDebugKotlin` → compilation failure.  
**Severity: P0**

### L-2 **MISSING** — `PrivateCallActivity.kt:687-695` — User hangup (`onUserRequestedEnd`) never notifies JS; LiveKit Room stays connected ⚠️ APK
```kotlin
vm.markEnding("user_hangup")
vm.markEnded()  // → ENDED → launchEndScreenAndFinish()
```
No `NativeCallPlugin.dispatch(...)` call fires. JS never receives a hangup signal, so:
- `LiveKitPlugin.disconnect()` is never called → Room remains publishing on the SFU.
- `settle_private_call` RPC is never triggered → server never settles billing.
- Telecom connection stays ACTIVE → BT End button shows stale state.
The comment at line 692 says "Phase D will dispatch…" but Phase D was delivery-gated on billing; the hangup dispatch path was never wired.  
**Repro:** Native user taps End; call screen closes; WebRTC audio continues to flow for the peer; server never bills.  
**Severity: P0**

### L-3 **MISSING** — `PrivateCallViewModel.kt:401-414` — Room event observer (`eventsJob`) is cancelled on `onCleared` but `room` reference cleared without removing renderers ⚠️ APK
`onCleared` cancels `eventsJob` and sets `room = null` but the `PrivateCallActivity` may call `detachAllRenderers(release=true)` in `onDestroy` concurrently. `attachedRemoteTrack`/`attachedLocalTrack` are Activity fields; VM clears `room` without nulling the track refs. Window: VM clears room → GC can collect → Activity `onDestroy` calls `removeRenderer` on a GC'd track → potential NPE in native WebRTC.  
**Repro:** Rotate device at exact moment of remote disconnect (≤ 5 s grace window).  
**Severity: P2**

### L-4 **BUG** — `PrivateCallEndActivity.kt:178` — Deprecated `onBackPressed()` override ⚠️ APK
`onBackPressed()` is deprecated since API 33. `ComponentActivity` subclasses should use `onBackPressedDispatcher`. On Android 14+ with `enableOnBackInvokedCallback=true` (already set in manifest line 110), the deprecated override may not fire reliably on back gesture.  
**Repro:** On Android 14 with gesture nav, back swipe from PrivateCallEndActivity → rating broadcast never fires.  
**Severity: P1**

---

## Area 7 – IncomingCallActivity Race / Dismissed Race

### I-1 **BUG** — `IncomingCallActivity.java:54-65` — Missing `FLAG_KEEP_SCREEN_ON` on API 27+ (O_MR1+) path ⚠️ APK
The pre-API 27 path (`else` branch, line 59) adds `FLAG_KEEP_SCREEN_ON`. The API 27+ path calls `setShowWhenLocked` + `setTurnScreenOn` but **never** adds `FLAG_KEEP_SCREEN_ON`. The screen may time out and turn off during ringing (default 15–30 s display timeout) before the user can answer.  
**Repro:** On API 27+ device with screen-timeout = 15 s, receive a call push; screen turns off after 15 s while ringing.  
**Severity: P1**

### I-2 **RACE** — `IncomingCallActivity.java:281-292` — `onNewIntent` re-creates `timeoutRunnable` but leaks old Ringtone reference ⚠️ APK
`onNewIntent` calls `stopRinging()` to cancel old vibration + timer but does NOT stop `ringtone.stop()` before immediately re-starting ringing for the new call. The old ringtone object is overwritten without checking `ringtone.isPlaying()`, leaving the old stream open if `stopRinging` was called on a race path (e.g. endReceiver fires just before onNewIntent). Double ringtone audible.  
**Repro:** Two rapid calls arrive within the ring timeout window; two ringtones play simultaneously.  
**Severity: P2**

---

## Area 8 – Audio Focus & Routing

### A-1 **WEAK** — `CallAudioRouter.kt:88` — `AudioManager.isSpeakerphoneOn` setter deprecated on API 31 ⚠️ APK
`am.isSpeakerphoneOn = target` is deprecated since API 31. On API 31+ the setter is silently ignored on certain OEM builds (Samsung, Xiaomi). Should use `AudioManager.setCommunicationDevice()` with version guard.  
**Repro:** On Samsung Android 12+ device, speaker toggle button has no effect.  
**Severity: P1**

### A-2 **MISSING** — `CallAudioRouter.kt` — No `AudioDeviceCallback` for mid-call BT connect/disconnect ⚠️ APK
`isExternalAudioDeviceConnected()` is only called at `attach()` time and on explicit user speaker-toggle. If a BT headset is connected **after** the call starts, the speaker state is not updated. Users must manually toggle speaker off to route audio to the headset.  
`LiveKitPlugin` registers `registerAudioDeviceListener()` but its callbacks only update LiveKit's audio session, not `CallAudioRouter.speakerOn`. The split ownership causes divergent state between the two audio modules.  
**Repro:** Start native call with speaker on → connect BT headset mid-call → audio continues on speaker.  
**Severity: P1**

### A-3 **BUG** — `CallAudioRouter.kt:67-77` / `PrivateCallActivity.kt:398-400` — `attach()` overwrites `originalMode` to current mode, which may already be `MODE_IN_COMMUNICATION` from LiveKitPlugin ⚠️ APK
`attach()` saves `am.mode` as `originalMode`. If LiveKitPlugin already set `MODE_IN_COMMUNICATION` before PrivateCallActivity opens (which it does for private calls), `originalMode = MODE_IN_COMMUNICATION`. On `detach()`, the mode is "restored" to `MODE_IN_COMMUNICATION`, leaving it stuck in comm mode after the Activity finishes.  
**Repro:** End a private call; play a video → audio routed through earpiece instead of speaker/media path.  
**Severity: P1**

---

## Area 9 – Permission Flow

### P-1 **MISSING** — `PrivateCallActivity.kt:170-175` — No camera/microphone permission pre-check before entering PrivateCallActivity ⚠️ APK
`attachToCurrentRoom` returns `false` if no Room exists, but there is no CAMERA or RECORD_AUDIO permission check before the Activity opens or before `PrivateCallActivity.newIntent()` is called. If both permissions exist when LiveKitPlugin connects (JS-side grant) but one is revoked before the Activity launches, the Activity bails silently with a black screen and no explanation to the user.  
**Repro:** Grant camera → open call → revoke camera in Settings mid-connect → PrivateCallActivity shows blank screen, no error.  
**Severity: P2**

---

## Area 10 – Manifest / Declaration Issues

### M-1 **WEAK** — `AndroidManifest.xml:262-265` — `CallActionReceiver` intent-filter has bare unqualified action `DECLINE_CALL` ⚠️ APK
```xml
<receiver android:name=".receiver.CallActionReceiver" android:exported="false">
    <intent-filter>
        <action android:name="DECLINE_CALL" />
    </intent-filter>
</receiver>
```
The code uses `com.merilive.app.DECLINE_CALL`. The manifest action string does not match. The filter is dead and misleading. Since all PendingIntents targeting this receiver are explicit (setClass), the filter mismatch doesn't break Accept/Decline from the notification, but it will break any **implicit** broadcast targeting the bare action string. The filter should use the fully-qualified constant or be removed.  
**Severity: P2**

### M-2 **MISSING** — `AndroidManifest.xml` — `IncomingCallActivity` lacks `android:documentLaunchMode="never"` ⚠️ APK
`IncomingCallActivity` uses `launchMode="singleTop"` with `taskAffinity=""`. On Android 12+ the task affinity and singleTop combination can create a separate recents entry for certain launch paths (especially FSI on some OEMs). `android:documentLaunchMode="never"` prevents it from appearing in recents independently.  
**Severity: P2**

---

## Area 11 – Miscellaneous Gaps

### X-1 **MISSING** — `NativeCallPlugin.kt:90-110` — `dispatch` deduplication blocks "presented" re-delivery on Activity re-show ⚠️ APK
`ackedActions` deduplicates on key `"$callId:presented"`. If `IncomingCallActivity` fires "presented" and then the same call is relaunched (e.g., onNewIntent), the second "presented" is silently dropped. JS `usePrivateCall` never learns the UI re-appeared, so the timeout countdown displayed in JS may be misaligned.  
**Severity: P2**

### X-2 **BUG** — `PrivateCallBeautySheet.kt:74` — `BottomSheetDialog` shown against Activity context without `isFinishing()` guard ⚠️ APK
`BottomSheetDialog(host)` where `host` is the `PrivateCallActivity`. If the Activity is finishing (call ended) when the user taps the beauty button, showing the dialog throws `WindowManager$BadTokenException` (window already removed).  
**Repro:** Call ends at exact moment user taps beauty button → crash.  
**Severity: P2**

### X-3 **MISSING** — `PrivateCallViewModel.kt:370-378` — `startPeerGrace` runs even if call is in RECONNECTING state ⚠️ APK
When the remote peer temporarily disconnects during an ICE restart (which LiveKit raises as `ParticipantDisconnected`), the 5 s grace timer starts. If the ICE restart completes and the peer reconnects but `ParticipantConnected` arrives >5 s after the disconnect, the call is ended prematurely. LiveKit reconnect can take 3–10 s on weak networks — the grace window is too narrow for the reconnect case.  
**Severity: P2**

---

## Top 10 P0/P1 Issues to Fix First
*(All require APK rebuild)*

| Rank | ID | Severity | Summary |
|------|----|----------|---------|
| 1 | **L-1** | P0 | `attachResilienceController` missing closing `}` — module will not compile |
| 2 | **L-2** | P0 | User hangup never notifies JS — Room stays connected, billing never settles |
| 3 | **F-1** | P0 | FCM thread blocked by synchronous avatar bitmap fetch — call notification may never fire |
| 4 | **I-1** | P1 | `IncomingCallActivity` missing `FLAG_KEEP_SCREEN_ON` on API 27+ — screen dims during ring |
| 5 | **S-1** | P1 | `CallForegroundService.START_STICKY` restarts with null intent showing ghost "Call in progress" notification |
| 6 | **A-1** | P1 | `AudioManager.isSpeakerphoneOn` deprecated on API 31+; speaker toggle silently no-ops on OEMs |
| 7 | **A-3** | P1 | `CallAudioRouter.detach()` restores `originalMode = MODE_IN_COMMUNICATION` → media audio stuck in comm mode after call |
| 8 | **A-2** | P1 | No mid-call BT device callback — audio stays on speaker after headset connects |
| 9 | **C-1** | P1 | `onCreateIncomingConnectionFailed` dispatches wrong "decline" action for busy/system-rejected calls |
| 10 | **B-2** | P1 | `USE_FULL_SCREEN_INTENT` grant not verified on Android 14 — FSI silently downgraded to heads-up |

---

*Findings B-1 (dead `startActivity` from background), C-3 (outgoing connection stub), PA-1 (BAL on openInCallActivity), L-4 (deprecated onBackPressed on Android 14 gesture nav), and M-1 (mismatched DECLINE_CALL action) are also important and should be addressed in the same release cycle.*
