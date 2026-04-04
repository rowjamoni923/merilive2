# 🚀 PART 18 — সম্পূর্ণ Android Native SDK Setup, Supabase Integration ও Zero-WebView Architecture

> **এই Part টি সবার শেষে দিতে হবে (Part 0–17 এর পর)**
> এটা নিশ্চিত করবে যে পুরো অ্যাপটি 100% Native Android SDK দিয়ে চলছে এবং কোনো Web Icon, Web Favicon বা WebView-এর চিহ্ন নেই।

---

## 📋 সারসংক্ষেপ

| বিষয় | বিস্তারিত |
|-------|----------|
| Package | `com.merilive.app` |
| Min SDK | 24 (Android 7.0) |
| Target SDK | 34 (Android 14) |
| Compile SDK | 34 |
| Java | 17 |
| Kotlin | 1.9.22+ |
| Version Code | 9 |
| Version Name | 9.0.0 |
| Architecture | 100% Native Kotlin/Java (NO Capacitor WebView) |

---

## 🔴 CATEGORY 1: Web Icon / Favicon সম্পূর্ণ রিমুভ

নেটিভ অ্যান্ড্রয়েডে কোনো `favicon.ico`, `manifest.json`, বা PWA meta tag প্রয়োজন নেই। নিশ্চিত করো:

```kotlin
// ❌ এগুলো নেটিভে থাকবে না:
// - index.html (no <link rel="icon">)
// - manifest.json / manifest.webmanifest
// - service-worker.js
// - meta theme-color tags
// - apple-touch-icon tags

// ✅ এর পরিবর্তে নেটিভ আইকন ব্যবহার হবে:
// android/app/src/main/res/
// ├── mipmap-mdpi/ic_launcher.webp (48x48)
// ├── mipmap-hdpi/ic_launcher.webp (72x72)
// ├── mipmap-xhdpi/ic_launcher.webp (96x96)
// ├── mipmap-xxhdpi/ic_launcher.webp (144x144)
// ├── mipmap-xxxhdpi/ic_launcher.webp (192x192)
// ├── mipmap-mdpi/ic_launcher_round.webp
// ├── mipmap-hdpi/ic_launcher_round.webp
// ├── mipmap-xhdpi/ic_launcher_round.webp
// ├── mipmap-xxhdpi/ic_launcher_round.webp
// ├── mipmap-xxxhdpi/ic_launcher_round.webp
// └── mipmap-anydpi-v26/
//     ├── ic_launcher.xml (Adaptive Icon)
//     └── ic_launcher_round.xml
```

### Adaptive Icon XML (Android 8.0+):
```xml
<!-- res/mipmap-anydpi-v26/ic_launcher.xml -->
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
```

### Notification Icon:
```
// res/drawable/ic_notification.xml — Single color, white on transparent
// res/drawable/ic_stat_notification.xml — Small notification bar icon
```

---

## 🔴 CATEGORY 2: Supabase Android Native SDK (supabase-kt)

### 2.1 Dependency Setup

```kotlin
// build.gradle.kts (app-level)
val supabaseVersion = "3.1.4"
val ktorVersion = "3.1.3"

dependencies {
    // ═══════════════════════════════════════
    // SUPABASE KOTLIN SDK (সম্পূর্ণ)
    // ═══════════════════════════════════════
    implementation(platform("io.github.jan-tennert.supabase:bom:$supabaseVersion"))
    implementation("io.github.jan-tennert.supabase:postgrest-kt")        // Database queries
    implementation("io.github.jan-tennert.supabase:auth-kt")             // Authentication
    implementation("io.github.jan-tennert.supabase:storage-kt")          // File uploads
    implementation("io.github.jan-tennert.supabase:realtime-kt")         // Real-time subscriptions
    implementation("io.github.jan-tennert.supabase:functions-kt")        // Edge Functions
    
    // Ktor Engine (HTTP client for supabase-kt)
    implementation("io.ktor:ktor-client-okhttp:$ktorVersion")
    implementation("io.ktor:ktor-client-content-negotiation:$ktorVersion")
    implementation("io.ktor:ktor-serialization-kotlinx-json:$ktorVersion")
    
    // Kotlinx Serialization
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
}
```

### 2.2 Supabase Client Singleton

