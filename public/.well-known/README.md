# Android App Links — Digital Asset Links

## What this file does

`assetlinks.json` tells Android that `com.merilive.app` is authorised to handle
HTTPS URLs for the domains listed in `AndroidManifest.xml`:

- `https://merilive.com/*`
- `https://www.merilive.com/*`

When `android:autoVerify="true"` is present on the intent-filter, Android
fetches `/.well-known/assetlinks.json` from each host during app install and
verifies the SHA-256 fingerprint. If verification succeeds, the OS will
**always** open those URLs in MeriLive (no disambiguation dialog).

## Getting the correct SHA-256 fingerprint

The fingerprint currently in `assetlinks.json` must match the signing
certificate used to build the APK that users install.

### Option A — extract from your release keystore

```bash
keytool -list -v \
  -keystore /path/to/merilive-release.keystore \
  -alias merilive \
  | grep "SHA256:" \
  | sed 's/.*SHA256: //' \
  | sed 's/://g'
```

### Option B — extract from the built APK (Play App Signing or any keystore)

```bash
keytool -printcert -jarfile app-release.apk \
  | grep "SHA256:" \
  | sed 's/.*SHA256: //' \
  | sed 's/://g'
```

### Option C — debug keystore (for internal testing only)

```bash
keytool -list -v \
  -keystore ~/.android/debug.keystore \
  -alias androiddebugkey \
  -storepass android \
  | grep "SHA256:" \
  | sed 's/.*SHA256: //' \
  | sed 's/://g'
```

Paste the resulting 64-character hex string (no colons) into
`assetlinks.json` under `sha256_cert_fingerprints`.

## Play App Signing

If you use **Google Play App Signing**, the certificate that signs the APK
uploaded to Play Console is the *upload* key, but the APK delivered to users
is signed with the *app signing* key managed by Google. In that case you
must use the app-signing certificate fingerprint (found in Play Console →
Release → Setup → App Integrity → App signing key certificate).

## Testing

1. Install the app on a device.
2. Run the Google Digital Asset Links tool:
   ```bash
   adb shell pm verify-app-links --re-verify com.merilive.app
   ```
3. Check verification state:
   ```bash
   adb shell pm get-app-links com.merilive.app
   ```
   Look for `verified: true` for each domain.

## File format

Google expects `application/json` with no redirect. The `_headers` file in
`public/` already sets `Content-Type: application/json` and a 1-hour cache.
