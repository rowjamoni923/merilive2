# 🚀 MeriLive Android — সম্পূর্ণ Setup Guide (A to Z) v6.0

> **Package:** `com.merilive.app` | **Java:** 17 | **Kotlin:** 2.1.10 | **Capacitor:** 8.x | **Target SDK:** 35
> **Last Updated:** 2026-03-31
> **Play Store Version:** v8.0.6 (versionCode 9)

---

## 📁 সম্পূর্ণ ফোল্ডার স্ট্রাকচার

```
android/app/src/main/
├── java/com/merilive/app/
│   ├── MainActivity.java                  ← Capacitor bridge + 4 plugin registration + WebView TURBO
│   ├── MeriLiveApplication.java           ← App lifecycle, 6 notification channels, TikTok SDK, crash handler
│   ├── MyFirebaseMessagingService.java    ← FCM push handler (10 notification types)
│   ├── IncomingCallService.java           ← Foreground service (lock screen calls, 60s timeout)
│   ├── IncomingCallActivity.java          ← Full-screen call UI (Glide avatar, pulse animation)
│   ├── CallActionReceiver.java            ← Accept/decline broadcast bridge (WeakReference)
│   ├── DeepARPlugin.java                  ← Camera2 + DeepAR v5.1 beauty engine (1080p) + AR Stickers
│   ├── PlayStoreBillingPlugin.java        ← Google Play Billing 6.x (coins, auto-consume, retry)
│   └── plugins/
│       └── LiveKitNativePlugin.kt         ← GPU video rendering (SurfaceViewRenderer, coroutines)
│
├── res/
│   ├── drawable/
│   │   ├── accept_button_bg.xml           ← সবুজ গোল বাটন (accept call)
│   │   ├── avatar_circle_border.xml       ← অবতার বৃত্তাকার বর্ডার (pink stroke)
│   │   ├── avatar_glow.xml                ← অবতার গ্লো ইফেক্ট (radial gradient)
│   │   ├── call_background_gradient.xml   ← কল স্ক্রিন ব্যাকগ্রাউন্ড
│   │   ├── circle_green.xml               ← সবুজ বৃত্ত
│   │   ├── circle_red.xml                 ← লাল বৃত্ত
│   │   ├── decline_button_bg.xml          ← লাল গোল বাটন (decline call)
│   │   ├── default_avatar.xml             ← ডিফল্ট অবতার (vector drawable)
│   │   ├── ic_call_accept.xml             ← কল গ্রহণ আইকন (phone)
│   │   ├── ic_call_decline.xml            ← কল প্রত্যাখ্যান আইকন (call end)
│   │   ├── ic_call_notification.xml       ← কল নোটিফিকেশন আইকন
│   │   └── pulse_ring.xml                 ← পালস অ্যানিমেশন রিং
│   │
│   ├── layout/
│   │   └── activity_incoming_call.xml     ← ইনকামিং কল ফুল-স্ক্রিন UI
│   │
│   ├── values/
│   │   ├── strings.xml                    ← অ্যাপের নাম + Google Sign-In Client ID
│   │   └── styles_incoming_call.xml       ← কল UI থিম + কালার ডেফিনিশন
│   │
│   └── xml/
│       ├── file_paths.xml                 ← FileProvider paths (camera, storage)
│       └── network_security_config.xml    ← HTTPS-only + localhost dev exception
│
├── AndroidManifest.xml                    ← (permissions + components নিচে দেওয়া আছে)
├── google-services.json                   ← Firebase config (Firebase Console থেকে ডাউনলোড)
├── proguard-rules.pro                     ← R8/ProGuard rules (v4.0 TURBO)
└── build.gradle                           ← App-level build config
```

**মোট ফাইল সংখ্যা:**
- **Java ফাইল:** 8টি
- **Kotlin ফাইল:** 1টি (LiveKitNativePlugin.kt)
- **Drawable XML:** 12টি
- **Layout XML:** 1টি
- **Values XML:** 2টি
- **Config XML:** 2টি
- **Build/Config:** 4টি (build.gradle, proguard-rules.pro, keystore.properties, google-services.json)

---

