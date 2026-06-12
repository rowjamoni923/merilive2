# Live Streaming Smoothness Fix Plan (2026-06-12)

Research-first protocol: competitor pattern (Chamet/Bigo/Olamet using Agora) → LiveKit translation completed via subagent. Android references checked: Agora live quickstart uses `setupLocalVideo` + `startPreview` before `joinChannel` (preview stays owned by same RTC engine); LiveKit Android exposes `LocalParticipant.publishVideoTrack(track, options)` for an existing `LocalVideoTrack`; LiveKit JS `RoomOptions` exposes `disconnectOnPageLeave`; LiveKit JS `LocalVideoTrack.restartTrack({ facingMode })` supports in-place camera restart. Sources checked 2026-06-12: Agora Android Interactive Live Streaming Quickstart, LiveKit Android `publishVideoTrack` reference, LiveKit JS `RoomOptions` reference.

## Gap inventory (Live Streaming only — Private Call & Party next)

| # | Gap | Risk | Effort | Status |
|---|---|---|---|---|
| GAP-5 | `disconnectOnPageLeave` defaults `true` — SFU drops host on tab-blur / notification shade | 🔴 Critical | 1 line | ✅ DONE batch-1 |
| GAP-7 | GoLive `useLiveKit` always `false`, dead `livekitSwitchCamera` branch | 🟡 Low | delete 6 lines | ✅ DONE batch-1 |
| GAP-2 | `hostTransitionPreviewStream` cleanup stops still-publishing track when beauty processor swaps `mediaStreamTrack` identity | 🔴 High | ~5 lines | ✅ DONE batch-1 |
| GAP-4 | `forceEndStream` wrote `is_active=false` without DataPacket / canonical close RPC | 🟠 Medium | lifecycle hook | ✅ DONE batch-2 |
| GAP-1 | Camera-switch nullified/ended preview before next camera live → Go Live could publish null/stopped track | 🟠 Medium | atomic swap | ✅ DONE batch-2 |
| GAP-3 | Host auto-rejoin called `room.disconnect(true)` and stopped reusable local tracks | 🔴 High | preserve live tracks | ✅ DONE batch-3 |
| GAP-6 | Web `switchCamera` relied on `deviceId` only; Android duplicate/blank IDs could no-op | 🟡 Low-med | `restartTrack(facingMode)` | ✅ DONE batch-3 |
| GAP-8 | `forceEndStreamSync` existed but was not attached, leaving ghost stream until stale cleanup | 🟡 Low | beforeunload keepalive RPC only | ✅ DONE batch-3 |
| ANDROID-GAP-A | GoLive unmount cleanup removed `native-media-active` during preview→live navigation, making WebView opaque over the still-running native TextureView | 🔴 Critical | 1 cleanup guard | ✅ DONE Android batch |
| ANDROID-GAP-B | Promoted preview renderer stayed in `previewRenderer`; `attachLocal()` then released/recreated local renderer, causing blank TextureView during Android handoff | 🔴 Critical | renderer adoption | ✅ DONE Android batch |
| ANDROID-GAP-C | JS native live connect omitted `isHost`, so native host grace/classification could fall back to generic call behavior | 🟠 Medium | 1 option | ✅ DONE Android batch |
| NATIVE-KOTLIN-GAP-A | Standalone Android Kotlin app used CameraX preview + LiveKit camera without an arbiter | 🔴 Critical | CameraOwnership util + release before live | ✅ DONE Android batch |
| NATIVE-KOTLIN-GAP-B | Native LiveKit connect/switch camera ran on caller thread with no OEM release grace | 🔴 Critical | IO dispatcher + 1200ms grace | ✅ DONE Android batch |
| NATIVE-KOTLIN-GAP-C | Native renderer was add-only; pause/resume/reconnect could double-bind EGL renderer or lose SurfaceTexture | 🔴 Critical | remove-before-add + lifecycle restore | ✅ DONE Android batch |
| NATIVE-KOTLIN-GAP-D | Live foreground service returned `START_NOT_STICKY`, no recovery after Android process pressure | 🟠 Medium | sticky service | ✅ DONE Android batch |

## Batch-3 applied code notes
1. Web/native stream end: explicit End button already publishes `stream_ended` before `close_live_stream_now`; lifecycle forced close now also uses `publishStreamEnded` + `close_live_stream_now`, not direct table update.
2. Web GoLive preview switch is atomic: old preview remains visible until a new live video track is ready; mic track is preserved.
3. Web in-room switch uses LiveKit `LocalVideoTrack.restartTrack({ facingMode })`, with deviceId fallback only for older tracks.
4. Host web Room replacement preserves still-live local preview tracks when reconnecting instead of calling `disconnect(true)` blindly.
5. Native Android connect has a public in-flight guard to reject duplicate connect attempts instead of racing two Room/camera sessions.
6. Native LiveKit stream-ended registry is registered immediately after native connect succeeds, before React effect timing can race the End button.
7. Viewer preloaded Rooms now set `disconnectOnPageLeave: false` to prevent handoff/pagehide black screen.
8. Web ghost close is gated to `beforeunload` only; no pagehide/visibility auto-kill, preserving professional mobile background behavior.

## Remaining verification honesty
- Code-side Live Streaming gap list above is complete for the known blank-camera causes.
- Runtime verification still requires APK rebuild + owner account device test; without that, only code-complete can be claimed, not 100% field-verified.

## Next flows (after Live verified by owner test account)
- Private Call (`useLiveKitCall`, `CallProvider`) — accept-race + camera black on caller side
- Party Room (audio / video / game) — fragmented camera ownership + 3 controllers
