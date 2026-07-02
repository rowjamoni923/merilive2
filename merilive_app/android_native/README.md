# Native Android host — staged plugin files

This directory holds Kotlin plugin sources that must be dropped into the
Flutter Android host **after** `flutter create --platforms=android .` is run
inside `merilive_app/`. The Flutter project doesn't have `android/` scaffolded
yet, so we can't commit them to their final path until that step happens.

## Files here

| Staged file | Destination in Android host |
| --- | --- |
| `LiveKitFlutterPlugin.kt` | `android/app/src/main/kotlin/com/merilive/app/plugins/LiveKitFlutterPlugin.kt` |

## Integration checklist (post `flutter create`)

1. Copy each file to its destination above.
2. In `android/app/build.gradle`:
   ```gradle
   dependencies {
     implementation "io.livekit:livekit-android:2.23.5"
   }
   ```
   and enable `packagingOptions { pickFirst '**/libc++_shared.so' }` (LiveKit
   ships its own WebRTC native).
3. In `android/settings.gradle`, ensure JitPack is available:
   ```gradle
   dependencyResolutionManagement {
     repositories { maven { url 'https://jitpack.io' } }
   }
   ```
4. Register the plugin in `MainActivity.kt`:
   ```kotlin
   class MainActivity : FlutterActivity() {
     override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
       super.configureFlutterEngine(flutterEngine)
       LiveKitFlutterPlugin.register(flutterEngine, this)
     }
   }
   ```
5. Set the Flutter activity window background to transparent so the
   SurfaceViewRenderer behind Flutter shows through.

## Contract

MethodChannel name: `app.merilive/livekit` — must exactly match the Dart-side
`LiveKitBridge` at `lib/core/native/livekit_bridge.dart`. Every method is
idempotent, main-thread safe, and reports back a `Map<String, Any?>` with at
least a `success` boolean (or `attached`/`reason` for the local-track calls),
matching what the Capacitor `LiveKitNative` plugin already returns to the web
build. Publish resolution is hard-locked to 1080p and scaling to
`SCALE_ASPECT_FILL` inside the plugin — Flutter callers cannot override it.