```kotlin
// com/merilive/app/data/SupabaseClient.kt
package com.merilive.app.data

import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.FlowType
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.storage.Storage
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.functions.Functions

object SupabaseClient {
    
    // ═══════════════════════════════════════
    // PRODUCTION CREDENTIALS
    // ═══════════════════════════════════════
    private const val SUPABASE_URL = "https://pppcwawjjpwwrmvezcdy.supabase.co"
    private const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcGN3YXdqanB3d3JtdmV6Y2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzQ4OTYsImV4cCI6MjA4MzkxMDg5Nn0.VUy58uiU63Kb3i4qj2ALK2s3arjBJ25CbnwCcvblpQw"
    
    val client = createSupabaseClient(
        supabaseUrl = SUPABASE_URL,
        supabaseKey = SUPABASE_ANON_KEY
    ) {
        install(Auth) {
            flowType = FlowType.PKCE
            scheme = "merilive"
            host = "auth-callback"
        }
        install(Postgrest)
        install(Storage)
        install(Realtime)
        install(Functions)
    }
}
```

### 2.3 Supabase ব্যবহারের স্থানসমূহ (কোথায় কী কানেক্ট হবে)

| Feature | Supabase Module | Table/Function | কোন Screen থেকে |
|---------|----------------|----------------|-----------------|
| Login (Start/Guest) | `Auth.signInAnonymously()` | `auth.users` + `profiles` | `LoginActivity` |
| Login (WhatsApp OTP) | `Functions.invoke("whatsapp-otp")` | Edge Function | `LoginActivity` |
| Login (Gmail) | `Auth.signInWith(Email)` | `auth.users` | `LoginActivity` |
| User Profile | `Postgrest["profiles"]` | `profiles` | `ProfileFragment` |
| Live Streams List | `Postgrest["live_streams"]` | `live_streams` | `HomeFragment` |
| Live Stream Token | `Functions.invoke("live-stream")` | Edge Function → LiveKit | `LiveWatchActivity` |
| Chat Messages | `Realtime.channel()` | `messages` | `ChatFragment` |
| Gift Sending | `Functions.invoke("send-gift")` | `gift_transactions` | `LiveWatchActivity`, `PartyRoomActivity` |
| Party Rooms | `Postgrest["party_rooms"]` | `party_rooms` | `PartyFragment` |
| Coin Purchase | `Functions.invoke("verify-google-purchase")` | `coin_transactions` | `CoinStoreActivity` |
| Push Token | `Postgrest["push_tokens"]` | `push_tokens` | `MyFirebaseMessagingService` |
| Followers/Following | `Postgrest["follows"]` | `follows` | `ProfileFragment` |
| Banners | `Postgrest["banners"]` | `banners` | `HomeFragment` |
| Search Users | `Postgrest["profiles"].select().ilike()` | `profiles` | `SearchActivity` |
| Reels | `Postgrest["reels"]` | `reels` | `ReelsFragment` |
| Agency | `Postgrest["agencies"]` | `agencies` + `agency_hosts` | `AgencyFragment` |
| Withdrawal | `Postgrest["agency_withdrawals"]` | `agency_withdrawals` | `WithdrawalActivity` |
| Report User | `Postgrest["reports"]` | `reports` | `ReportDialog` |
| Block User | `Postgrest["blocked_users"]` | `blocked_users` | `ProfileFragment` |
| Daily Login | `Postgrest["daily_login_rewards"]` | `daily_login_rewards` | `DailyRewardDialog` |
| Notifications | `Postgrest["notifications"]` | `notifications` | `NotificationActivity` |
| App Settings | `Postgrest["app_settings"]` | `app_settings` | App-wide |
| Level System | `Postgrest["profiles"].select("level,xp")` | `profiles` | `LevelFragment` |
| VIP/Noble | `Postgrest["user_vip_status"]` | `user_vip_status` | `VIPFragment` |
| Leaderboard | `Postgrest["leaderboard_rankings"]` | `leaderboard_rankings` | `LeaderboardActivity` |
| Private Call Billing | `Functions.invoke("call-billing")` | `private_calls` + `call_events` | `CallActivity` |
| File Upload (Avatar) | `Storage["avatars"].upload()` | Storage bucket | `EditProfileActivity` |
| File Upload (Chat) | `Storage["chat-media"].upload()` | Storage bucket | `ChatFragment` |
| File Upload (Reel) | `Storage["reels"].upload()` | Storage bucket | `CreateReelActivity` |
| Realtime Presence | `Realtime.channel().presenceState()` | Channel presence | `LiveWatchActivity`, `PartyRoomActivity` |
| AI Chatbot | `Functions.invoke("ai-chat")` | Edge Function | `AIChatActivity` |

### 2.4 Session Persistence (নেটিভ)

