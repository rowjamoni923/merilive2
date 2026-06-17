ভাই, সৎভাবে বলি: আগের ৪-৫ রাউন্ড "সব ফিক্স কর" ব্লাইন্ড পাস → ১৫-২০টা ফাইলে optional chaining → তোর আসল সমস্যা untouched থেকে গেছে। এবার সেই ভুল আর করব না। তোর দেওয়া দুইটা specific সমস্যা ধরে surgical fix করব।

## আসল সমস্যা (তোর কথায়)
1. **Private call (সবচেয়ে urgent)** — বাটনে ক্লিক → ১০+ সেকেন্ড দেরি → UI ২ সেকেন্ড দেখা যায় → তারপর ক্যামেরা open হওয়ার সময় **পুরো স্ক্রিন সাদা**, ক্যামেরা কখনই আসে না।
2. **General slowness** — Home / Profile / Live room / Wallet সবখানে ডাটা আসে কিন্তু ৫-১৫ সেকেন্ড দেরিতে। Installed APK-এ।

## প্ল্যান (৩ ফেজ, প্রতিটায় research → diagnose → fix → verify)

### Phase 1 — Private Call white-screen (highest priority)
**Research (locked rule):** Chamet/Bigo/Olamet private-call ringing→connected→camera-on path কিভাবে <2s রাখে (Agora pre-warm pattern → LiveKit translate)। মেমরিতে already আছে `nativePrejoinCameraPreview` Go Live-এর জন্য — Private call এ সম্ভবত একই pattern নেই।

**Diagnose:**
- `usePrivateCall.ts` (1454 lines), `useLiveKitCall.ts` (1087), `ActiveCallScreen.tsx` (1433), `PrivateCallActivity.kt` (961), `NativeCallPlugin.kt` (663) — full read করে call flow trace করব: button click → DB insert → FCM → callee accept → LiveKit token → room connect → publish camera → render।
- প্রতিটা step-এ timing log বসাব (১টা debug build দরকার পড়লে), অথবা code-flow থেকেই lag-source আলাদা করব।
- "সাদা স্ক্রিন when camera starts" — সম্ভাব্য কারণ: (a) WebView VideoTrack render path camera grab-এর সময় frame drop করে, (b) Android native VideoView surface lifecycle race, (c) GoLive-এর মতো `startLocalPreview` pre-warm private call-এ নাই → cold camera open lag → surface white।

**Fix scope (target):**
- LiveKit token + room connect parallelize (currently সম্ভবত sequential)।
- Camera publish-এর আগে `startLocalPreview` pre-warm pattern private call-এও bring (Go Live-এ যেটা already কাজ করে)।
- White-screen এর root cause fix — সম্ভবত native `PrivateCallActivity.kt` এর SurfaceViewRenderer attach timing, বা WebView path থেকে native path-এ handoff race।
- **APK rebuild লাগবে** (সৎ থাকব, false claim করব না)।

### Phase 2 — Home/Profile/Wallet 5-15s slowness
**Diagnose (no code first):**
- Browser preview-এ owner account দিয়ে login → Playwright দিয়ে actual network waterfall + console timings নেব।
- `supabase--slow_queries` already দেখেছি — top hot writes throttled আছে। এখন **read** path দেখতে হবে: কোন SELECT 5-15s নিচ্ছে।
- React Query cache, parallel fetching, N+1 queries — Index/Profile/Wallet-এ audit।

**Fix scope:**
- যেই queries actually slow সেগুলোতে indexed + parallelized।
- Avatar/frame/entry-animation cache prewarm।
- React Query `staleTime`/`gcTime` tune করে refetch storm কমাব।

### Phase 3 — Verification
- Owner account (smdollarex923@gmail.com) দিয়ে preview-এ self-test।
- Private call: web-এ যতটা সম্ভব verify, APK-only path-এর জন্য "APK rebuild করে test কর" সৎভাবে বলব — fake "fixed" claim দিব না।

## কী করব না
- কোনো UI/design পরিবর্তন (locked rule)।
- ১৫-২০টা ফাইলে cosmetic `?.` spray (যেটা গত ৪ রাউন্ডে কাজ করেনি)।
- "সব ফিক্স হয়ে গেছে" বলে actual verification ছাড়া close করা।

