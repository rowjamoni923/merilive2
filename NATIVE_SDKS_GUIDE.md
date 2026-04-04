# 🚀 MeriLive Native SDKs - সম্পূর্ণ ডকুমেন্টেশন

## Overview

এই SDKs আপনার অ্যাপকে সম্পূর্ণ নেটিভ অনুভূতি দেবে - কোনো ব্রাউজিং নেই!

---

## 📦 Available SDKs

| SDK | বর্ণনা |
|-----|--------|
| **NativeCameraSDK** | ক্যামেরা, ভিডিও রেকর্ডিং, ফটো ক্যাপচার |
| **VideoProcessingSDK** | ভিডিও কম্প্রেশন, থাম্বনেইল, ফিল্টার |
| **MLModelSDK** | ফেস ডিটেকশন, AI চ্যাট |
| **NativeUISDK** | Haptics, Dialogs, Toast, Gestures |
| **AnimationSDK** | পার্টিকেল, ট্রানজিশন, মাইক্রো-ইন্টারঅ্যাকশন |

---

## 🎥 Video Processing SDK

### ভিডিও থাম্বনেইল

```typescript
import { getVideoSDK } from '@/sdk';

const videoSDK = getVideoSDK();

// একটি থাম্বনেইল
const thumbnail = await videoSDK.generateThumbnail(videoFile, {
  time: 5, // 5 সেকেন্ডে
  width: 320,
  format: 'jpeg',
});

// একাধিক থাম্বনেইল
const thumbnails = await videoSDK.generateThumbnails(videoFile, 5);
```

### ভিডিও কম্প্রেশন

```typescript
const compressedBlob = await videoSDK.compress(videoFile, {
  maxWidth: 720,
  maxHeight: 480,
  quality: 0.7,
}, (progress) => {
  console.log(`${progress.stage}: ${progress.progress}%`);
});
```

### ভিডিও ফিল্টার

```typescript
const filteredBlob = await videoSDK.applyFilter(videoFile, {
  type: 'sepia',
  value: 0.8,
});
```

---

## 🧠 ML/AI SDK

### ফেস ডিটেকশন

```typescript
import { getFaceDetector } from '@/sdk';

const detector = getFaceDetector();
await detector.initialize();

// ভিডিও থেকে
const result = await detector.detectFromVideo(videoElement);
console.log('Face detected:', result.detected);
console.log('Faces:', result.faces);

// ক্যানভাসে আঁকা
detector.drawFaceBox(ctx, result.faces[0], '#00FF00');
```

### AI চ্যাট (Lovable AI)

```typescript
import { getAIChatService } from '@/sdk';

const ai = getAIChatService({
  systemPrompt: 'You are a helpful assistant. Respond in Bengali.',
});

// Simple chat
const response = await ai.chat([
  { role: 'user', content: 'হ্যালো!' }
]);

// Streaming
await ai.streamChat(messages, {
  onToken: (token) => console.log(token),
  onComplete: (full) => console.log('Done:', full),
  onError: (err) => console.error(err),
});
```

---

## 📱 Native UI SDK

### Haptic Feedback

```typescript
import { HapticFeedback } from '@/sdk';

// বিভিন্ন ধরনের
HapticFeedback.impact('light');    // হালকা
HapticFeedback.impact('medium');   // মাঝারি
HapticFeedback.impact('heavy');    // ভারী
HapticFeedback.impact('success');  // সফল
HapticFeedback.impact('error');    // ভুল
HapticFeedback.impact('selection');// সিলেকশন
```

### Native Dialogs

```typescript
import { NativeDialogs } from '@/sdk';

// Alert
await NativeDialogs.alert({
  title: 'সতর্কতা',
  message: 'আপনি কি নিশ্চিত?',
});

// Confirm
const confirmed = await NativeDialogs.confirm({
  title: 'মুছে ফেলুন',
  message: 'এই আইটেম মুছে ফেলতে চান?',
  okButtonTitle: 'হ্যাঁ',
  cancelButtonTitle: 'না',
});

// Action Sheet
const index = await NativeDialogs.actionSheet('অপশন বেছে নিন', [
  { title: 'ক্যামেরা' },
  { title: 'গ্যালারি' },
  { title: 'বাতিল', destructive: true },
]);
```

### Native Toast

```typescript
import { NativeToast } from '@/sdk';

NativeToast.show({
  message: 'সফলভাবে সংরক্ষিত!',
  duration: 'short',
  position: 'bottom',
});
```

### Swipe Gestures

```typescript
import { SwipeGestureDetector, HapticFeedback } from '@/sdk';

const detector = new SwipeGestureDetector(element, {
  threshold: 50,
  direction: 'horizontal',
  onSwipeLeft: () => {
    HapticFeedback.impact('light');
    // পরবর্তী পেজ
  },
  onSwipeRight: () => {
    HapticFeedback.impact('light');
    // আগের পেজ
  },
});

// Cleanup
detector.destroy();
```

