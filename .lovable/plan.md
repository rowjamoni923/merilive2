# Merilive Hybrid Rebuild — Master Plan (v2, User-Approved 2026-07-01)

> **Approach:** Flutter (UI shell) + Native Kotlin/Swift (performance layer) + React (admin + public web).
> **Timeline:** 6 months, unhurried, quality-first.
> **Platforms:** Android + iOS together (Flutter same codebase).
> **Migration order:** Section-by-section, one at a time, A-to-Z parity per section before moving on.
> **Local build:** User has Flutter installed. Lovable delivers code only; user runs `flutter build apk` / `flutter build ipa`.

---

## 🔒 Hard Guarantees (locked with user, non-negotiable)

1. **Zero browser-chrome artifact** — no stray video icon, play button, fullscreen icon, or any browser-injected UI on any video surface (viewer side, host side, preview, call, party, reels). Native SurfaceView/TextureView only, no `<video>` element anywhere in production video flow.

2. **Camera zoom parity** — hardware `minZoomRatio` + ultra-wide (0.5x) lens enumeration mandatory. Preview and broadcast share the same native SurfaceTexture — pixel-to-pixel match. Chamet/Bigo-level FOV, no digital crop-in.

3. **Performance SLA:**
   - 60 fps scroll on home / reels / chat / gift panel
   - Tap response < 100ms
   - Cold start < 1.5s
   - RAM baseline < 120MB (currently 250-400MB in WebView)
   - App size < 35MB (currently 80MB+)
   - Battery drain 40% lower than current build

4. **Design parity — hubohu same** — every section migrated MUST match current React design pixel-for-pixel: banner, colors, spacing, animations, gradients, icons, cards, modals, toasts, transitions. NO redesign during migration. Redesign is a separate phase after parity is achieved.

5. **Logic parity — A-to-Z** — every RPC call, every realtime channel, every edge function, every business rule (billing, VIP, level, gift, agency %, diamond deduction) must behave identically. Backend (Supabase) unchanged.

6. **Honest testing loop** — every phase ships code + build instructions. User builds APK locally, tests on device, gives feedback. No "trust me it works" — device verification required before next phase.

7. **Research-first per section** — before starting each section, spawn research subagent on how Chamet/Bigo/Olamet/Poppo implement it, cite sources in the section spec, THEN code.

---

## 🏛️ Architecture Split (final)

| Layer | Technology | Scope |
|---|---|---|
| **UI Shell** | Flutter 3.x (Dart) | All ~342 mobile screens — auth, home, profile, feed, chat, gift panel, wallet, VIP, agency, settings |
| **Performance Layer** | Native Kotlin (Android) + Swift (iOS) | Camera2/X, LiveKit SDK, VAP/SVGA/Lottie gift render, background call service, push, biometric, notification |
| **Admin Panel** | React + Vite (kept as-is) | Web-only, opens in browser |
| **Public Landing** | React + Vite (kept as-is) | / /about /agency /privacy /terms |
| **Backend** | Supabase (unchanged) | Auth, DB, Storage, Realtime, Edge Functions |
| **Media SFU** | Self-hosted LiveKit @ wss://livekit.merilive.xyz | Unchanged |

---

## 📋 Section Migration Order (locked)

User-approved: **one section at a time, full A-to-Z of that section, then next.**

### Section 1: Auth (start here)
Scope: splash → onboarding → login → signup → OTP → gender/role select → face verification handoff → session persistence → password reset → deep-link auth callback → account-persist-across-uninstall (Android ID) → all toasts/errors/loading states → hubohu current design.

### Section 2: Home
Scope: home shell → top banner carousel → tab bar (Popular/Nearby/New/Following) → live grid cards → offline hosts row → nav drawer → search entry → notification bell → level/VIP badges → pull-to-refresh → infinite scroll → realtime online-status updates → hubohu current design.

### Section 3-N: TBD after Section 1 & 2 shipped and tested
Likely order: Profile → Live Streaming (viewer) → Live Streaming (host/GoLive) → Party Room → Private Call → Wallet/Recharge → Gift Shop → VIP → Agency → Chat/DM → Notifications → Settings → Reels → Games → PK Battle.

---

## 🚦 Per-Section Workflow (repeat for every section)

1. **Research** — spawn subagent: how Chamet/Bigo/Olamet do this section (competitor screens, patterns, edge cases). Cite sources.
2. **Audit current React implementation** — list every screen, component, RPC, realtime channel, edge function, animation, edge case involved in this section.
3. **Write section spec** — `.lovable/flutter-migration/section-N-<name>.md` with: screens list, design tokens, native plugin needs, API contracts, acceptance criteria (all 7 guarantees).
4. **Build Flutter screens** — pixel-match current design.
5. **Wire native plugins** if needed (camera/livekit/gift/push).
6. **Wire Supabase client** — Dart supabase_flutter package, same schema, same RPCs.
7. **Deliver code + build instructions** — user runs `flutter pub get && flutter build apk --release`.
8. **User tests on device** — feedback loop.
9. **Iterate until user says "next section"**.
10. **Move to next section**.

---

## 🗂️ Project Structure (final)

```
/dev-server/
├── merilive_app/              ← NEW Flutter project (mobile app)
│   ├── lib/
│   │   ├── core/              (theme, router, supabase client, utils)
│   │   ├── features/
│   │   │   ├── auth/          ← Section 1
│   │   │   ├── home/          ← Section 2
│   │   │   ├── profile/       ...
│   │   │   └── ...
│   │   └── main.dart
│   ├── android/
│   │   └── app/src/main/kotlin/  ← native plugins (Camera, LiveKit, VAP, SVGA)
│   ├── ios/
│   │   └── Runner/               ← native plugins (Swift)
│   └── pubspec.yaml
├── src/                       ← existing React (admin + public landing) — KEPT
├── supabase/                  ← unchanged
└── .lovable/
    ├── plan.md                ← this file
    └── flutter-migration/     ← per-section specs
```

---

## 📊 What User Will Get vs Current

| Metric | Current (React+Capacitor WebView) | Target (Flutter+Native) |
|---|---|---|
| UI framerate | 30-45 fps, jank | Solid 60 fps |
| Cold start | 3-5s | < 1.5s |
| RAM baseline | 250-400MB | < 120MB |
| APK size | 80MB+ | < 35MB |
| Camera latency | 400-800ms | < 150ms |
| Gift animation | CPU decode, drop frames | GPU decode, no drop |
| Background call | Unreliable | Native foreground service, reliable |
| Video icon glitch | Present | Impossible (no browser layer) |
| Camera zoom | Zoomed-in, cannot fix cleanly | Hardware min-zoom + ultra-wide, Chamet-level |

**Honest expectation:** 85-90% Chamet parity. Not 100% (they have 5 years + 100+ engineers), but indistinguishable to end users in Bangladesh/India market.

---

## ⚠️ Honest Limitations

- Lovable sandbox cannot compile Flutter APK — user builds locally.
- Lovable sandbox cannot run Flutter app for automated Playwright testing — user tests on device.
- First 2-3 months: hybrid state (some sections Flutter, some still WebView). Users may notice slight inconsistency during transition.
- Native plugin changes always require APK rebuild — no hot-reload possible for those.

---

## ▶️ Next Action

Awaiting user's "**যাও, Section 1 (Auth) শুরু কর**" to begin:
- Spawn research subagent on Chamet/Bigo auth flow
- Audit current React auth implementation (all files, RPCs, edge cases)
- Write `section-1-auth.md` spec
- Initialize `merilive_app/` Flutter project
- Build Auth screens with hubohu current design parity