```kotlin
// com/merilive/app/data/SessionManager.kt
package com.merilive.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.status.SessionStatus

object SessionManager {
    private const val PREF_NAME = "merilive_session"
    private const val KEY_ACCESS_TOKEN = "access_token"
    private const val KEY_REFRESH_TOKEN = "refresh_token"
    private const val KEY_MANUAL_LOGOUT = "meri_manual_logout"
    
    private lateinit var prefs: SharedPreferences
    
    fun init(context: Context) {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        
        prefs = EncryptedSharedPreferences.create(
            context,
            PREF_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }
    
    fun saveSession(accessToken: String, refreshToken: String) {
        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .putBoolean(KEY_MANUAL_LOGOUT, false)
            .apply()
    }
    
    fun isManualLogout(): Boolean = prefs.getBoolean(KEY_MANUAL_LOGOUT, false)
    
    fun clearSession() {
        prefs.edit()
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .putBoolean(KEY_MANUAL_LOGOUT, true)
            .apply()
    }
    
    // ⚠️ সেশন শুধুমাত্র ম্যানুয়াল লগআউটে ক্লিয়ার হবে
    // নেটওয়ার্ক এরর বা টোকেন রিফ্রেশ ফেইলে সেশন বজায় থাকবে
    fun getRefreshToken(): String? = prefs.getString(KEY_REFRESH_TOKEN, null)
}
```

### 2.5 Encrypted Preferences Dependency

```kotlin
// build.gradle.kts
dependencies {
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
}
```

---

## 🔴 CATEGORY 3: LiveKit Android Native SDK (GPU Video Rendering)

### 3.1 Dependencies

```kotlin
// build.gradle.kts
dependencies {
    // ═══════════════════════════════════════
    // LIVEKIT ANDROID SDK (GPU-accelerated WebRTC)
    // ═══════════════════════════════════════
    implementation("io.livekit:livekit-android:2.23.5")
    implementation("io.livekit:livekit-android-camerax:2.23.5")  // CameraX integration
    
    // Kotlin Coroutines (LiveKit requirement)
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
}
```

### 3.2 Repository Setup

```kotlin
// settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven("https://jitpack.io")       // LiveKit transitive deps
    }
}
```

### 3.3 LiveKit Manager (Singleton)

```kotlin
// com/merilive/app/livekit/LiveKitManager.kt
package com.merilive.app.livekit

import android.content.Context
import io.livekit.android.LiveKit
import io.livekit.android.room.Room
import io.livekit.android.room.RoomException
import io.livekit.android.room.track.VideoTrack
import io.livekit.android.renderer.SurfaceViewRenderer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

object LiveKitManager {
    
    private var room: Room? = null
    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState
    
    enum class ConnectionState {
        DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING
    }
    
    /**
     * LiveKit Room তৈরি এবং কানেক্ট
     * @param wsUrl: LiveKit WebSocket URL (Edge Function থেকে প্রাপ্ত)
     * @param token: LiveKit JWT Token (Edge Function থেকে প্রাপ্ত)
     */
    suspend fun connect(context: Context, wsUrl: String, token: String): Room {
        disconnect() // আগের কানেকশন ক্লোজ
        
        _connectionState.value = ConnectionState.CONNECTING
        
        val newRoom = LiveKit.create(context.applicationContext)
        try {
            newRoom.connect(wsUrl, token)
            room = newRoom
            _connectionState.value = ConnectionState.CONNECTED
            return newRoom
        } catch (e: RoomException) {
            _connectionState.value = ConnectionState.DISCONNECTED
            throw e
        }
    }
    
    /**
     * GPU-accelerated SurfaceViewRenderer এ ভিডিও অ্যাটাচ
     */
    fun attachVideoToSurface(track: VideoTrack, renderer: SurfaceViewRenderer) {
        track.addRenderer(renderer)
    }
    
    fun detachVideoFromSurface(track: VideoTrack, renderer: SurfaceViewRenderer) {
        track.removeRenderer(renderer)
    }
    
    suspend fun disconnect() {
        room?.disconnect()
        room = null
        _connectionState.value = ConnectionState.DISCONNECTED
    }
    
    fun getRoom(): Room? = room
}
```

### 3.4 LiveKit Token প্রাপ্তি (Supabase Edge Function)

```kotlin
// LiveKit token পাওয়ার জন্য Edge Function কল:
suspend fun getLiveKitToken(roomName: String, type: String, identity: String): LiveKitTokenResponse {
    val response = SupabaseClient.client.functions.invoke(
        function = "live-stream",
        body = mapOf(
            "action" to "get-token",
            "roomName" to roomName,
            "participantType" to type,
            "identity" to identity
        )
    )
    return response.body<LiveKitTokenResponse>()
}

@Serializable
data class LiveKitTokenResponse(
    val token: String,
    val url: String,
    val roomName: String
)
```

### 3.5 LiveKit ব্যবহারের স্থানসমূহ

