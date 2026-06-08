---
name: Professional quality must never leak
description: Every shipped surface (live/call/party/gift/entry/wallet/feed) must match Chamet/Bigo/HiClub/Wejoy/Olamet/Poppo standard. No half-pro screens, no "good enough", no temporary hacks visible to users.
type: preference
---

# Rule (locked 2026-06-08 by user)

User explicit: "professional করতে হবে তোমাকে … যাতে কখনো leaking না যায়।"

Every user-facing surface must hit professional live-streaming standard (Chamet / Bigo / HiClub / Wejoy / Olamet / Poppo / CrushLive class). **No exception, no temporary downgrade visible to users.**

## What this means

- Before any phase ships, the surface must be visually + behaviorally indistinguishable from named competitors on the same flow.
- No placeholder text, no debug toasts, no "TODO", no skeleton-forever, no blank black frames, no spinner-without-deadline visible to end users.
- Web design stays sacred (per mem://preferences/web-design-sacred-android-native-pro). Professional upgrade = behavior, performance, resilience, native SDK quality — not redesign.
- If a fix can only land partially, gate it behind a flag (default OFF) so users never see the half-state. Never ship partial pro polish to production.
- Every phase must include: research → gap audit → implementation → owner-account verification → "leak check" (screenshot/recording compared to competitor reference).

## Leak check (mandatory before claiming a phase done)

1. Open the surface as owner test account on real preview / APK.
2. Compare side-by-side with one named competitor screenshot for that flow.
3. Ask: would a Chamet/Bigo user notice this is "not pro"? If yes → not done.
4. Common leak sources to scan: loading spinners with no timeout, error toasts in dev language, off-brand colors slipping into native screens, camera black-frame on resume, audio click on join, gift not landing on beat, entry banner overlap, wallet balance jump, call timer drift, retry button missing.

## Forbidden phrases / patterns

- "good enough for now"
- "we'll polish later"
- "user won't notice"
- Shipping any visible Bangla/dev string in production code (see mem://preferences/english-only-ui-strings).
- Native Activity that doesn't reuse web's color/typography tokens.
