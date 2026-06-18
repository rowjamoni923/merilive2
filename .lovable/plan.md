# Phase 5 — Secondary Pages Polish (Sequential)

Scope locked by user: all 4 sub-groups. Order chosen by visit-frequency × user-money-sensitivity.

## Execution order

### 5A · Profile + EditProfile (highest traffic)
- `Profile.tsx` (3,478 lines) — collapsible hero header with parallax cover, sticky tab bar on scroll, level/VIP/noble badge cluster, stats row tap-targets (followers/following/diamonds), gift wall horizontal scroll, follow/message CTAs in thumb-zone.
- `EditProfile.tsx` (1,410 lines) — avatar upload sheet, inline-edit rows with right-chevron, character counter on bio, gender/birthday pickers as bottom sheets, save button safe-area pinned.
- Reuse existing avatar-frame / level-frame / VIP-medal components — purely presentational pass.

### 5B · Wallet + Recharge + History (money-sensitive)
- `Recharge.tsx` (4,010 lines) — hero coin balance card with gradient + animated counter, package grid (2-col) with "Best Value" / "+X% Bonus" ribbons, first-recharge offer banner pinned, payment-method bottom-sheet with last-used pin, total + pay CTA sticky.
- `RechargeHistory.tsx` (431 lines) — date-grouped list, type icons (top-up / refund / bonus / withdrawal), amount color (+green / −red), empty-state illustration, filter chips.
- `AgentWallet.tsx` (809 lines) — same hero treatment, transfer/withdraw split actions.

### 5C · Leaderboard + PK Leaderboard + Rankings
- `Leaderboard.tsx` (936 lines) — top-3 podium (rank 1 elevated centre, 2 left, 3 right) with crown/frame, rank 4+ list with rank pill, period tabs (Hourly/Daily/Weekly/Monthly), region chips, sticky self-rank footer.
- `PKLeaderboard.tsx` (348 lines) — same podium pattern with PK-specific badges (wins/streak).
- `AgentRank.tsx` — agency leaderboard, same shell.

### 5D · Settings + Notifications + Privacy
- `Settings.tsx` (1,348 lines) — iOS-style grouped sections (Account / Privacy / Notifications / About / Danger), inline `Switch` toggles, right-chevron drilldown rows, destructive Sign-Out + Delete-Account at bottom in semantic destructive color, app version footer.
- `settings/NotificationSettings.tsx` — category groups (Calls / Gifts / Followers / System / Marketing) with master toggle + per-category toggles, quiet-hours card.
- `settings/Blacklist.tsx` — blocked users list with unblock confirm.

## Per-phase workflow (research-first, mandated)
For each sub-phase (5A → 5D):
1. **Research** — competitor pattern review (Chamet/Bigo/Poppo/Olamet) via subagent before any code (already in progress for all 4 — findings will be cited inline when each phase starts).
2. **Read** — current implementation in full.
3. **Polish** — presentation-only changes; preserve every handler, query, mutation, side effect. Strict design-token usage (no hardcoded colors), English-only strings, safe-area respected, thumb-zone CTAs.
4. **Verify** — tsc passes; spot-check via owner test account (`smdollarex923@gmail.com`) at preview URL.
5. **Stop & confirm** before moving to next sub-phase.

## Non-goals (out of scope this phase)
- No business-logic changes (balance math, RLS, payment flows untouched).
- No Android-native plugin edits (camera / VAP / gift-anim sacred path).
- No new tables / edge functions / migrations.
- No translation work (English-only stays).

## Starting now
Phase 5A (Profile + EditProfile) kicks off as soon as the research subagent returns. I'll post findings + diff summary before touching any file in 5A.