## এক্সিকিউশন
Approve করলে Phase 1 দিয়ে শুরু — call flow পুরো read → competitor pattern research → diagnosis report → targeted fix → APK-rebuild needed/not honest answer। তারপর Phase 2-এ যাব।

**Estimated:** Phase 1 ~৪০-৬০ মিনিট (research + read + fix), Phase 2 ~৩০-৪৫ মিনিট। মোট ~১.৫-২ ঘণ্টার surgical কাজ — কিন্তু আগের ৪ রাউন্ডের চেয়ে actual ফল আসবে।

## Emergency Fix — AgencyDashboard null display_name crash (2026-06-17)
**User-visible failure:** Agency dashboard crashed with `TypeError: Cannot read properties of null (reading 'display_name')` in `AgencyDashboard` render.

**Research/pro standard:** Chamet/Bigo-style agency dashboards must never crash when a joined member profile row is missing/deleted/RLS-hidden; list rows render a safe fallback name/avatar and keep actions available.

**Root cause:** agency host/sub-agent state could still receive a `null`/missing `profile` from Supabase joins/manual approve path, then a child/list render path attempted to read `display_name`.

**Fix shipped:** `AgencyDashboard.tsx` now normalizes every agency host and sub-agent through a non-null `NormalizedAgencyProfile`, including the host approval path, so render receives fallback profile fields instead of null.

**Second hardening pass:** render now uses `safeHosts`, `safePendingHosts`, `safeSubAgents`, and `safeSubAgencies` normalized collections, plus defensive row normalizers, so even stale/null state rows cannot reach `.display_name` directly.

**Verified:** owner-account browser test opened `/agency-dashboard`; dashboard rendered, no ErrorBoundary, no `display_name` TypeError, no failed agency/profile requests.

## Emergency Fix — Remove blocking MeriLive loading card/spinner (2026-06-18)
**User-visible failure:** `/index` could show a centered branded `MeriLive / Loading...` card instead of the app surface, especially on mobile/slow chunk load.

**Research/pro standard:** NN/g recommends skeleton/content-shaped placeholders for full-page waits because they show the upcoming layout; generic spinners are only acceptable for short/unknown waits. BIGO Lite markets low-resource fast startup as a core live-streaming requirement, so a Chamet/Bigo-class live app should prefer cached/instant surfaces over app-wide blocking loaders.

**Root cause:** `App.tsx` still had a visible Suspense fallback (`PageLoader`) plus first-session splash behavior, so route chunk/auth timing could expose a branded loading card across the whole app.

**Fix shipped:** user app route Suspense fallback is now silent (`null`) and first-launch branded splash is disabled, so the app no longer shows the screenshot-style `MeriLive Loading...` blocker.

## Android Instant Startup / Network-Adaptive Performance Pass (2026-06-18)
**User-visible failure:** Android APK cold/resume path felt slow/laggy on 4G/5G: delayed design paint, white/blank screen, generic spinner/loader surfaces, and late image/feed rendering.

**Research/pro standard:** Capacitor SplashScreen docs confirm Android launch splash is controlled by native SplashScreen API and can be hidden programmatically; Android `WebSettings` supports normal HTTP cache mode + DOM storage + offscreen pre-raster; web.dev recommends stale-while-revalidate so cached assets paint immediately while updates refresh in background; MDN NetworkInformation exposes effective connection/downlink/saveData for network-adaptive behavior.

**Root causes found:** `capacitor.config.ts` forced `launchShowDuration: 2000`; `index.html` still drew a boot spinner before React; `ProtectedRoute` still showed `MeriLiveLoader` for 1.5s auth recovery; Home feed instant cache used `sessionStorage`, so Android process kill lost it; native Glide image prefetch existed but defaulted OFF.

**Fix shipped:** native splash delay set to `0`; boot spinner removed; ProtectedRoute now renders cached route surface during native auth recovery and ban checks instead of a loader; React Query persistence now includes Home feed/countries; Home feed snapshot persists in `localStorage` across app kills; Android WebView now enables cache/DOM storage/offscreen pre-raster/hardware layer/important renderer priority; native Glide first-screen image prefetch is default ON while interceptor remains OFF; image warmup limits adapt to connection tier (2G/slow/offline 6, 3G 12, 4G/5G 24).

