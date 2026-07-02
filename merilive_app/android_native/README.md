# Native Android host — staged plugin files

This directory holds Kotlin plugin sources + resources that must be dropped
into the Flutter Android host **after** `flutter create --platforms=android .`
is run inside `merilive_app/`. The Flutter project doesn't have `android/`
scaffolded yet, so we can't commit them to their final path until that step
happens.

## Files here

| Staged file | Destination in Android host |
| --- | --- |
| `LiveKitFlutterPlugin.kt` | `android/app/src/main/kotlin/com/merilive/app/plugins/LiveKitFlutterPlugin.kt` |
| `NativeGiftAnimationPlugin.kt` | `android/app/src/main/kotlin/com/merilive/app/plugins/NativeGiftAnimationPlugin.kt` |
| `NativeEntryAnimationPlugin.kt` | `android/app/src/main/kotlin/com/merilive/app/plugins/NativeEntryAnimationPlugin.kt` |
| `IncomingCallBridgePlugin.kt` | `android/app/src/main/kotlin/com/merilive/app/flutter/IncomingCallBridgePlugin.kt` |
| `MeriFirebaseMessagingService.kt` | `android/app/src/main/kotlin/com/merilive/app/service/MeriFirebaseMessagingService.kt` |
| `IncomingCallService.kt` | `android/app/src/main/kotlin/com/merilive/app/service/IncomingCallService.kt` |
| `IncomingCallActivity.kt` | `android/app/src/main/kotlin/com/merilive/app/ui/call/IncomingCallActivity.kt` |
| `res/layout/activity_incoming_call.xml` | `android/app/src/main/res/layout/activity_incoming_call.xml` |


## Integration checklist (post `flutter create`)

1. Copy each file to its destination above.
2. `android/app/build.gradle`:
   ```gradle
   plugins {
     id 'com.android.application'
     id 'kotlin-android'
     id 'com.google.gms.google-services'          // FCM
   }
   dependencies {
     implementation "io.livekit:livekit-android:2.23.5"
     implementation platform("com.google.firebase:firebase-bom:33.5.0")
     implementation "com.google.firebase:firebase-messaging-ktx"
     implementation "androidx.core:core-ktx:1.13.1"
   }
   packagingOptions { pickFirst '**/libc++_shared.so' }
   ```
3. Root `android/build.gradle` — add the Google Services classpath:
   ```gradle
   buildscript {
     dependencies {
       classpath 'com.google.gms:google-services:4.4.2'
     }
   }
   ```
4. Drop `google-services.json` (from Firebase console, package
   `com.merilive.app`) into `android/app/google-services.json`.
5. `android/settings.gradle` — ensure JitPack is available (LiveKit):
   ```gradle
   dependencyResolutionManagement {
     repositories { maven { url 'https://jitpack.io' } }
   }
   ```
6. Register both plugins in `MainActivity.kt`:
   ```kotlin
   class MainActivity : FlutterActivity() {
     override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
       super.configureFlutterEngine(flutterEngine)
       LiveKitFlutterPlugin.register(flutterEngine, this)
       flutterEngine.plugins.add(IncomingCallBridgePlugin())
     }
   }
   ```
7. `android/app/src/main/AndroidManifest.xml` — inside `<application>`:
   ```xml
   <service
       android:name=".service.MeriFirebaseMessagingService"
       android:exported="false">
     <intent-filter>
       <action android:name="com.google.firebase.MESSAGING_EVENT" />
     </intent-filter>
   </service>

   <service
       android:name=".service.IncomingCallService"
       android:exported="false"
       android:foregroundServiceType="phoneCall" />

   <activity
       android:name=".ui.call.IncomingCallActivity"
       android:showOnLockScreen="true"
       android:turnScreenOn="true"
       android:excludeFromRecents="true"
       android:launchMode="singleTop"
       android:theme="@style/Theme.AppCompat.NoActionBar.Fullscreen"
       android:exported="false" />
   ```
   and top-level permissions:
   ```xml
   <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
   <uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL" />
   <uses-permission android:name="android.permission.WAKE_LOCK" />
   <uses-permission android:name="android.permission.VIBRATE" />
   <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
   <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
   ```
8. Set the Flutter activity window background to transparent so the
   LiveKit `SurfaceViewRenderer` behind Flutter shows through.

## MethodChannel contracts

| Channel | Owner | Purpose |
| --- | --- | --- |
| `app.merilive/livekit` | `LiveKitFlutterPlugin` | Camera / connect / publish / mute / flip / beauty. Matches the Capacitor `LiveKitNative` plugin on the web build. |
| `app.merilive/incoming_call` | `IncomingCallBridgePlugin` | Native ↔ Dart handoff for the incoming-call ringer. Methods: `pending` (Dart pulls cached cold-start event), `dismiss` (Dart tells native to tear down). Native pushes `incoming` / `accept` / `decline` with `{call_id, caller_id, caller_name, caller_avatar, call_type}`. |

## Post-integration rebuild command

```bash
cd merilive_app
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs   # regenerates app_router.gr.dart
flutter build apk --release
```

APK rebuild is REQUIRED for the incoming-call plumbing to activate on
device — FCM service + full-screen activity + method-channel bridge all
live in the native layer.
