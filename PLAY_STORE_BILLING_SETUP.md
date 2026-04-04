# Google Play Store In-App Billing Setup Guide

এই গাইডটি আপনার MeriLive অ্যাপে Google Play In-App Purchase সেটআপ করতে সাহায্য করবে।

## 📋 প্রয়োজনীয়তা

1. Google Play Console অ্যাক্সেস
2. Android Studio
3. অ্যাপ Play Store এ পাবলিশড (বা Internal Testing এ)

---

## ধাপ ১: Play Console এ প্রোডাক্ট তৈরি করুন

### 1.1 Play Console এ লগইন করুন
- [play.google.com/console](https://play.google.com/console) এ যান
- আপনার অ্যাপ সিলেক্ট করুন

### 1.2 In-App Products তৈরি করুন
1. **Monetize** → **Products** → **In-app products** এ যান
2. **Create product** বাটনে ক্লিক করুন
3. প্রতিটি কয়েন প্যাকেজের জন্য:

| Product ID | নাম | মূল্য (USD) |
|------------|-----|-------------|
| `coins_7000` | 7,000 Diamonds | $2.49 |
| `coins_13200` | 13,200 Diamonds | $4.99 |
| `coins_26400` | 26,400 Diamonds | $9.99 |
| `coins_66000` | 66,000 Diamonds | $24.99 |
| `coins_132000` | 132,000 Diamonds | $49.99 |
| `coins_330000` | 330,000 Diamonds | $99.99 |
| `coins_660000` | 660,000 Diamonds | $199.99 |
| `coins_1320000` | 1,320,000 Diamonds | $399.99 |

4. প্রতিটি প্রোডাক্ট **Active** করুন

---

## ধাপ ২: Android Studio সেটআপ

### 2.1 build.gradle এ Billing Library যোগ করুন

`android/app/build.gradle` ফাইলে:

```gradle
dependencies {
    // ... existing dependencies
    
    // Google Play Billing
    implementation 'com.android.billingclient:billing:6.0.1'
}
```

### 2.2 Plugin রেজিস্টার করুন

`android/app/src/main/java/com/merilive/app/MainActivity.java` এ:

```java
package com.merilive.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register plugins
        registerPlugin(ScreenSecurityPlugin.class);
        registerPlugin(PlayStoreBillingPlugin.class);  // এই লাইন যোগ করুন
        
        super.onCreate(savedInstanceState);
    }
}
```

### 2.3 Plugin ফাইল কপি করুন

`android-setup/java/com/merilive/app/PlayStoreBillingPlugin.java` ফাইলটি কপি করে 
`android/app/src/main/java/com/merilive/app/` ফোল্ডারে পেস্ট করুন।

---

## ধাপ ৩: টেস্টিং

### 3.1 License Testers যোগ করুন
1. Play Console → **Settings** → **License testing**
2. আপনার টেস্ট Gmail অ্যাকাউন্ট যোগ করুন
3. সেভ করুন

### 3.2 Internal Testing ব্যবহার করুন
1. **Testing** → **Internal testing** এ যান
2. একটি রিলিজ তৈরি করুন
3. APK/AAB আপলোড করুন
4. রিলিজ করুন

### 3.3 টেস্ট করুন
- টেস্ট ডিভাইসে অ্যাপ ইনস্টল করুন
- Recharge পেজে যান
- "Play Store" অপশন দেখতে পাবেন
- পারচেজ করুন (টেস্ট মোডে টাকা কাটবে না)

---

## ধাপ ৪: Build Commands

```bash
# Dependencies ইনস্টল
npm install --legacy-peer-deps

# Build
npx vite build

# Sync to Android
npx cap sync android

# Open in Android Studio
npx cap open android
```

---

## 🔒 নিরাপত্তা নোট

- Purchase verification সার্ভার-সাইডে হয়
- Purchase token ডেটাবেসে সংরক্ষিত হয়
- Duplicate purchase চেক করা হয়

---

## ⚠️ গুরুত্বপূর্ণ

1. **Production এ যাওয়ার আগে**:
   - License testing থেকে টেস্ট অ্যাকাউন্ট সরান
   - সব প্রোডাক্ট Active আছে কিনা দেখুন

2. **বাংলাদেশ/ভারত**:
   - Play Store বিলিং সব দেশে কাজ করে
   - মূল্য স্থানীয় মুদ্রায় দেখাবে

3. **Hybrid সিস্টেম**:
   - Android: Play Store দেখাবে (প্রাথমিক) + bKash/Nagad (বিকল্প)
   - Web: শুধু bKash/Nagad দেখাবে
