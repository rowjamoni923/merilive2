# এক Camera, এক Pipeline

ভাই তোমার কথা ১০০% ঠিক। হ্যাঁ — একসাথে দশটা plugin camera দখলের জন্য মারামারি করলে preview সাদা আসবেই, freeze হবেই, এবং চাপ বেশি হলে app crash পর্যন্ত করতে পারে। এটা stupid architecture। এখন একদম গোড়া থেকে ঠিক করব।

## লক্ষ্য

**ONE camera, ONE pipeline, FOUR surfaces:**

```text
                  ┌──────────────────────────┐
                  │   ProCameraEngine (1টা)  │
                  │  - CameraX capture       │
                  │  - Beauty/BG processor   │
                  │  - LiveKit publisher     │
                  └────────────┬─────────────┘
                               │ same track
       ┌───────────────┬───────┴──────┬────────────────┐
       ▼               ▼              ▼                ▼
   Live Stream    Private Call   Video Party       Game Party

   FaceVerification → আলাদা minimal CameraX session (কখনো overlap না)
```

কেউ কাউকে কখনো camera dispute করবে না, কারণ চারটা surface একই track থেকে frame পাবে।

## যা delete হবে (duplicate camera owners)

1. `src/sdk/NativeCameraSDK.ts` + `src/sdk/useCameraSDK.ts` — duplicate camera SDK, এখন unused করব
2. `src/plugins/NativeCamera.ts` কে শুধু FaceVerification-এ scope করব
3. `src/hooks/useNativeFaceCamera.ts` + `useNativeAndroidFaceCamera.ts` — একটাতে merge
4. `useBeautyState` থেকে যেকোনো independent camera open call সরাব
5. `livekitReliableMedia` / `livekitMediaDeviceHandlers` — LiveKit-এর ভেতরে centralize

## যা তৈরি হবে

### Frontend
- `src/camera/ProCameraEngine.ts` — single source of truth
  - `acquire(owner: 'live'|'call'|'video-party'|'game-party')`
  - `release(owner)`
  - `getTrack()` → একই LocalVideoTrack চারটা feature-ই পাবে
  - reference-counted: শেষ owner release করলে track stop
- `src/camera/useProCamera.ts` — React hook wrapper
- চারটা page (GoLive, ActiveCallScreen, video party, game party) শুধু `useProCamera(owner)` call করবে

### Android Native
- `CameraOwnership.kt` কে strict arbiter বানাব: একসাথে শুধু ONE owner — `LIVEKIT` অথবা `FACE_VERIFY`, কখনো দুটো না
- `NativeCameraPlugin` কে শুধু `FACE_VERIFY` mode-এ allow করব
- `LiveKitPlugin` সব live/call/party-র জন্য একই capture session reuse করবে (প্রতিবার নতুন Camera2 device open হবে না)
- `GPUPixelBeautyPlugin` কখনো নিজে camera খুলবে না — শুধু LiveKit-এর frame-এ filter চালাবে

## Pro-grade quality (একটাই, কিন্তু ভালো)

- Resolution: 720p@30 default, device-capable হলে 1080p@30
- Adaptive bitrate via LiveKit simulcast (already tuned in `livekitCameraTuning.ts`)
- Beauty + virtual background single GPU pipeline-এ
- Auto-focus/exposure/WB lock during streaming
- Front camera mirror, back camera no-mirror (consistent)

## Verification

Native rebuild করার পর এই sequence test করব:
1. Live start → stop → Private call start → end → Video party join → leave → Game party join → leave
2. কখনো সাদা screen আসা যাবে না
3. Camera ownership log একসাথে শুধু একটা owner দেখাবে
4. FaceVerification live-এর পরে চালালে cleanly হাত বদল হবে

## File touch list (approx)

- new: `src/camera/ProCameraEngine.ts`, `src/camera/useProCamera.ts`
- edit: `GoLive.tsx`, `ActiveCallScreen.tsx`, video party page, game party page, `useLiveKitClient.ts`, `useLiveKitCall.ts`, `useBeautyState.ts`
- edit (native): `CameraOwnership.kt`, `NativeCameraPlugin.java`, `LiveKitPlugin.kt`, `GPUPixelBeautyPlugin.kt`
- delete/scope: `src/sdk/NativeCameraSDK.ts`, `src/sdk/useCameraSDK.ts`, duplicate face-camera hooks

বড় কাজ — কিন্তু এর পর আর কোনদিন "white screen / camera fight" হবে না। তুমি approve করলে শুরু করি।
