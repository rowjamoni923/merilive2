# Deep Linking Complete Setup Guide for MeriLive App

This guide explains how to set up complete deep linking so that when users click links like `https://merilive.com/link?ref=AGTEAM01`, they are automatically redirected to the app (if installed) or to the download page (if not installed).

## How It Works

```
User clicks link in browser (Chrome/Opera/Firefox)
         ↓
   Smart Link Page loads
         ↓
   ┌─────────────────────────────────────┐
   │      Is MeriLive app installed?      │
   └─────────────────────────────────────┘
         ↓                    ↓
       YES                   NO
         ↓                    ↓
   App opens with         Shows download page
   the deep link          (stores referral code)
         ↓                    ↓
   User lands on          User downloads app
   correct page           from Play Store
                                ↓
                          User opens app
                                ↓
                          App reads stored
                          referral code
                                ↓
                          User lands on
                          correct page
```

---

## Step 1: Share Links in This Format

Instead of sharing direct app routes, share Smart Link URLs:

| Purpose | Share This URL |
|---------|----------------|
| Sub-Agent Referral | `https://merilive.com/link?ref=AGTEAM01` |
| Join Agency | `https://merilive.com/link?code=AGTEAM01` |
| Create Sub-Agency | `https://merilive.com/link?parent=AGTEAM01` |
| View Host Profile | `https://merilive.com/link?host=USER_ID` |
| Any Page | `https://merilive.com/link?target=/some-page` |

**Example for agency owners:**
```
আমার এজেন্সিতে যোগ দিন! 🎉
https://merilive.com/link?ref=AGTEAM01
```

---

## Step 2: Get Your SHA256 Fingerprint

For Android App Links to work, you need your app's signing key fingerprint.

### For Debug Build:
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

### For Release Build:
```bash
keytool -list -v -keystore your-release-key.keystore -alias your-alias
```

Copy the **SHA256** fingerprint (looks like: `14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:...`)

---

## Step 3: Update assetlinks.json

Edit `public/.well-known/assetlinks.json` and add your SHA256 fingerprint:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.merilive.app",
      "sha256_cert_fingerprints": [
        "YOUR_DEBUG_SHA256_HERE",
        "YOUR_RELEASE_SHA256_HERE"
      ]
    }
  }
]
```

**Important:** Add BOTH debug and release fingerprints if testing on both builds.

---

## Step 4: Update Android Manifest

Add these intent filters inside the `<activity>` tag in `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Deep Link: HTTPS URLs (App Links) -->
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="merilive.com" />
</intent-filter>

<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="www.merilive.com" />
</intent-filter>

<!-- Deep Link: Custom URL Scheme (Fallback) -->
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="merilive" />
</intent-filter>
```

---

## Step 5: Host Files on Your Domain

### 5a. Publish the app to make assetlinks.json available:

After publishing, verify the file is accessible at:
```
https://merilive.com/.well-known/assetlinks.json
```

### 5b. If using a separate hosting:

Copy `public/.well-known/assetlinks.json` to your web server's `.well-known` directory.

Ensure it's served with:
- `Content-Type: application/json`
- No authentication required
- HTTPS only

---

## Step 6: Update Play Store Settings (Optional but Recommended)

In Google Play Console:
1. Go to **Setup → App Integrity**
2. Copy the **SHA256 certificate fingerprint** from the "App signing key certificate" section
3. Add this fingerprint to your `assetlinks.json`

This ensures verified app links work for users who download from Play Store.

---

## Step 7: Rebuild and Test

### Build the app:
```bash
npm run build
npx cap sync android
npx cap open android
```

### Test the flow:

1. **Test with app installed:**
   - Open Chrome on your Android device
   - Navigate to: `https://merilive.com/link?ref=TEST123`
   - App should open directly

2. **Test without app installed:**
   - Uninstall the app
   - Navigate to: `https://merilive.com/link?ref=TEST123`
   - Should show download page
   - Install app from Play Store
   - Open app
   - Should navigate to the referral page

---

## Verification Tools

### Check assetlinks.json is accessible:
```bash
curl https://merilive.com/.well-known/assetlinks.json
```

### Use Google's verification tool:
Visit: https://developers.google.com/digital-asset-links/tools/generator

Enter:
- Domain: `merilive.com`
- Package: `com.merilive.app`
- SHA256 fingerprint

---

## Troubleshooting

### Links open in browser instead of app?

1. **Fingerprint mismatch:** Make sure SHA256 in assetlinks.json matches your signing key
2. **File not accessible:** Verify `https://merilive.com/.well-known/assetlinks.json` returns JSON
3. **Cache issue:** Clear Chrome cache or use incognito mode
4. **autoVerify missing:** Ensure `android:autoVerify="true"` is in intent-filter

### Clear Android's link association cache:
```bash
adb shell pm set-app-links --package com.merilive.app 0 all
adb shell pm verify-app-links --re-verify com.merilive.app
```

### Deferred deep link not working?

1. Check localStorage in the browser: `localStorage.getItem("meri_pending_deep_link")`
2. Ensure the link was stored before redirecting to Play Store
3. Check app logs: `adb logcat | grep DeepLink`

---

## Quick Reference

| Link Type | URL Format |
|-----------|------------|
| Agency Referral | `https://merilive.com/link?ref=CODE` |
| Join Agency | `https://merilive.com/link?code=CODE` |
| Sub-Agency | `https://merilive.com/link?parent=CODE` |
| Host Profile | `https://merilive.com/link?host=USER_ID` |
| Custom Path | `https://merilive.com/link?target=/path` |

---

## Files Modified

1. `public/.well-known/assetlinks.json` - Android App Links verification
2. `src/pages/SmartLink.tsx` - Smart redirect page
3. `src/components/common/DeepLinkHandler.tsx` - In-app deep link handler
4. `android/app/src/main/AndroidManifest.xml` - Intent filters (manual edit)
5. `capacitor.config.ts` - App plugin configuration

---

## Support

For more information:
- [Android App Links Documentation](https://developer.android.com/training/app-links)
- [Capacitor App Plugin](https://capacitorjs.com/docs/apis/app)
- [Digital Asset Links](https://developers.google.com/digital-asset-links)
