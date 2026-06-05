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

## What Lovable already shipped in Pkg426

| File | Purpose |
| --- | --- |
| `android/app/src/main/java/com/merilive/app/plugin/NativeVAPPlugin.kt` | Native Kotlin VAP plugin |
| `src/plugins/NativeVAP.ts` | JS bridge + safe wrappers |
| `src/utils/vapNativeFlag.ts` | Feature-flag utility |
| `android/app/src/main/java/com/merilive/app/MainActivity.java` | `registerPlugin(NativeVAPPlugin.class)` |
| `android/app/build.gradle` | `com.tencent.qgame:vap:1.0.20` dependency |

Phase 2 (NOT shipped in Pkg426, by user mandate): wire
`tryNativeVAPPlay()` into `VAPPlayer.tsx` / `EntryVAPPlayer.tsx` behind
the `isNativeVAPFlagEnabled()` gate so the staged-rollout dial can
gradually replace the WebView VAP path with the native one.