## 🔧 Step 1: Project-Level build.gradle (android/build.gradle)

```groovy
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.2.2'
        classpath 'com.google.gms:google-services:4.4.2'
        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.10'
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
        maven { url 'https://maven.livekit.io/releases' }
        maven { url 'https://artifact.bytedance.com/repository/pangle' }
        maven { url 'https://jitpack.io' }
    }
}
```

---

## 🔧 Step 2: App-Level build.gradle (android/app/build.gradle)

> **📌 ফাইল:** `android-setup/build.gradle.partial` দেখুন — সম্পূর্ণ কোড সেখানে আছে।

মূল পয়েন্টগুলো:

```groovy
apply plugin: 'com.android.application'
apply plugin: 'kotlin-android'

android {
    namespace "com.merilive.app"
    compileSdkVersion 35
    
    defaultConfig {
        applicationId "com.merilive.app"
        minSdkVersion 24
        targetSdkVersion 35
        versionCode 9
        versionName "8.0.6"
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = '17'
    }
}

dependencies {
    // Capacitor
    implementation project(':capacitor-android')
    
    // Google Play Billing 6.x
    implementation 'com.android.billingclient:billing:6.1.0'
    
    // Google Play In-App Update
    implementation 'com.google.android.play:app-update:2.1.0'
    
    // Google Sign-In
    implementation 'com.google.android.gms:play-services-auth:21.0.0'
    
    // Firebase
    implementation platform('com.google.firebase:firebase-bom:32.7.0')
    implementation 'com.google.firebase:firebase-messaging'
    implementation 'com.google.firebase:firebase-auth'
    
    // Image Loading (Glide) — Call Avatar
    implementation 'com.github.bumptech.glide:glide:4.16.0'
    annotationProcessor 'com.github.bumptech.glide:compiler:4.16.0'
    
    // TikTok SDK
    implementation 'com.github.tiktok:tiktok-business-android-sdk:1.5.0'
    implementation 'androidx.lifecycle:lifecycle-process:2.3.1'
    implementation 'com.android.installreferrer:installreferrer:2.2'
    
    // LiveKit Native SDK
    implementation "io.livekit:livekit-android:2.23.5"
    implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3"
    implementation "org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3"
}

apply plugin: 'com.google.gms.google-services'
```

---

## 🔧 Step 3: AndroidManifest.xml

> **📌 পারমিশন:** `android-setup/AndroidManifest_permissions.xml` দেখুন
> **📌 কম্পোনেন্ট:** `android-setup/AndroidManifest_additions.xml` দেখুন

### মূল পারমিশন সমূহ:

| Category | Permissions |
|----------|-----------|
| **Internet** | INTERNET, ACCESS_NETWORK_STATE, ACCESS_WIFI_STATE |
| **Camera** | CAMERA (+ hardware features) |
| **Audio** | RECORD_AUDIO, MODIFY_AUDIO_SETTINGS |
| **Location** | ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION |
| **Storage** | READ_EXTERNAL_STORAGE (≤32), READ_MEDIA_* (13+) |
| **Notifications** | POST_NOTIFICATIONS |
| **Call System** | WAKE_LOCK, FOREGROUND_SERVICE, FOREGROUND_SERVICE_PHONE_CALL, USE_FULL_SCREEN_INTENT, VIBRATE, RECEIVE_BOOT_COMPLETED |
| **Billing** | com.android.vending.BILLING |
| **Bluetooth** | BLUETOOTH_CONNECT, BLUETOOTH_SCAN |
| **DeepAR** | libOpenCL.so (native library) |

### ⛔ রিমুভ করা পারমিশন (Google Play Policy):
- ❌ `READ_PHONE_STATE` — WebRTC calls, Android telecom নয়
- ❌ `CALL_PHONE` / `SEND_SMS` — দরকার নেই
- ❌ `ACCESS_BACKGROUND_LOCATION` — Prominent Disclosure required
- ❌ `MANAGE_EXTERNAL_STORAGE` — All Files Access policy
- ❌ `BODY_SENSORS` — Health declaration required
- ❌ `REQUEST_INSTALL_PACKAGES` — Policy rejection risk

