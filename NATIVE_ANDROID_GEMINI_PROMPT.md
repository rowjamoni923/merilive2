# MeriLive — Complete Native Android App Build Guide for AI Agent

## IMPORTANT: READ THIS ENTIRE DOCUMENT BEFORE STARTING

You are building a **100% Native Android Application** (Kotlin + Java) for **MeriLive** — a social live streaming platform similar to Bigo Live / Chamet / Azar. The entire backend is already built and running on **Supabase**. You do NOT need to build any backend. You only need to build the Android frontend that connects to the existing Supabase backend.

---

## APP IDENTITY

```
App Name: MeriLive
Package Name: com.merilive.app
Min SDK: 24
Target SDK: 35
Compile SDK: 35
Version Code: 9
Version Name: 9.0.0
Language: Kotlin (primary) + Java (for DeepAR plugin)
Architecture: MVVM + Hilt Dependency Injection
Design: Material3 Dark Theme — Ultra-premium luxurious aesthetic
```

---

## BACKEND CONNECTION (Supabase — Already Running)

The entire backend is on Supabase. Every single piece of data loads from Supabase. Do NOT create any local database or Room DB for primary data. Use Supabase for everything.

```
Supabase URL: https://pppcwawjjpwwrmvezcdy.supabase.co
Supabase Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcGN3YXdqanB3d3JtdmV6Y2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzQ4OTYsImV4cCI6MjA4MzkxMDg5Nn0.VUy58uiU63Kb3i4qj2ALK2s3arjBJ25CbnwCcvblpQw
```

**Supabase SDK to use:** `io.github.jan-tennert.supabase` (Kotlin Multiplatform SDK)

```kotlin
// Initialize Supabase client
val supabase = createSupabaseClient(
    supabaseUrl = "https://pppcwawjjpwwrmvezcdy.supabase.co",
    supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcGN3YXdqanB3d3JtdmV6Y2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzQ4OTYsImV4cCI6MjA4MzkxMDg5Nn0.VUy58uiU63Kb3i4qj2ALK2s3arjBJ25CbnwCcvblpQw"
) {
    install(Auth)
    install(Postgrest)
    install(Realtime)
    install(Storage)
    install(Functions)
}
```

---

## STREAMING SERVER (LiveKit — Already Running)

All video/audio streaming (Live Streams, Party Rooms, Private Calls) uses LiveKit WebRTC.

```
LiveKit Server: wss://merilive.xyz
Token Generation: Supabase Edge Function "livekit-token"
Video Codec: VP8
Resolution: 1080p @ 30fps
Max Bitrate: 3 Mbps
Audio Codec: Opus
```

To get a LiveKit token, call the Supabase Edge Function:
```kotlin
val result = supabase.functions.invoke("livekit-token") {
    body = buildJsonObject {
        put("roomName", streamId)
        put("participantName", userId)
        put("isHost", true) // or false for viewers
    }
}
// Response contains: { "token": "..." }
```

Then connect to LiveKit:
```kotlin
val room = LiveKit.create(applicationContext)
room.connect("wss://merilive.xyz", token)
```

---

## BEAUTY FILTERS (DeepAR — License Already Configured)

DeepAR provides real-time beauty filters and AR stickers on camera.

```
DeepAR SDK: ai.deepar:deepar:6.0.1
License: Already configured for package com.merilive.app
Assets Location: android/app/src/main/assets/effects/
Subfolders: beauty/, masks/, accessories/, fun/, filters/, makeup/
File Format: .deepar files (exported from DeepAR Studio)
```

**CRITICAL:** The file `beauty.deepar` in `assets/effects/beauty/` is REQUIRED for beauty sliders to work.

Beauty Studio Parameters (sliders):
- Smooth Skin (0.0 - 1.0)
- Big Eyes (0.0 - 1.0)  
- Slim Face (0.0 - 1.0)
- Whiten (0.0 - 1.0)
- Lipstick (0.0 - 1.0)

Camera Pipeline: DeepAR processes camera frames → outputs to LiveKit video track for streaming.

---

## STEP 1: PROJECT SETUP

### 1.1 Create New Android Project
- Empty Activity
- Package: `com.merilive.app`
- Language: Kotlin
- Min SDK: 24

### 1.2 Project-level build.gradle
```groovy
plugins {
    id 'com.android.application' version '8.2.0' apply false
    id 'org.jetbrains.kotlin.android' version '1.9.22' apply false
    id 'com.google.dagger.hilt.android' version '2.48' apply false
    id 'com.google.gms.google-services' version '4.4.0' apply false
    id 'org.jetbrains.kotlin.plugin.serialization' version '1.9.22' apply false
}
```

