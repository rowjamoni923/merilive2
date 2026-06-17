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

