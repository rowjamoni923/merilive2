# Random Match Call (Match Call) — Implementation Plan

Research complete (Chamet/Poppo/Olamet/Bigo/HiiClub/WeJoy/Crush Live/Hollah/Kome). Full report: `/mnt/documents/random-match-call-competitive-research.md`. Industry-verified defaults locked: **40s minimum billable**, **90s free trial**, **60% host / 40% platform**, **15s host ring timeout**, **3 flash-disconnects/hour → 30 min pool ban**.

## What gets built

### 1. Database (1 migration)
- `random_call_settings` — admin-editable singleton (price/min/max, min_billable_seconds=40, free_trial_seconds=90, host_split_pct=0.60, ring_timeout=15, flash thresholds, daily skip cap, VIP multipliers, no-match timeout)
- `random_call_queue` — waiting callers + hosts, indexed for fast atomic matching
- `random_call_sessions` — every match (status: ringing/active/completed/sub_minimum/aborted, duration, coins_charged, beans_awarded, ended_by)
- `host_match_preferences` — opt-in, rate, langs, blocked users, flash-disconnect counter + cooldown
- RPCs: `claim_match` (FOR UPDATE SKIP LOCKED), `pre_authorize_random_call`, `settle_random_call` (enforces 40s rule)
- GRANTs + RLS per project standards

### 2. Edge Functions (3)
- `random-call-enqueue` — pre-auth coins, insert queue, attempt instant match, broadcast `incoming_call` via Supabase Realtime to host
- `random-call-cancel` — release hold, mark cancelled
- `livekit-webhook-random` — on `room_finished`: enforce 40s rule (host=0 beans, caller=no refund unless within free trial), bump flash counter if host ended early, credit beans/debit coins otherwise

### 3. Admin Panel
- New menu item **"Random Call"** under existing admin pricing/settings section (same pattern as private-call price page → single source of truth)
- `AdminRandomCallSettings.tsx` — all knobs editable, "Not configured" guard if row missing, instant reflection
- Sub-tab: live sessions monitor + flash-disconnect leaderboard

### 4. User UI
- Home tab → **"Match Call"** button (existing nav, professional Chamet-style icon)
- `RandomCallSearchScreen.tsx` — spinning globe animation, gender/country chips (country gated by VIP if admin enables), cancel button, queue position
- `IncomingRandomCallScreen.tsx` — reuses existing private-call ring UI (15s timer from admin config)
- In-call: existing LiveKit private-call screen reused; adds free-trial timer (0–90s "FREE") + billing ticker after
- Post-call summary: duration, coins spent, rate host ★

### 5. Anti-abuse
- 3s skip cooldown, 30 daily skips, 3-flash-disconnect/hour → 30min pool ban (all admin-configurable)
- Coin pre-authorization (2 min @ host rate) before queue entry — insufficient balance rejected immediately
- LiveKit webhook is sole source of truth for billing (no client-side timer trust)

## What does NOT change
- Existing private-call (direct 1-on-1 from host profile) untouched
- LiveKit native plugin / camera path untouched (decoder/SFU only — no Android rebuild needed for this feature, edge-only)
- All existing pricing/wallet/withdraw flows intact
- Design language matches existing private-call screens (no redesign)

## Defaults (admin-editable, English-only UI strings)
| Setting | Default | Source |
|---|---|---|
| min_billable_seconds | 40 | Chamet agency policy |
| free_trial_seconds | 90 | Chamet Free Chat Card |
| host_split_pct | 0.60 | Chamet/Olamet standard |
| host_min_rate_coins_per_min | 1200 | Chamet floor |
| host_max_rate_coins_per_min | 20000 | Chamet ceiling |
| ring_timeout_seconds | 15 | Industry standard |
| match_timeout_seconds | 300 | Industry standard |
| daily_skip_limit | 30 | Industry standard |
| flash_disconnect_threshold | 3 / 1 hr | Industry standard |
| flash_disconnect_cooldown_min | 30 | Industry standard |

## Verification plan (owner test account)
Login as `smdollarex923@gmail.com` → Home → Match Call → enqueue → second window as host opts in → match → end at 20s (verify host gets 0, caller no refund) → second call end at 60s (verify host gets beans, caller charged correctly) → check admin panel settings reflect instantly when changed.

## Out of scope (this turn)
- AI nudity/minor moderation (Phase 2 — needs Vision API decision)
- VIP score multiplier UI (defaults applied in matching algo; VIP UI later)
- Mass-market matching (we're starting with simple gender + lang preference; Chamet's 6-factor score = Phase 2)

Ship as one coherent migration + 3 edge functions + admin page + match-call user screens.