### 1.3 App-level build.gradle
```groovy
plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
    id 'kotlin-kapt'
    id 'com.google.dagger.hilt.android'
    id 'com.google.gms.google-services'
    id 'org.jetbrains.kotlin.plugin.serialization'
}

android {
    namespace "com.merilive.app"
    compileSdk 35

    defaultConfig {
        applicationId "com.merilive.app"
        minSdk 24
        targetSdk 35
        versionCode 9
        versionName "9.0.0"
    }

    buildFeatures {
        viewBinding true
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
    // Core Android
    implementation 'androidx.core:core-ktx:1.12.0'
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'com.google.android.material:material:1.11.0'
    implementation 'androidx.constraintlayout:constraintlayout:2.1.4'
    implementation 'androidx.core:core-splashscreen:1.0.1'
    implementation 'androidx.viewpager2:viewpager2:1.0.0'
    implementation 'androidx.swiperefreshlayout:swiperefreshlayout:1.1.0'

    // Navigation
    implementation 'androidx.navigation:navigation-fragment-ktx:2.7.6'
    implementation 'androidx.navigation:navigation-ui-ktx:2.7.6'

    // Lifecycle
    implementation 'androidx.lifecycle:lifecycle-viewmodel-ktx:2.7.0'
    implementation 'androidx.lifecycle:lifecycle-livedata-ktx:2.7.0'
    implementation 'androidx.lifecycle:lifecycle-runtime-ktx:2.7.0'
    implementation 'androidx.lifecycle:lifecycle-process:2.7.0'

    // Hilt DI
    implementation 'com.google.dagger:hilt-android:2.48'
    kapt 'com.google.dagger:hilt-android-compiler:2.48'

    // Supabase Kotlin SDK (ALL backend operations)
    implementation platform('io.github.jan-tennert.supabase:bom:3.1.4')
    implementation 'io.github.jan-tennert.supabase:postgrest-kt'
    implementation 'io.github.jan-tennert.supabase:auth-kt'
    implementation 'io.github.jan-tennert.supabase:realtime-kt'
    implementation 'io.github.jan-tennert.supabase:storage-kt'
    implementation 'io.github.jan-tennert.supabase:functions-kt'
    implementation 'io.ktor:ktor-client-android:3.1.3'

    // LiveKit (ALL video/audio: live streaming, party rooms, private calls)
    implementation 'io.livekit:livekit-android:2.23.5'
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'

    // DeepAR (Beauty filters + AR stickers)
    implementation 'ai.deepar:deepar:6.0.1'

    // Firebase (Push notifications ONLY — NOT for auth)
    implementation platform('com.google.firebase:firebase-bom:32.7.0')
    implementation 'com.google.firebase:firebase-messaging'

    // Media
    implementation 'com.google.android.exoplayer:exoplayer:2.19.1'
    implementation 'com.github.bumptech.glide:glide:4.16.0'
    kapt 'com.github.bumptech.glide:compiler:4.16.0'
    implementation 'com.airbnb.android:lottie:6.3.0'

    // SVGA (Gift animations)
    implementation 'com.opensource.svgaplayer:library:2.7.0'

    // Google Play Billing
    implementation 'com.android.billingclient:billing-ktx:6.1.0'

    // Google Play In-App Update
    implementation 'com.google.android.play:app-update-ktx:2.1.0'

    // WebView for games
    implementation 'androidx.webkit:webkit:1.9.0'

    // Image cropping
    implementation 'com.github.yalantis:ucrop:2.2.8'

    // Networking
    implementation 'com.squareup.okhttp3:okhttp:4.12.0'
    implementation 'org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2'

    // Security (encrypted storage for session tokens)
    implementation 'androidx.security:security-crypto:1.1.0-alpha06'

    // Shimmer loading effect
    implementation 'com.facebook.shimmer:shimmer:0.5.0'
}
```

### 1.4 settings.gradle — Add Repositories
```groovy
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven { url 'https://jitpack.io' }
        maven { url 'https://sdk.deepar.ai/android/maven' }
    }
}
```

### 1.5 google-services.json
Place the Firebase config file at `android/app/google-services.json` for push notifications.

---

## STEP 2: AUTHENTICATION SYSTEM

**CRITICAL: There are exactly 3 login methods. NO Google Sign-In SDK. NO Firebase Auth (except FCM).**

All authentication goes through Supabase Auth.

### Method 1: "Start" Button (Guest Login)
This creates an anonymous-like account tied to the physical device.

```kotlin
// Generate persistent device-based ID
val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
val fingerprint = Build.FINGERPRINT
val hardwareUUID = sha256("${androidId}_${fingerprint}")

// Use as email/password for Supabase Auth
val guestEmail = "guest_${hardwareUUID}@meri.local"
val guestPassword = hardwareUUID

// Try sign in first (returning user on same device)
try {
    supabase.auth.signInWith(Email) {
        email = guestEmail
        password = guestPassword
    }
} catch (e: Exception) {
    // New device — sign up
    supabase.auth.signUpWith(Email) {
        email = guestEmail
        password = guestPassword
    }
}
```

After guest login → Check if `profiles.gender` is null → If null, show Gender Selection screen (Male/Female mandatory).

### Method 2: Phone Number (WhatsApp OTP)
```kotlin
// Step 1: Show country picker (240+ countries, auto-detect via IP)
// Step 2: User enters phone number
// Step 3: Send OTP via WhatsApp
val response = supabase.functions.invoke("send-whatsapp-otp") {
    body = buildJsonObject {
        put("phone", "+8801XXXXXXXXX")
        put("countryCode", "BD")
    }
}

// Step 4: User enters OTP code
// Step 5: Verify OTP and sign in
val signInResult = supabase.functions.invoke("otp-direct-signin") {
    body = buildJsonObject {
        put("phone", "+8801XXXXXXXXX")
        put("otp", "123456")
    }
}
// Response contains session tokens → save to EncryptedSharedPreferences
```

