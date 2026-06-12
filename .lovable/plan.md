# Live Streaming Smoothness Fix Plan (2026-06-12)

Research-first protocol: competitor pattern (Chamet/Bigo/Olamet using Agora) → LiveKit translation completed via subagent. Android references checked: Agora live quickstart uses `setupLocalVideo` + `startPreview` before `joinChannel` (preview stays owned by same RTC engine); LiveKit Android exposes `LocalParticipant.createVideoTrack` and `publishVideoTrack` for an existing `LocalVideoTrack`; LiveKit Android issue history includes camera flip/background freeze risks, so renderer/camera ownership must not be recreated casually.

## Gap inventory (Live Streaming only — Private Call & Party next)

| # | Gap | Risk | Effort | Status |
|---|---|---|---|---|
| GAP-5 | `disconnectOnPageLeave` defaults `true` — SFU drops host on tab-blur / notification shade | 🔴 Critical | 1 line | ✅ DONE batch-1 |
| GAP-7 | GoLive `useLiveKit` always `false`, dead `livekitSwitchCamera` branch | 🟡 Low | delete 6 lines | ✅ DONE batch-1 |
| GAP-2 | `hostTransitionPreviewStream` cleanup stops still-publishing track when beauty processor swaps `mediaStreamTrack` identity | 🔴 High | ~5 lines | ✅ DONE batch-1 |
| GAP-4 | `forceEndStream` writes `is_active=false` without DataPacket broadcast — admin/viewer "auto off-on bounce" | 🟠 Medium | ~5 lines + 1 prop | ⏳ batch-2 |
| GAP-1 | Camera-switch nullifies `streamRef` for ~100-600ms gap → if Go Live pressed in window, `setPreparedHostPreviewStream(null)` | 🟠 Medium | ~10 lines (atomic swap) | ⏳ batch-2 |
| GAP-3 | Host auto-rejoin calls `room.disconnect(true)` → stops local hardware tracks → 1s black flash + camera re-open every reconnect | 🔴 High | ~15 lines + preload plumbing | ⏳ batch-3 (surgical) |
| GAP-6 | `switchCamera` uses `deviceId` only — silent no-op on Android with duplicate IDs | 🟡 Low-med | ~10 lines | ⏳ batch-3 |
| GAP-8 | `forceEndStreamSync` defined but never attached (intentional, Pkg426) — accept 3-min ghost-stream window or add gated `pagehide` | 🟡 Low | doc-only or 5 lines | deferred |
| ANDROID-GAP-A | GoLive unmount cleanup removed `native-media-active` during preview→live navigation, making WebView opaque over the still-running native TextureView | 🔴 Critical | 1 cleanup guard | ✅ DONE Android batch |
| ANDROID-GAP-B | Promoted preview renderer stayed in `previewRenderer`; `attachLocal()` then released/recreated local renderer, causing blank TextureView during Android handoff | 🔴 Critical | renderer adoption | ✅ DONE Android batch |
| ANDROID-GAP-C | JS native live connect omitted `isHost`, so native host grace/classification could fall back to generic call behavior | 🟠 Medium | 1 option | ✅ DONE Android batch |

## Open audit questions
1. `stopLocalTracksOnUnpublish` Room option — currently default `true`, compounds GAP-3
2. Supabase realtime `is_active=false` vs DataPacket propagation delta on slow connections
3. Android Java `LiveKitPlugin` source (binary plugin) — race window in `startLocalPreview`/`stopLocalPreview` interlock can't be fully audited from JS side
4. Viewer preloaded-Room path also lacks `disconnectOnPageLeave: false` — propagate fix to `liveStreamPreloader`

## Next flows (after Live verified by owner test account)
- Private Call (`useLiveKitCall`, `CallProvider`) — accept-race + camera black on caller side
- Party Room (audio / video / game) — fragmented camera ownership + 3 controllers
