# 📸 MeriLive Native Camera SDK

## Overview

এটি একটি সম্পূর্ণ Native Camera SDK যা Android/iOS অ্যাপে সব ধরনের ক্যামেরা অপারেশন হ্যান্ডেল করে।

## Features

- ✅ **Native Permission Handling** - Capacitor দিয়ে Android/iOS সিস্টেম ডায়ালগ
- ✅ **Progressive Fallback** - HD → SD → Basic রেজোলিউশন ফলব্যাক
- ✅ **Photo Capture** - ক্যামেরা দিয়ে বা গ্যালারি থেকে ছবি তোলা
- ✅ **Video Recording** - MediaRecorder দিয়ে ভিডিও রেকর্ড
- ✅ **Camera Switching** - Front/Back ক্যামেরা সুইচ
- ✅ **Flash Control** - টর্চ/ফ্ল্যাশ কন্ট্রোল
- ✅ **Bengali Error Messages** - ইউজার-ফ্রেন্ডলি বাংলা মেসেজ

---

## Installation

SDK ইতিমধ্যে `src/sdk/` ফোল্ডারে আছে। কোনো আলাদা ইনস্টলেশন লাগবে না।

---

## Usage

### 1. Basic Usage (React Hook)

```typescript
import { useCameraSDK } from '@/sdk';

function MyComponent() {
  const { 
    stream, 
    isLoading, 
    isRecording,
    error,
    startPreview, 
    stopPreview,
    takePhoto,
    startRecording,
    stopRecording,
    switchCamera,
  } = useCameraSDK({ facing: 'user', includeAudio: true });

  const handleStart = async () => {
    try {
      const mediaStream = await startPreview();
      // Stream ready - attach to video element
    } catch (err) {
      console.error('Camera failed:', err);
    }
  };

  return (
    <div>
      <video ref={videoRef} autoPlay playsInline muted />
      <button onClick={handleStart}>Start Camera</button>
      <button onClick={takePhoto}>Take Photo</button>
    </div>
  );
}
```

### 2. Using CameraPreview Component

```typescript
import { CameraPreview } from '@/components/camera/CameraPreview';

function MyPage() {
  return (
    <CameraPreview 
      facing="user"
      autoStart={true}
      showControls={true}
      onPhoto={(photo) => {
        console.log('Photo taken:', photo.dataUrl);
      }}
      onVideo={(video) => {
        console.log('Video recorded:', video.url, video.duration);
      }}
      onError={(error) => {
        console.error('Camera error:', error);
      }}
    />
  );
}
```

### 3. Direct SDK Usage (Non-React)

```typescript
import { NativeCameraSDK, getCameraSDK } from '@/sdk';

// Create instance
const camera = new NativeCameraSDK({
  facing: 'user',
  quality: 'hd',
  includeAudio: true,
});

// Or use singleton
const camera = getCameraSDK();

// Initialize and get capabilities
const capabilities = await camera.initialize();
console.log('Has front camera:', capabilities.hasFrontCamera);

// Request permissions
const permResult = await camera.requestPermissions();
if (!permResult.granted) {
  console.error('Permission denied:', permResult.error);
  return;
}

// Start camera preview
const stream = await camera.startPreview(videoElement);

// Take photo
const photo = await camera.takePhoto();
console.log('Photo base64:', photo.base64);

// Record video
await camera.startRecording(10); // Max 10 seconds
// ... wait ...
const video = await camera.stopRecording();
console.log('Video blob:', video.blob);

// Switch camera
await camera.switchCamera();

// Cleanup
await camera.cleanup();
```

---

## API Reference

### CameraConfig

```typescript
interface CameraConfig {
  facing: 'user' | 'environment';  // 'user' = front, 'environment' = back
  quality: 'hd' | 'sd' | 'low' | 'auto';
  includeAudio: boolean;
  enableFlash: boolean;
}
```

### CameraCapabilities