**Virtual email format for phone users:** `phone_+8801XXXXXXXXX@meri.local`
**One account per phone number enforced.**

### Method 3: Gmail (Email + Password)
This is standard email/password authentication. NOT Google Sign-In popup. User types their Gmail address and a password.

```kotlin
// Sign Up with email + password
supabase.auth.signUpWith(Email) {
    email = "user@gmail.com"
    password = "userPassword123"
}

// Sign In
supabase.auth.signInWith(Email) {
    email = "user@gmail.com"
    password = "userPassword123"
}

// Email OTP verification (already deployed Edge Function)
supabase.functions.invoke("send-email-otp") {
    body = buildJsonObject { put("email", "user@gmail.com") }
}
supabase.functions.invoke("verify-email-otp") {
    body = buildJsonObject {
        put("email", "user@gmail.com")
        put("otp", "12345678")
    }
}
```

### Session Persistence
```kotlin
// Save session to EncryptedSharedPreferences after login
val encryptedPrefs = EncryptedSharedPreferences.create(
    "meri_session", masterKey, context,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)
encryptedPrefs.edit()
    .putString("access_token", session.accessToken)
    .putString("refresh_token", session.refreshToken)
    .apply()

// On app launch: restore session
val accessToken = encryptedPrefs.getString("access_token", null)
val refreshToken = encryptedPrefs.getString("refresh_token", null)
if (accessToken != null && refreshToken != null) {
    supabase.auth.importSession(/* ... */)
}

// NEVER auto-logout. Only manual logout.
// On logout: supabase.auth.signOut(SignOutScope.LOCAL)
```

### Single Device Policy
When user logs in, update `profiles.active_session_id` with a new UUID. Subscribe to realtime changes on this field. If another device changes it, force logout the current device.

---

## STEP 3: APP NAVIGATION STRUCTURE

### Bottom Navigation Bar (5 tabs):
```
Tab 1: 🏠 Home — Live streams grid, banners, categories
Tab 2: 🔍 Discover — Search/browse users
Tab 3: 🎬 Live — Party rooms + Go Live button
Tab 4: 💬 Chat — Private & group messages
Tab 5: 👤 Profile — User profile, settings, wallet
```

Use Jetpack Navigation Component with a `BottomNavigationView`.

### Complete Screen List (All pages to build):

**Main Screens:**
1. Home (Index) — Live stream grid with banners
2. Discover — Search users, recommended grid
3. Live — Party rooms list
4. Chat — Conversation list
5. Profile — User's own profile

**Live Streaming:**
6. LiveStream — Watch/host a live stream
7. GoLive — Camera preview + start streaming
8. LiveStreamFeed — TikTok-style vertical swipe between streams

**Party Rooms:**
9. PartyRooms — Browse/search rooms
10. PartyRoom — Inside a party room (audio/video/game)
11. CreateParty — Create new party room

**Chat:**
12. ChatConversation — 1-on-1 or group chat messages
13. GroupSettings — Manage group members

**Profile & Settings:**
14. EditProfile — Edit name, avatar, bio
15. ProfileDetail — View other user's profile
16. Level — User level progress & privileges
17. VIP — VIP membership purchase & benefits
18. Shop — Buy avatar frames, effects, etc.
19. Settings — App settings
20. Blacklist — Blocked users
21. CustomerService — Support chat
22. CallHistory — Past calls
23. FollowingList — Following/followers
24. Withdrawal — Withdraw earnings (for hosts)
25. Tags — User interest tags
26. MyPoster — User's media gallery
27. Tasks — Daily/weekly tasks for rewards
28. Rewards — Reward claim history
29. FaceVerification — AI face verification
30. About — App info

**Recharge & Finance:**
31. Recharge — Buy coins (Google Play Billing)
32. RechargeHistory — Purchase history

**Reels:**
33. Reels — TikTok-style vertical video feed

**Agency System:**
34. Agency — Agency overview
35. AgencyDashboard — Agency management
36. AgencySignup — Apply to create agency
37. CreateAgency — Create new agency
38. JoinAgency — Join existing agency
39. AgencyDetails — Agency info
40. AgencyPolicy — Rules & policies
41. AgencyHostManagement — Manage agency hosts
42. AgencyWithdrawal — Agency withdrawal
43. AgencyTransferHistory — Transfer records
44. AgencyCommissionHistory — Commission records
45. AgencyCoinExchange — Diamond ↔ Beans
46. AgencyCoinTrader — Coin trading
47. AgentWallet — Agent balance
48. AgentRank — Agency rankings
49. TransferHistory — Transfer logs
50. HostApplication — Apply to become host
51. HostDashboard — Host earnings/stats
52. HostVerification — Host verification
53. HostTransferHistory — Host transfer logs
54. BecomeSubAgent — Sub-agent application

**Helper System:**
55. HelperDashboard — Topup helper dashboard
56. Level5HelperDashboard — Senior helper dashboard
57. PayrollHelperGuide — Helper guide

**Games (WebView-based):**
58. Roulette — Roulette game
59. FerrisWheel — Ferris wheel game
60. TeenPatti — Teen Patti card game

**Leaderboard:**
61. Leaderboard — Global rankings
62. PKLeaderboard — PK battle rankings

