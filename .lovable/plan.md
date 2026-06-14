
# Camera System Full Rebuild — Delete-First, Then Rebuild

## Goal
পুরাতন project-এর simple pattern + LiveKit Android SDK-র built-in capturer = **একটাই camera path**, সব room type-এ (Live / Private Call / Video Party / Game Party)। Face Verification পুরোপুরি আলাদা ও untouched।

## Honest Confidence
**85–90%** design ও system অক্ষত থাকবে। বাকি 10–15% = real device OEM quirks (একমাত্র APK rebuild + test-এ ধরা পড়ে)।

---

## Phase 1 — DELETE (over-engineered layers)

### Native Android (Kotlin/Java)
- `android/app/src/main/java/com/merilive/app/plugin/LiveKitPlugin.kt` (6252 lines)
- `android/app/src/main/java/com/merilive/app/plugin/CameraOwnership.kt`
- `android/app/src/main/java/com/merilive/app/plugin/CameraAuthorityManager.kt`
- `android/app/src/main/java/com/merilive/app/activity/CameraResilienceController.kt`
- `android/app/src/main/java/com/merilive/app/rtc/` — পুরো folder (RtcEngineManager, BoundedSurfaceHost, SurfaceLifecycleManager, AppLifecycleObserver, WebViewPermissionGate, PermissionHelper)
- `native-kotlin/util/CameraOwnership.kt` (standalone app — unused in hybrid)
- `native-kotlin/service/LiveKitManager.kt`

**Keep:** `NativeCameraPlugin.java` (Face Verification only — clearly marked)

### JS / TypeScript
- `src/camera/ProCameraEngine.ts`, `src/camera/useProCamera.ts`
- `src/native/cameraAuthority.ts`
- `src/lib/androidCameraHandoff.ts`
- `src/hooks/useNativeLiveKitLifecycle.ts`
- `src/hooks/useRtcLifecycle.ts`
- পুরাতন `src/plugins/NativeLiveKit.ts` (rewrite হবে Phase 2-এ)

**Keep:** `src/plugins/NativeCamera.ts`, `src/hooks/useNativeFaceCamera.ts` (Face Verification)

### Cleanup edits (not delete)
- `MainActivity.java` — remove plugin registrations for deleted plugins
- `capacitor.config.ts` — remove dead plugin entries
- `AndroidManifest.xml` — keep camera/mic perms, remove dead services if any
- All React files importing deleted modules → update to new minimal API (Phase 2)

---

## Phase 2 — REBUILD (one minimal LiveKit plugin)

### New `LiveKitPlugin.kt` (~500 lines)
পুরাতন project-এর pattern + best practice:

```text
LiveKitPlugin
├── connect(url, token, roomType)         // live | call | party
├── disconnect()
├── publishCamera(enable: boolean)        // host/broadcaster only
├── publishMic(enable: boolean)
├── switchCamera()                        // front ↔ back
├── attachRemoteVideo(participantId, surfaceTag)
├── detachRemoteVideo(participantId)
├── setVideoQuality(low|med|high)
└── events: participant-joined, track-subscribed, disconnected, etc.
```

**Camera handling:**
- LiveKit SDK-র built-in `Camera2Capturer` — **NO custom ownership lock, NO Camera2 raw access**
- One `Room` instance per session
- `SurfaceViewRenderer` behind transparent WebView (পুরাতন pattern)
- `startLocalPreview` for Go-Live prejoin (already proven working, keep that piece)

### New `NativeLiveKit.ts` (~200 lines)
Same public method names current React code uses (drop-in)। যেগুলোর শুধু renaming দরকার, সেগুলো thin wrapper দিয়ে cover করব — **React UI / pages ভাঙবে না**।

### React-side touches (minimal)
Only call-site rewrites for deleted hooks (`useProCamera`, `useNativeLiveKitLifecycle`, `useRtcLifecycle`)। Replace with simple `useEffect` mount/unmount around new plugin's `connect`/`disconnect`। UI markup unchanged।

---

## Phase 3 — Verify (Lovable-side only)
- `bun run build` — TypeScript clean
- Owner account preview test (smdollarex923@gmail.com): chat নেভিগেট, route load, no console errors
- APK rebuild + real-device test — **user side**

---

## Files affected — quick count
- **Delete:** ~12 files (native + JS)
- **Rewrite:** 2 files (LiveKitPlugin.kt, NativeLiveKit.ts)
- **Edit (small):** ~10–15 React hooks/components that import deleted symbols
- **Untouched:** All UI components, pages, design tokens, Supabase, edge functions, LiveKit VPS server

---

## Risk & Mitigation
| Risk | Mitigation |
|---|---|
| React import errors after delete | Keep `NativeLiveKit.ts` public API stable; add no-op stubs for removed exports |
| Face Verification regression | NativeCamera plugin physically untouched + has its own `CameraOwnership` arbiter removed (only one camera now, no conflict) |
| Live host can't publish | Use LiveKit SDK's built-in capturer — same code that works in 1000s of production apps |
| APK build error | Smaller code = fewer build issues; will fix any compile error before declaring done |

---

## Order of operations (this session)
1. Delete all Phase-1 files in one batch
2. Rewrite `LiveKitPlugin.kt` (new minimal)
3. Rewrite `src/plugins/NativeLiveKit.ts` (drop-in API)
4. Fix all broken imports across React (grep-driven)
5. Update `MainActivity.java` plugin list
6. Build check
7. Report: "Lovable-side ✅ done, APK rebuild needed for device test"

**Approve "হ্যাঁ আগা" দিলে শুরু করব। এটা একটা long single-session refactor — মাঝপথে stop করলে app build ভাঙা থাকবে, তাই একবারে শেষ করতে হবে।**