### Pull to Refresh

```typescript
import { PullToRefresh } from '@/sdk';

const ptr = new PullToRefresh(scrollContainer, async () => {
  await fetchNewData();
}, 80);

// Cleanup
ptr.destroy();
```

### Status Bar

```typescript
import { StatusBarControl } from '@/sdk';

StatusBarControl.setStyle('dark');
StatusBarControl.setBackgroundColor('#000000');
StatusBarControl.hide();
StatusBarControl.show();
```

### Share & Clipboard

```typescript
import { NativeShare, NativeClipboard } from '@/sdk';

// শেয়ার
await NativeShare.share({
  title: 'MeriLive',
  text: 'এই অ্যাপ দেখুন!',
  url: 'https://merilive.app',
});

// কপি
await NativeClipboard.copy('Hello World');
const text = await NativeClipboard.read();
```

---

## ✨ Animation SDK

### পার্টিকেল ইফেক্ট

```typescript
import { getParticleSystem } from '@/sdk';

const particles = getParticleSystem();

// কাস্টম পার্টিকেল
particles.emit(x, y, {
  count: 50,
  colors: ['#FFD700', '#FF6B6B', '#4ECDC4'],
  speed: { min: 3, max: 8 },
  gravity: 0.15,
});

// কনফেটি
particles.confetti();
```

### মাইক্রো-ইন্টারঅ্যাকশন

```typescript
import { MicroInteractions } from '@/sdk';

// রিপল ইফেক্ট
button.addEventListener('click', (e) => {
  MicroInteractions.ripple(button, e);
});

// অন্যান্য অ্যানিমেশন
MicroInteractions.pulse(element);
MicroInteractions.shake(element);
MicroInteractions.bounce(element);
MicroInteractions.heartbeat(element);
MicroInteractions.float(element);
```

### লোডিং অ্যানিমেশন

```typescript
import { LoadingAnimations } from '@/sdk';

// স্কেলেটন
const stop = LoadingAnimations.skeleton(element);
// ... লোডিং শেষে
stop();

// শিমার
const stop = LoadingAnimations.shimmer(element);

// স্পিনার
const stop = LoadingAnimations.spinner(container, 40, '#FFD700');

// ডটস
const stop = LoadingAnimations.dots(container);
```

### নম্বর কাউন্টার

```typescript
import { NumberCounter } from '@/sdk';

const counter = new NumberCounter(element);
counter.countTo(1000, {
  duration: 2000,
  easing: 'easeOut',
  prefix: '৳',
  decimals: 0,
});
```

### পেজ ট্রানজিশন

```typescript
import { PageTransitions } from '@/sdk';

await PageTransitions.transition(fromElement, toElement, {
  type: 'slide-left',
  duration: 300,
  easing: 'spring',
});
```

---

## 🎮 React Hooks

### useCameraSDK

```typescript
import { useCameraSDK } from '@/sdk';

function MyComponent() {
  const {
    stream,
    isLoading,
    isRecording,
    recordingDuration,
    error,
    startPreview,
    stopPreview,
    takePhoto,
    startRecording,
    stopRecording,
    switchCamera,
    toggleFlash,
  } = useCameraSDK({ facing: 'user' });

  return (
    <video ref={videoRef} />
  );
}
```

---

## 📁 File Structure

```
src/sdk/
├── index.ts              # All exports
├── NativeCameraSDK.ts    # Camera SDK
├── useCameraSDK.ts       # Camera React hook
├── VideoProcessingSDK.ts # Video processing
├── MLModelSDK.ts         # ML/AI features
├── NativeUISDK.ts        # Native UI utilities
└── AnimationSDK.ts       # Animations

src/components/camera/
└── CameraPreview.tsx     # Ready-to-use component
```

---

## 🔧 Android Setup

### ১. নতুন ডিপেন্ডেন্সি sync করুন

```bash
npm run build
npx cap sync android
```

### ২. Capacitor plugins যোগ করুন

নিম্নলিখিত plugins স্বয়ংক্রিয়ভাবে যুক্ত হয়েছে:
- @capacitor/camera
- @capacitor/haptics
- @capacitor/dialog
- @capacitor/action-sheet
- @capacitor/toast
- @capacitor/keyboard
- @capacitor/share
- @capacitor/clipboard
- @capacitor/status-bar

### ৩. APK Build করুন

```bash
npx cap open android
# Android Studio: Build > Generate Signed Bundle / APK
```

---

## ✅ Benefits

- ✨ **100% নেটিভ অনুভূতি** - Native dialogs, haptics, gestures
- 🚀 **দ্রুত পারফর্ম্যান্স** - 60fps animations
- 📱 **ব্রাউজার-মুক্ত** - কোনো ওয়েব ফিল নেই
- 🎨 **কাস্টমাইজেবল** - সব কিছু কনফিগার করা যায়
- 🔒 **অফলাইন রেডি** - বেশিরভাগ ফিচার অফলাইনে কাজ করে