| Feature | Screen | কীভাবে কাজ করে |
|---------|--------|-----------------|
| Live Stream দেখা | `LiveWatchActivity` | Edge Function → token → `LiveKitManager.connect()` → Remote video track → `SurfaceViewRenderer` |
| Live Stream শুরু | `GoLiveActivity` | Edge Function → host token → Local camera → `room.localParticipant.setCameraEnabled(true)` |
| Party Room Audio | `PartyRoomActivity` | Edge Function → token → Audio-only room → `room.localParticipant.setMicrophoneEnabled(true)` |
| Party Room Video | `PartyRoomActivity` | Same + `setCameraEnabled(true)` for video slots |
| Private Call (Audio) | `CallActivity` | Edge Function → 1:1 room → Audio only |
| Private Call (Video) | `CallActivity` | Edge Function → 1:1 room → Audio + Video |
| PK Battle | `LiveWatchActivity` | 2 rooms simultaneously → Split-screen layout |
| Co-host | `LiveWatchActivity` | Same room → Multiple video tracks |
| Admin Monitor | `AdminStreamViewer` | Read-only token → Monitor any stream |

### 3.6 ProGuard Rules (LiveKit)

```proguard
# LiveKit SDK
-keep class io.livekit.** { *; }
-keep class livekit.org.webrtc.** { *; }
-dontwarn io.livekit.**
-dontwarn livekit.org.webrtc.**

# WebRTC
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**
```

---

## 🔴 CATEGORY 4: DeepAR Android Native SDK (Beauty & AR Effects)

### 4.1 Dependencies

```kotlin
// build.gradle.kts
dependencies {
    // ═══════════════════════════════════════
    // DEEPAR SDK (Beauty Filters + AR Stickers)
    // ═══════════════════════════════════════
    implementation("ai.deepar:deepar-sdk:6.0.1")
}
```

### 4.2 Repository

```kotlin
// settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        maven("https://maven.deepar.ai")  // DeepAR Maven Repository
    }
}
```

### 4.3 DeepAR License Key

```kotlin
// ⚠️ এই License Key আমাদের প্রোডাকশন কী — শুধুমাত্র com.merilive.app এ কাজ করবে
private const val DEEPAR_LICENSE_KEY = "cf1eb9f4e2d9a7fdd208d71e4232eb8d05e09b2e2f9b1de6cc28fb93f0c824c65c9bcc7cfbe0c797"
```

### 4.4 DeepAR Engine Manager

```kotlin
// com/merilive/app/deepar/DeepARManager.kt
package com.merilive.app.deepar

import ai.deepar.ar.DeepAR
import ai.deepar.ar.AREventListener
import ai.deepar.ar.DeepARImageFormat
import android.content.Context
import android.view.SurfaceView

object DeepARManager {
    
    private var deepAR: DeepAR? = null
    private var isInitialized = false
    
    // Beauty parameter mapping
    private val BEAUTY_KEYS = arrayOf(
        "smoothness", "whitening", "redness", "eyeEnlarge",
        "faceSlim", "chinSlim", "noseNarrow", "lipColor"
    )
    private val DEEPAR_PARAM_NAMES = arrayOf(
        "Skin Smoothing", "Skin Whitening", "Redness", "Eye Enlargement",
        "Face Slim", "Chin Slim", "Nose Narrow", "Lip Color"
    )
    
    fun initialize(context: Context, surfaceView: SurfaceView, listener: AREventListener) {
        if (isInitialized) return
        
        deepAR = DeepAR(context).apply {
            setLicenseKey(DEEPAR_LICENSE_KEY)
            initialize(context, listener)
            setRenderSurface(surfaceView.holder.surface, 1080, 1920)
        }
        isInitialized = true
    }
    
    /**
     * Beauty effect লোড (beauty.deepar ফাইল থেকে)
     * Location: assets/effects/beauty/beauty.deepar
     */
    fun loadBeautyEffect() {
        deepAR?.switchEffect("mask", "file:///android_asset/effects/beauty/beauty.deepar")
    }
    
    /**
     * AR Sticker/Mask লোড
     * @param category: "masks", "accessories", "fun", "filters", "makeup"
     * @param effectName: "cat_ears", "sunglasses" ইত্যাদি
     */
    fun loadEffect(category: String, effectName: String) {
        deepAR?.switchEffect("mask", "file:///android_asset/effects/$category/$effectName.deepar")
    }
    
    /**
     * Beauty parameter সেট করো (0.0 to 1.0)
     */
    fun setBeautyParam(key: String, value: Float) {
        val index = BEAUTY_KEYS.indexOf(key)
        if (index >= 0 && deepAR != null) {
            deepAR?.changeParameterFloat(
                "Beauty", // GameObject name
                "MeshRenderer", // Component
                DEEPAR_PARAM_NAMES[index],
                value
            )
        }
    }
    
    /**
     * Camera frame ফিড করো (NV21 format)
     */
    fun processFrame(data: ByteArray, width: Int, height: Int, orientation: Int, mirror: Boolean) {
        deepAR?.receiveFrame(
            data,
            width, height,
            orientation,
            mirror,
            DeepARImageFormat.NV21,
            0 // pixelBufferIndex
        )
    }
    
    fun release() {
        deepAR?.release()
        deepAR = null
        isInitialized = false
    }
}
```

