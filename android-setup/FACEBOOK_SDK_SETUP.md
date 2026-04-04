# Facebook SDK সেটআপ গাইড (Native Android)

Facebook App ID: `26549403151321096`

## এই SDK দিয়ে যা যা হবে:
✅ App Install Tracking (কতজন Facebook Ad থেকে ইনস্টল করেছে)  
✅ App Events / Analytics (Registration, Purchase ইত্যাদি ট্র্যাক)  
✅ Deep Linking (Facebook Ad ক্লিক করে সরাসরি নির্দিষ্ট পেজে যাওয়া)  
✅ Facebook Share (অ্যাপ থেকে কনটেন্ট শেয়ার)  

---

## Step 1: build.gradle (app-level) এ Facebook SDK যোগ করুন

`android/app/build.gradle` ফাইলে:

```gradle
dependencies {
    // ... existing dependencies ...
    
    // Facebook SDK
    implementation 'com.facebook.android:facebook-android-sdk:17.0.1'
}
```

## Step 2: strings.xml এ Facebook App ID যোগ করুন

`android/app/src/main/res/values/strings.xml` ফাইলে যোগ করুন:

```xml
<resources>
    <!-- ... existing strings ... -->
    
    <!-- Facebook SDK Configuration -->
    <string name="facebook_app_id">26549403151321096</string>
    <string name="facebook_client_token">YOUR_CLIENT_TOKEN_HERE</string>
    <string name="fb_login_protocol_scheme">fb26549403151321096</string>
</resources>
```

### Client Token কোথায় পাবেন:
1. [Facebook Developer Console](https://developers.facebook.com) → MeriLive অ্যাপ
2. **App settings** → **Advanced**
3. **Client Token** কপি করুন

## Step 3: AndroidManifest.xml আপডেট করুন

`android/app/src/main/AndroidManifest.xml` এ `<application>` ট্যাগের ভিতরে যোগ করুন:

```xml
<application>
    <!-- ... existing content ... -->
    
    <!-- Facebook SDK Meta Data -->
    <meta-data
        android:name="com.facebook.sdk.ApplicationId"
        android:value="@string/facebook_app_id" />
    <meta-data
        android:name="com.facebook.sdk.ClientToken"
        android:value="@string/facebook_client_token" />
    
    <!-- Facebook Content Provider (for Share) -->
    <provider
        android:name="com.facebook.FacebookContentProvider"
        android:authorities="com.facebook.app.FacebookContentProvider26549403151321096"
        android:exported="true" />
    
    <!-- Facebook Deferred Deep Link Activity -->
    <activity
        android:name="com.facebook.CustomTabActivity"
        android:exported="true">
        <intent-filter>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="@string/fb_login_protocol_scheme" />
        </intent-filter>
    </activity>
</application>

<!-- Internet Permission (সাধারণত আগে থেকেই থাকে) -->
<uses-permission android:name="android.permission.INTERNET" />
<!-- Ad ID Permission for better tracking -->
<uses-permission android:name="com.google.android.gms.permission.AD_ID" />
```

## Step 4: Application Class এ Facebook SDK Initialize করুন

আপনার `Application` ক্লাসে (যেমন: `MeriLiveApp.kt`):

```kotlin
import com.facebook.FacebookSdk
import com.facebook.appevents.AppEventsLogger

@HiltAndroidApp
class MeriLiveApp : Application() {
    override fun onCreate() {
        super.onCreate()
        
        // Initialize Facebook SDK
        FacebookSdk.sdkInitialize(applicationContext)
        AppEventsLogger.activateApp(this)
    }
}
```

## Step 5: App Events ট্র্যাক করুন (Analytics)

যেকোনো Activity/Fragment থেকে ইভেন্ট পাঠান:

```kotlin
import com.facebook.appevents.AppEventsLogger
import com.facebook.appevents.AppEventsConstants
import android.os.Bundle

// Logger instance
val logger = AppEventsLogger.newLogger(context)

// Registration Complete
logger.logEvent(AppEventsConstants.EVENT_NAME_COMPLETED_REGISTRATION, Bundle().apply {
    putString(AppEventsConstants.EVENT_PARAM_REGISTRATION_METHOD, "phone")
})

// Purchase/Recharge
logger.logEvent(AppEventsConstants.EVENT_NAME_PURCHASED, 9.99, Currency.getInstance("USD"), Bundle().apply {
    putString(AppEventsConstants.EVENT_PARAM_CONTENT_TYPE, "coins")
    putString(AppEventsConstants.EVENT_PARAM_CONTENT_ID, "coin_pack_100")
})

// Custom Event (e.g., Go Live)
logger.logEvent("go_live_started", Bundle().apply {
    putString("stream_type", "video")
})

// App Open (auto-tracked, but can also manually call)
logger.logEvent(AppEventsConstants.EVENT_NAME_ACTIVATED_APP)
```

## Step 6: Facebook Share ইমপ্লিমেন্ট করুন

```kotlin
import com.facebook.share.model.ShareLinkContent
import com.facebook.share.widget.ShareDialog
import android.net.Uri

// Share a link
val content = ShareLinkContent.Builder()
    .setContentUrl(Uri.parse("https://merilive.com"))
    .setQuote("Check out MeriLive! 🎉")
    .build()

ShareDialog.show(activity, content)
```

## Step 7: Deep Linking সেটআপ

### Facebook Developer Console এ:
1. **App settings** → **Basic**
2. নিচে **"Add Platform"** → **"Android"** সিলেক্ট
3. **Package Name**: `com.merilive.app`
4. **Class Name**: `com.merilive.app.MainActivity`
5. **Key Hashes** যোগ করুন:

```bash
# Debug key hash
keytool -exportcert -alias androiddebugkey -keystore ~/.android/debug.keystore | openssl sha1 -binary | openssl base64

# Release key hash  
keytool -exportcert -alias your-alias -keystore your-release-key.keystore | openssl sha1 -binary | openssl base64
```

### কোডে Deep Link হ্যান্ডেল করুন:

```kotlin
import com.facebook.applinks.AppLinkData

// onCreate() এ
AppLinkData.fetchDeferredAppLinkData(this) { appLinkData ->
    appLinkData?.targetUri?.let { uri ->
        // Handle the deep link
        // e.g., navigate to specific screen based on URI
        Log.d("DeepLink", "Facebook deep link: $uri")
    }
}
```

## Step 8: Facebook Developer Console এ Android Platform যোগ করুন

1. [Facebook Developer Console](https://developers.facebook.com) → MeriLive
2. **App settings** → **Basic** → নিচে স্ক্রল
3. **"Add Platform"** ক্লিক → **"Android"** সিলেক্ট
4. ফিল্ডগুলো পূরণ করুন:
   - **Google Play Package Name**: `com.merilive.app`
   - **Class Name**: `com.merilive.app.MainActivity`
   - **Key Hashes**: উপরের কমান্ড থেকে পাওয়া hash পেস্ট করুন
5. **Save Changes**

---

## টেস্টিং

```bash
# Build
./gradlew assembleDebug

# Install & Run
adb install app/build/outputs/apk/debug/app-debug.apk
```

Facebook Events Dashboard এ চেক করুন:
**Facebook Developer Console** → **App events** → **Event Manager**

## ⚠️ গুরুত্বপূর্ণ

- App টি **Published** (Live) মোডে থাকতে হবে Facebook এ
- **Client Token** অবশ্যই strings.xml এ সঠিকভাবে বসাতে হবে
- Google Play-তে **Data Safety** সেকশনে Facebook SDK এর ডাটা কালেকশন ডিক্লেয়ার করতে হবে
