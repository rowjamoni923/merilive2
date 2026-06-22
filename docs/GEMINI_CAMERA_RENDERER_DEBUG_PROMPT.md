# Gemini Prompt — Camera Renderer Not Visible Across 5 Surfaces (Merilive Android APK)

> Copy the entire content below this line and paste it into Gemini (or Claude/GPT) along with `LiveKitPlugin.kt`, `MainActivity.kt`, the relevant React screen files, and a fresh `adb logcat` capture. The prompt is written so the model will not waste tokens on irrelevant areas.

---

## Role
You are a senior Android + LiveKit + Capacitor engineer auditing a production live-streaming app (Chamet/Bigo class). The app is **Capacitor 6 + React + LiveKit Android SDK 2.26.0** running on a **self-hosted LiveKit SFU** at `wss://livekit.merilive.xyz`. Do NOT suggest migrating to Agora, LiveKit Cloud, or any other SDK — they are forbidden.

## The single bug (5 surfaces, identical symptom)
The user enters any of these screens and sees a **blank white/purple screen** where their own camera preview should be:

| # | Surface | Screen route / component |
|---|---------|--------------------------|
| 1 | Go Live prejoin | `GoLive.tsx` → `startLocalPreview()` |
| 2 | Live broadcast (host) | `LiveRoom.tsx` after `connect()` |
| 3 | Private Call (caller + callee) | `PrivateCall.tsx`, uses `attachLocal()` |
| 4 | Video Party (owner + seat-takers) | `VideoParty.tsx`, uses `attachLocalSurface()` per seat |
| 5 | Game Party (with video) | `GameParty.tsx`, uses `attachLocalSurface()` per seat |

**Evidence the camera is actually working but only the renderer is missing:**
- LiveKit `connect()` resolves, `participant-connected` events fire
- A "LIVE" badge appears in the header right after Go Live
- Remote viewers can see and hear the broadcaster (camera track is published to SFU)
- `Stream ended` screen renders normally → session lifecycle is fine
- On the local device, only the area where `SurfaceViewRenderer` should sit is blank
- Audio Party (no video) screens work perfectly → only video render path is broken

## What to investigate (in this exact order — do not skip)

### Step 1 — Read these files first, fully
- `android/app/src/main/java/com/merilive/app/plugin/LiveKitPlugin.kt` (~1450 lines)
- `android/app/src/main/java/com/merilive/app/MainActivity.kt`
- `src/plugins/NativeLiveKit.ts`
- `src/services/livekitService.ts`
- `src/hooks/useNativeLiveKitLifecycle.ts`
- `src/native/seatRenderer.ts`
- `src/utils/nativeMediaSurface.ts`
- The 5 screen files listed in the table above

### Step 2 — Verify these four hypotheses, one by one
For each, give a verdict: `CONFIRMED / RULED OUT / NEEDS LOGCAT`, with the exact file:line that proves it.

**Hypothesis A — Renderer is added but WebView is opaque on top of it.**
- Check `MainActivity` and `LiveKitPlugin.attachLocal()`/`startLocalPreview()` for `webView.setBackgroundColor(Color.TRANSPARENT)` and `webView.background = null`.
- Confirm Capacitor's root view (`bridge.webView.parent`) is a `FrameLayout` or `CoordinatorLayout` that allows children at index 0.
- Confirm the SurfaceViewRenderer is `addView(renderer, 0, params)` with `setZOrderMediaOverlay(false)` so it sits BEHIND the WebView, not on top.

**Hypothesis B — Renderer added but never `init(eglBase.eglBaseContext, null)`'d, or VideoTrack `addRenderer` throws and is swallowed.**
- Look at `LiveKitPlugin.kt` line ~550 `attachLocal` and ~554 `attachLocal addRenderer failed (likely already attached)`. The catch is swallowing the real exception — make the model add `Log.e(TAG, "addRenderer", t)` with full stack and re-run.
- Confirm `EglBase` instance is the SAME one passed to `Room`/`LocalVideoTrack` capturer and to `SurfaceViewRenderer.init`. Mismatched EGL contexts = silent black/white.