### 4.5 DeepAR Effect ফাইল স্ট্রাকচার

```
android/app/src/main/assets/effects/
├── beauty/
│   └── beauty.deepar          ← ★ বাধ্যতামূলক (Beauty Studio এর জন্য)
├── masks/
│   ├── cat_ears.deepar
│   ├── devil_horns.deepar
│   └── bunny.deepar
├── accessories/
│   ├── sunglasses.deepar
│   ├── crown.deepar
│   └── hat.deepar
├── fun/
│   ├── fire_breath.deepar
│   └── rainbow.deepar
├── filters/
│   ├── vintage.deepar
│   ├── warm.deepar
│   └── cool.deepar
└── makeup/
    ├── red_lips.deepar
    └── smoky_eyes.deepar
```

### 4.6 DeepAR ব্যবহারের স্থান

| Feature | Screen | কীভাবে কাজ করবে |
|---------|--------|-----------------|
| Beauty Studio | `GoLiveActivity` | Camera preview → DeepAR process → Beauty sliders (8 params) |
| AR Stickers | `GoLiveActivity` | Effect picker grid → `loadEffect()` → Real-time face tracking |
| Face Verification | `FaceVerifyActivity` | Camera → DeepAR face detection → Screenshot → Upload |
| Beauty in Call | `CallActivity` (video) | Same beauty pipeline for video calls |

### 4.7 ProGuard Rules (DeepAR)

```proguard
# DeepAR SDK
-keep class ai.deepar.ar.** { *; }
-dontwarn ai.deepar.ar.**
```

---

## 🔴 CATEGORY 5: Firebase SDK (Push Notifications + Auth)

### 5.1 Dependencies

```kotlin
dependencies {
    // ═══════════════════════════════════════
    // FIREBASE (Push + Auth)
    // ═══════════════════════════════════════
    implementation(platform("com.google.firebase:firebase-bom:32.7.0"))
    implementation("com.google.firebase:firebase-messaging")    // FCM Push
    implementation("com.google.firebase:firebase-auth")          // Phone auth (fallback)
}
```

### 5.2 google-services.json

```
// এই ফাইলটি android-setup/google-services.json থেকে কপি হবে
// Location: android/app/google-services.json
// Package: com.merilive.app
// Firebase Project: merilive-app
```

### 5.3 FCM Service

```kotlin
// com/merilive/app/MyFirebaseMessagingService.kt
// 9 টি notification type হ্যান্ডেল করে:
// 1. incoming_call → IncomingCallActivity (lock screen সহ)
// 2. gift_received → Gift animation notification
// 3. new_follower → Profile redirect
// 4. live_started → Live stream redirect
// 5. party_invite → Party room redirect
// 6. message → Chat redirect
// 7. system → System notification
// 8. admin_notice → Admin notice
// 9. coin_bonus → Coin store redirect
```

---

## 🔴 CATEGORY 6: Google Play Billing SDK (Coin Purchase)

### 6.1 Dependencies

```kotlin
dependencies {
    // ═══════════════════════════════════════
    // GOOGLE PLAY BILLING (In-App Purchase)
    // ═══════════════════════════════════════
    implementation("com.android.billingclient:billing:6.1.0")
    implementation("com.android.billingclient:billing-ktx:6.1.0")  // Kotlin extensions
}
```

### 6.2 Billing Flow

```
User clicks coin package
    → BillingClient.launchBillingFlow()
    → Google Play purchase dialog
    → onPurchasesUpdated() callback
    → Supabase Edge Function: verify-google-purchase
    → Server verifies with Google Play API
    → Coins credited to user account
    → UI refreshed
```

### 6.3 Billing ব্যবহারের স্থান

| Feature | Screen | কীভাবে |
|---------|--------|--------|
| Coin Purchase | `CoinStoreActivity` | `coin_packages` টেবিল থেকে package list → BillingClient |
| VIP Purchase | `VIPStoreActivity` | In-app subscription → BillingClient |
| Noble Card | `NobleStoreActivity` | One-time purchase → BillingClient |

---

## 🔴 CATEGORY 7: Google Play In-App Update SDK

### 7.1 Dependencies

```kotlin
dependencies {
    implementation("com.google.android.play:app-update:2.1.0")
    implementation("com.google.android.play:app-update-ktx:2.1.0")
}
```

### 7.2 Update Check

```kotlin
// app_version_settings টেবিল থেকে চেক:
// - current_version_code (সর্বশেষ ভার্সন)
// - min_version_code (ফোর্স আপডেট threshold)
// - force_update (boolean)
// - update_message (ইউজারকে দেখানোর মেসেজ)
// - play_store_url (ডাউনলোড লিংক)
```