**Other:**
63. Invitation — Referral/invite friends
64. SmartLink — Deep link handler
65. LandingPage — App landing/welcome page

**Public Pages (No auth required):**
66. PublicPrivacyPolicy
67. GoogleLibraryOrderRules
68. PoliciesAndBenefits

---

## STEP 4: HOME SCREEN

### Data Sources (all from Supabase):
```kotlin
// Banners (auto-scrolling carousel at top)
supabase.from("banners")
    .select()
    .eq("is_active", true)
    .order("display_order", Order.ASCENDING)

// Categories (tab filters)
supabase.from("categories")
    .select()
    .eq("is_active", true)
    .order("display_order", Order.ASCENDING)

// Live Streams (2-column grid)
supabase.from("live_streams")
    .select("*, profiles!host_id(display_name, avatar_url, user_level, country_code)")
    .eq("is_live", true)
    .order("viewer_count", Order.DESCENDING)
```

### UI Layout:
```
┌─────────────────────────────┐
│ Header: Logo | Coins | 🔔   │
├─────────────────────────────┤
│ [Banner Carousel - auto scroll] │
├─────────────────────────────┤
│ [Category Tabs: All|Popular|New|...]│
├─────────────────────────────┤
│ [Top Tabs: Live | Party | Nearby] │
├─────────────────────────────┤
│ ┌─────────┐ ┌─────────┐    │
│ │ Stream 1│ │ Stream 2│    │
│ │ 🔴 LIVE │ │ 🔴 LIVE │    │
│ │ 👁 234  │ │ 👁 89   │    │
│ │ Host Ava│ │ Host Ava│    │
│ └─────────┘ └─────────┘    │
│ ┌─────────┐ ┌─────────┐    │
│ │ Stream 3│ │ Stream 4│    │
│ └─────────┘ └─────────┘    │
├─────────────────────────────┤
│ 🏠  🔍  🎬  💬  👤          │
└─────────────────────────────┘
```

Each stream card shows: Thumbnail image, Host avatar (with frame), Host name, Viewer count, LIVE badge, Country flag.

---

## STEP 5: LIVE STREAMING

### 5.1 Go Live (Host starts streaming)

Flow:
1. Open camera with DeepAR beauty filters active
2. Show Beauty Studio panel (sliders for skin smooth, big eyes, etc.)
3. Show AR Sticker picker (load .deepar files from assets/effects/)
4. User enters stream title, selects category
5. Tap "Go Live" button:
   a. Insert row into `live_streams` table with `is_live = true`
   b. Call Edge Function `livekit-token` to get host token
   c. Connect to LiveKit room at `wss://merilive.xyz`
   d. Publish camera video track + microphone audio track
6. Show live streaming UI with overlay controls

### 5.2 Watch Live (Viewer)

Flow:
1. Tap stream card on Home → Navigate to LiveStream screen
2. Insert row into `stream_viewers` table
3. Call Edge Function `livekit-token` to get viewer token
4. Connect to LiveKit room, subscribe to host's video/audio tracks
5. Display host video full-screen
6. Show overlay UI on top of video

### 5.3 Live Stream Overlay UI:
```
┌─────────────────────────────┐
│ ← [Host Info] [👁 234] [⋯] │  ← Top bar
│                             │
│  [Join notifications fly]   │  ← Animated join banners
│                             │
│                             │
│  [Gift animation area]      │  ← Full-screen gift effects
│                             │
│                             │
│ [Chat messages scroll]      │  ← Semi-transparent chat
│ [Chat messages scroll]      │
│ [Chat messages scroll]      │
├─────────────────────────────┤
│ [💬 Input] [🎁] [❤️] [📤]  │  ← Bottom controls
└─────────────────────────────┘
```

### 5.4 Features during live stream:
- **Chat:** Realtime messages via Supabase Realtime subscription on stream messages
- **Gifts:** Gift panel (swipeable grid), send gift → calls Edge Function `gift-service`
- **Gift Animations:** SVGA animations play full-screen when gift received
- **Like:** Floating heart animations
- **Join Notifications:** Animated banner flies across when user joins
- **Entry Effects:** VIP users get special entrance animations (SVGA)
- **Viewer List:** Panel showing all current viewers
- **PK Battle:** 1v1 battle between two hosts (split screen)
- **Co-Host:** Invite viewer to stream together
- **Music Player:** Background music from `admin_music_library` table
- **Host Busy Overlay:** When host takes private call, show blur + "Host is on a Private Call"

### 5.5 Realtime Subscriptions for Live Stream:
```kotlin
// New viewers joining
supabase.realtime.channel("stream-viewers-$streamId")
    .postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
        table = "stream_viewers"
        filter = "stream_id=eq.$streamId"
    }

// Chat messages
supabase.realtime.channel("stream-chat-$streamId")
    .postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
        table = "stream_messages"  
        filter = "stream_id=eq.$streamId"
    }

// Gift transactions
supabase.realtime.channel("stream-gifts-$streamId")
    .postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
        table = "gift_transactions"
        filter = "stream_id=eq.$streamId"
    }
```

---

## STEP 6: PARTY ROOM SYSTEM

### Room Types:
1. **Audio Room** — Voice chat only, seat grid with avatars
2. **Video Room** — Video + voice, camera feeds per seat
3. **Game Room** — Audio room + game WebView overlay