**Verification status:** Static scan confirms no `MeriLiveLoader` remains in ProtectedRoute and no `#root:empty` spinner remains. Android-native changes require APK rebuild before device timing can be honestly claimed fixed.

## Video Evidence Fix — Party + Private Camera 5–10s Delay (2026-06-18)
**Uploaded video analyzed:** `VID-20260618-WA0002.mp4` is 75.18s. Timestamp sheet shows: private/live surface dark camera placeholder from about **40.5s → 49.0s (~8.5s)** before first visible camera frame; party slot blank/spinner from about **61.5s → 66.5s (~5s)**; party room transition/preparing around **70.5s → 71.5s**.

**Research/pro standard:** Chamet/Bigo/Agora-style Android flow is `startPreview()` first, render local native SurfaceView/TextureView immediately, then `joinChannel/connect` in background. LiveKit Android supports creating a `LocalVideoTrack` independently and publishing it after `Room.connect`, so CameraX first frame must not wait on token/signaling network latency.

**Root cause:** Native `LiveKitPlugin.promotePreviewToSession()` called network-bound `room.connect(url, token)` before opening/rendering the camera on cold paths. Party JS also fetched token before prewarming native bounded preview. `NativeVideoView` tried `attachLocalSurface` once; native returned `attached:true` even when no camera track existed, so React stopped retrying and the party tile stayed blank until another layout signal.

**Fix shipped:** `LiveKitPlugin.kt` now creates/starts the local CameraX track and binds renderer/seat slots **before** `room.connect()`. Party join now starts bounded native preview in parallel with LiveKit token fetch and re-prewarms before seat video enable. Native `attachLocalSurface` now returns `attached:false reason=no_track` until the track exists, and `NativeVideoView` retries every ~160ms until bound. Private call native startup now uses **720p** instead of cold 1080p for faster CameraX first frame/encoder warmup.

**Verification status:** Static scan confirms all three fixes are present. Because this changes Android native plugin + native camera timing, **APK rebuild is required** before honest device verification.

## Private Call Final Pass — Room adoption + no camera/video icons (2026-06-18)
**Uploaded video analyzed:** `VID-20260618-WA0003.mp4` shows caller leaving Home at ~1s, then the private-call dialing screen stays dark with only avatar/Calling UI from ~5s through ~20s, and the receiver side shows only a heads-up notification around ~30s instead of an app-owned full-screen ring surface.

**Research/pro standard:** Agora/Chamet/Bigo pattern is local preview first (`startPreview`) before joining, full-screen incoming call UI before media connect, and real signal bars from SDK/network quality rather than phone status-bar interpretation. LiveKit equivalent is `LocalVideoTrack` prewarm + native renderer attach before/while `Room.connect` runs.

**Root causes found:** `RtcEngineManager.currentRoom()` was still a hardcoded stub returning `null`, so rebuilt APK could connect/publish in `LiveKitPlugin` but `PrivateCallActivity` could not adopt the Room and had nothing to render. Also `startLocalPreview()` opened CameraX but JS did not call `attachLocalWithRetry()`, and React calling fallbacks could paint an opaque dark surface over the native preview. React also had a fake `isConnected`-only signal bar and foreground incoming call UI was a compact banner.

**Fix shipped:** `RtcEngineManager` now stores the active process Room; `LiveKitPlugin` binds/clears that Room on connect/disconnect and exposes `switchCameraFromNative`; native private-call signal bars were added and update from Android `ConnectivityManager.NetworkCallback` (no polling); `startLocalPreview()` now attaches the native local renderer; React calling fallback exposes the native preview instead of covering it; hardcoded fake signal bars were removed; foreground incoming call modal is now full-screen; all visible non-admin Camera/Video lucide glyphs were replaced/removed across call/live/party/visitor/public/helper/chat/settings/profile surfaces.

**Verification status:** Source scan returns no visible non-admin Camera/Video lucide icon components. Native APK rebuild is required to verify the private-call native Room adoption and signal bars on device.