---

## 🔴 CATEGORY 8: Google Sign-In SDK (Gmail Login)

### 8.1 Dependencies

```kotlin
dependencies {
    // ⚠️ শুধুমাত্র Gmail email/password login এর জন্য
    // Native Google Sign-In SDK বাদ দেওয়া হয়েছে
    // এর পরিবর্তে Supabase Auth Email/Password ব্যবহার হচ্ছে
    
    // implementation("com.google.android.gms:play-services-auth:21.0.0")  // ❌ EXCLUDED
}
```

### 8.2 Gmail Login Flow (Supabase Auth)

```kotlin
// Gmail Login = Supabase Email/Password Auth
// কোনো Google Sign-In SDK প্রয়োজন নেই
suspend fun loginWithGmail(email: String, password: String) {
    SupabaseClient.client.auth.signInWith(Email) {
        this.email = email
        this.password = password
    }
}
```

---

## 🔴 CATEGORY 9: Image Loading SDK (Glide)

### 9.1 Dependencies

```kotlin
dependencies {
    implementation("com.github.bumptech.glide:glide:4.16.0")
    kapt("com.github.bumptech.glide:compiler:4.16.0")
}
```

### 9.2 ব্যবহার

| স্থান | কাজ |
|-------|------|
| Avatar সকল জায়গায় | `Glide.with(ctx).load(url).circleCrop()` |
| Banner images | `Glide.with(ctx).load(url).centerCrop()` |
| Chat image messages | `Glide.with(ctx).load(url).into(imageView)` |
| Incoming Call screen | Full-screen avatar with Glide |
| Gift animations | Lottie/SVGA (আলাদা library) |

---

## 🔴 CATEGORY 10: TikTok Business SDK (Attribution)

### 10.1 Dependencies

```kotlin
dependencies {
    implementation("com.github.tiktok:tiktok-business-android-sdk:1.5.0")
    implementation("androidx.lifecycle:lifecycle-process:2.3.1")
    implementation("androidx.lifecycle:lifecycle-common-java8:2.3.1")
    implementation("com.android.installreferrer:installreferrer:2.2")
}
```

### 10.2 Initialization

```kotlin
// MeriLiveApplication.onCreate() এ initialize হবে
// App install attribution tracking এর জন্য
```

---

## 🔴 CATEGORY 11: Animation Libraries (Lottie + SVGA)

### 11.1 Dependencies

```kotlin
dependencies {
    // Lottie (Gift animations, UI animations)
    implementation("com.airbnb.android:lottie:6.6.2")
    
    // SVGA (Vehicle entrance, Special gift animations)
    implementation("com.github.nicklockwood:svgaplayer-android:3.0.0")
}
```

### 11.2 ব্যবহারের স্থান

| Library | Feature | Screen |
|---------|---------|--------|
| Lottie | Gift animations | `LiveWatchActivity`, `PartyRoomActivity` |
| Lottie | Loading spinners | App-wide |
| Lottie | Empty states | List screens |
| SVGA | Vehicle entrance | `LiveWatchActivity`, `PartyRoomActivity` |
| SVGA | Special gift effects | `LiveWatchActivity` |
| SVGA | Level up celebration | `LevelUpDialog` |

---

## 🔴 CATEGORY 12: Image Cropping (UCrop)

### 12.1 Dependencies

```kotlin
dependencies {
    implementation("com.github.yalantis:ucrop:2.2.9")
}
```

### 12.2 ব্যবহার

| Feature | Screen |
|---------|--------|
| Avatar crop (1:1) | `EditProfileActivity` |
| Cover image crop (16:9) | `EditProfileActivity` |
| Live poster crop (3:4) | `GoLiveActivity` |

---

## 🔴 CATEGORY 13: Additional Native SDKs

### 13.1 Complete Dependencies List

