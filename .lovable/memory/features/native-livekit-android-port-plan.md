---
name: Native LiveKit Android port — Live + Party + Private Call
description: 8-phase migration plan replacing WebView livekit-client JS with native io.livekit:livekit-android Kotlin plugin (Bigo/Chamet-grade architecture). Locked 2026-06-08.
type: feature
---

# Native LiveKit Android Port — Master Plan

**Goal:** replace WebView `livekit-client` JS path with native `io.livekit:livekit-android` Kotlin SDK for live stream, party room, and private call. Match Bigo/Chamet/Tango production architecture. Web design SACRED — UI stays in React WebView, only media plane goes native.

## Architecture

```
JS (UI / control plane)          Kotlin (media plane)
─────────────────────            ────────────────────
LiveKitNative.ts          ←→     LiveKitNativePlugin.kt
  .connect({url,token,role,flow})    → Room.connect()
  .setMicEnabled(bool)               → localParticipant.setMicrophoneEnabled()
  .setCameraEnabled(bool)            → localParticipant.setCameraEnabled()
  .switchCamera()                    → CameraCapturer.switchCamera()
  .publishVideo(opts)                → CameraCapturer + MediaCodec H.264/AV1
  .attachRemoteView({sid,frame})     → TextureViewRenderer overlay
  .detachRemoteView({sid})           → renderer.release()
  .sendData(payload,topic)           → room.localParticipant.publishData()
  .disconnect()                      → Room.disconnect()

  on('participantConnected') ←       plugin.notifyListeners()
  on('participantDisconnected') ←
  on('trackSubscribed') ←
  on('trackUnsubscribed') ←
  on('activeSpeakersChanged') ←
  on('connectionQuality') ←
  on('dataReceived') ←               (gifts/chat/reactions fanout)
  on('disconnected') ←
  on('reconnecting'/'reconnected') ←
```

## Phase order (locked)

| # | Phase | Scope | APK rebuild |
|---|---|---|---|
| **N1** | Plugin foundation | `LiveKitNativePlugin.kt` + `LiveKitNative.ts` shim: connect, disconnect, setMicEnabled, setCameraEnabled, switchCamera, basic events. Foreground service stub. Gate `shouldUseNativeLiveKit()` already exists. | ✅ |
| **N2** | Video rendering | Native `TextureViewRenderer` overlay anchored under WebView via `Bridge.getWebView().addView()`. JS `attachRemoteView({sid, frame: {x,y,w,h}})`. Mirror local preview. DPI-aware. | ✅ |
| **N3** | Live Stream port | `useLiveStreamWebRTC` → native plugin. Host publish (camera+mic+simulcast 180p/540p/source). Viewer subscribe. Selective subscription via native. JS hook **frozen** behind native gate. | ✅ |
| **N4** | Party Room port | `usePartyRoomWebRTC` → native plugin. Multi-seat publish/subscribe. Active speaker, mute persistence, seat invitations. Re-applies III.a–III.f on native path. | ✅ |
| **N5** | Private Call port | `usePrivateCallWebRTC` (or equivalent) → native plugin. 1-on-1 video/audio. Ring → accept → connect handshake via FCM data message (existing path). Camera switch, mute, end. | ✅ |
| **N6** | DataPacket bridging | All `livekitGiftSignaling`, `livekitChatSignaling`, `livekitReactions`, `livekitPartySignaling`, `livekitActiveSpeaker`, `livekitMetadata`, `livekitRoomMetadata` → native `room.localParticipant.publishData()` + `dataReceived` event bridge. Topic-based dispatch in JS. | ✅ |
| **N7** | Foreground service hardening | `FOREGROUND_SERVICE_CAMERA` + `FOREGROUND_SERVICE_MICROPHONE` types. Background grace logic (60s for live/party host) moved from current `LiveKitPlugin.kt` JS-control to fully native. Audio focus integration. Phone call interruption. Bluetooth/wired headset routing via `AudioSwitchHandler`. | ✅ |
| **N8** | Kill-switch + JS cleanup | Per-device gate. Phased rollout 10% → 50% → 100%. Once stable: DELETE `usePartyRoomWebRTC`, `useLiveStreamWebRTC`, `usePrivateCallWebRTC` JS WebRTC bodies. Keep only `livekit-client` import as Lovable browser preview fallback. | ✅ |

## Hard rules during port

- **Design SACRED** — only media plane changes. No UI/copy/animation edits.
- **JS WebRTC hooks FROZEN** — no new features, no fixes except security. Existing III.a–III.f features re-implemented on native path in N3–N4.
- **Every phase = APK rebuild** — honestly state, never claim "verified" without owner-account APK test.
- **Web fallback gated** — `shouldUseNativeLiveKit()` returns true on Android APK, false in Lovable browser preview. Old APKs (pre-N1) keep JS path until they update.
- **DataPacket parity** — gifts/chat/reactions must work IDENTICALLY on native path before flipping any flow.
- **No camera conflict** — native LiveKit camera path coordinates with existing `ProCamera` arbiter + face-verify + Camera2 handoff.

## Verified Kotlin classes (LiveKit Android SDK v2.24.1)

| Class | Package | Use |
|---|---|---|
| `LiveKit` | `io.livekit.android` | `LiveKit.create(context)` entry point |
| `Room` | `io.livekit.android.room` | `connect(url, token)`, `disconnect()`, `events` Flow |
| `LocalParticipant` | `io.livekit.android.room.participant` | mic/cam toggle, publish track, publishData |
| `RemoteParticipant` | `io.livekit.android.room.participant` | identity, tracks |
| `CameraCapturer` | `io.livekit.android.room.track` | Camera2 capture, switchCamera |
| `LocalVideoTrack` | `io.livekit.android.room.track` | publish video |
| `LocalAudioTrack` | `io.livekit.android.room.track` | publish audio with platform AEC |
| `TextureViewRenderer` | `io.livekit.android.renderer` | remote video render surface |
| `RoomEvent` | `io.livekit.android.events` | sealed events: ParticipantConnected, TrackSubscribed, ActiveSpeakersChanged, DataReceived, etc. |
| `AudioSwitchHandler` | `io.livekit.android.audio` | bluetooth/wired headset routing |

## Gradle dependency

```kotlin
implementation("io.livekit:livekit-android:2.24.1")
```

## AndroidManifest additions

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_CAMERA" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
```

## Re-applying III.a–III.f on native path (in N4)

| Phase | Re-port to native |
|---|---|
| III.a — schema/race fixes | DB-only, no port needed |
| III.b — host controls + mute persistence | JS control plane only, no port needed |
| III.c — host 60s background grace | MOVE from current LiveKitPlugin.kt JS-control → native foreground service in N7 |
| III.d — seat invitations | DB + JS UI only, no port needed |
| III.e — per-seat gift target | JS UI only, no port needed (DataPacket goes via N6) |
| III.f — audio profile (music/speech) | Re-implement in native plugin: switch `AudioPresets` Kotlin equivalent + channelCount in `LocalAudioTrack` config |

## Reference

Owner-locked rule: `mem://constraints/no-web-rtc-native-only.md`
Research basis: subagent report 2026-06-08 — Bigo/Chamet/Tango/Agora/ZEGO native SDK evidence + 100ms verdict.
