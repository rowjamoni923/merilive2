# 📱 MeriLive Android Studio V8 Complete Setup Guide

## 🎯 Version Information
- **Version Name**: 8.0.0
- **Version Code**: 8
- **Package Name**: com.merilive.app

---

## 📁 Project Structure

```
android/
├── app/
│   ├── src/
│   │   └── main/
│   │       ├── java/com/merilive/app/
│   │       │   ├── MainActivity.java
│   │       │   ├── PlayStoreBillingPlugin.java
│   │       │   └── ScreenSecurityPlugin.java
│   │       ├── res/
│   │       │   └── values/
│   │       │       └── strings.xml
│   │       └── AndroidManifest.xml
│   └── build.gradle
├── build.gradle
├── gradle.properties
└── settings.gradle
```

---

## 🔧 Step 1: Project থেকে Code Pull করুন

```bash
# GitHub থেকে project clone করুন
git clone https://github.com/YOUR_USERNAME/merilive.git
cd merilive

# Dependencies install করুন
npm install --legacy-peer-deps

# Android platform add করুন (যদি না থাকে)
npx cap add android

# Build করুন
npm run build

# Android sync করুন
npx cap sync android

# Android Studio তে open করুন
npx cap open android
```

---

## 📄 Step 2: build.gradle (app-level) - `android/app/build.gradle`

```gradle
apply plugin: 'com.android.application'

android {
    // ⚠️ CRITICAL: AGP 8.0+ এ namespace বাধ্যতামূলক
    namespace "com.merilive.app"
    compileSdkVersion rootProject.ext.compileSdkVersion
    
    defaultConfig {
        applicationId "com.merilive.app"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        
        // ✅ VERSION 8 - Update these values
        versionCode 8
        versionName "8.0.0"
        
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
    }
    
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
    
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

repositories {
    flatDir {
        dirs '../capacitor-cordova-android-plugins/src/main/libs', 'libs'
    }
}

dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
    implementation "androidx.coordinatorlayout:coordinatorlayout:$androidxCoordinatorLayoutVersion"
    implementation "androidx.core:core-splashscreen:$coreSplashScreenVersion"
    implementation project(':capacitor-android')
    
    // Google Play In-App Update (REQUIRED for auto-update feature)
    implementation 'com.google.android.play:app-update:2.1.0'
    
    // Google Play Billing (for in-app purchases)
    implementation 'com.android.billingclient:billing:6.1.0'
    
    // Google Sign-In SDK
    implementation 'com.google.android.gms:play-services-auth:21.0.0'
    
    testImplementation "junit:junit:$junitVersion"
    androidTestImplementation "androidx.test.ext:junit:$androidxJunitVersion"
    androidTestImplementation "androidx.test.espresso:espresso-core:$androidxEspressoCoreVersion"
    implementation project(':capacitor-cordova-android-plugins')
}

apply from: 'capacitor.build.gradle'
```

---

## 📄 Step 3: MainActivity.java

Path: `android/app/src/main/java/com/merilive/app/MainActivity.java`

```java
package com.merilive.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// Google Auth Plugin Import
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register Google Auth Plugin BEFORE super.onCreate()
        registerPlugin(GoogleAuth.class);
        
        super.onCreate(savedInstanceState);
    }
}
```

---

## 📄 Step 4: PlayStoreBillingPlugin.java

Path: `android/app/src/main/java/com/merilive/app/PlayStoreBillingPlugin.java`