### Data:
```kotlin
// List party rooms
supabase.from("party_rooms")
    .select("*, profiles!host_id(display_name, avatar_url)")
    .eq("is_active", true)

// Room participants
supabase.from("party_room_participants")
    .select("*, profiles!user_id(display_name, avatar_url, user_level)")
    .eq("room_id", roomId)
```

### Party Room UI:
```
┌─────────────────────────────┐
│ ← Room Name [ID] [👁 12] ⋯ │
├─────────────────────────────┤
│ [Background Image]          │
│                             │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐  │  ← Seat Grid
│  │ 👑│ │ 🎤│ │ 🎤│ │  +│  │     (4-9 seats)
│  │Host│ │P2 │ │P3 │ │Join│  │
│  └───┘ └───┘ └───┘ └───┘  │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐  │
│  │ 🎤│ │  +│ │  +│ │  +│  │
│  └───┘ └───┘ └───┘ └───┘  │
│                             │
│ [Chat messages]             │
│ [Chat messages]             │
├─────────────────────────────┤
│ [💬] [🎁] [🎵] [🎮] [🎤] [⚙]│  ← Bottom bar
└─────────────────────────────┘
```

### Party Room LiveKit:
- Same `wss://merilive.xyz` server
- Each participant on a seat publishes their audio (and video in video rooms)
- Token from `livekit-token` Edge Function with `roomName = partyRoomId`
- Mute/unmute per seat, kick/ban controls for room admin

### Party Room Features:
- Seat request system (users request, host approves)
- Background customization (from `party_room_backgrounds` table)
- Gift sending & animations (same system as live stream)
- Music player (host plays music for all)
- Game overlay (load HTML5 games in WebView)
- Vehicle entrance animations for VIP users
- Chat with emoji support

---

## STEP 7: PRIVATE CALL SYSTEM

### Call Types: Audio Call & Video Call

### Call Flow:

**Caller initiates:**
```kotlin
// 1. Show call confirm modal (display cost per minute)
// 2. Insert call record
supabase.from("private_calls").insert(
    PrivateCall(
        caller_id = currentUserId,
        receiver_id = targetUserId,
        call_type = "video", // or "audio"
        status = "ringing"
    )
)
// 3. Get LiveKit token for call room
val token = supabase.functions.invoke("livekit-token") {
    body = buildJsonObject {
        put("roomName", "call_$callId")
        put("participantName", currentUserId)
        put("isHost", false)
    }
}
// 4. Wait for receiver to answer (realtime subscription)
```

**Receiver gets notification:**
```kotlin
// Subscribe to incoming calls
supabase.realtime.channel("incoming-calls")
    .postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
        table = "private_calls"
        filter = "receiver_id=eq.$currentUserId"
    }
// When new call detected with status "ringing":
// → Show full-screen IncomingCallActivity (even on lock screen)
```

**Incoming Call on Lock Screen (Native Android):**
- Use `IncomingCallActivity` with `showWhenLocked = true`, `turnScreenOn = true`
- Use `IncomingCallService` (foreground service, type `phoneCall`)
- Full-screen notification with caller avatar, name
- Accept / Reject buttons
- Vibration + ringtone

**During Call:**
```
┌─────────────────────────────┐
│ [Remote video - full screen]│
│                             │
│            ┌────┐           │
│            │Self│ ← PIP     │
│            │cam │           │
│            └────┘           │
│                             │
│  [Timer: 02:34]             │
│                             │
│ [Chat messages area]        │
├─────────────────────────────┤
│ [🔇] [📷] [🔊] [💬] [🎁] [📞]│
└─────────────────────────────┘
```

**Call Billing:**
- Per-minute rate from call settings
- Coins deducted from caller's `profiles.coins`
- Beans added to receiver's `profiles.beans`
- Timer starts after both tracks connected
- On end: Show `CallRatingModal` (1-5 stars) → `CallEndedModal` (summary)

---

## STEP 8: CHAT SYSTEM

### Features:
1. Private 1-on-1 messaging
2. Group chats
3. Text messages
4. Image/media messages (upload to Supabase Storage)
5. Gift emoji animations
6. Voice messages
7. Emoji picker
8. Unread count badges
9. Push notifications for new messages

### Data:
```kotlin
// Conversation list
supabase.from("conversations")
    .select("*, profiles!other_user_id(display_name, avatar_url)")
    .or("user1_id.eq.$userId,user2_id.eq.$userId")
    .order("last_message_at", Order.DESCENDING)

// Messages in conversation
supabase.from("messages")
    .select("*, profiles!sender_id(display_name, avatar_url)")
    .eq("conversation_id", conversationId)
    .order("created_at", Order.ASCENDING)

// Realtime new messages
supabase.realtime.channel("messages-$conversationId")
    .postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
        table = "messages"
        filter = "conversation_id=eq.$conversationId"
    }
```

### Moderation (Edge Functions already deployed):
- `content-moderate` — AI content moderation
- `detect-phone-number` — Block phone number sharing in chat
- `scan-image-contact` — Scan images for contact info

---

## STEP 9: REELS (TikTok-style Vertical Videos)

