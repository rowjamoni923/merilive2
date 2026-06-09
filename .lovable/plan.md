# Plan — Phase 1: Auth (start / Google / Phone / Gender)

Started 2026-06-09. Per 16-phase roadmap + research-first mandate.

## Competitor research (locked in mem://features/auth-competitor-numbers)
8 apps surveyed (Chamet, Bigo, Olamet, Poppo, Hollah, HiiClub, WeJoy, Crush Live). Key numbers:
- OTP: 6-digit, 60s resend countdown, 5min expiry, 3 retries
- Cold TTID target < 2000ms (Play flags ≥ 5000ms)
- Page transitions 300ms / 250ms M3 Emphasized-Decelerate
- Gender: mandatory, Male/Female only, after first signup
- SMS Retriever API for autofill (native)
- Splash ≤ 1000ms, brand-color window bg to kill white flash

## Gap list vs current src/pages/Auth.tsx

| # | Gap | Severity | Layer | Status |
|---|-----|----------|-------|--------|
| 1 | Auto-recovery timeout = 4500ms — full-screen "Restoring your session…" blocks UI up to 4.5s on cold open. Industry TTID < 2000ms | HIGH | Web | FIX NOW |
| 2 | No 60s visible resend countdown — 3 resend buttons (email login, email signup, WhatsApp phone) are tappable instantly. Industry standard = 60s lockout countdown shown to user | HIGH | Web | FIX NOW |
| 3 | No SMS Retriever API autofill on Android | MED | Native (APK rebuild) | DEFERRED — needs Capacitor plugin |
| 4 | No M3 motion tokens for screen transitions (default React render) | LOW | Web | SKIP — design-sacred, dialogs use shadcn defaults |
| 5 | Gender selection currently deferred to Home page (see line 2667 comment) — industry shows it mandatorily after first signup | MED | Web flow | DEFER — already implemented post-login on Home, acceptable |
| 6 | Glow orbs use `filter: blur(60px)` × 3 + infinite pulse — Helio G35 risk > 8ms/frame | LOW | Web | SKIP — design-sacred (visual element) |
| 7 | Google Sign-In via web OAuth, not Credential Manager native | MED | Native (APK rebuild) | DEFERRED |
| 8 | No Baseline Profile shipped → −15-30% cold start lost | MED | Android (Gradle) | DEFERRED |
| 9 | White-flash potential on Activity transitions | LOW | Android theme | DEFERRED — needs windowBackground=brand color check |

## This-phase web fixes (design-sacred, functional only)

### Fix #1 — Recovery timeout 4500ms → 2000ms
File: src/pages/Auth.tsx:427

### Fix #2 — 60s resend countdown timer
File: src/pages/Auth.tsx (handleResend* + buttons at 2654, 2778, 3042)
- Add `resendCountdown` state, ticker effect
- Disable button + label "Resend in {N}s" during countdown, restore "Resend Code" at 0

## Deferred (APK rebuild / native)
3, 7, 8, 9 — bundled into Phase 1.B = "Auth native polish" to ship with next APK. Will revisit when user opts in to APK work.

## Verification
Owner-account self-test via preview (smdollarex923@gmail.com) — email OTP flow + phone OTP flow + session-restore cold open timing.
