# Native Google Sign-In সেটআপ গাইড

এই অ্যাপ **Native Google Sign-In SDK** ব্যবহার করে যা কোন ব্রাউজার ছাড়াই কাজ করে। সবকিছু অ্যাপের ভিতরেই হয়।

## Android সেটআপ (প্রয়োজনীয়)

### Step 1: Google Cloud Console এ OAuth Client তৈরি করুন

1. [Google Cloud Console](https://console.cloud.google.com/) এ যান
2. আপনার প্রজেক্ট সিলেক্ট করুন
3. **APIs & Services > Credentials** এ যান
4. **Create Credentials > OAuth Client ID** ক্লিক করুন
5. **Android** সিলেক্ট করুন
6. নিচের তথ্য দিন:
   - **Package name**: `com.merilive.app`
   - **SHA-1 Certificate fingerprint**: নিচের কমান্ড দিয়ে পান:

```bash
# Debug keystore এর জন্য
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

# Release/Production keystore এর জন্য
keytool -list -v -keystore your-release-key.keystore -alias your-alias
```

### Step 2: strings.xml এ Client ID যোগ করুন

`android/app/src/main/res/values/strings.xml` ফাইলে:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">MeriLive</string>
    <string name="title_activity_main">MeriLive</string>
    <string name="package_name">com.merilive.app</string>
    <string name="custom_url_scheme">com.merilive.app</string>
    
    <!-- Google Sign-In Web Client ID (from Google Cloud Console) -->
    <string name="server_client_id">YOUR_WEB_CLIENT_ID.apps.googleusercontent.com</string>
</resources>
```

### Step 3: AndroidManifest.xml আপডেট করুন

`android/app/src/main/AndroidManifest.xml` এ যোগ করুন:

```xml
<application>
    <!-- ... existing code ... -->
    
    <!-- Google Sign-In Activity -->
    <activity
        android:name="com.google.android.gms.auth.api.signin.internal.SignInHubActivity"
        android:exported="true"
        android:screenOrientation="portrait"
        tools:replace="android:screenOrientation" />
</application>
```

### Step 4: build.gradle আপডেট করুন

`android/app/build.gradle` এ dependency যোগ করুন:

```gradle
dependencies {
    // ... existing dependencies ...
    
    // Google Sign-In SDK (for native auth)
    implementation 'com.google.android.gms:play-services-auth:21.0.0'
}
```

### Step 5: Capacitor Plugin রেজিস্টার করুন

`android/app/src/main/java/.../MainActivity.java` এ:

```java
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Register Google Auth plugin
        registerPlugin(GoogleAuth.class);
    }
}
```

## Supabase সেটিংস

Supabase Dashboard এ যান:
1. **Authentication > Providers > Google** 
2. **Web Client ID** এবং **Web Client Secret** যোগ করুন
3. **Authorized Client IDs** এ আপনার Android Client ID যোগ করুন

## টেস্টিং

```bash
# Build
npm run build

# Sync
npx cap sync android

# Android Studio তে Run করুন
npx cap open android
```

## কীভাবে কাজ করে?

1. ইউজার "Google দিয়ে লগইন" বাটনে চাপলে **Native Google Sign-In Dialog** খুলবে
2. এই Dialog সম্পূর্ণ **অ্যাপের ভিতরেই** থাকে, কোন ব্রাউজার খোলে না
3. ইউজার তার Google Account সিলেক্ট করে
4. অ্যাপ ID Token পেয়ে Supabase এ পাঠায়
5. Supabase সেশন তৈরি করে এবং ইউজার লগইন হয়ে যায়

## সুবিধাসমূহ

✅ কোন ব্রাউজার খোলে না  
✅ সম্পূর্ণ নেটিভ অভিজ্ঞতা  
✅ দ্রুত এবং নিরাপদ  
✅ ইউজারের পরিচিত Google UI  