### UI: ViewPager2 with vertical scroll
```
┌─────────────────────────────┐
│                             │
│  [Full-screen video]        │
│  (ExoPlayer)                │
│                             │
│                    [❤️ 234] │  ← Right side actions
│                    [💬 45]  │
│                    [📤]     │
│                    [🎁]     │
│                             │
│ [@username] [Follow]        │
│ Caption text here...        │
│ 🎵 Song name               │
└─────────────────────────────┘
```

### Data:
```kotlin
supabase.from("reels")
    .select("*, profiles!user_id(display_name, avatar_url, user_level)")
    .order("created_at", Order.DESCENDING)
    .limit(20)
```

### Upload Flow:
1. Record video or pick from gallery
2. Trim, add text/effects
3. Select background music (from `admin_music_library` table)
4. Upload video via Edge Function `r2-upload` (Cloudflare R2 storage)
5. Insert reel record to `reels` table

---

## STEP 10: GIFT SYSTEM

### Gift Data:
```kotlin
supabase.from("gifts")
    .select()
    .eq("is_active", true)
    .order("sort_order", Order.ASCENDING)
```

### Gift Panel UI:
- Swipeable category tabs (All, Popular, Premium, etc.)
- Grid of gift icons with coin prices
- Quantity selector (x1, x10, x99, x999)
- Send button

### Sending a Gift:
```kotlin
supabase.functions.invoke("gift-service") {
    body = buildJsonObject {
        put("giftId", selectedGift.id)
        put("recipientId", hostId)
        put("quantity", 1)
        put("streamId", currentStreamId) // or "roomId" for party rooms
    }
}
```

### Gift Animations:
- **SVGA:** Full-screen SVGA animation files (use SVGAPlayer library)
- **Lottie:** Lottie JSON animations
- **Flying:** Small icon flies from sender to receiver
- Gift combo counter for repeated sends

---

## STEP 11: PROFILE & SOCIAL SYSTEM

### Profile Data:
```kotlin
supabase.from("profiles")
    .select()
    .eq("id", userId)
    .single()
```

### Profile fields:
- display_name, avatar_url, bio, gender, country_code
- user_level, vip_level, coins, beans, diamonds, pending_earnings
- is_host, is_verified, is_online, last_seen_at
- equipped_avatar_frame_id, equipped_chat_bubble_id
- equipped_entrance_id, equipped_entry_name_bar_id
- equipped_vehicle_id, equipped_noble_card_id

### Social:
```kotlin
// Follow user
supabase.from("follow_relationships").insert(
    FollowRelation(follower_id = myId, following_id = targetId)
)

// Followers list
supabase.from("follow_relationships")
    .select("*, profiles!follower_id(display_name, avatar_url)")
    .eq("following_id", userId)
```

### Level System:
- XP earned from streaming, receiving gifts, completing tasks
- Level shown as gold badge with number
- Higher levels unlock features (from `user_level_privileges` table)

### VIP System:
- VIP levels with special perks
- Purchased via coins or Google Play Billing
- Special avatar frames, entry effects, badges

---

## STEP 12: SHOP SYSTEM

### Categories:
```kotlin
// Avatar Frames
supabase.from("avatar_frames").select().eq("is_active", true)

// Chat Bubbles
supabase.from("chat_bubbles").select().eq("is_active", true)

// Entry Effects
supabase.from("entry_effects").select().eq("is_active", true)

// Entry Name Bars
supabase.from("entry_name_bars").select().eq("is_active", true)

// Vehicle Entrances
supabase.from("vehicle_entrances").select().eq("is_active", true)

// Noble Cards
supabase.from("noble_cards").select().eq("is_active", true)

// VIP Medals
supabase.from("vip_medals").select().eq("is_active", true)
```

### Purchase Flow:
1. Select item → Preview animation
2. Check price (diamonds/coins)
3. Deduct currency → Insert into `user_purchased_items`
4. Equip → Update `profiles.equipped_*_id`

---

## STEP 13: AGENCY SYSTEM

### Tables:
- `agencies` — Agency info (name, code, level, balances)
- `agency_hosts` — Hosts belonging to agency
- `agency_performance` — Weekly/monthly performance
- `agency_withdrawals` — Withdrawal requests
- `agency_commission_history` — Commission records
- `agency_earnings_transfers` — Earnings transfers
- `agency_level_tiers` — Level-based commission rates
- `agency_diamond_transactions` — Diamond transactions
- `agency_rankings` — Rankings/leaderboard

### Features:
- Create agency (unique agency_code)
- Invite hosts via referral code
- Track host earnings
- Commission calculated per agency level tier
- Diamond ↔ Beans exchange
- Withdrawal requests
- Sub-agency system (parent_agency_id)

---

## STEP 14: RECHARGE (Google Play Billing)

```kotlin
// Load coin packages
supabase.from("coin_packages")
    .select()
    .eq("is_active", true)
    .order("display_order", Order.ASCENDING)

// After Google Play purchase success:
supabase.functions.invoke("verify-google-purchase") {
    body = buildJsonObject {
        put("purchaseToken", purchase.purchaseToken)
        put("productId", purchase.products.first())
        put("packageName", "com.merilive.app")
    }
}
// Edge Function verifies with Google and adds coins to profile
```

---

## STEP 15: LEADERBOARD