```java
package com.merilive.app;

import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.android.billingclient.api.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "PlayStoreBilling")
public class PlayStoreBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private static final String TAG = "PlayStoreBilling";
    private BillingClient billingClient;
    private PluginCall pendingPurchaseCall;

    @Override
    public void load() {
        super.load();
        Log.d(TAG, "PlayStoreBillingPlugin loaded");
    }

    @PluginMethod
    public void initialize(PluginCall call) {
        try {
            billingClient = BillingClient.newBuilder(getContext())
                    .setListener(this)
                    .enablePendingPurchases()
                    .build();

            billingClient.startConnection(new BillingClientStateListener() {
                @Override
                public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        Log.d(TAG, "Billing client connected successfully");
                        JSObject result = new JSObject();
                        result.put("success", true);
                        call.resolve(result);
                    } else {
                        Log.e(TAG, "Billing setup failed: " + billingResult.getDebugMessage());
                        call.reject("Billing setup failed: " + billingResult.getDebugMessage());
                    }
                }

                @Override
                public void onBillingServiceDisconnected() {
                    Log.w(TAG, "Billing service disconnected");
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Initialize error", e);
            call.reject("Initialize error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        if (billingClient == null || !billingClient.isReady()) {
            call.reject("Billing client not ready");
            return;
        }

        try {
            JSArray productIdsArray = call.getArray("productIds");
            List<String> productIds = new ArrayList<>();
            for (int i = 0; i < productIdsArray.length(); i++) {
                productIds.add(productIdsArray.getString(i));
            }

            List<QueryProductDetailsParams.Product> productList = new ArrayList<>();
            for (String productId : productIds) {
                productList.add(
                        QueryProductDetailsParams.Product.newBuilder()
                                .setProductId(productId)
                                .setProductType(BillingClient.ProductType.INAPP)
                                .build()
                );
            }

            QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                    .setProductList(productList)
                    .build();

            billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsList) -> {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    JSObject result = new JSObject();
                    JSONArray products = new JSONArray();

                    for (ProductDetails details : productDetailsList) {
                        try {
                            JSONObject product = new JSONObject();
                            product.put("productId", details.getProductId());
                            product.put("title", details.getTitle());
                            product.put("description", details.getDescription());

                            ProductDetails.OneTimePurchaseOfferDetails offerDetails = 
                                    details.getOneTimePurchaseOfferDetails();
                            if (offerDetails != null) {
                                product.put("price", offerDetails.getFormattedPrice());
                                product.put("priceAmountMicros", offerDetails.getPriceAmountMicros());
                                product.put("priceCurrencyCode", offerDetails.getPriceCurrencyCode());
                            }

                            products.put(product);
                        } catch (JSONException e) {
                            Log.e(TAG, "JSON error", e);
                        }
                    }

                    result.put("products", products);
                    call.resolve(result);
                } else {
                    call.reject("Failed to get products: " + billingResult.getDebugMessage());
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "getProducts error", e);
            call.reject("getProducts error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        if (billingClient == null || !billingClient.isReady()) {
            call.reject("Billing client not ready");
            return;
        }

        String productId = call.getString("productId");
        if (productId == null || productId.isEmpty()) {
            call.reject("Product ID is required");
            return;
        }

        pendingPurchaseCall = call;

        List<QueryProductDetailsParams.Product> productList = new ArrayList<>();
        productList.add(
                QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(productId)
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build()
        );

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(productList)
                .build();

        billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsList) -> {
            if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK 
                    && !productDetailsList.isEmpty()) {
                
                ProductDetails productDetails = productDetailsList.get(0);
                
                List<BillingFlowParams.ProductDetailsParams> productDetailsParamsList = new ArrayList<>();
                productDetailsParamsList.add(
                        BillingFlowParams.ProductDetailsParams.newBuilder()
                                .setProductDetails(productDetails)
                                .build()
                );

                BillingFlowParams billingFlowParams = BillingFlowParams.newBuilder()
                        .setProductDetailsParamsList(productDetailsParamsList)
                        .build();

                billingClient.launchBillingFlow(getActivity(), billingFlowParams);
            } else {
                pendingPurchaseCall = null;
                call.reject("Product not found: " + productId);
            }
        });
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult billingResult, 
                                   @Nullable List<Purchase> purchases) {
        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK 
                && purchases != null) {
            
            for (Purchase purchase : purchases) {
                handlePurchase(purchase);
            }
        } else if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            if (pendingPurchaseCall != null) {
                pendingPurchaseCall.reject("Purchase cancelled by user");
                pendingPurchaseCall = null;
            }
        } else {
            if (pendingPurchaseCall != null) {
                pendingPurchaseCall.reject("Purchase failed: " + billingResult.getDebugMessage());
                pendingPurchaseCall = null;
            }
        }
    }

    private void handlePurchase(Purchase purchase) {
        if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
            if (!purchase.isAcknowledged()) {
                AcknowledgePurchaseParams acknowledgePurchaseParams =
                        AcknowledgePurchaseParams.newBuilder()
                                .setPurchaseToken(purchase.getPurchaseToken())
                                .build();

                billingClient.acknowledgePurchase(acknowledgePurchaseParams, billingResult -> {
                    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        resolvePurchase(purchase);
                    } else {
                        if (pendingPurchaseCall != null) {
                            pendingPurchaseCall.reject("Failed to acknowledge purchase");
                            pendingPurchaseCall = null;
                        }
                    }
                });
            } else {
                resolvePurchase(purchase);
            }
        }
    }

    private void resolvePurchase(Purchase purchase) {
        if (pendingPurchaseCall != null) {
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("orderId", purchase.getOrderId());
            result.put("purchaseToken", purchase.getPurchaseToken());
            result.put("productId", purchase.getProducts().get(0));
            pendingPurchaseCall.resolve(result);
            pendingPurchaseCall = null;
        }
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        if (billingClient == null || !billingClient.isReady()) {
            call.reject("Billing client not ready");
            return;
        }

        billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build(),
                (billingResult, purchasesList) -> {
                    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        JSObject result = new JSObject();
                        JSONArray purchases = new JSONArray();

                        for (Purchase purchase : purchasesList) {
                            try {
                                JSONObject p = new JSONObject();
                                p.put("orderId", purchase.getOrderId());
                                p.put("purchaseToken", purchase.getPurchaseToken());
                                p.put("productId", purchase.getProducts().get(0));
                                purchases.put(p);
                            } catch (JSONException e) {
                                Log.e(TAG, "JSON error", e);
                            }
                        }

                        result.put("purchases", purchases);
                        call.resolve(result);
                    } else {
                        call.reject("Failed to restore purchases");
                    }
                }
        );
    }
}
```

