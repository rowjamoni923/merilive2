---
name: Pkg426 Native VAP plugin (Phase 1 + 2)
description: Additive Tencent VAP Android plugin + JS bridge + 3-tier feature flag + wired into VAPPlayer/EntryVAPPlayer via useNativeVAPAttempt hook. Default OFF, zero regression on web/iOS, instant kill-switch.
type: feature
---
**Phase 1 (infra, OFF by default)**
- `android/app/src/main/java/com/merilive/app/plugin/NativeVAPPlugin.kt` — Tencent `com.tencent.qgame:vap:1.0.20`, MediaCodec decoder-only (no Camera2 conflict), FrameLayout overlay added to activity decor, on-disk download cache, emits `vap:start|complete|error` events. `Class.forName("com.tencent.qgame.animplayer.AnimView")` availability gate so older APKs report false.
- `src/plugins/NativeVAP.ts` — `isNativeVAPAvailable()` (cached), `tryNativeVAPPlay({url,loop,fillScreen,scaleMode,timeoutMs=3000})` w/ Promise.race timeout, `tryNativeVAPPrefetch()`, `stopNativeVAP()`. Returns false on any failure path → caller falls back silently.
- `src/utils/vapNativeFlag.ts` — `isNativeVAPFlagEnabled()` three-tier OR: (1) `localStorage['vap:native:enabled']` per-device override, (2) `app_settings.vap_native_enabled` global kill-switch, (3) `app_settings.vap_native_rollout_percent` w/ sticky bucket in `localStorage['vap:native:bucket']`.
- `MainActivity.java` registers plugin; `android/app/build.gradle` adds Tencent VAP dependency.

**Phase 2 (wiring, ships gated)**
- NEW `src/hooks/useNativeVAPAttempt.ts` — returns `'pending'|'active'|'fallback'`. Lazy-loads `vap_native_enabled` + `vap_native_rollout_percent` from app_settings once per session via `getAppSetting` (Pkg D cache). Registers `vap:complete`/`vap:error` listeners filtered by url BEFORE calling `tryNativeVAPPlay` to avoid missing short-clip complete events. On unmount: removes listener + `stopNativeVAP()`.
- `src/components/common/VAPPlayer.tsx` + `src/components/entry/EntryVAPPlayer.tsx` — call hook with `loop: loop ? 0 : 1`, render transparent placeholder when mode is `'pending'` or `'active'` (WebView `<video>`+`<canvas>` NOT mounted to avoid double-decode), re-emit `onLoad` via effect when mode flips to `'active'` so overlay containers reveal. Existing WebView path is byte-identical on `'fallback'`.

**Zero-regression**: Flag default OFF → every existing animation runs the exact pre-Pkg426 WebView/WebGL path. Web/iOS short-circuit in `isNativeVAPFlagEnabled` before any native call. Older APKs without the AAR report `available:false`. 3 s timeout on `tryNativeVAPPlay` guarantees no hang.

**Enable per device**: `localStorage.setItem('vap:native:enabled','1')` + reload.
**Enable app-wide**: `INSERT INTO app_settings (setting_key,setting_value) VALUES ('vap_native_enabled','true'::jsonb), ('vap_native_rollout_percent','10'::jsonb)`. Pkg378 broadcast bump invalidates cache instantly.

**Constraint reconciliation**: `mem://constraints/never-touch-gift-entry-animations` was explicitly lifted by the user for this Phase-2 wiring only. Changes are confined to: render-path conditional that mounts native overlay instead of WebGL canvas (no shader / playback-rate / sound-pipeline edits). The shader code, audio routing, frame loop, and `playSoundUrl` integration in both players are byte-identical to pre-Pkg426. Constraint REMAINS for all other gift/entry edits.

**Build step**: `npx cap sync android && cd android && ./gradlew assembleRelease`.

**Phase 3 (not shipped)**: hook `tryNativeVAPPrefetch` into Pkg424 warmup; iOS plugin (separate Tencent SDK).

Full reproducible Gemini prompt at `docs/GEMINI_NATIVE_VAP_PROMPT.md`.
