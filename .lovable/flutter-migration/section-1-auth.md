# Section 1 — Auth (Flutter Migration Spec)

**Status:** Draft awaiting user approval
**Owner:** Lovable agent
**Backend:** Unchanged (Supabase `ayjdlvuurscxucatbbah`, all existing RPCs/edge fns reused)
**Parity mode:** Hubohu (pixel + logic identical to current React)

---

## 1. Research Summary (Chamet/Bigo/Olamet/Poppo/Tango/HiiClub)

| Aspect | Industry standard | Our current | Decision |
|---|---|---|---|
| Splash | 2-3s, session check + remote config | We don't have explicit splash | **Keep current (silent restore)** — no fake loading UI (memory rule) |
| Onboarding | 3-4 slide carousel, skippable | `WelcomeOnboarding.tsx` from `onboarding_slides` table | **Parity** |
| Primary login | Google / Phone OTP / Guest | Device-ID "Start" (guest-like) + Phone OTP + Email OTP | **Parity + Google native retained** |
| Gender lock | Locked after signup, support-only change | `finalize_signup_profile` RPC locks it | **Parity** |
| Face verification | Blocking for hosts | Non-blocking, prompted after signup, blocking on Go Live | **Parity** |
| Session persistence | Google/FB link + Firebase Install ID | Hardware UUID (`Device.getId()`) + `recover_session_by_device` RPC | **Parity** |
| Terms accept | Checkbox gating login button | `agreed` state gates all buttons | **Parity** |

Full research: research report captured in chat 2026-07-01.

---

## 2. Screen Inventory (parity target)

| # | Screen | Flutter route | Source React ref |
|---|---|---|---|
| 1 | Onboarding carousel | `/onboarding` | `WelcomeOnboarding.tsx` |
| 2 | Auth landing (Start / Phone / Email buttons + Terms) | `/auth` | `Auth.tsx:2270+` |
| 3 | Gender + Name (Start flow) | `/auth/gender` | `authStep === "gender"` (`Auth.tsx:2304`) |
| 4 | Email input | `/auth/email` | `authStep === "email"` (`Auth.tsx:2444`) |
| 5 | Email OTP entry | `/auth/email-otp` | `authStep === "email_otp"` (`Auth.tsx:2527`) |
| 6 | Create password (email) | `/auth/email-password` | `authStep === "email_password"` (`Auth.tsx:2616`) |
| 7 | Login (email + password) | `/auth/login` | `authStep === "login"` (`Auth.tsx:2730`) |
| 8 | Phone input | `/auth/phone` | `authStep === "phone_input"` (`Auth.tsx:2776`) |
| 9 | WhatsApp OTP entry | `/auth/phone-otp` | `authStep === "phone_otp"` (`Auth.tsx:2920`) |
| 10 | Create password (phone) | `/auth/phone-password` | `authStep === "phone_password"` (`Auth.tsx:2994`) |
| 11 | OAuth callback | `/auth/callback` | `AuthCallback.tsx` |
| 12 | Password reset | `/reset-password` | `ResetPassword.tsx` |
| 13 | Gender selection modal (post-signin repair) | overlay | `GenderSelectionModal.tsx` |
| 14 | Ban popup | overlay | `BanPopupDialog.tsx` |

---

## 3. Backend Contract (unchanged — reused as-is)

**RPCs called from Flutter:** `recover_session_by_device`, `finalize_signup_profile`, `claim_device_id`, `record_invitation`, `join_agency`, `check_ban_on_login`, `check_signup_eligibility`, `ensure_profile_row_from_auth`.

**Edge functions called from Flutter:** `device-session-recover`, `convert-anonymous-to-guest`, `send-email-otp`, `verify-email-otp`, `otp-direct-signin`, `send-whatsapp-otp`, `send-signup-confirmation` (legacy — drop if unused).

**Supabase auth methods:** `signInWithPassword`, `signUp`, `setSession`, `getSession`, `getUser`, `refreshSession`, `signOut`, `signInWithIdToken`, `updateUser`, `onAuthStateChange`.

