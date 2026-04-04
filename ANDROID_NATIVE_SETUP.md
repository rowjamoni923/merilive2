# 🚀 MeriLive - Android Native Google Sign-In সম্পূর্ণ সেটআপ গাইড

এই গাইড অনুসরণ করলে Native Google Sign-In কোন ব্রাউজার ছাড়াই কাজ করবে।

---

## 📋 প্রয়োজনীয় ধাপসমূহ

### ধাপ ১: প্রজেক্ট Export ও Clone করুন

```bash
# GitHub এ Export করার পর
git clone YOUR_GITHUB_REPO_URL
cd your-project

# Dependencies ইনস্টল করুন
npm install

# Android প্ল্যাটফর্ম যোগ করুন
npx cap add android
npx cap update android
```

---

### ধাপ ২: SHA-1 Fingerprint বের করুন

**Terminal এ এই কমান্ড রান করুন:**

```bash
# Debug keystore (Development এর জন্য)
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

**Output থেকে SHA1 কপি করুন:**
```
SHA1: XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX
```

---

### ধাপ ৩: Google Cloud Console সেটআপ

1. **Google Cloud Console** এ যান: https://console.cloud.google.com/

2. **নতুন Project তৈরি করুন** বা existing project সিলেক্ট করুন

3. **APIs & Services > OAuth consent screen** এ যান:
   - User Type: External
   - App name: MeriLive
   - Support email: আপনার ইমেইল
   - Save করুন

4. **APIs & Services > Credentials** এ যান

5. **প্রথমে Web Client তৈরি করুন:**
   - Create Credentials > OAuth Client ID
   - Application type: **Web application**
   - Name: MeriLive Web Client
   - Authorized redirect URIs যোগ করুন:
     - `https://pppcwawjjpwwrmvezcdy.supabase.co/auth/v1/callback`
   - **Client ID কপি করে রাখুন** (এটাই `server_client_id`)

6. **Android Client তৈরি করুন:**
   - Create Credentials > OAuth Client ID
   - Application type: **Android**
   - Name: MeriLive Android
   - Package name: `com.merilive.app`
   - SHA-1: ধাপ ২ থেকে কপি করা SHA-1 পেস্ট করুন
   - Create ক্লিক করুন

---

### ধাপ ৪: Supabase সেটআপ

1. **Supabase Dashboard** এ যান: https://supabase.com/dashboard

2. আপনার Project > **Authentication > Providers > Google**

3. **Enable Google** অন করুন

4. নিচের তথ্য দিন:
   - **Client ID**: ধাপ ৩ এর Web Client ID
   - **Client Secret**: ধাপ ৩ এর Web Client Secret
   - **Authorized Client IDs** এ Android Client ID যোগ করুন

5. **Save** করুন

---

### ধাপ ৫: Android ফাইল আপডেট করুন

#### 5.1 AndroidManifest.xml এ Permissions যোগ করুন

ফাইল: `android/app/src/main/AndroidManifest.xml`

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- 🎥 ক্যামেরা ও মাইক্রোফোন পারমিশন (Live Stream ও Face Verification এর জন্য) -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    
    <!-- 🌐 ইন্টারনেট পারমিশন -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    
    <!-- 📍 লোকেশন পারমিশন -->
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    
    <!-- 📱 অন্যান্য পারমিশন -->
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    
    <!-- ক্যামেরা ফিচার ডিক্লেয়ার করুন (optional করা হয়েছে যাতে সব ডিভাইসে কাজ করে) -->
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
    <uses-feature android:name="android.hardware.camera.front" android:required="false" />

    <application
        ...>
        <!-- বাকি অ্যাপ্লিকেশন কনফিগ -->
    </application>
</manifest>
```

**⚠️ গুরুত্বপূর্ণ:** `<uses-feature android:required="false" />` ব্যবহার করা হয়েছে যাতে ক্যামেরা ছাড়া ডিভাইসেও অ্যাপ ইনস্টল হয়।

#### 5.2 strings.xml আপডেট করুন

ফাইল: `android/app/src/main/res/values/strings.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">MeriLive</string>
    <string name="title_activity_main">MeriLive</string>
    <string name="package_name">com.merilive.app</string>
    <string name="custom_url_scheme">com.merilive.app</string>
    
    <!-- আপনার Web Client ID এখানে দিন -->
    <string name="server_client_id">973947856306-n6kjihap25bdffjv967evtt1i7j1vs38.apps.googleusercontent.com</string>
</resources>
```

#### 5.3 MainActivity.java আপডেট করুন

ফাইল: `android/app/src/main/java/com/merilive/app/MainActivity.java`

```java
package com.merilive.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GoogleAuth.class);
        super.onCreate(savedInstanceState);
    }
}
```

#### 5.4 build.gradle আপডেট করুন

ফাইল: `android/app/build.gradle` এর dependencies ব্লকে যোগ করুন:

```gradle
dependencies {
    // ... existing dependencies ...
    
    implementation 'com.google.android.gms:play-services-auth:21.0.0'
}
```

---

### ধাপ ৬: Build ও Test করুন

```bash
# Web app build করুন
npm run build

# Android এ sync করুন
npx cap sync android

# Android Studio তে ওপেন করুন
npx cap open android
```

Android Studio তে:
1. **Build > Build Bundle(s) / APK(s) > Build APK(s)**
2. APK টেস্ট করুন

---

## ✅ সফল হলে যা হবে

- Google Sign-In বাটনে ক্লিক করলে **Native Google Dialog** দেখাবে
- কোন ব্রাউজার ওপেন হবে না
- সরাসরি অ্যাপের ভিতরেই লগইন হবে

---

## ❌ সমস্যা হলে চেক করুন

1. **SHA-1 সঠিক আছে?** - Debug/Release keystore ঠিক আছে কিনা
2. **Package name মিলছে?** - `com.merilive.app` সব জায়গায় একই হতে হবে
3. **Web Client ID দিয়েছেন?** - Android Client ID নয়, Web Client ID দিতে হবে
4. **Supabase এ Google enabled?** - Provider চালু আছে কিনা

---

## 📞 সাহায্য প্রয়োজন?

Android Studio এর Logcat এ এরর দেখুন এবং মেসেজ শেয়ার করুন।