```kotlin
supabase.from("leaderboard_entries")
    .select("*, profiles!user_id(display_name, avatar_url, user_level)")
    .eq("period_type", "weekly") // daily, weekly, monthly
    .eq("leaderboard_type", "gift_senders") // gift_receivers, streamers, richest
    .order("rank_position", Order.ASCENDING)
    .limit(100)
```

---

## STEP 16: PUSH NOTIFICATIONS (Firebase Cloud Messaging)

```kotlin
// Save FCM token to profile
class MyFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        // Update profiles.fcm_token
        CoroutineScope(Dispatchers.IO).launch {
            supabase.from("profiles")
                .update { set("fcm_token", token) }
                .eq("id", currentUserId)
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val type = message.data["type"]
        when (type) {
            "incoming_call" -> showIncomingCallNotification(message.data)
            "new_message" -> showChatNotification(message.data)
            "gift_received" -> showGiftNotification(message.data)
            "new_follower" -> showFollowerNotification(message.data)
            "stream_started" -> showStreamNotification(message.data)
            else -> showGenericNotification(message)
        }
    }
}
```

### Incoming Call Notification:
- High priority FCM → IncomingCallService (foreground) → IncomingCallActivity
- Channel: `merilive_call_channel` with `IMPORTANCE_HIGH`
- Full-screen intent for lock screen display

---

## STEP 17: GAMES (WebView)

```kotlin
// Load game in WebView
val gameUrl = "https://your-r2-bucket.com/games/roulette/index.html"
webView.loadUrl(gameUrl)

// JavaScript bridge for communication
webView.addJavascriptInterface(object {
    @JavascriptInterface
    fun getBalance(): Int = currentDiamondBalance

    @JavascriptInterface
    fun processWin(amount: Int) {
        // Call Supabase RPC
        supabase.rpc("process_game_win", buildJsonObject {
            put("p_user_id", userId)
            put("p_amount", amount)
        })
    }
}, "MeriLive")
```

---

## STEP 18: SECURITY FEATURES

1. **VPN Detection:** Call `supabase.functions.invoke("detect-vpn")` on app launch
2. **Device Banning:** Check `banned_devices` table with device fingerprint
3. **IP Blocking:** Check `blocked_ips` table
4. **Rate Limiting:** Use `check_rate_limit` RPC before sensitive actions
5. **FLAG_SECURE:** Add to sensitive Activities (prevent screenshots)
6. **Encrypted Storage:** `EncryptedSharedPreferences` for all tokens
7. **Content Moderation:** Auto-moderate chat via Edge Functions
8. **Single Device Session:** Force logout old device on new login

---

## STEP 19: REALTIME SUBSCRIPTIONS

Subscribe to these Supabase Realtime channels:

```kotlin
// 1. Live streams (home page updates)
channel("live-streams")
    .postgresChangeFlow(schema = "public", table = "live_streams")

// 2. Stream viewers (in live stream)
channel("viewers-$streamId")
    .postgresChangeFlow(table = "stream_viewers", filter = "stream_id=eq.$streamId")

// 3. Chat messages
channel("chat-$conversationId")
    .postgresChangeFlow(table = "messages", filter = "conversation_id=eq.$conversationId")

// 4. Incoming calls
channel("calls-$userId")
    .postgresChangeFlow(table = "private_calls", filter = "receiver_id=eq.$userId")

// 5. Gift transactions (in stream/room)
channel("gifts-$streamId")
    .postgresChangeFlow(table = "gift_transactions", filter = "stream_id=eq.$streamId")

// 6. Online status
channel("presence-$userId")
    .postgresChangeFlow(table = "profiles", filter = "id=eq.$userId")

// 7. Party room participants
channel("party-$roomId")
    .postgresChangeFlow(table = "party_room_participants", filter = "room_id=eq.$roomId")

// 8. Notifications
channel("notifications-$userId")
    .postgresChangeFlow(table = "notifications", filter = "user_id=eq.$userId")

// 9. App settings (maintenance mode)
channel("app-settings")
    .postgresChangeFlow(table = "app_settings")
```

---

## STEP 20: EDGE FUNCTIONS (Already Deployed — Just Call Them)

You do NOT need to create these. They are already running on Supabase. Just call them:

```kotlin
// Pattern for calling any Edge Function:
val result = supabase.functions.invoke("function-name") {
    body = buildJsonObject {
        put("key", "value")
    }
}
```

**Auth Functions:**
- `send-whatsapp-otp` — Send OTP via WhatsApp
- `send-email-otp` — Send OTP via email
- `verify-email-otp` — Verify email OTP
- `otp-direct-signin` — Verify OTP and create session
- `send-password-otp` — Password reset OTP
- `convert-anonymous-to-guest` — Convert anonymous to guest account
- `link-device-to-account` — Link device to existing account
- `force-reset-guest-password` — Reset guest password

**Media Functions:**
- `livekit-token` — Get LiveKit room token
- `livekit-egress` — Start/stop stream recording
- `r2-upload` — Upload files to Cloudflare R2
- `r2-proxy` — Proxy R2 file access
- `delete-reel` — Delete a reel video

**Communication Functions:**
- `gift-service` — Process gift sending
- `notify-new-message` — Send push for new message
- `send-push-notification` — Send generic push
- `send-app-notification` — In-app notification
- `ai-chat` — AI chat responses
- `support-chat` — Customer support
- `translate` — Text translation
- `speech-to-text` — Voice to text