**Hypothesis C — `boundedOnly` / preview-mode flag is leaking to fullscreen surfaces.**
- Search every caller of `startLocalPreview({ boundedOnly: true|false })` and `attachLocal({...})`.
- In `GoLive.tsx` and `LiveRoom.tsx` it must be `boundedOnly: false`. In Video/Game Party seats it must be `true` (so the per-seat `attachLocalSurface` runs).
- Confirm `previewRenderer` field in plugin is not being re-used across surfaces causing the second screen to skip mount.

**Hypothesis D — Per-seat bounds are off-screen / zero-sized.**
- `attachLocalSurface({ x, y, width, height })` — verify the React side computes bounds in **CSS pixels then converts to device px using `window.devicePixelRatio`**. On a 3.5x DPR phone (Pixel/Samsung high-end), forgetting this gives a 4x-too-small renderer at the wrong position → effectively invisible.
- `updateSurfaceBounds` must fire on resize / scroll / orientation change.

### Step 3 — Reproduce with logcat
Have the developer run:
```bash
adb logcat -c && adb logcat -v time \
  LiveKitPlugin:V Camera2Capturer:V EglRenderer:V \
  SurfaceViewRenderer:V Capacitor:I AndroidRuntime:E *:S
```
Then: open Go Live, wait 5s, tap Go Live, wait 10s, tap End. Save full log.

Tell the developer exactly which log lines prove which hypothesis. Look specifically for:
- `Camera2Capturer: Opening camera 1` followed by `Stream configured`
- `EglRenderer: Reporting first rendered frame.` ← **if missing, renderer was never wired to the track**
- `SurfaceViewRenderer: Layout: ...` ← width/height should be > 0
- Any silent `IllegalStateException` or `RuntimeException` in `addRenderer`

### Step 4 — Write the fix
After confirming the hypothesis, output a single unified diff (`diff -u`) that:
- Touches **only** `LiveKitPlugin.kt` and at most one TS file (`NativeLiveKit.ts` or the calling screen)
- Does **NOT** reintroduce `CameraOwnership`, `CameraAuthorityManager`, `CameraResilienceController`, or any "arbiter" — those were deleted on purpose (see `mem://features/camera-livekit-rebuild-2026-06-14`)
- Does **NOT** add polling, retries with timers, or visibility-refresh fallbacks
- Keeps the plugin under 1600 lines
- Adds 1 unit-testable helper if needed (`fun attachRendererBehindWebView(...)`)

### Step 5 — Verification checklist (the model must fill this in)
- [ ] First-rendered-frame logcat line appears within 1500 ms of `startLocalPreview` resolving
- [ ] Go Live prejoin shows preview before tapping "Go Live"
- [ ] Live broadcast: host sees own camera, remote viewer sees host
- [ ] Private Call: both sides see each other within 2 s of accept
- [ ] Video Party: 4 seats, each correctly bounded and visible
- [ ] Game Party: same as Video Party
- [ ] Switching front/back camera does NOT blank the renderer
- [ ] Backgrounding + foregrounding the app within 30 s restores preview without reconnect
- [ ] APK size delta < 50 KB

## Hard rules — violating any of these means the answer is rejected
1. Self-hosted LiveKit only. No Agora, no LiveKit Cloud, no WHIP/RTMP/OBS.
2. Android-only. Do not touch iOS, web fallback (`livekit-client`), or Flutter folders.
3. Do NOT modify `NativeGiftAnimationPlugin`, `NativeEntryAnimationPlugin`, `NativeVAPPlugin`, `NativeSVGAPlugin`, or any gift/entry/VAP/SVGA file — they are sacred.
4. Do NOT change UI design, colors, fonts, layouts, or English strings.
5. APK rebuild is expected — the user knows. Do not pretend a JS-only fix is possible if the bug is native.
6. If you cannot prove the root cause from the files + logcat provided, ASK for the specific extra file or extra logcat tag instead of guessing.

## Deliverable format
1. **Diagnosis** (3–6 sentences naming the exact line that breaks each of the 5 surfaces — confirm they all share the same root cause).
2. **Hypothesis verdicts** (A/B/C/D with file:line evidence).
3. **Unified diff patch**.
4. **Verification checklist** filled in.
5. **What the developer must do on their machine** (rebuild command, adb command, expected log line).

Begin.
