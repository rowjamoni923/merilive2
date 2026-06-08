# PK Battle — Native Android Polish Plan

Research-locked (Bigo/Chamet/ZEGOCLOUD/Tencent TUILiveKit + Agora→LiveKit translation). Plan keeps the **React PK design 100% untouched** — only adds native sound, haptic, and full-screen winner/loser cues that WebView cannot deliver smoothly.

We reuse plugins that already exist in the APK (no new Kotlin files, no new gradle deps, no MainActivity changes). This means: **one APK rebuild after Phase NP3 ships the asset list — that's it.**

---

## What stays untouched

- All PK React components (Panel, Active, Result, Punishment, Request) — design + layout + animations
- Server-authoritative score, autoend trigger, cron tick — all P1-P5 work
- Supabase Realtime sync (already < 200 ms, matches industry standard)
- Score bar fill animation (Framer Motion at 300 ms is within industry norm)

---

## What gets native-polished

### Phase NP1 — Native SFX bank with auto-ducking
Plays five PK sounds through the existing `GiftAudioMixer` (SoundPool ≤4, master ducking already wired):

```text
battle-start.mp3   → on status='active' transition
countdown-321.mp3  → at T-3s of timer
time-up.mp3        → at T-0
victory.mp3        → on winner_user_id === currentUserId
defeat.mp3         → on winner_user_id !== currentUserId
```

Wiring lives in a new tiny hook `usePKBattleSfx(battle)` consumed by `PKBattleActive`. Web = silent no-op (mixer methods already guarded).

### Phase NP2 — Native haptic cues
Uses existing `VibrationPlugin`. Triggers only on the affected user's device:

```text
gift received during PK  → 30 ms light tick (host only)
battle start             → double-tap (both hosts)
time up                  → 80 ms medium
victory                  → 50-30-50 ms triple
defeat                   → single 120 ms heavy
```

Lives in same `usePKBattleSfx` hook. Already Android-only; web no-op.

### Phase NP3 — Full-screen VAP winner / defeat cue
Routes through existing **NativeGiftAnimationPlugin** (Pkg438) using `tryPlayUrl()` — no new plugin code needed. We just supply asset URLs from a new admin-configurable table `pk_battle_assets` (one row per cue: `start_vap_url`, `victory_vap_url`, `defeat_vap_url`, optional `punishment_sticker_url`). Falls back to current React result modal if asset missing or web platform.

Punishment sticker = single PNG/VAP overlaid via the native plugin on the loser tile during the 90 s window, replacing the current CSS dim wash for Android while React overlay stays as fallback.

### Phase NP4 (optional, skip unless jank observed)
Move score-bar width animation from Framer Motion to a thin native `ValueAnimator` bridge. Skipping by default — Bigo/Tencent use 300 ms native ValueAnimator, our 300 ms Framer Motion in WebView is visually equivalent on mid+ devices. Will revisit only if device QA flags jank.

---

## Files touched

**New (small):**
- `src/hooks/usePKBattleSfx.ts` — orchestrates NP1+NP2+NP3 from server-authoritative `pk_battles` row state
- Supabase migration: `pk_battle_assets` table (admin-configurable URLs, per existing admin-rates rule)

**Edited:**
- `src/components/live/PKBattleActive.tsx` — adds `usePKBattleSfx(battle)` call (one line, no UI change)
- `src/components/live/PKBattleResult.tsx` — fires victory/defeat cue via the hook (one line)
- `src/components/live/PKPunishmentOverlay.tsx` — optional native sticker via `tryPlayEntryUrl`, React overlay stays as fallback

**Zero edits to:** Kotlin plugins, MainActivity, gradle, native manifest.

---

## Honesty checkpoint

- All five Phase NP1+NP2+NP3 React/SQL changes ship via WebView → users get them **without** an APK rebuild
- The SFX/VAP assets themselves must be uploaded to Supabase Storage (admin task)
- APK rebuild is **not required** because we only call existing native plugins through their existing JS wrappers
- Owner can test in preview with smdollarex923@gmail.com (web SFX/VAP will no-op silently; Android device will play them)

---

## Anti-cheat (already in place — confirming, not adding)

- Server-authoritative score via `bill_pk_gift` RPC ✅
- `pk_battles.status` autoend trigger ✅
- Cron 5 s safety net ✅
- Gift de-dup via `pk_battle_gifts` PK ✅
- Level ≥ 5 gating on PK initiation ✅

No new anti-cheat work needed; current state matches Bigo/Chamet standard.

---

## Order of execution

1. Write migration for `pk_battle_assets` + GRANTs + admin-readable RLS
2. Build `usePKBattleSfx` hook
3. Wire one-line calls in PKBattleActive + PKBattleResult
4. Optional: wire native sticker in PKPunishmentOverlay
5. Ship. Owner uploads VAP/MP3 assets via admin panel.

Approve and I'll execute straight through.