---

## 📄 Step 5: ScreenSecurityPlugin.java

Path: `android/app/src/main/java/com/merilive/app/ScreenSecurityPlugin.java`

```java
package com.merilive.app;

import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * ScreenSecurityPlugin - Prevents screenshots and screen recording
 * Uses Android's FLAG_SECURE window flag
 */
@CapacitorPlugin(name = "ScreenSecurity")
public class ScreenSecurityPlugin extends Plugin {
    private boolean isSecure = false;

    /**
     * Enable secure mode - prevents screenshots and screen recording
     */
    @PluginMethod
    public void enableSecureMode(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().getWindow().setFlags(
                    WindowManager.LayoutParams.FLAG_SECURE,
                    WindowManager.LayoutParams.FLAG_SECURE
                );
                isSecure = true;
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to enable secure mode", e);
            }
        });
    }

    /**
     * Disable secure mode - allows screenshots and screen recording
     */
    @PluginMethod
    public void disableSecureMode(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().getWindow().clearFlags(
                    WindowManager.LayoutParams.FLAG_SECURE
                );
                isSecure = false;
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to disable secure mode", e);
            }
        });
    }

    /**
     * Check if secure mode is currently enabled
     */
    @PluginMethod
    public void isSecureModeEnabled(PluginCall call) {
        try {
            com.getcapacitor.JSObject result = new com.getcapacitor.JSObject();
            result.put("enabled", isSecure);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to check secure mode status", e);
        }
    }
}
```

---

## 📄 Step 6: strings.xml