### মূল কম্পোনেন্ট সমূহ:

```xml
<!-- Application tag-এর ভিতরে -->

<!-- 1. Incoming Call Activity -->
<activity
    android:name=".IncomingCallActivity"
    android:excludeFromRecents="true"
    android:launchMode="singleTop"
    android:screenOrientation="portrait"
    android:showWhenLocked="true"
    android:turnScreenOn="true"
    android:theme="@style/Theme.IncomingCall" />

<!-- 2. Incoming Call Foreground Service -->
<service
    android:name=".IncomingCallService"
    android:enabled="true"
    android:exported="false"
    android:foregroundServiceType="phoneCall" />

<!-- 3. Firebase Messaging Service -->
<service
    android:name=".MyFirebaseMessagingService"
    android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>

<!-- 4. Call Action Receiver -->
<receiver
    android:name=".CallActionReceiver"
    android:enabled="true"
    android:exported="false">
    <intent-filter>
        <action android:name="com.merilive.app.CALL_ACTION" />
        <action android:name="com.merilive.app.CLOSE_INCOMING_CALL" />
    </intent-filter>
</receiver>
```

---

## 📋 Step 4: Java ফাইল সমূহ (8টি)

### সব ফাইলের লোকেশন:
```
android/app/src/main/java/com/merilive/app/
```

| # | ফাইল | সাইজ | কাজ |
|---|------|------|-----|
| 1 | `MainActivity.java` | 484 lines | Capacitor bridge, 4 plugin registration, WebView TURBO optimization (10 layers), back button, call bridge, intent routing |
| 2 | `MeriLiveApplication.java` | 430 lines | Application class, 6 notification channels + 3 groups, TikTok SDK, crash handler, lifecycle monitoring |
| 3 | `MyFirebaseMessagingService.java` | 606 lines | FCM handler for 10 notification types: call, message, gift, photo, stream, admin, follow, topup, call_ended, generic |
| 4 | `IncomingCallService.java` | 361 lines | Foreground service for incoming calls, full-screen intent, audio focus, 60s timeout |
| 5 | `IncomingCallActivity.java` | 439 lines | Full-screen call UI, Glide avatar, pulse animation, ringtone + vibration, lock screen support |
| 6 | `CallActionReceiver.java` | 131 lines | Broadcast receiver for call accept/decline/end, WeakReference listener |
| 7 | `DeepARPlugin.java` | 1884 lines | Camera2 API + DeepAR beauty engine, 8 beauty parameters, sticker support, 1080p, zoom enforcement |
| 8 | `PlayStoreBillingPlugin.java` | 584 lines | Google Play Billing 6.x, product query, purchase flow, auto-consume, restore, exponential backoff retry |

### Kotlin Plugin:
```
android/app/src/main/java/com/merilive/app/plugins/
```

| # | ফাইল | সাইজ | কাজ |
|---|------|------|-----|
| 9 | `LiveKitNativePlugin.kt` | 349 lines | GPU-rendered video via SurfaceViewRenderer, room events, auto track attach |

---

## 🎨 Step 5: Drawable Resources (12টি)

### লোকেশন:
```
android/app/src/main/res/drawable/
```

