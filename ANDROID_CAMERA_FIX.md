# 📷 MeriLive - ক্যামেরা ও Google Sign-In ফিক্স গাইড

এই গাইড অনুসরণ করলে ক্যামেরা এবং Google Sign-In সমস্যা সমাধান হবে।

---

## 🔧 সমস্যা ১: "Camera access failed"

### সমাধান: AndroidManifest.xml এ পারমিশন যোগ করুন

**ফাইল:** `android/app/src/main/AndroidManifest.xml`

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- ========== ক্যামেরা ও অডিও পারমিশন ========== -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    
    <!-- ========== ইন্টারনেট পারমিশন ========== -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    
    <!-- ========== লোকেশন পারমিশন ========== -->
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    
    <!-- ========== অন্যান্য পারমিশন ========== -->
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />

    <!-- ========== ক্যামেরা ফিচার (Optional) ========== -->
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.front" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true">
        
        <!-- ... বাকি অ্যাপ্লিকেশন কনফিগ ... -->
        
    </application>
</manifest>
```

### চেক করুন:
- [ ] `CAMERA` পারমিশন আছে
- [ ] `RECORD_AUDIO` পারমিশন আছে
- [ ] `uses-feature` গুলো `required="false"` আছে

---

## 🔧 সমস্যা ২: "Something went wrong" (Google Sign-In)

### সমাধান: সঠিক কনফিগারেশন নিশ্চিত করুন

#### ধাপ ১: Google Cloud Console চেক করুন

1. **Google Cloud Console** এ যান: https://console.cloud.google.com/
2. আপনার প্রজেক্ট সিলেক্ট করুন
3. **APIs & Services > Credentials** এ যান

**নিশ্চিত করুন এই দুটি Client ID আছে:**

| টাইপ | Package/Origin | SHA-1 |
|------|----------------|-------|
| **Web application** | - | - |
| **Android** | `com.merilive.app` | আপনার SHA-1 |

#### ধাপ ২: strings.xml চেক করুন

**ফাইল:** `android/app/src/main/res/values/strings.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">MeriLive</string>
    <string name="title_activity_main">MeriLive</string>
    <string name="package_name">com.merilive.app</string>
    <string name="custom_url_scheme">com.merilive.app</string>
    
    <!-- ⚠️ এটা Web Client ID হতে হবে, Android Client ID নয় -->
    <string name="server_client_id">973947856306-n6kjihap25bdffjv967evtt1i7j1vs38.apps.googleusercontent.com</string>
</resources>
```

#### ধাপ ৩: Supabase Auth চেক করুন

1. **Supabase Dashboard** এ যান: https://supabase.com/dashboard
2. **Authentication > Providers > Google** এ যান
3. নিশ্চিত করুন:
   - **Enabled** ✅
   - **Client ID** = Web Client ID
   - **Client Secret** = Web Client Secret
   - **Authorized Client IDs** এ Android Client ID আছে

#### ধাপ ৪: MainActivity.java চেক করুন

**ফাইল:** `android/app/src/main/java/com/merilive/app/MainActivity.java`

```java
package com.merilive.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // ⚠️ GoogleAuth.class registerPlugin অবশ্যই থাকতে হবে
        registerPlugin(GoogleAuth.class);
        super.onCreate(savedInstanceState);
    }
}
```

#### ধাপ ৫: build.gradle চেক করুন

**ফাইল:** `android/app/build.gradle`

```gradle
dependencies {
    // ... other dependencies ...
    
    // Google Play Services Auth - অবশ্যই থাকতে হবে
    implementation 'com.google.android.gms:play-services-auth:21.0.0'
}
```

---

## 🚀 নতুন APK বিল্ড করুন

সব পরিবর্তন করার পর:

```bash
# ১. লেটেস্ট কোড আনুন
git pull

# ২. বিল্ড করুন
npm run build

# ৩. Android এ Sync করুন
npx cap sync android

# ৪. Android Studio তে ওপেন করুন
npx cap open android
```

**Android Studio তে:**
1. **Build > Clean Project**
2. **Build > Rebuild Project**
3. **Build > Generate Signed Bundle / APK**

---

## ✅ টেস্ট চেকলিস্ট

নতুন APK ইনস্টল করার পর:

### ক্যামেরা টেস্ট:
- [ ] Face Verification ওপেন করুন
- [ ] "Start Camera" বাটনে ক্লিক করুন
- [ ] Android পারমিশন ডায়ালগ আসবে
- [ ] "Allow" দিন
- [ ] ক্যামেরা দেখা যাচ্ছে

### Google Sign-In টেস্ট:
- [ ] Auth পেজে যান
- [ ] "Google" বাটনে ক্লিক করুন
- [ ] Google অ্যাকাউন্ট সিলেক্টর আসবে
- [ ] অ্যাকাউন্ট সিলেক্ট করুন
- [ ] লগইন সফল

---

## ❓ এখনও সমস্যা হলে

### Logcat দেখুন:

Android Studio তে:
1. **View > Tool Windows > Logcat**
2. Filter: `GoogleAuth` বা `Camera`
3. এরর মেসেজ দেখুন এবং শেয়ার করুন

### সাধারণ সমস্যা:

| এরর | সমাধান |
|-----|--------|
| `SIGN_IN_CANCELLED` | ব্যবহারকারী বাতিল করেছে |
| `DEVELOPER_ERROR` | SHA-1 বা Package name ভুল |
| `NETWORK_ERROR` | ইন্টারনেট সংযোগ চেক করুন |
| `NotAllowedError` | পারমিশন দেওয়া হয়নি |
| `NotFoundError` | ক্যামেরা নেই |
