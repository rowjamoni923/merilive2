# Project Memory

## Core
Chamet-class live streaming app. NEVER use polling/visibility-refresh in place of realtime. LiveKit for in-room, Supabase Realtime for everything else — both stay. Supabase = full backend (Auth/DB/Storage/Edge), never migrate to VPS. **LiveKit SFU ALREADY self-hosted on user's VPS at wss://livekit.merilive.xyz — NOT LiveKit Cloud.** No migration work needed. Always re-verify LIVEKIT_URL before discussing migration/cost.
**VPS work DEFERRED** — do NOT propose VPS docker/ssh/config tasks unless user explicitly asks. Pure Lovable code (React/edge fn/DB) is fine. See mem://preferences/vps-deferred.
**🚫 WEB GIFT animation components remain FORBIDDEN** (FullScreenGiftAnimation, FlyingGiftAnimation, GiftEmojiAnimation, VAPPlayer, gift sound, gift panel, public-gift-media). Gift = Android-native only (Pkg438). **✅ WEB ENTRY animation components UNBLOCKED 2026-06-07** — UnifiedEntryAnimation, EntryBarAnimation, useEntryAnimations, flying name, welcome chat message are now permitted (silent on web). See mem://constraints/never-touch-gift-entry-animations.
**🌐 ENGLISH-ONLY UI STRINGS** — All toasts/labels/messages/errors in app code MUST be English, never Bangla. National app. Reply to user in Bangla in chat but never in code. See mem://preferences/english-only-ui-strings.
**📋 MIGRATION PLAN MANDATORY** — Before ANY live/call/party/RTC/camera/animation task, READ `.lovable/plan.md` first, locate the phase, follow listed files only, then tick `[x]` when done. No plan-skip allowed. See mem://preferences/follow-migration-plan.
**📱 ANDROID-ONLY FOREVER** — 99% users Android. Web is NOT a delivery target, only preview/dev. All RTC/animation/payment/camera SDKs must be Android-native (livekit-android, native VAP, Camera2, FCM, Play Billing). NEVER propose web-first or "JS-now, native-later" for live/call/party/billing. See mem://preferences/android-only-forever.
**💰 ALL RATES ADMIN-CONFIGURABLE** — Call price, platform cut, agency %, sub-agency %, bonus tiers, grace seconds — ALL read from admin-controlled DB tables (`agency_policy_settings`, `app_settings`, `call_price_settings`, `host_levels` etc.). NEVER hardcode 35%/65%/2%/70-coins. Agency commission = small % of host earnings paid from company's cut (NOT cutting host further). See mem://preferences/admin-configurable-rates.
**🧹 NO DUPLICATE NATIVE SYSTEMS** — Single-owner plugin for camera (LiveKitPlugin), audio focus (AudioFocusPlugin), gift SFX (GiftAudioMixer), beauty (ONE pipeline only), call lifecycle. NEVER create parallel plugins for same hardware/pipeline. Audit existing before adding. Delete only after reference-check (production has 10K+ users). See mem://preferences/no-duplicate-native-systems.
**🔍 GOOGLE-RESEARCH-BEFORE-FIX** — For any non-trivial live/call/party/RTC/billing/animation work, research Bigo/Chamet/StreamKar/PoPo/CrushLive/HiClub/Wejoy industry standard FIRST, then code. See mem://preferences/google-research-before-fix.

## Memories
- [Follow migration plan](mem://preferences/follow-migration-plan) — MANDATORY: read `.lovable/plan.md` before any live/call/party/RTC/camera/animation work; tick `[x]` on completion.
- [Android-only forever](mem://preferences/android-only-forever) — Hard rule: native Android SDK for every RTC/animation/payment/camera path. Web = preview only, NOT a target platform.
- [Admin-configurable rates](mem://preferences/admin-configurable-rates) — All percentages/rates from DB config tables, never hardcoded. Agency commission paid from company cut, not from host.
- [No duplicate native systems](mem://preferences/no-duplicate-native-systems) — Single-owner rule for camera/audio/beauty/call plugins. Audit + reference-check before deleting any plugin (10K+ production users).
- [Google research before fix](mem://preferences/google-research-before-fix) — Spawn research subagent / websearch on pro apps before non-trivial RTC/billing/animation code.
- [Owner test account](mem://preferences/test-account.md) — Always-available preview login (smdollarex923@gmail.com) for end-to-end self-testing.
- [Phase 0.5 Native Plugin Audit](mem://features/phase-0.5-native-plugin-audit) — DONE 2026-06-07. Deleted Pkg435 NativeAudioEnginePlugin + NativeVideoEnginePlugin + JNI cpp + CMake. No real duplicates — layered beauty/call/audio designs confirmed legitimate.
- [Phase 3 Private Call audit](mem://features/phase3-private-call-audit) — DONE 2026-06-06.
- [Pkg438 Native gift+entry animation Phase A](mem://features/pkg438-native-gift-entry-animation-phase-a) — DONE 2026-06-06. Android-only foundation. Phase B (JS dispatcher) → Plan Phase 5.
- [Pkg425 Trader wallet history + instant UI](mem://features/pkg425-trader-wallet-history-instant) — DONE 2026-06-06.
- [Pkg424 instant-play warmup](mem://features/pkg424-instant-play-warmup) — DONE 2026-06-05.
