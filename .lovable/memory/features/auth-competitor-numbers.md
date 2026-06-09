---
name: Auth competitor numbers (Phase 1)
description: Locked industry numbers for auth flow — splash, OTP, Google, gender, transitions, TTID. Use BEFORE any auth code change.
type: feature
---
# Auth — Industry-Locked Numbers (researched 2026-06-09)

Competitors surveyed: Chamet, Bigo Live, Olamet, Poppo Live, Hollah Live, HiiClub, WeJoy, Crush Live (all 8 require account, ZERO guest mode).

## Splash / Landing
- Splash duration: ≤ **1000 ms** (Android 12+ SplashScreen API)
- Pre-A12 fallback: 1500–2500 ms fixed timer
- Landing fade-in: **300 ms**
- Window background MUST be brand color (NOT white) to kill white-flash. Use `overridePendingTransition(0,0)` or `ActivityOptions.makeCustomAnimation`.

## Google Sign-In
- API: **Credential Manager** (One Tap deprecated 2024+). Legacy apps still ship One Tap.
- Render: 300–800 ms cold, total ~1–2 s cold, <500 ms warm
- After 2 dismissals → suppressed 24 h → MUST fall back to phone/email
- Error UX: inline snackbar, never blocking modal

## Phone OTP
- **6 digits** universal
- Resend countdown: **60 s** visible timer (lock before)
- Expiry: **5 min**
- Retries: **3** before block, escalating delay
- Autofill: **SMS Retriever API** (zero perms, app-hash) — User Consent API fallback
- Country picker: searchable bottom-sheet, flag+dial-code, 150–200 countries
- Validation: E.164 client-side before server call, inline error

## Gender
- Shown immediately after first signup, **mandatory** (cannot skip)
- Options: **Male / Female only** (no non-binary in this market)
- Chamet: permanent. Bigo: editable in Settings.
- Chamet end-to-end signup: ~3 min 40 s (phone OTP → gender → photo)

## Transitions (Material M3)
- Auth → OTP: **300 ms** (motionDurationMedium2)
- OTP → Gender: **250 ms** (motionDurationMedium1)
- Splash → Landing: 200–300 ms fade
- Modal dismiss: 200 ms
- Easing enter: `cubic-bezier(0.05,0.7,0.1,1.0)` (Emphasized Decelerate)
- Easing exit: `cubic-bezier(0.3,0,0.8,0.15)`
- Pattern: slide-right-in + fade (NOT pure fade, NOT shared-element)

## Performance (Play Console Vitals)
- Cold TTID target: **< 2000 ms** (Play flags ≥ 5000 ms)
- Warm: < 800 ms (flagged ≥ 2000 ms)
- Hot: < 500 ms (flagged ≥ 1500 ms)
- Frame budget: **16.67 ms** @ 60 fps
- Helio G35: keep UI-thread work < 8 ms/frame
- Ship **Baseline Profiles** (`baseline.prof`) → −15–30% cold start on low-end

## Citations
- developer.android.com/topic/performance/vitals/launch-time
- developer.android.com/develop/ui/views/launch/splash-screen
- developers.google.com/identity/sms-retriever/overview
- developer.android.com/identity/legacy/one-tap
- github.com/material-components/material-components-android (Motion.md)
- bittopup.com Chamet feature guide
- pvapins.com Bigo OTP guide