```typescript
interface CameraCapabilities {
  hasCamera: boolean;
  hasFrontCamera: boolean;
  hasBackCamera: boolean;
  hasFlash: boolean;
  hasMicrophone: boolean;
  supportsHD: boolean;
  maxResolution: { width: number; height: number };
}
```

### PhotoResult

```typescript
interface PhotoResult {
  dataUrl: string;    // data:image/jpeg;base64,...
  base64: string;     // Raw base64 string
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp';
}
```

### VideoRecordingResult

```typescript
interface VideoRecordingResult {
  blob: Blob;
  url: string;        // Object URL for playback
  duration: number;   // Seconds
  mimeType: string;
}
```

---

## Error Codes

| Code | Description (English) | Description (Bengali) |
|------|----------------------|----------------------|
| `PERMISSION_DENIED` | Camera permission denied | ক্যামেরা অনুমতি প্রত্যাখ্যাত |
| `CAMERA_NOT_FOUND` | No camera found | কোনো ক্যামেরা পাওয়া যায়নি |
| `CAMERA_IN_USE` | Camera in use by another app | ক্যামেরা অন্য অ্যাপে ব্যবহৃত হচ্ছে |
| `STREAM_FAILED` | Failed to start camera | ক্যামেরা চালু করতে ব্যর্থ |
| `RECORDING_FAILED` | Recording failed | রেকর্ডিং ব্যর্থ |
| `FLASH_NOT_SUPPORTED` | Flash not supported | ফ্ল্যাশ সমর্থিত নয় |

---

## Integration Examples

### Face Verification

```typescript
import { useCameraSDK } from '@/sdk';

function FaceVerification() {
  const { startPreview, startRecording, stopRecording } = useCameraSDK({
    facing: 'user',
    quality: 'sd',
    includeAudio: false,
  });

  const startVerification = async () => {
    const stream = await startPreview();
    await startRecording(15); // 15 second max
    
    // Auto-stop after 10 seconds
    setTimeout(async () => {
      const video = await stopRecording();
      // Upload video for verification
      await uploadForVerification(video.blob);
    }, 10000);
  };
}
```

### Go Live

```typescript
import { useCameraSDK } from '@/sdk';

function GoLive() {
  const { stream, startPreview, switchCamera } = useCameraSDK({
    facing: 'user',
    quality: 'hd',
    includeAudio: true,
  });

  useEffect(() => {
    startPreview().then(stream => {
      // Send stream to Agora/WebRTC
      agoraClient.publishLocalStream(stream);
    });
  }, []);

  return (
    <button onClick={switchCamera}>Switch Camera</button>
  );
}
```

---

## Android Setup Checklist

### AndroidManifest.xml

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />

<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-feature android:name="android.hardware.camera.front" android:required="false" />
```

### Build & Test

```bash
npm run build
npx cap sync android
npx cap open android

# In Android Studio:
# Build > Generate Signed Bundle / APK
```

---

## Troubleshooting

### ক্যামেরা কাজ করছে না

1. **Permission Check**: Settings > Apps > MeriLive > Permissions > Camera ✓
2. **Rebuild APK**: `npm run build && npx cap sync android`
3. **Clear App Cache**: Settings > Apps > MeriLive > Storage > Clear Cache

### কালো স্ক্রিন দেখাচ্ছে

1. অন্য ক্যামেরা অ্যাপ বন্ধ করুন
2. ফোন রিস্টার্ট করুন
3. Debug APK ব্যবহার করুন, Logcat চেক করুন

### "PERMISSION_DENIED" এরর

1. Settings থেকে manually permission দিন
2. অ্যাপ uninstall করে reinstall করুন

---

## File Structure

```
src/
├── sdk/
│   ├── index.ts              # SDK exports
│   ├── NativeCameraSDK.ts    # Main SDK class
│   └── useCameraSDK.ts       # React hook
├── components/
│   └── camera/
│       └── CameraPreview.tsx # Ready-to-use component
```

---

## Version

- **SDK Version**: 1.0.0
- **Capacitor**: 8.x
- **Platform**: Android/iOS/Web
