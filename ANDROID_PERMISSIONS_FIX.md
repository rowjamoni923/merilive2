# 🔐 MeriLive - Android Permissions Fix (সম্পূর্ণ গাইড)

## ❌ সমস্যা

স্ক্রিনশটে দেখা যাচ্ছে: **"No permissions allowed"**

এর মানে হলো Android অ্যাপে Camera, Microphone, Location পারমিশনগুলো ডিক্লেয়ার করা হয়নি।

---

## ✅ সমাধান

### ধাপ ১: প্রজেক্ট Export করুন

1. Lovable থেকে **"Export to GitHub"** করুন
2. আপনার কম্পিউটারে `git clone` করুন
3. `npm install` রান করুন
4. `npm run build` রান করুন
5. `npx cap sync android` রান করুন
6. `npx cap open android` দিয়ে Android Studio খুলুন

---

### ধাপ ২: AndroidManifest.xml এডিট করুন

**ফাইল লোকেশন:** `android/app/src/main/AndroidManifest.xml`

**নিচের সম্পূর্ণ কোড দিয়ে রিপ্লেস করুন:**

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- ==================== ক্যামেরা পারমিশন ==================== -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.front" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />

    <!-- ==================== অডিও/মাইক্রোফোন পারমিশন ==================== -->
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />

    <!-- ==================== লোকেশন পারমিশন ==================== -->
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-feature android:name="android.hardware.location.gps" android:required="false" />

    <!-- ==================== ইন্টারনেট পারমিশন ==================== -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />

    <!-- ==================== স্টোরেজ পারমিশন ==================== -->
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />

    <!-- ==================== নোটিফিকেশন পারমিশন ==================== -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />

    <!-- ==================== ফোরগ্রাউন্ড সার্ভিস (লাইভ/কল) ==================== -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_CAMERA" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />

    <!-- ==================== অন্যান্য পারমিশন ==================== -->
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true"
        android:hardwareAccelerated="true"
        android:largeHeap="true"
        android:requestLegacyExternalStorage="true">

        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:exported="true"
            android:launchMode="singleTask"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:screenOrientation="portrait">
            
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!-- Deep Links -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="merilive" />
            </intent-filter>

        </activity>

        <!-- ফায়ারবেস মেসেজিং সার্ভিস -->
        <service
            android:name="com.google.firebase.messaging.FirebaseMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>

        <!-- ক্যামেরা প্রোভাইডার -->
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>

    </application>

</manifest>
```

---

### ধাপ ৩: file_paths.xml তৈরি করুন

**ফাইল লোকেশন:** `android/app/src/main/res/xml/file_paths.xml`

যদি `xml` ফোল্ডার না থাকে, তৈরি করুন।

```xml
<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="my_images" path="." />
    <cache-path name="my_cache_images" path="." />
    <files-path name="my_files" path="." />
    <external-files-path name="my_external_files" path="." />
</paths>
```

---

### ধাপ ৪: MainActivity.java আপডেট করুন

**ফাইল লোকেশন:** `android/app/src/main/java/com/merilive/app/MainActivity.java`

```java
package com.merilive.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// Capacitor Plugins
import com.codetrix.googleauth.GoogleAuth;
import com.getcapacitor.plugin.Camera;
import com.getcapacitor.community.facebooklogin.FacebookLogin;

public class MainActivity extends BridgeActivity {
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register plugins
        registerPlugin(GoogleAuth.class);
        registerPlugin(Camera.class);
        
        super.onCreate(savedInstanceState);
    }
}
```

---

### ধাপ ৫: build.gradle এ ডিপেন্ডেন্সি যোগ করুন

**ফাইল লোকেশন:** `android/app/build.gradle`

`dependencies` ব্লকে যোগ করুন:

```gradle
dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
    implementation "androidx.coordinatorlayout:coordinatorlayout:$androidxCoordinatorLayoutVersion"
    implementation "androidx.core:core-splashscreen:$coreSplashScreenVersion"
    
    // Google Play Services
    implementation 'com.google.android.gms:play-services-auth:21.0.0'
    implementation 'com.google.android.gms:play-services-location:21.0.1'
    
    // Camera & Media
    implementation 'androidx.camera:camera-core:1.3.1'
    implementation 'androidx.camera:camera-camera2:1.3.1'
    implementation 'androidx.camera:camera-lifecycle:1.3.1'
    implementation 'androidx.camera:camera-view:1.3.1'
    
    // WebRTC (for live streaming)
    implementation 'io.agora.rtc:full-sdk:4.2.2'
    
    testImplementation "junit:junit:$junitVersion"
    androidTestImplementation "androidx.test.ext:junit:$androidxJunitVersion"
    androidTestImplementation "androidx.test.espresso:espresso-core:$androidxEspressoCoreVersion"
}
```

---

### ধাপ ৬: APK বিল্ড করুন

```bash
# Android Studio তে:
# 1. Build > Clean Project
# 2. Build > Rebuild Project
# 3. Build > Generate Signed Bundle / APK > APK
# 4. Release APK সিলেক্ট করুন
# 5. Sign করুন এবং Build করুন
```

---

## 🔍 ফলাফল যাচাই করুন

নতুন APK ইনস্টল করার পর Settings > Apps > MeriLive > Permissions এ যান।

আপনি দেখতে পাবেন:

✅ **Camera** - ক্যামেরা অ্যাক্সেস
✅ **Microphone** - মাইক্রোফোন অ্যাক্সেস  
✅ **Location** - লোকেশন অ্যাক্সেস
✅ **Storage** - ফাইল স্টোরেজ অ্যাক্সেস
✅ **Notifications** - নোটিফিকেশন

---

## ⚠️ গুরুত্বপূর্ণ নোট

### কেন এই সমস্যা হয়?

Capacitor অ্যাপে:
1. **Permissions Manifest এ লাগে** - না থাকলে Android সেটিংসে দেখায় না
2. **Runtime Permission ও লাগে** - অ্যাপ প্রথমবার চালু করলে পপআপ আসবে

### Target SDK Version

`android/variables.gradle` এ চেক করুন:

```gradle
ext {
    minSdkVersion = 22
    targetSdkVersion = 34  // Android 14
    compileSdkVersion = 34
}
```

---

## 📱 টেস্ট চেকলিস্ট

| পারমিশন | টেস্ট |
|---------|-------|
| Camera | Go Live চালু করুন |
| Microphone | Voice message পাঠান |
| Location | Home পেজে লোকেশন দেখুন |
| Storage | Profile photo আপলোড করুন |
| Notifications | Push notification পান |

---

## 🆘 সমস্যা হলে

1. **Clean Build করুন:** `Build > Clean Project`
2. **Cache মুছুন:** `File > Invalidate Caches`
3. **Gradle Sync করুন:** `File > Sync Project with Gradle Files`
4. **পুরানো APK Uninstall করুন** তারপর নতুন APK Install করুন

---

**এই গাইড ফলো করলে আপনার অ্যাপে সব পারমিশন সঠিকভাবে দেখাবে! 🎉**