---

## 4. Design Tokens (extracted, must match pixel-for-pixel)

```dart
// Colors (from index.css + Auth.tsx)
const kAuthBgGradient = [Color(0xFF0F0C29), Color(0xFF302B63), Color(0xFF24243E), Color(0xFF0F0C29)];
const kGlowPurple = Color(0xFF9B87F5);
const kGlowPink   = Color(0xFFF472B6);
const kGlowBlue   = Color(0xFF60A5FA);
const kCardCream  = [Color(0xFFFFFBF2), Color(0xFFFAF5EA), Color(0xFFF5EFDF)];

// Button gradients
const kBtnStart   = [Color(0xFF9333EA), Color(0xFFD946EF), Color(0xFFEC4899)]; // purple→fuchsia→pink
const kBtnPhone   = [Color(0xFF22C55E), Color(0xFF10B981), Color(0xFF16A34A)]; // green→emerald
const kBtnEmail   = [Color(0xFF4338CA), Color(0xFF2563EB), Color(0xFF0284C7)]; // indigo→blue→sky
const kBtnLogin   = [Color(0xFFDB2777), Color(0xFFF43F5E), Color(0xFFDB2777)]; // pink→rose→pink

// Radii + heights
const kBtnRadius = 16.0;   // rounded-2xl
const kCardRadius = 24.0;  // rounded-3xl
const kBtnHeight = 40.0;   // h-10 main, h-12/h-14 dialog CTAs
const kDialogBtnHeight = 48.0;

// Typography
const kFontFamily = 'Inter'; // fallback: Poppins, system
```

**Assets to port:** `src/assets/app-logo.png`, `src/assets/auth-bg/auth-bg-2.jpg` → `merilive_app/assets/auth/`.
**Admin-configurable branding:** logo URL, background (image/video/gif/gradient), logo texts — same schema, fetched from same `admin_branding` table.

---

## 5. Validation & Error Strings (verbatim — English-only rule)

- Email regex: `^[^\s@]+@[^\s@]+\.[^\s@]+$`
- Password min: 6
- OTP length: 6
- Phone min digits: 7
- Resend cooldown: 60s
- Display name max: 30

All 40+ toast strings from audit §11 must appear **verbatim** in Flutter (English only, memory rule).

---

## 6. Native Plugin Requirements (Section 1 scope)

| Plugin | Purpose | Platform |
|---|---|---|
| `supabase_flutter` | Auth + DB + Realtime | Both |
| `google_sign_in` | Google Sign-In (retain current native flow) | Both |
| `firebase_auth` (only for Phone SMS if kept) | Legacy Firebase phone (audit says has bug — recommend dropping) | Both |
| `device_info_plus` | Hardware UUID (parity with `@capacitor/device`) | Both |
| `flutter_secure_storage` | Session persistence (parity with `@capacitor/preferences`) | Both |
| `app_links` | OAuth + password-reset deep links | Both |
| `local_auth` | Biometric unlock (parity with `BiometricAuth.ts`) | Both |
| `flutter_svg` + `cached_network_image` | Logo / bg rendering | Both |

**No new Kotlin plugin needed for Section 1** — device ID + storage handled by Dart packages. Native camera comes in Section 3+.

---

## 7. State Management

- **Riverpod** (industry standard for Supabase Flutter apps) — `authProvider` (StreamNotifier watching `supabase.auth.onAuthStateChange`), `sessionProvider`, `profileProvider`.
- No global mutable singletons. Session flows through providers.
- Post-signin side effects (ban check, native storage save, avatar prime) run inside `authProvider` listener — parity with `App.tsx:998-1208`.

---

## 8. Acceptance Criteria (must ALL pass before Section 1 = done)