| # | ফাইল | টাইপ | কাজ |
|---|------|------|-----|
| 1 | `accept_button_bg.xml` | Shape (oval) | সবুজ গোল accept বাটন (#4CAF50) |
| 2 | `avatar_circle_border.xml` | Shape (oval) | অবতার বৃত্তাকার বর্ডার (#E91E63 stroke) |
| 3 | `avatar_glow.xml` | Shape (oval) | রেডিয়াল গ্লো ইফেক্ট (#60E91E63) |
| 4 | `call_background_gradient.xml` | Shape (rect) | কল স্ক্রিন ব্যাকগ্রাউন্ড (#2a1a3e → #0a0a0f) |
| 5 | `circle_green.xml` | Shape (oval) | সবুজ বৃত্ত (#00C853) |
| 6 | `circle_red.xml` | Shape (oval) | লাল বৃত্ত (#FF1744) |
| 7 | `decline_button_bg.xml` | Shape (oval) | লাল গোল decline বাটন (#F44336) |
| 8 | `default_avatar.xml` | Vector | ডিফল্ট ইউজার আইকন (120x120dp) |
| 9 | `ic_call_accept.xml` | Vector | ফোন আইকন (24dp, white) |
| 10 | `ic_call_decline.xml` | Vector | কল শেষ আইকন (24dp, white) |
| 11 | `ic_call_notification.xml` | Vector | নোটিফিকেশন কল আইকন (24dp, #E91E63) |
| 12 | `pulse_ring.xml` | Shape (oval) | পালস অ্যানিমেশন রিং (#40E91E63 stroke) |

---

## 📐 Step 6: Layout XML (1টি)

### লোকেশন:
```
android/app/src/main/res/layout/activity_incoming_call.xml
```

ইনকামিং কল UI:
- Gradient background overlay
- Pulse animation rings (2টি)
- Caller avatar with glow frame (150dp)
- Caller name (28sp bold)
- Call type text
- MeriLive branding
- Decline button (70dp red circle + icon)
- Accept button (70dp green circle + icon)
- Swipe hint text

---

## 📝 Step 7: Values XML (2টি)

### `res/values/strings.xml`
```xml
<string name="app_name">MeriLive</string>
<string name="server_client_id">973947856306-n6kjihap25bdffjv967evtt1i7j1vs38.apps.googleusercontent.com</string>
```

### `res/values/styles_incoming_call.xml`
- `Theme.IncomingCall` — NoActionBar, fullscreen, lock screen flags
- Colors: `call_background` (#0a0a0f), `call_primary` (#E91E63), `call_accept` (#4CAF50), `call_decline` (#F44336)

---

## ⚙️ Step 8: XML Config (2টি)

### `res/xml/file_paths.xml`
- Internal files, cache, external storage, media paths for FileProvider

### `res/xml/network_security_config.xml`
- Production: HTTPS only
- Dev: cleartext allowed for localhost, 10.0.2.2

---

## 🔐 Step 9: ProGuard Rules

> **📌 ফাইল:** `android-setup/proguard-rules.pro` (155 lines)

Protected classes:
- Capacitor Framework
- Firebase (Auth + Messaging)
- Google Play Billing 6.x
- Google Play In-App Update
- DeepAR Native Camera
- Glide (Image Loading)
- TikTok Business SDK
- MeriLive App Classes
- LiveKit + WebRTC
- AndroidX
- OkHttp / Okio

---

## 🔑 Step 10: Keystore

> **📌 ফাইল:** `android-setup/keystore.properties`

```properties
storeFile=../../android-setup/merilive.jks
storePassword=Sazzad017
keyAlias=key0
keyPassword=Sazzad017
```

> ⚠️ **IMPORTANT:** এই ফাইল git-এ commit করবেন না! `.gitignore` এ যোগ করুন।

---

## 🔥 Step 11: Firebase Setup

1. [Firebase Console](https://console.firebase.google.com/) এ যান
2. আপনার প্রজেক্ট সিলেক্ট করুন
3. Android app যোগ করুন (package: `com.merilive.app`)
4. `google-services.json` ডাউনলোড করুন
5. `android/app/` ফোল্ডারে রাখুন

---

## 📲 Step 12: সম্পূর্ণ ফাইল কপি করার নির্দেশনা

### Android Studio তে কপি করার জন্য:

```bash
# 1. Java ফাইল কপি (8টি)
cp android-setup/java/com/merilive/app/*.java \
   android/app/src/main/java/com/merilive/app/

# 2. Kotlin plugin কপি
mkdir -p android/app/src/main/java/com/merilive/app/plugins/
cp android-setup/plugins/LiveKitNativePlugin.kt \
   android/app/src/main/java/com/merilive/app/plugins/

# 3. Drawable কপি (12টি)
cp android-setup/res/drawable/*.xml \
   android/app/src/main/res/drawable/

# 4. Layout কপি
cp android-setup/res/layout/*.xml \
   android/app/src/main/res/layout/

# 5. Values কপি
cp android-setup/res/values/*.xml \
   android/app/src/main/res/values/

# 6. XML config কপি
cp android-setup/res/xml/*.xml \
   android/app/src/main/res/xml/

# 7. ProGuard কপি
cp android-setup/proguard-rules.pro \
   android/app/proguard-rules.pro

# 8. Keystore কপি
cp android-setup/keystore.properties \
   keystore.properties
cp android-setup/merilive.jks \
   android-setup/merilive.jks
```

---

## ✅ চেকলিস্ট — সব ফাইল আছে কিনা যাচাই করুন

### Java ফাইল (8টি):
- [x] `MainActivity.java` (484 lines) — Capacitor bridge + TURBO WebView
- [x] `MeriLiveApplication.java` (430 lines) — App lifecycle + notification channels
- [x] `MyFirebaseMessagingService.java` (606 lines) — FCM handler (10 types)
- [x] `IncomingCallService.java` (361 lines) — Foreground call service
- [x] `IncomingCallActivity.java` (439 lines) — Full-screen call UI
- [x] `CallActionReceiver.java` (131 lines) — Broadcast bridge
- [x] `DeepARPlugin.java` (1884 lines) — Camera2 + DeepAR beauty
- [x] `PlayStoreBillingPlugin.java` (584 lines) — Google Play Billing

### Kotlin ফাইল (1টি):
- [x] `LiveKitNativePlugin.kt` (349 lines) — GPU video renderer

### Drawable XML (12টি):
- [x] `accept_button_bg.xml`
- [x] `avatar_circle_border.xml`
- [x] `avatar_glow.xml`
- [x] `call_background_gradient.xml`
- [x] `circle_green.xml`
- [x] `circle_red.xml`
- [x] `decline_button_bg.xml`
- [x] `default_avatar.xml`
- [x] `ic_call_accept.xml`
- [x] `ic_call_decline.xml`
- [x] `ic_call_notification.xml`
- [x] `pulse_ring.xml`

### Layout XML (1টি):
- [x] `activity_incoming_call.xml`

### Values XML (2টি):
- [x] `strings.xml`
- [x] `styles_incoming_call.xml`

### Config XML (2টি):
- [x] `file_paths.xml`
- [x] `network_security_config.xml`

### Build/Config:
- [x] `build.gradle.partial` — App build config
- [x] `proguard-rules.pro` — ProGuard rules (155 lines)
- [x] `keystore.properties` — Signing config
- [x] `merilive.jks` — Keystore file
- [x] `google-services.json` — Firebase config
- [x] `AndroidManifest_permissions.xml` — 40+ permissions
- [x] `AndroidManifest_additions.xml` — 4 components

### Extras:
- [x] `proguard-livekit.pro` — LiveKit-specific ProGuard
- [x] `FACEBOOK_SDK_SETUP.md` — Facebook SDK guide
- [x] `PART_18_NATIVE_SDK_SETUP.md` — Native SDK setup
- [x] `GEMINI_FIX_NONEXISTENTCLASS.md` — Build fix guide

---

## 🎯 মোট ফাইল: 30+ টি

সব ফাইল `android-setup/` ফোল্ডারে সংরক্ষিত আছে। Android Studio তে `npx cap sync` করার পর উপরের কপি কমান্ড ব্যবহার করে সব ফাইল সঠিক জায়গায় বসান।

---

## 📊 Feature Matrix — কোন ফাইল কোন ফিচার সাপোর্ট করে

| Feature | Java/Kotlin Files | Resources |
|---------|------------------|-----------|
| **Push Notifications** | MyFirebaseMessagingService, MeriLiveApplication | — |
| **Incoming Calls (Background)** | IncomingCallService, IncomingCallActivity, CallActionReceiver | 12 drawables, 1 layout, styles |
| **Google Play Billing** | PlayStoreBillingPlugin | — |
| **DeepAR Beauty Camera** | DeepARPlugin | — |
| **LiveKit GPU Video** | LiveKitNativePlugin.kt | — |
| **WebView Optimization** | MainActivity | — |
| **Screen Security** | MainActivity | — |
| **TikTok Analytics** | MeriLiveApplication | — |

---

**© MeriLive 2026 — All Rights Reserved**
