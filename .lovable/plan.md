## লক্ষ্য
Live Stream, Party Room, Private Call — তিনটাতেই:
1. অ্যাপ minimize করলেও অন্য প্রান্তের ভয়েস clearly শোনা যাবে + নিজের mic চালু থাকবে (background audio continuity)
2. Video/face uninterrupted থাকবে (foreground service — Android কখনো কেটে দিবে না)
3. কোথাও lag নেই, UI ১% ও ভাঙবে না, professional Android feel
4. Disconnect/drop হবে না

---

## Research-first (competitor parity)
Chamet, Bigo, Poppo, Olamet, HiiClub — সবাই Android `ForegroundService` + `MediaSession` + `AudioFocus` + LiveKit background track publishing ব্যবহার করে। আমাদের LiveKit self-hosted, তাই translation দরকার নেই — সরাসরি LiveKit Android SDK এর `Room.Options(adaptiveStream=true)` + custom `ForegroundService` binding।

## Current gap (verified from codebase)
- `LiveKitPlugin.kt` — কোনো `ForegroundService` bind নেই → OS 30–60s এ audio track kill করে
- Party/Live/Call তিনটার জন্য আলাদা lifecycle handling নেই → minimize এ track publisher unpublish হয়ে যায়
- WebView pause এ JS timer freeze → LiveKit heartbeat miss → reconnect loop → "কেটে যায়"
- Audio route (speaker vs earpiece) minimize এ hardcoded reset হয়

---

## প্ল্যান (৪ phase, সব Android-native — APK rebuild লাগবে)

### Phase 1 — Foreground Service (audio/video continuity)
- নতুন `LiveKitForegroundService.kt` — `FOREGROUND_SERVICE_TYPE_MICROPHONE | CAMERA | MEDIA_PLAYBACK`
- Notification channel: "Live Call Active" (persistent, non-dismissible while in call)
- `LiveKitPlugin.connect()` → `startForegroundService()` bind; `disconnect()` → stop
- Manifest permissions: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `FOREGROUND_SERVICE_CAMERA`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (API 34+)

### Phase 2 — AudioFocus + MediaSession
- `AudioManager.requestAudioFocus()` with `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`
- `MediaSessionCompat` for lock-screen controls + call state
- Restore audio route (speaker) after focus loss (call interruption, notification)

### Phase 3 — WebView lifecycle guard
- `MainActivity.onPause` → do NOT pause WebView while LiveKit session active (checked via plugin state)
- Keep JS heartbeat alive → no reconnect loop
- Camera preview (native renderer already behind WebView per prior fix) unaffected

### Phase 4 — LiveKit resilience
- `RoomOptions.adaptiveStream = true`, `dynacast = true`
- Reconnect policy: exponential backoff, max 30s, auto-resume tracks
- Background track publishing: `LocalAudioTrack.setEnabled(true)` on pause (already published, just guard against JS unpublish call)

---

## Design/UI guardrails (৳acred)
- কোনো UI file touch হবে না — pure native Android + minimal JS lifecycle hook
- English-only strings (notification title: "Live call in progress")
- Design ১% ও ভাঙবে না — সব change `android/app/src/main/java/...` তে

## Verification
Owner account (smdollarex923@gmail.com) দিয়ে APK rebuild এর পর:
1. Live start → home button → 2 min wait → other side এ voice continuous শোনা যায় কিনা
2. Private call → notification pull down → still connected
3. Party room seat → screen off → voice active
4. Reconnect drill: airplane mode 10s → auto-recover

## গুরুত্বপূর্ণ note
এই পুরো কাজ **Android native (Kotlin)** — APK rebuild ছাড়া effect হবে না। Lovable preview এ web-এ background audio এমনিতেই browser handle করে (page visible থাকলেই)। তুমি confirm করলে Phase 1 থেকে শুরু করবো।