1. ✅ **Design parity** — every screen matches current React pixel-for-pixel (side-by-side screenshot compare).
2. ✅ **Zero browser-chrome artifact** — no `<video>`, no browser UI anywhere.
3. ✅ **Zero regression on backend** — every RPC/edge fn call in audit §3-4 fires with identical params.
4. ✅ **Session persists across reinstall** — uninstall APK → reinstall → still logged in via device-recover RPC.
5. ✅ **All 40+ toast strings** appear verbatim, English-only.
6. ✅ **Ban check fires on every SIGNED_IN** and shows `BanPopupDialog` overlay.
7. ✅ **Gender modal shows** if profile missing gender post-signin.
8. ✅ **Deep-link password reset** opens `/reset-password` correctly.
9. ✅ **Guard behavior** — unauthenticated navigation to protected route redirects to `/auth` with `next=` param.
10. ✅ **60fps** on all Auth screens (measured via Flutter DevTools performance overlay).
11. ✅ **Cold start to Auth landing** < 1.5s on mid-range device.
12. ✅ **APK builds successfully** with `flutter build apk --release`, size < 35MB (Section 1 alone).

---

## 9. Delivery Plan (this section only)

### Step A — Foundation (1 delivery)
- Init `merilive_app/` Flutter project (Android + iOS).
- Configure `pubspec.yaml` with all packages listed §6.
- Set up Supabase client (`main.dart`), Riverpod scope.
- Theme + design tokens file.
- App router (go_router) with all 14 routes.
- Splash + native storage bootstrap.

### Step B — Onboarding + Auth landing (1 delivery)
- `WelcomeOnboarding` carousel (fetches from `onboarding_slides`).
- Auth landing screen with 3 buttons + Terms checkbox + admin branding.
- `AuthBackground` widget (gradient + animated glow orbs + admin-configurable image/video).

### Step C — Start (device-recover) flow (1 delivery)
- `handleDeviceRegistration` port: check_signup_eligibility → device-recover → signup → finalize_signup_profile → toast.
- Gender + Name dialog.
- Location detection + invitation tracking + agency join.

### Step D — Email flow (1 delivery)
- Email input → send-email-otp → OTP entry → verify-email-otp → otp-direct-signin (create or login).
- Password creation for new users.
- Login screen (email + password) via signInWithPassword.

### Step E — Phone flow (1 delivery)
- Phone input → send-whatsapp-otp → OTP entry → verify → otp-direct-signin.
- Password creation for new users.

### Step F — Callbacks + Guards + Modals (1 delivery)
- `AuthCallback` deep-link handler.
- `ResetPassword` screen.
- `authGuard` + protected route wrapper.
- `GenderSelectionModal` overlay.
- `BanPopupDialog` overlay.
- Native session storage adapter (flutter_secure_storage bridge).

### Step G — Device QA (user runs)
- User builds APK on local machine.
- Tests all 14 screens against current React app.
- Reports issues → we iterate.
- On sign-off → Section 1 marked complete.

**Total deliveries:** ~6 code drops + 1 QA loop. No timeline promise — quality-first per user directive.

---

## 10. Explicit Non-Goals (Section 1 scope boundary)

- ❌ Camera/LiveKit — Section 3+.
- ❌ Home feed — Section 2.
- ❌ Profile edit — Section 3.
- ❌ Redesign — Auth stays hubohu current design. Redesign is a separate future phase.
- ❌ Legacy `handleEmailAuth` (client-generated OTP) — dropped as insecure. Only new `send-email-otp` flow ported.
- ❌ `signInAnonymously` phone path — dropped per audit finding (`Auth.tsx:1005-1006` says "must never use").

---

## 11. Open Decisions (need user answer before Step A)

1. **Legacy `send-signup-confirmation` edge function** — drop or keep? Audit says it's parallel to `send-email-otp`. Recommendation: **drop**.
2. **`useFirebasePhoneAuth`** — audit found it uses `signInAnonymously` which breaks device recovery. **Recommendation: remove, keep only WhatsApp OTP path (which is your current primary phone flow).**
3. **Riverpod vs BLoC vs Provider** — recommending **Riverpod** (best Supabase support, most modern). Confirm?
4. **Router — go_router vs auto_route** — recommending **go_router** (official Flutter team package). Confirm?

---

**Awaiting user "যাও Step A শুরু কর" before writing any Flutter code.**