```kotlin
dependencies {
    // ═══════════════════════════════════════
    // CORE ANDROID
    // ═══════════════════════════════════════
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.1")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.viewpager2:viewpager2:1.1.0")
    implementation("androidx.fragment:fragment-ktx:1.8.5")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    
    // ═══════════════════════════════════════
    // NAVIGATION
    // ═══════════════════════════════════════
    implementation("androidx.navigation:navigation-fragment-ktx:2.8.5")
    implementation("androidx.navigation:navigation-ui-ktx:2.8.5")
    
    // ═══════════════════════════════════════
    // LIFECYCLE (ViewModel, LiveData)
    // ═══════════════════════════════════════
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-livedata-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-process:2.8.7")
    
    // ═══════════════════════════════════════
    // CAMERA (DeepAR এর জন্য Camera2 API)
    // ═══════════════════════════════════════
    implementation("androidx.camera:camera-core:1.4.1")
    implementation("androidx.camera:camera-camera2:1.4.1")
    implementation("androidx.camera:camera-lifecycle:1.4.1")
    implementation("androidx.camera:camera-view:1.4.1")
    
    // ═══════════════════════════════════════
    // NETWORK
    // ═══════════════════════════════════════
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    
    // ═══════════════════════════════════════
    // LOCATION
    // ═══════════════════════════════════════
    implementation("com.google.android.gms:play-services-location:21.3.0")
    
    // ═══════════════════════════════════════
    // SPLASH SCREEN (Android 12+)
    // ═══════════════════════════════════════
    implementation("androidx.core:core-splashscreen:1.0.1")
    
    // ═══════════════════════════════════════
    // SECURITY (EncryptedSharedPreferences)
    // ═══════════════════════════════════════
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    
    // ═══════════════════════════════════════
    // MARKDOWN RENDERING (Chat, Terms, Policy)
    // ═══════════════════════════════════════
    implementation("io.noties.markwon:core:4.6.2")
    
    // ═══════════════════════════════════════
    // EMOJI (Chat emoji picker)
    // ═══════════════════════════════════════
    implementation("com.vanniktech:emoji-google:0.21.0")
    
    // ═══════════════════════════════════════
    // MEDIA PLAYER (Voice messages, Music)
    // ═══════════════════════════════════════
    implementation("androidx.media3:media3-exoplayer:1.5.1")
    implementation("androidx.media3:media3-ui:1.5.1")
    
    // ═══════════════════════════════════════
    // BIOMETRIC (Optional security)
    // ═══════════════════════════════════════
    implementation("androidx.biometric:biometric:1.2.0-alpha05")
}
```

---

## 🔴 CATEGORY 14: AndroidManifest.xml — সম্পূর্ণ Permissions

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.merilive.app">

    <!-- Internet -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    
    <!-- Camera & Microphone (Live, Call, Beauty) -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    
    <!-- Location (Nearby feature) -->
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    
    <!-- Vibration (Haptic feedback) -->
    <uses-permission android:name="android.permission.VIBRATE" />
    
    <!-- Keep alive (Call, Live) -->
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
    
    <!-- Notifications -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    
    <!-- Lock screen call display -->
    <uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
    
    <!-- Image picking -->
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    
    <!-- ❌ EXCLUDED (Google Play Policy) -->
    <!-- NO: READ_PHONE_STATE -->
    <!-- NO: CALL_PHONE -->
    <!-- NO: READ_CALL_LOG -->
    <!-- NO: SEND_SMS -->
    <!-- NO: READ_SMS -->
    <!-- NO: BODY_SENSORS -->
    <!-- NO: ACCESS_BACKGROUND_LOCATION -->
    <!-- NO: READ_EXTERNAL_STORAGE (deprecated) -->
    <!-- NO: WRITE_EXTERNAL_STORAGE (deprecated) -->
    
    <!-- Camera features (optional) -->
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
    <uses-feature android:name="android.hardware.camera.front" android:required="false" />
    <uses-feature android:name="android.hardware.microphone" android:required="false" />
    <uses-feature android:name="android.hardware.location.gps" android:required="false" />
</manifest>
```

---

## 🔴 CATEGORY 15: ProGuard Rules — সম্পূর্ণ

```proguard
# ═══════════════════════════════════════
# MeriLive Production ProGuard Rules
# ═══════════════════════════════════════

# Supabase Kotlin SDK
-keep class io.github.jan.supabase.** { *; }
-dontwarn io.github.jan.supabase.**
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**

# Kotlinx Serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.merilive.app.**$$serializer { *; }
-keepclassmembers class com.merilive.app.** { *** Companion; }
-keepclasseswithmembers class com.merilive.app.** { kotlinx.serialization.KSerializer serializer(...); }

# LiveKit
-keep class io.livekit.** { *; }
-keep class livekit.org.webrtc.** { *; }
-dontwarn io.livekit.**
-dontwarn livekit.org.webrtc.**
-keep class org.webrtc.** { *; }

# DeepAR
-keep class ai.deepar.ar.** { *; }
-dontwarn ai.deepar.ar.**

# Firebase
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Google Play Billing
-keep class com.android.vending.billing.** { *; }
-keep class com.android.billingclient.** { *; }

# Glide
-keep public class * implements com.bumptech.glide.module.GlideModule
-keep class * extends com.bumptech.glide.module.AppGlideModule { <init>(...); }
-keep class com.bumptech.glide.load.data.ParcelFileDescriptorRewinder$InternalRewinder { *** rewind(); }

