# 🚀 MeriLive Android Production Build Guide

## ✅ Production Configuration Status

এই প্রজেক্টটি সম্পূর্ণ **Self-Hosted Production Mode** এ কনফিগার করা আছে।

| Feature | Status | Details |
|---------|--------|---------|
| Domain | ✅ | `merilive.com` (Lovable domain নয়) |
| Assets | ✅ | Bundled locally (`dist` folder) |
| Camera/Mic | ✅ | Native SDK permissions |
| Google OAuth | ✅ | Native SDK (no browser) |
| Deep Links | ✅ | SmartLink via `merilive.com/link?` |
| Share Links | ✅ | All use production domain |

---

## 📱 Android APK Build Steps

### Prerequisites
- Node.js 18+
- Android Studio (latest)
- Git

### Step 1: Export থেকে GitHub
1. Lovable এ **"Export to GitHub"** button click করুন
2. আপনার GitHub repository তে push হবে

### Step 2: Local Setup
```bash
# Clone your repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO

# Install dependencies
npm install

# Build production assets
npm run build
```

### Step 3: Add Android Platform
```bash
# Add Android platform (first time only)
npx cap add android

# Sync web assets to Android
npx cap sync android
```

### Step 4: Open in Android Studio
```bash
npx cap open android
```

### Step 5: Build APK
Android Studio তে:
1. Wait for Gradle sync to complete
2. **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
3. APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## 🔧 Key Configuration Files

### capacitor.config.ts
```typescript
// ✅ Production mode - NO server URL
webDir: 'dist',  // Loads local bundled assets
appId: 'com.merilive.app',
appName: 'MeriLive',
// NO "server.url" = Full native mode
```

### Production Domain Usage
সব share links `merilive.com` domain ব্যবহার করে:
- `src/utils/shareLinks.ts` - Centralized link generation
- Agency invite, Live stream share, Party room invite

---

## 🌐 Domain Configuration

| Purpose | Domain | Notes |
|---------|--------|-------|
| Production App | `merilive.com` | Main user-facing domain |
| Admin Panel | `merilive.top` | Separate admin access |
| Deep Links | `merilive.com/link?` | SmartLink system |
| API Backend | `pppcwawjjpwwrmvezcdy.supabase.co` | Supabase backend |

---

## 🔐 Security Configuration

### Google OAuth
- **Client ID**: Already in `capacitor.config.ts`
- **SHA-256**: `D6:F9:B3:BB:73:2D:48:1D:DB:36:D4:DC:F2:B5:4D:60:61:88:71:77:14:8A:9C:A2:32:3D:16:34:66:A8:51:F6`

### App Links
- **assetlinks.json**: `merilive.top/.well-known/assetlinks.json`

---

## 📦 Release Build (Signed APK)

### Create Keystore (First time)
```bash
keytool -genkey -v -keystore merilive-release-key.keystore \
  -alias merilive \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

### Build Release APK
1. Android Studio: **Build** → **Generate Signed Bundle / APK**
2. Select **APK**
3. Choose your keystore
4. Build type: **release**

---

## ⚡ Native Features Included

- ✅ In-app browser (no external redirects)
- ✅ Camera & Microphone (native permissions)
- ✅ Push Notifications
- ✅ GPS Location
- ✅ Haptic feedback
- ✅ Google Sign-In (native SDK)
- ✅ Deep linking
- ✅ Status bar customization
- ✅ Safe area support (notch/gesture nav)

---

## ✅ Pre-Build Checklist

- [ ] `npm run build` successful (no errors)
- [ ] `npx cap sync android` completed
- [ ] Android Studio Gradle sync successful
- [ ] Test on emulator/device
- [ ] Verify all permissions in AndroidManifest.xml

---

## 🐛 Common Issues & Fixes

### White screen on launch
```bash
npm run build
npx cap sync android
```

### Build fails
```bash
cd android && ./gradlew clean && cd ..
npm run build
npx cap sync android
```

### Camera not working
Check AndroidManifest.xml permissions

### Google Sign-In fails
Verify SHA-256 fingerprint in Google Cloud Console

### Deep links not working
Check `assetlinks.json` at `merilive.top/.well-known/`

---

## 🔄 Update Workflow

```bash
git pull
npm install
npm run build
npx cap sync android
npx cap open android
```

---

**App ID**: `com.merilive.app`  
**Last Updated**: January 2026