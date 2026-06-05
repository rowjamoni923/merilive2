# Gemini Prompt — Native Android VAP Plugin (Pkg426)

> Copy-paste the prompt below to Gemini (or any other code model) when you
> need it to reproduce the exact same native VAP plugin setup that Lovable
> shipped in Pkg426. The prompt is self-contained: it tells Gemini what to
> build, where to put each file, the exact API surface, and the zero-risk
> rollout rules.

---

## Prompt to give Gemini

You are working on a Capacitor-based Android app (`com.merilive.app`,
`appId: com.merilive.app`, `minSdk 24`, `compileSdk 34`,
`targetSdk 34`, Kotlin + Java, Capacitor v6). The app is a live-streaming
platform similar to Chamet. There is already a working native SVGA plugin
(`NativeSVGAPlugin.kt` + `src/plugins/NativeSVGA.ts`) that we want to
mirror exactly for a new native VAP (Video Animation Player) plugin.

Build a new native Android plugin called `NativeVAP` that plays alpha-channel
MP4 gift / entry animations using Tencent's official open-source VAP SDK
(`com.tencent.qgame:vap:1.0.20`, MIT license, the same SDK used by WeChat,
QQ, Tencent Video, and Honor of Kings).

### Hard requirements

1. **Zero regression.** The plugin is ADDITIVE. Do not modify any existing
   animation component — `VAPPlayer.tsx`, `EntryVAPPlayer.tsx`,
   `FullScreenGiftAnimation.tsx`, `FlyingGiftAnimation.tsx`,
   `GiftEmojiAnimation.tsx`, `UnifiedEntryAnimation.tsx`,
   `EntryBarAnimation.tsx`, `useEntryAnimations` are forbidden to touch.
2. **Default OFF.** Ship a feature-flag utility. The flag must default to
   `false` so the freshly-built APK behaves identically to the previous one
   for every existing user until we explicitly enable it.
3. **Graceful fallback.** `isAvailable()` returns `false` on iOS, web
   preview, or older APKs (use `Class.forName` to detect the AAR). Every
   JS-side wrapper must catch errors and return `false` so callers can
   silently fall back to the WebView VAP path.
4. **No Camera2 conflict.** VAP only uses the MediaCodec *decoder* — it
   must never claim Camera2. We have an existing `CameraOwnership.kt`
   arbiter used by LiveKit / GPUPixel / NativeCamera; the new plugin must
   leave it untouched.

### File 1 — `android/app/src/main/java/com/merilive/app/plugin/NativeVAPPlugin.kt`

- `@CapacitorPlugin(name = "NativeVAP")`
- Methods:
  - `isAvailable(call: PluginCall)` — return `{available: Boolean}`. The
    boolean comes from `Class.forName("com.tencent.qgame.animplayer.AnimView")`
    in a try/catch.
  - `play(call: PluginCall)` — accepts `url: String` (required),
    `loop: Int = 1` (0 = infinite), `fillScreen: Boolean = true`,
    `scaleMode: String = "fitCenter"` (`fitCenter | centerCrop | fitXY`).
    Downloads the MP4 on a background `Executors.newFixedThreadPool(2)`
    (cache-aware, results stored in a `ConcurrentHashMap<String, File>` and
    persisted to `context.cacheDir/vap/<hash>.mp4`), then hops to the UI
    thread, creates a transparent `FrameLayout` overlay above the WebView,
    inserts a `com.tencent.qgame.animplayer.AnimView`, and calls
    `startPlay(file)`. Wire an `IAnimListener` that emits
    `vap:start`, `vap:complete`, and `vap:error` listener events. On
    complete/error, tear down the overlay.
  - `stop(call: PluginCall)` — `animView?.stopPlay()` + remove overlay.
  - `prefetch(call: PluginCall)` — download to cache only (Pkg424-style
    warmup so the first real `play()` is instant).
- The overlay creation pattern must mirror `NativeSVGAPlugin.kt` exactly
  (`bridge.webView.parent as ViewGroup`, transparent background,
  `MATCH_PARENT` when `fillScreen=true`, `WRAP_CONTENT + Gravity.CENTER`
  otherwise, `isClickable=false`, `isFocusable=false`).

### File 2 — `src/plugins/NativeVAP.ts`

- Use `registerPlugin<NativeVAPPlugin>('NativeVAP')`.
- Type interface mirrors the Kotlin methods.
- Export helpers:
  - `isNativeVAPAvailable(): Promise<boolean>` — short-circuits to `false`
    on non-Android-native, caches the result.
  - `tryNativeVAPPlay(opts)` — wraps `play()` in a `Promise.race` with a
    3-second timeout. Returns `true` on success, `false` on any error so
    callers can fall back to WebView VAP without further handling.
  - `tryNativeVAPPrefetch(url)` — best-effort warmup.
  - `stopNativeVAP()` — fire-and-forget cleanup.

### File 3 — `src/utils/vapNativeFlag.ts`

Feature-flag utility with three OR-evaluated dials:

1. Per-device localStorage override (`vap:native:enabled` = `'1'|'0'|null`)
   — exported as `getLocalNativeVAPOverride()` / `setLocalNativeVAPOverride()`.
2. Remote enable flag fed from `app_settings.vap_native_enabled` via
   `setRemoteNativeVAPConfig({enabled})`.
3. Remote rollout percent (`0..100`) — sticky per-device via a bucket
   integer stored in `localStorage['vap:native:bucket']`, so the same
   device always lands in the same bucket (monotonic rollout).

Final gate `isNativeVAPFlagEnabled()`:

- Returns `false` immediately if `!Capacitor.isNativePlatform()` or
  platform !== `'android'`.
- Otherwise applies override → kill switch → rollout-percent in that
  order. Defaults to `false` when nothing is configured.

### File 4 — `android/app/src/main/java/com/merilive/app/MainActivity.java`

Add one line below the existing `NativeSVGAPlugin` registration:

```java
registerPlugin(com.merilive.app.plugin.NativeVAPPlugin.class);
```

### File 5 — `android/app/build.gradle`

Add one dependency line in the `dependencies { ... }` block, just below
the existing `SVGAPlayer-Android` line:

```gradle
implementation 'com.tencent.qgame:vap:1.0.20'
```

JitPack repo is already configured in the root `android/build.gradle`.

### After Gemini finishes

Run:

```bash
npx cap sync android
cd android && ./gradlew assembleRelease
```

Install the new APK. With the flag still OFF, behavior is identical to the
previous build (zero regression). To smoke-test on your own device, open the
in-app dev console and run:

```js
localStorage.setItem('vap:native:enabled', '1');
```

Then trigger a gift / entry animation. The native VAP overlay will render
above the WebView. To globally enable, set
`app_settings.vap_native_enabled = true` and optionally
`app_settings.vap_native_rollout_percent = 10` for a staged rollout.

---

## What Lovable already shipped

### Pkg426 Phase-1 — Infrastructure (additive, OFF by default)

| File | Purpose |
| --- | --- |
| `android/app/src/main/java/com/merilive/app/plugin/NativeVAPPlugin.kt` | Native Kotlin VAP plugin |
| `src/plugins/NativeVAP.ts` | JS bridge + safe wrappers (`tryNativeVAPPlay`, `tryNativeVAPPrefetch`, `stopNativeVAP`) |
| `src/utils/vapNativeFlag.ts` | Three-tier feature flag (local override / remote kill-switch / staged rollout) |
| `android/app/src/main/java/com/merilive/app/MainActivity.java` | `registerPlugin(NativeVAPPlugin.class)` |
| `android/app/build.gradle` | `com.tencent.qgame:vap:1.0.20` dependency |

### Pkg426 Phase-2 — Wiring (ships gated, default OFF)

| File | Purpose |
| --- | --- |
| `src/hooks/useNativeVAPAttempt.ts` | NEW. Returns `'pending' \| 'active' \| 'fallback'`. Loads remote flag once per session, attempts native play, surfaces complete/error events. |
| `src/components/common/VAPPlayer.tsx` | Calls `useNativeVAPAttempt(resolvedSrc)`. When mode is `'active'` or `'pending'`, the WebView `<video>` + WebGL `<canvas>` are NOT mounted — native plugin owns the screen. On `'fallback'` the existing WebView path runs unchanged. |
| `src/components/entry/EntryVAPPlayer.tsx` | Same wiring as `VAPPlayer.tsx`, mirrored for entry overlays. |

#### Zero-regression guarantees

- Flag remains OFF by default — `isNativeVAPFlagEnabled()` returns `false` on web, iOS, and any Android device until either the local override is set or `app_settings.vap_native_enabled = true`.
- Native plugin missing or returning `ok:false` within 3 s → hook resolves to `'fallback'` → existing WebView path renders.
- `onLoad` is re-emitted from the hook side-effect when mode flips to `'active'` so overlay containers (e.g. `FullScreenGiftAnimation`) still reveal themselves.
- `onComplete` / `onError` are wired to the plugin's `vap:complete` / `vap:error` events so callers receive the same lifecycle they get from the WebView path.

#### To enable on your own device

```js
// In the running app's JS console:
localStorage.setItem('vap:native:enabled', '1');
location.reload();
```

#### To roll out app-wide

```sql
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES ('vap_native_enabled', 'true'::jsonb),
       ('vap_native_rollout_percent', '10'::jsonb)
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;
```

Increase `vap_native_rollout_percent` (1 → 10 → 50 → 100) over a few days; Pkg378 broadcast bump invalidates the in-memory `app_settings` cache instantly across every connected client.

### Phase-3 (not shipped yet)

- Wire `tryNativeVAPPrefetch()` into the Pkg424 warmup pipeline so the same gift MP4 is also cached by the native plugin's on-disk store, giving first-play latency ≈ 50 ms even on cold cache.
- iOS native VAP plugin (Tencent's iOS SDK is separate; only Android is in scope today).