# Lottie
-dontwarn com.airbnb.lottie.**
-keep class com.airbnb.lottie.** { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# TikTok
-keep class com.tiktok.** { *; }
-dontwarn com.tiktok.**

# R8 / Enum
-keepclassmembers enum * { public static **[] values(); public static ** valueOf(java.lang.String); }

# Kotlin Coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembers class kotlinx.coroutines.** { volatile <fields>; }
```

---

## 🔴 CATEGORY 16: Signing Configuration

### Keystore Info
```properties
# android-setup/keystore.properties
storeFile=../../android-setup/merilive.jks
storePassword=Sazzad017
keyAlias=key0
keyPassword=Sazzad017
```

### SHA-256 Fingerprint
```
D6:F9:B3:BB:73:2D:48:1D:DB:36:D4:DC:F2:B5:4D:60:61:88:71:77:14:8A:9C:A2:32:3D:16:34:66:A8:51:F6
```

---

## 🔴 CATEGORY 17: Build Configuration Summary

```kotlin
// build.gradle.kts (app-level) — সম্পূর্ণ summary
android {
    namespace = "com.merilive.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.merilive.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 9
        versionName = "9.0.0"
    }

    signingConfigs {
        create("release") {
            storeFile = file("../../android-setup/merilive.jks")
            storePassword = "Sazzad017"
            keyAlias = "key0"
            keyPassword = "Sazzad017"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        viewBinding = true
    }
}

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.gms.google-services")
    id("kotlin-kapt")
}
```

---

## 🔴 CATEGORY 18: Project-Level build.gradle.kts

```kotlin
// build.gradle.kts (project-level)
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.2.2")
        classpath("com.google.gms:google-services:4.4.0")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.22")
        classpath("org.jetbrains.kotlin:kotlin-serialization:1.9.22")
    }
}
```

---

## ✅ FINAL CHECKLIST — সব SDK Install হয়েছে কিনা

| # | SDK | Version | Install Method | Verified |
|---|-----|---------|---------------|----------|
| 1 | Supabase Kotlin (supabase-kt) | 3.1.4 | Maven Central | ☐ |
| 2 | Ktor (HTTP engine) | 3.1.3 | Maven Central | ☐ |
| 3 | LiveKit Android | 2.23.5 | JitPack | ☐ |
| 4 | DeepAR SDK | 6.0.1 | maven.deepar.ai | ☐ |
| 5 | Firebase BOM | 32.7.0 | Google Maven | ☐ |
| 6 | Google Play Billing | 6.1.0 | Google Maven | ☐ |
| 7 | Google Play Update | 2.1.0 | Google Maven | ☐ |
| 8 | Glide | 4.16.0 | Maven Central | ☐ |
| 9 | TikTok Business | 1.5.0 | JitPack | ☐ |
| 10 | Lottie | 6.6.2 | Maven Central | ☐ |
| 11 | SVGA Player | 3.0.0 | JitPack | ☐ |
| 12 | UCrop | 2.2.9 | JitPack | ☐ |
| 13 | ExoPlayer (Media3) | 1.5.1 | Google Maven | ☐ |
| 14 | Markwon | 4.6.2 | Maven Central | ☐ |
| 15 | Emoji | 0.21.0 | Maven Central | ☐ |
| 16 | OkHttp | 4.12.0 | Maven Central | ☐ |
| 17 | Security Crypto | 1.1.0-alpha06 | Google Maven | ☐ |
| 18 | Navigation | 2.8.5 | Google Maven | ☐ |
| 19 | CameraX | 1.4.1 | Google Maven | ☐ |
| 20 | Biometric | 1.2.0-alpha05 | Google Maven | ☐ |

---

## ⚠️ গুরুত্বপূর্ণ নোট

1. **কোনো WebView বা Capacitor নেই** — এটা 100% Native Kotlin/Java অ্যাপ  
2. **কোনো Web Favicon বা PWA manifest নেই** — শুধু Native mipmap icons  
3. **Supabase JavaScript SDK নেই** — শুধু `supabase-kt` (Kotlin SDK)  
4. **livekit-client (npm) নেই** — শুধু `livekit-android` (Native SDK)  
5. **সব API call Supabase Kotlin SDK দিয়ে** — Edge Functions সহ  
6. **DeepAR License শুধু `com.merilive.app` এ কাজ করবে**  
7. **Session persistence EncryptedSharedPreferences দিয়ে** — App uninstall করলে session মুছে যাবে  
8. **Google Play Billing শুধু Production signed APK এ কাজ করবে**  

---

> **Gemini-কে বলো:** "PART 18 অনুসরণ করে সব Native SDK ইনস্টল করো, build.gradle কনফিগার করো, এবং নিশ্চিত করো যে কোনো Web artifact (favicon, service worker, manifest.json) অ্যাপে নেই। সব কিছু Android Native SDK দিয়ে চলবে।"