**Moderation Functions:**
- `content-moderate` — AI content moderation
- `detect-phone-number` — Detect phone numbers in text
- `scan-image-contact` — Scan images for contact info
- `detect-vpn` — VPN detection
- `auto-face-verify` — AI face verification
- `detect-country` — Detect user's country

**Commerce Functions:**
- `verify-google-purchase` — Verify Google Play purchase
- `fetch-exchange-rates` — Currency exchange rates

**Game Functions:**
- `game-provider` — Load game configuration
- `game-auto-runner` — Auto-play game logic

---

## STEP 21: ANDROID MANIFEST PERMISSIONS

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

**❌ BANNED PERMISSIONS (Will cause Google Play rejection):**
- `READ_PHONE_STATE`
- `CALL_PHONE`
- `READ_CALL_LOG`
- `SEND_SMS`
- `READ_SMS`
- `READ_EXTERNAL_STORAGE` (use scoped storage)
- `WRITE_EXTERNAL_STORAGE`

---

## STEP 22: UI DESIGN SPECIFICATION

### Theme: Ultra-Premium Dark Material3

```xml
<!-- Colors -->
<color name="background">#09090b</color>
<color name="surface">#111114</color>
<color name="surface_variant">#1a1a1f</color>
<color name="primary">#e91e63</color>         <!-- Pink -->
<color name="primary_variant">#9c27b0</color>  <!-- Purple -->
<color name="accent">#ff6f00</color>           <!-- Orange -->
<color name="gold">#ffd700</color>             <!-- Gold for VIP/Level -->
<color name="text_primary">#ffffff</color>
<color name="text_secondary">#9ca3af</color>
<color name="card_background">#1a1a2e</color>
<color name="gradient_start">#e91e63</color>
<color name="gradient_end">#9c27b0</color>
```

### Design Principles:
1. **Glass-morphism:** Semi-transparent cards with blur background
2. **Gradients:** Pink → Purple → Orange gradients for primary elements
3. **Gold accents:** VIP badges, Level frames, Premium items
4. **Rounded corners:** 16dp for cards, 24dp for buttons
5. **Shadows:** Colored shadows (pink/purple glow) on premium elements
6. **Animations:** Smooth transitions, scale animations on tap
7. **Shimmer:** Loading skeletons with shimmer effect
8. **Typography:** Bold for headings, clean for body text

### Avatar Frame System:
- Avatar frames are SVGA/Lottie animations that wrap around user avatars
- Load frame URL from `avatar_frames.frame_url`
- Render as overlay on top of circular avatar image
- Some frames are animated (rotating, glowing, particles)

### Entry Animations:
When VIP users enter a live stream or party room:
1. Full-screen SVGA/Lottie animation plays (3-5 seconds)
2. Entry name bar shows user name with special styling
3. Vehicle animation (car/plane flies across screen)
4. Data from: `entry_effects`, `entry_name_bars`, `vehicle_entrances` tables

---

## STEP 23: APP LIFECYCLE & MISC

### Splash Screen:
- Background: #09090b
- MeriLive logo centered
- Duration: 2 seconds
- Use AndroidX SplashScreen API

### App Update Checker:
```kotlin
// Check version from Supabase
supabase.from("app_version_settings")
    .select()
    .eq("platform", "android")
    .single()
// Compare versionCode with current → show update dialog if needed
// Use Google Play In-App Update API for seamless updates
```

### Maintenance Mode:
```kotlin
supabase.from("app_settings")
    .select("setting_value")
    .eq("setting_key", "maintenance_mode")
    .single()
// If enabled → show maintenance overlay, block app usage
```

### Online Presence:
```kotlin
// Update online status when app is active
supabase.from("profiles")
    .update {
        set("is_online", true)
        set("last_seen_at", Clock.System.now().toString())
    }
    .eq("id", userId)

// Set offline when app goes to background
// Use ProcessLifecycleOwner to detect app lifecycle
```

### Deep Linking:
- Handle URLs: `merilive.com/link?type=stream&id=xxx`
- Parse link type and navigate to appropriate screen
- Types: stream, party, profile, agency, invitation

### Pull to Refresh:
- SwipeRefreshLayout on all list screens
- Refresh data from Supabase

### Network Status:
- Monitor connectivity
- Show offline banner when disconnected
- Auto-reconnect realtime subscriptions

---

## SUMMARY

This app connects to an existing Supabase backend for ALL data operations. The key technologies are:

| Component | Technology |
|-----------|-----------|
| Backend/Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth (email/password) |
| Realtime | Supabase Realtime (PostgreSQL changes) |
| File Storage | Supabase Storage + Cloudflare R2 |
| Serverless Functions | Supabase Edge Functions (68 deployed) |
| Video Streaming | LiveKit (wss://merilive.xyz) |
| Beauty Filters | DeepAR SDK |
| Push Notifications | Firebase Cloud Messaging |
| In-App Purchases | Google Play Billing |
| Video Playback | ExoPlayer |
| Animations | SVGA + Lottie |
| Image Loading | Glide |
| DI | Hilt |

**DO NOT** create any custom backend. **DO NOT** use Firebase Auth. **DO NOT** use Google Sign-In SDK. Everything runs through Supabase.
