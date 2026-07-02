# Android host — Phase H1

Real Flutter Android module. `merilive_app/android_native/` is now retired
as a staging folder — every source file has been copied to its final
package path under `android/app/src/main/kotlin/com/merilive/app/`.

## Local build

```bash
cd merilive_app
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs
flutter build apk --debug
```

Requires (checked-in by developer on their machine, NOT by Lovable):

- `android/local.properties` with `flutter.sdk=/path/to/flutter` and
  `sdk.dir=/path/to/android/sdk`.
- `android/app/google-services.json` from Firebase console
  (package `com.merilive.app`) for FCM.
- App icons at `android/app/src/main/res/mipmap-*/ic_launcher.png`
  (any adaptive icon set works; the manifest references `@mipmap/ic_launcher`).

## Registered plugins

| Channel | Plugin | Purpose |
| --- | --- | --- |
| `app.merilive/livekit` | `LiveKitFlutterPlugin` | Camera / connect / publish / beauty / sticker / stats |
| `app.merilive/audio_focus` | (H2 pending) | AudioManager focus events |
| `merilive/gift_animation` | `NativeGiftAnimationPlugin` | VAP / SVGA / Lottie gift renderer |
| `merilive/entry_animation` | `NativeEntryAnimationPlugin` | Premium entry banner renderer |
| `app.merilive/incoming_call` | `IncomingCallBridgePlugin` | FCM → full-screen ringer |

## Phase H2 hooks (still `unimplemented`)

- `snapshotVoiceChunk`
- `setBackgroundMusic` / `setBackgroundMusicPlaying` / `setBackgroundMusicVolume`
- `setVirtualBackground`
- `setNoiseCancellation`
- `app.merilive/audio_focus` EventChannel emitter

Those are landing in H2; every Dart caller is already dormant-safe today.
