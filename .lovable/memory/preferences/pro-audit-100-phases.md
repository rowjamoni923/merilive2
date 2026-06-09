---
name: Pro audit — 100-phase mandate (A-to-Z professionalization)
description: Owner-locked 2026-06-09. Every page/screen/section of the app must be audited and professionalized one-by-one, Android-first, research-first, zero-leak. Even if it takes 100+ phases.
type: preference
---

# 🏆 PRO AUTID — 100-PHASE MANDATE

**Locked 2026-06-09 by owner.** This rule overrides any pressure to ship fast or batch.

## The mandate

Owner explicit: *"যদি আমাদের phase 100টাও কমপ্লিট করতে হয় সমস্ত কিছু professional ভাবে করতে হবে।"*

প্রত্যেকটা page, screen, section, button, modal, toast, animation, transition — Chamet/Bigo/Olamet/Poppo/Hollah/HiiClub-class professional standard match করতে হবে। No "good enough", no "ship now polish later", no half-pro surfaces visible to users।

## Surfaces in scope (A-to-Z, owner-confirmed)

**Pages:** Auth (start/Gmail/phone/gender), Work, Home, Create, Profile, Profile Details, Reels, Agency, Top-up, Bill
**Room screens:** Live host, Live viewer, Party host, Party viewer, Private Call
**Sections:** Gift, Message, Level, Shop, VIP Membership, My Invitation, Profile Details, Agency Details, Agency Join/Apply, Settings, Support AI Chat, Call Price Update, Call History, Offline button

প্রত্যেক surface = minimum 1 phase। Big surface (room screens, top-up) = 2-3 phase।

## Per-phase MANDATORY checklist (auto-trigger, no skip)

প্রত্যেক phase শুরু করার আগে এই ৬ step auto-run হবে। কোনো step skip করা যাবে না।

1. **🔍 RESEARCH FIRST** — `websearch--web_code_search` + `acp_subagent--explore` দিয়ে competitor analysis:
   - Chamet, Bigo Live, Olamet, Poppo Live, Crush Live, Hollah Live, HiiClub, WeJoy
   - ওই exact surface-এ তারা কী করে (loading state, transitions, error UX, empty state, micro-interactions)
   - Industry numbers (timings, thresholds, animation durations, retry counts)
   - Citations + screenshots/links plan.md-এ লিখব
2. **📱 ANDROID-FIRST AUDIT** — current implementation read করব with Android lens:
   - Lag? Flicker? Cut-off? Blur? Jank on mid-range Android (Helio G35-class)?
   - Native plugin available কিনা (LiveKit, Camera2, GPUPixel, VAP/SVGA/Lottie, FCM, Play Billing)?
   - WebView-only path থাকলে — native path-এ migrate করার plan
3. **📋 GAP LIST** — competitor vs ours, table form, plan.md-এ
4. **🔧 FIX** — code change with web-design-sacred rule (UI/copy unchanged unless owner approves visual change)
5. **✅ OWNER-ACCOUNT VERIFY** — preview-এ `smdollarex923@gmail.com / Sazzad017@` দিয়ে test। APK-only path হলে honest "APK rebuild needed" বলব
6. **🧠 MEMORY UPDATE** — phase শেষে এই file এবং relevant feature memory update। কোন competitor-এর কোন pattern পেলাম, কোন number lock করলাম — সব save

## Android-first non-negotiables (every phase)

- **No lag** — 60fps minimum on mid-range, 120fps target on flagship
- **No flicker** — skeleton/shimmer always, never blank→content jump
- **No cut-off** — safe-area insets, navigation bar, notch, status bar — all handled
- **No blur** — proper DPR-aware image sizing, never `<img>` with implicit scale
- **Instant feedback** — every tap → haptic + visual within 16ms (1 frame)
- **Offline-resilient** — every screen has offline state, not just error toast
- **Auth flow** — start button → Gmail/Phone/Gender pages must be instant transition, no white flash, no layout shift

## Hard "STOP" rules

If during a phase I find myself thinking ANY of these — STOP and ask owner:
- "এটা small enough, research skip করি" → NO, ask
- "competitor analysis already করা আছে আগের phase-এ" → NO, re-verify, surfaces differ
- "design change লাগবে professional করতে" → NO, ask owner first
- "এটা web-এ test করলেই হবে" → NO, Android-first, APK rebuild honest বলব

## Override

Owner explicit "skip research this time" বললে only তখন skip। Otherwise rule auto-fires every phase, even on phase #100.

## Cross-references

- mem://preferences/research-first-mandatory.md — research protocol details
- mem://preferences/android-only-forever — Android = primary, web = preview only
- mem://preferences/professional-never-leak — zero half-pro surfaces
- mem://preferences/google-research-before-fix — competitor list + Agora→LiveKit translation
- mem://preferences/web-design-sacred-android-native-pro — UI sacred, internals native-pro
- mem://preferences/test-account.md — owner verify credentials
