# 9টা Incomplete Native Plugin — 100% Complete করার Roadmap

## সৎ Scope Assessment

| Plugin | বর্তমান % | কাজের পরিমাণ | একই session-এ সম্ভব? |
|---|---|---|---|
| NativeBillingSecurity | 30% (fake signature) | Play public key verify, ~150 লাইন | ✅ হ্যাঁ |
| NativeAudioEngine | 40% (sessionId=0) | LiveKit/MediaRecorder থেকে session-id ব্রিজ | ✅ হ্যাঁ |
| NativeSpeedOptimizer | 60% (broken cache delete) | recursive delete fix | ✅ হ্যাঁ |
| NativeCrashReporter | 95% | already production-grade, no-op | ✅ verify only |
| NativeVideoEngine | 10% (empty stub) | hardware H.264 encoder ব্রিজ OR delete | ⚠️ delete recommend |
| DeepLinkHandler | 40% | intent filter parsing + route bridge | ✅ হ্যাঁ |
| NativeMessageReply | 50% | FCM RemoteInput + reply RPC | ✅ হ্যাঁ |
| **NativeFeedPlugin** | 30% (built, not wired) | Home feed RecyclerView wire-up | ❌ ২-৩ সপ্তাহ |
| **NativeChatUIPlugin** | 40% (built, not wired) | Input/Avatar/Media/Reply/Typing/Realtime | ❌ ৩-৪ সপ্তাহ |
| **NativeReelsPlayer overlay** | 80% | Gift/Like/Comment native overlay | ❌ ২-৩ সপ্তাহ |

---

## Phase 1 — Pkg435: Critical Quick Wins (এই session)

এই ৬টা আজকে complete করব:

### 1. NativeBillingSecurity (Revenue Leak Fix)
- Play Store license key (PUBLIC_KEY) signature verification
- `Signature.getInstance("SHA1withRSA")` + Base64 decode
- Lucky Patcher/Freedom detection patterns বাড়ানো
- `getDeviceFingerprint` — deprecated `Build.SERIAL` সরানো (Android 8+ requires READ_PHONE_STATE)
- Need: `PLAY_BILLING_PUBLIC_KEY` secret থেকে নিতে হবে

### 2. NativeAudioEngine (Echo Cancellation)
- `enableProfessionalAudio(sessionId: int)` — caller থেকে session-id নিবে
- LiveKit Plugin থেকে AudioRecord.getAudioSessionId() bridge
- `setAudioEffect` — AudioEffect framework দিয়ে Reverb/BassBoost/Equalizer

### 3. NativeSpeedOptimizer
- `clearNativeCache` recursive delete (cacheDir.delete() doesn't work on non-empty)
- `trimMemory(TRIM_LEVEL)` method যোগ
- Glide cache + WebView cache clear bridge

### 4. NativeCrashReporter
- Already 95% — শুধু verify + add `setAttribute(key, value)` method

### 5. DeepLinkHandler
- AndroidManifest.xml এ intent-filter (https://merilive.top, app://merilive)
- `getInitialLink()` + `addListener('appUrlOpen')` proper Capacitor pattern
- React Router-এ bridge

### 6. NativeMessageReply
- FCM data payload থেকে RemoteInput.Builder
- NotificationCompat.Action with RemoteInput
- BroadcastReceiver intercepts reply → calls Supabase RPC via WorkManager

### 7. NativeVideoEngine
- Stub delete OR hardware AVC encoder ব্রিজ
- **Recommend**: Delete (LiveKit ইতিমধ্যে hardware encoder use করে)

---

## Phase 2 — Pkg436: NativeFeedPlugin (পরের sprint, 1-2 সপ্তাহ)

- Home feed RecyclerView with Glide image loading
- Native pull-to-refresh + infinite scroll
- Native chip filters (country/category)
- Tap → bridge to React Router for detail page
- React Index.tsx → `<NativeFeedView>` wrapper component
- Fallback: web view if plugin unavailable

---

## Phase 3 — Pkg437: NativeChatUIPlugin Full Wire-up (পরের sprint, 3-4 সপ্তাহ)

### Sub-tasks (Pkg437.1 — Pkg437.7):
1. **NativeChatInput** — EditText + Send/Mic/Attach button native
2. **Avatar loading** — Glide CircleCrop transform in adapter
3. **Media messages** — image/video/voice ViewHolders (ExoPlayer thumbnail)
4. **Reply/edit/delete** — long-press popup menu native
5. **Typing/read receipt** — bottom-of-list animations
6. **Realtime insert** — Supabase Realtime → adapter.notifyItemInserted with scroll-to-bottom
7. **Conversation list** — separate RecyclerView for Chat list page
8. Chat.tsx → `<NativeChatView>` wrapper

---

## Phase 4 — Pkg438: NativeReels Gift/Like Overlay (পরের sprint, 2-3 সপ্তাহ)

- Native double-tap heart animation (no WebView)
- Native gift panel overlay (re-use NativeGiftPanelPlugin)
- Native like counter with floating numbers
- Comment sheet stays WebView (acceptable)

---

## Risk Disclosure

- প্রতিটা Phase 2-4 এর পর **নতুন APK rebuild + Play Store upload** দরকার
- WebView/Native dual-path bugs বাড়বে (chat-এ message order mismatch, feed scroll position desync)
- বর্তমান WebView Chat + Feed production-এ stable চলছে — Phase 3 risk highest
- Phase 1 এর সব fix runtime safe, instant deploy

---

## আজকের decision চাই

**Phase 1 (Pkg435) আজকে শুরু করব?** এটাতে ৬টা plugin properly complete হবে, ১টা delete হবে, **৭টা সমস্যা এক session-এ শেষ**।

Phase 2/3/4 আলাদা package হিসেবে পরের session-এ — কারণ একসাথে শুরু করলে কোনোটাই 100% হবে না।

আপনার approval পেলে এখনই Pkg435 শুরু করি।
