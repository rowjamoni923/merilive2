---
name: Android 1-on-1 video call research (2026-06-09)
description: Verified industry patterns + LiveKit Android SDK 2.x APIs for FCM/FSI, audio routing, FGS, Camera2, proximity, channels, resilience. Used to confirm Phase 4 Private Call Android is professional-grade. Reference for Phase 5/6.
type: reference
---

# Android Call Stack Research — 2026-06-09

Source: subagent `sub_vsecgaxx` (capable model). All claims cited inline below.

## Verified APIs we already use (Phase 4 ✅)

| Concern | Industry pattern | Our impl | File |
|---|---|---|---|
| FCM avatar load | Post placeholder first, async re-notify same id | `AVATAR_LOADER` ExecutorService | `MeriFirebaseMessagingService.java:35-247` |
| FSI Android 14+ | `canUseFullScreenIntent()` guard | Done | same file:308-322 |
| Audio routing API 31+ | `setCommunicationDevice` not `setSpeakerphoneOn` | Done | `CallAudioRouter.kt:137-162` |
| BT handover mid-call | `registerAudioDeviceCallback` | Done | same:91-121 |
| Call FGS | `phoneCall` type, `START_NOT_STICKY`, `STOP_FOREGROUND_REMOVE` | Done | `CallForegroundService.java:46-129` |
| Resilience budget | 15s reconnect → end gracefully | Done | JS side `useLiveKitCall.ts` + native via `PrivateCallViewModel` |

## LiveKit 2.x APIs to use in Phase 5 (Live streaming)

- `RoomOptions(adaptiveStream=true, dynacast=true, reconnectPolicy=…)`
- `room.state: StateFlow<ConnectionState>` — collect for RECONNECTING budget
- `AudioSwitchHandler` (cast from `room.audioHandler`) — preferredDeviceList + selectDevice
- `localVideoTrack.stopCapture()` on `onPause`, `startCapture()` on `onResume` (Camera2 release pattern)
- Custom `ReconnectPolicy.getNextRetryDelay()` returning `null` = abort

Docs: docs.livekit.io/reference/client-sdk-android/livekit-android-sdk/

## Camera2 + GPUPixel pooling pattern (Phase 5)

`ArrayBlockingQueue<ByteArray>(4)` allocated in `onCreate`, `acquireLatestImage` → fill from pool → `image.close()` immediately → push processed buffer to GL thread → return to pool. Avoids per-frame allocation GC pressure.

## Notification channels (already correct)

- `IMPORTANCE_HIGH` incoming, `IMPORTANCE_LOW` ongoing
- `setAllowBubbles(false)`, `setShowBadge(false)`

## Agora → LiveKit translation (for future research subagents)

| Agora | LiveKit |
|---|---|
| `setEnableSpeakerphone(true)` | `AudioSwitchHandler.selectDevice(Speakerphone())` |
| `enableLocalVideo(false)` | `localVideoTrack.enabled = false` |
| `onConnectionStateChanged(RECONNECTING)` | `room.state.collect { if (it == ConnectionState.RECONNECTING) … }` |
| `AgoraConnectionService` | App-owned `Service` + `FOREGROUND_SERVICE_TYPE_PHONE_CALL` |

Full report archived in chat history (agent_id sub_vsecgaxx, 2026-06-09).
