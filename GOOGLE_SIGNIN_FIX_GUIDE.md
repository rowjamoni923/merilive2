# Google Sign-In "Something went wrong" (Error 10) ফিক্স গাইড

## সমস্যার কারণ
"Something went wrong" বা Error 10 সাধারণত **SHA-1 fingerprint mismatch** এর কারণে হয়। এটি ঘটে যখন:
1. APK এর signing key এর SHA-1 Google Cloud Console-এ নিবন্ধিত SHA-1 এর সাথে মিলে না
2. Debug এবং Release keystore আলাদা হয়
3. `google-services.json` ফাইল নেই

---

## ধাপ ১: বর্তমান APK এর SHA-1 বের করুন

**Debug Keystore (ডেভেলপমেন্ট):**
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

**Windows এ:**
```bash
keytool -list -v -keystore C:\Users\YOUR_USERNAME\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android
```

**Release/Production Keystore:**
```bash
keytool -list -v -keystore your-release-key.keystore -alias your-alias
```

📝 **SHA1 ফিঙ্গারপ্রিন্ট কপি করুন** (যেমন: `B7:91:EE:07:CB:37:50:CC:...`)

---

## ধাপ ২: Google Cloud Console এ OAuth Client আপডেট করুন

1. [Google Cloud Console](https://console.cloud.google.com/) এ যান
2. আপনার প্রজেক্ট সিলেক্ট করুন
3. **APIs & Services → Credentials** এ যান
4. **OAuth 2.0 Client IDs** সেকশনে আপনার **Android** client খুঁজুন
5. যদি না থাকে, **Create Credentials → OAuth client ID → Android** সিলেক্ট করুন
6. নিচের তথ্য দিন:
   - **Package name:** `com.merilive.app`
   - **SHA-1 certificate fingerprint:** ধাপ ১ থেকে পাওয়া SHA-1

⚠️ **গুরুত্বপূর্ণ:** প্রতিটা আলাদা keystore এর জন্য আলাদা Android OAuth Client তৈরি করুন (debug এবং release)

---

## ধাপ ৩: `google-services.json` ফাইল ডাউনলোড করুন (ঐচ্ছিক কিন্তু সুপারিশকৃত)

1. [Firebase Console](https://console.firebase.google.com/) এ যান
2. একটি প্রজেক্ট তৈরি করুন বা বিদ্যমান একটি ব্যবহার করুন
3. Android app যোগ করুন:
   - Package name: `com.merilive.app`
   - SHA-1: ধাপ ১ থেকে পাওয়া fingerprint
4. `google-services.json` ডাউনলোড করুন
5. এই ফাইলটি `android/app/` ফোল্ডারে রাখুন

---

## ধাপ ৪: Supabase Dashboard চেক করুন

1. [Supabase Dashboard](https://supabase.com/dashboard) এ যান
2. **Authentication → Providers → Google** এ যান
3. নিশ্চিত করুন:
   - **Client ID:** আপনার **Web Client ID** (`.apps.googleusercontent.com` দিয়ে শেষ)
   - **Client Secret:** আপনার Web client এর secret
   - **Authorized Client IDs:** আপনার **Android Client ID** এখানে যোগ করুন

---

## ধাপ ৫: Android ফাইলগুলো যাচাই করুন

### `android/app/src/main/res/values/strings.xml`
```xml
<string name="server_client_id">973947856306-n6kjihap25bdffjv967evtt1i7j1vs38.apps.googleusercontent.com</string>
```
✅ এটি **Web Client ID** হতে হবে (Android Client ID নয়!)

### `android/app/src/main/java/.../MainActivity.java`
```java
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GoogleAuth.class); // ← এটি super.onCreate() এর আগে হতে হবে
        super.onCreate(savedInstanceState);
    }
}
```

### `android/app/build.gradle`
```gradle
dependencies {
    implementation 'com.google.android.gms:play-services-auth:21.0.0'
}
```

---

## ধাপ ৬: নতুন APK বিল্ড করুন

```bash
# প্রজেক্ট বিল্ড করুন
npm run build

# Android এ sync করুন
npx cap sync android

# Android Studio তে খুলুন
npx cap open android
```

Android Studio তে:
1. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. নতুন APK ইনস্টল করুন

---

## সাধারণ সমস্যা ও সমাধান

### সমস্যা ১: "Error 10: DEVELOPER_ERROR"
**কারণ:** SHA-1 mismatch
**সমাধান:** 
- নিশ্চিত করুন যে সঠিক keystore এর SHA-1 Google Cloud Console এ নিবন্ধিত
- Debug এবং Release keystore দুটোই নিবন্ধন করুন

### সমস্যা ২: "Error 12501: User cancelled"
**কারণ:** ইউজার সাইন ইন বাতিল করেছে
**সমাধান:** কোন কোড পরিবর্তন দরকার নেই

### সমস্যা ৩: "Network Error"
**কারণ:** ইন্টারনেট সংযোগ সমস্যা
**সমাধান:** ইন্টারনেট চেক করুন

### সমস্যা ৪: "Configuration Error"
**কারণ:** Plugin সঠিকভাবে কনফিগার হয়নি
**সমাধান:** 
- `MainActivity.java` এ plugin registration চেক করুন
- `capacitor.config.ts` এ `serverClientId` চেক করুন

---

## চেকলিস্ট ✅

- [ ] Debug keystore এর SHA-1 Google Cloud Console এ আছে
- [ ] Release keystore এর SHA-1 Google Cloud Console এ আছে
- [ ] Web Client ID সব জায়গায় সঠিক (strings.xml, capacitor.config.ts)
- [ ] Android Client ID Supabase এর "Authorized Client IDs" এ আছে
- [ ] MainActivity.java তে GoogleAuth.class রেজিস্টার করা হয়েছে
- [ ] build.gradle এ play-services-auth dependency আছে
- [ ] google-services.json ফাইল android/app/ এ আছে (optional)

---

## টেস্টিং

APK ইনস্টল করার পর:
1. অ্যাপ খুলুন
2. "Google" বাটনে ট্যাপ করুন
3. Google Account সিলেক্ট করুন
4. সফলভাবে লগইন হওয়া উচিত ✅

যদি এখনও সমস্যা হয়, Android Studio এর **Logcat** দেখুন এবং "GoogleAuth" বা "signIn" সার্চ করুন।
