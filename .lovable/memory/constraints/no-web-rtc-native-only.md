---
name: NO WebRTC — Android Native SDK ONLY (live/party/call media)
description: ABSOLUTE HARDEST RULE. Live stream, party room, private call media path MUST use native LiveKit Android SDK. WebView/JS WebRTC FORBIDDEN in production path. Locked 2026-06-08 by owner.
type: constraint
---

# 🚨🚨🚨 ABSOLUTE HARDEST RULE — NO WEBRTC ANYWHERE 🚨🚨🚨

**Locked by owner 2026-06-08. Survives every session. NEVER weaken, NEVER skip, NEVER "just this once".**

## The rule

For **live stream**, **party room**, and **private call** — the media path (camera, microphone, encode, decode, transport) **MUST** use the **native LiveKit Android SDK** (`io.livekit:livekit-android`) via a Capacitor Kotlin plugin.

**FORBIDDEN in production code path:**
- ❌ `import { Room } from 'livekit-client'` for media
- ❌ `new Room()` in JS for camera/mic publish or subscribe
- ❌ `room.localParticipant.setMicrophoneEnabled()` from JS path on Android
- ❌ `room.localParticipant.setCameraEnabled()` from JS path on Android
- ❌ Any `livekit-client` JS SDK call that opens a real Camera2/AudioRecord session
- ❌ Browser `navigator.mediaDevices.getUserMedia()` for live-stream/party/call media
- ❌ WebRTC `RTCPeerConnection` in JS for these flows
- ❌ Adding "just a quick WebRTC patch" because "Lovable preview needs it"
- ❌ Calling any JS hook for media without going through `shouldUseNativeLiveKit()` gate
- ❌ Patching legacy JS media hooks for new features — they are **frozen** (audit-only / fallback only)
- ❌ **Using the word "WebRTC" in any new file name, identifier, hook name, variable, or comment.** Use "NativeLiveKit" / "LiveKit (Android native)" instead. Locked 2026-06-08 by owner after full rename sweep — see "Naming rule" below.

**MANDATORY for production code path on Android:**
- ✅ All live/party/call media goes through `LiveKitNativePlugin.kt` (Kotlin)
- ✅ JS layer only does control plane: connect token, mute toggle, seat changes, UI events
- ✅ Camera2 + MediaCodec hardware encoder via `io.livekit.android.room.track.CameraCapturer`
- ✅ AudioRecord + platform AEC via `io.livekit.android.room.track.LocalAudioTrack`
- ✅ `FOREGROUND_SERVICE_CAMERA` + `FOREGROUND_SERVICE_MICROPHONE` for background survival
- ✅ Remote video rendered with native `TextureViewRenderer` overlay (NOT `<video>` tag)

## Why (evidence locked 2026-06-08)

**ZERO top-50 live-streaming apps use WebView WebRTC.** Verified via APK teardowns:

| App | Engine | Evidence |
|---|---|---|
| Bigo Live | Native C++ (libwebrtc fork) | Engineering blog, 400M MAU |
| Chamet | Native ZEGOCLOUD (`im.zego.zegoexpress`, `libZegoExpressEngine.so`) | Fork.ai tech scan |
| Tango | Native in-house | Google Cloud case study |
| Olamet, Hollah, HiiClub, WeJoy, MICO, Poppo | Native Agora (`io.agora.rtc2`, `libagora-rtc-sdk.so`) | AppBrain APK 173MB+ |
| Likee | Native (Bigo shared stack) | 1B installs |
| TikTok Live | Native ByteRTC | — |
| Zoom, Google Meet mobile | Native C++ | — |

**100ms engineering verdict (verbatim):** *"WebView WebRTC is suitable for demos and internal tooling; it is not suitable for production mobile video products."*

## Why WebView WebRTC physically cannot be professional

1. **No Camera2 direct access** → soft encoder (libvpx) → 40-60% CPU vs native 15-25%
2. **No `FOREGROUND_SERVICE_CAMERA`/`_MICROPHONE`** → Android 12+ kills media on screen-lock / background → **this is the actual root cause of the persistent "video icon stays on" / camera-not-releasing bug**
3. **No platform AEC tuning** → echo + noise on mid-range Android
4. **Thermal throttle 30% earlier** because V8 JIT + DOM compete with codec for same cores
5. **`AudioManager.MODE_IN_COMMUNICATION` unreachable** from WebView → call audio quality bad
6. **Confirmed bugs:** react-native-webview #3804 (mic stops on lock), Devhide Android 12+ teardown

## LiveKit Android SDK (`io.livekit:livekit-android`) is production-ready

- v2.24.1, Kotlin 98.6%, actively maintained
- Same `libwebrtc` engine Agora/ZEGO use, bound natively to Camera2/MediaCodec/AudioRecord
- Feature parity with `livekit-client` JS SDK
- Compatible with our self-hosted SFU `wss://livekit.merilive.xyz` (zero VPS work needed)
- Classes: `Room`, `LocalParticipant`, `RemoteParticipant`, `CameraCapturer`, `LocalVideoTrack`, `LocalAudioTrack`, `TextureViewRenderer`, `RoomEvent` Flow

## Exception (the ONLY one)

`livekit-client` JS may remain ONLY as a **Lovable browser preview fallback** behind `shouldUseNativeLiveKit()` gate. On real Android APK the gate forces native path. The JS path is **frozen** — no new features, no fixes except security. When native port for a flow is complete, the JS path for that flow is **deleted**.

## How to apply

Before EVERY task touching live/party/call/media:
1. Ask: "Does this change touch camera, mic, encode, decode, transport, or a media hook?"
2. If yes → native LiveKit plugin path ONLY. No JS WebRTC. No exceptions.
3. If I think "small patch in JS hook is OK" → I MUST stop and ask the user first.
4. APK rebuild required after every native plugin change → say so honestly, do not claim verified.

## Override

Only the owner can override, with exact phrase: **"skip native rule this time for X"**. Even then, the override is single-task scoped and the JS code added MUST be marked `// TEMPORARY — native port pending` with a TODO comment.

## If I violate this rule

Trust is destroyed. Owner has stated explicitly that WebRTC patches "নষ্ট হয়ে যাবে" the whole professional build. This rule is non-negotiable.