Path: `android/app/src/main/res/values/strings.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">MeriLive</string>
    <string name="title_activity_main">MeriLive</string>
    <string name="package_name">com.merilive.app</string>
    <string name="custom_url_scheme">com.merilive.app</string>
    
    <!-- Google Sign-In Server Client ID -->
    <string name="server_client_id">973947856306-n6kjihap25bdffjv967evtt1i7j1vs38.apps.googleusercontent.com</string>
</resources>
```

---

## 📄 Step 7: AndroidManifest.xml Permissions

Add these permissions to `android/app/src/main/AndroidManifest.xml` (between `<manifest>` and `<application>`):

```xml
<!-- Internet & Network -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- Camera & Audio for Live Streaming -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />

<!-- Location -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

<!-- Notifications -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- Vibration for Haptic Feedback -->
<uses-permission android:name="android.permission.VIBRATE" />

<!-- In-App Billing -->
<uses-permission android:name="com.android.vending.BILLING" />

<!-- Foreground Service for Calls -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_CAMERA" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
```

---

## 🚀 Step 8: Build APK Commands

```bash
# 1. Project root এ যান
cd merilive

# 2. Latest code pull করুন
git pull origin main

# 3. Dependencies install করুন
npm install --legacy-peer-deps

# 4. Build করুন
npm run build

# 5. Android sync করুন
npx cap sync android

# 6. Android Studio open করুন
npx cap open android
```

### Android Studio তে:
1. **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
2. APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release APK তৈরি করতে:
1. **Build** → **Generate Signed Bundle / APK**
2. APK বা AAB সিলেক্ট করুন
3. Keystore সিলেক্ট করুন
4. Release build তৈরি হবে

---

## ✅ Step 9: Admin Panel Update

Version 8 launch করার পরে Admin Panel এ যান:

1. **Admin Panel** → **App Version** এ যান
2. নতুন version তথ্য দিন:
   - Version Code: `8`
   - Version Name: `8.0.0`
   - Force Update: `true` (যদি সবাইকে update করাতে চান)
3. Save করুন

---

## 📝 Release Notes (Version 8.0.0)

### English:
- Fixed avatar frame alignment and sizing
- Improved VIP privilege equipping (single selection)
- Enhanced animation performance
- Bug fixes and stability improvements

### বাংলা:
- অ্যাভাটার ফ্রেম সাইজ এবং অ্যালাইনমেন্ট ফিক্স করা হয়েছে
- VIP প্রিভিলেজ ইকুইপ সিস্টেম উন্নত করা হয়েছে
- অ্যানিমেশন পারফরম্যান্স বৃদ্ধি করা হয়েছে
- বাগ ফিক্স এবং স্টেবিলিটি উন্নয়ন

---

## 🔑 Google Sign-In Setup (Optional)

1. **Google Cloud Console**: https://console.cloud.google.com/
2. **APIs & Services** → **Credentials**
3. Create **OAuth Client ID**:
   - Android: `com.merilive.app` + SHA-1
   - Web: For server-side verification

### SHA-1 নেওয়ার কমান্ড:
```bash
# Debug key
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

# Release key
keytool -list -v -keystore your-release-key.keystore -alias your-alias
```

---

## ⚠️ Important Notes

1. **Version Code**: প্রতিবার নতুন APK upload করার সময় version code বাড়াতে হবে
2. **Namespace**: AGP 8.0+ এ `namespace` বাধ্যতামূলক
3. **Java Version**: Java 17 ব্যবহার করুন
4. **Gradle Sync**: Code change করার পরে Gradle sync করুন

---

## 🆘 Troubleshooting

### Error: "Namespace not specified"
```gradle
android {
    namespace "com.merilive.app"  // এটি প্রথম লাইনে যোগ করুন
    ...
}
```

### Error: MainActivity.java errors
- Namespace ঠিক করলে এই errors চলে যাবে
- File → Sync Project with Gradle Files

### APK install হচ্ছে না
- Developer Options enable করুন
- Unknown Sources allow করুন
- USB Debugging enable করুন
