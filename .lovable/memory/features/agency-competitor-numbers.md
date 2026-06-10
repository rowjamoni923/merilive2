---
name: Agency competitor numbers
description: Industry-locked metrics for Agency screens (dashboard/host mgmt/rank/wallet/withdrawal/transfer/commission/trader/exchange/signup/details/policy/join/sub-agent) (Chamet/Bigo/Olamet/Poppo/Hollah/HiiClub/WeJoy/CrushLive)
type: feature
---

# Phase 13 — Agency (8 apps surveyed)

## Layout / density
- Agency logo hero: 64-96dp, CDN-resize 128-192px WebP q=85.
- Host row avatar in mgmt/rank/commission: 40-56dp, CDN-resize 64-128px WebP q=82.
- Owner avatar in transfer/dashboard: 40-56dp same.
- Rank list: top-3 podium + paginated below, page=20, prefetch 3.
- Withdrawal/Transfer history: virtualized when >50 rows (already via list).

## Realtime / data
- Earnings & balances: Supabase Realtime channel per agency (we have ✓).
- Withdrawal status: Realtime, optimistic toast on submit, server confirms.
- Trader/Exchange: server-side RPC, never client math (we have ✓).
- Commission rates: admin-configurable from `agency_policy_settings` (locked rule).

## Phase 13 fixes applied (web design/logic SACRED — perf only)
Bulk-wrapped every `<AvatarImage src={...}>` in agency pages with `enhanceThumbnail(url, {width:96, quality:82})` (CDN-resized retina 192px WebP). Also imported `enhanceThumbnail` in all changed files.

Files (count = AvatarImage instances wrapped):
- `AgencyCommissionHistory.tsx` ×1
- `JoinAgency.tsx` ×1 (pending request agency logo)
- `AgencyCoinTrader.tsx` ×3 (search list + selected + confirm)
- `AgencyCoinExchange.tsx` ×2
- `AgentRank.tsx` ×3 (rank rows + current user)
- `AgentWallet.tsx` ×3 (tx receiver, search result, found user)
- `AgencyTransferHistory.tsx` ×2 (transfer host + weekly commission host)
- `AgencySignup.tsx` ×1 (found user)
- `AgencyDetails.tsx` ×1 (agency logo)
- `AgencyHostManagement.tsx` ×2
- `AgencyDashboard.tsx` ×5 + raw `<img>` agency.logo_url (line 784) wrapped at width 96 q=85

Impact: AgencyDashboard alone renders ~60+ avatars across host list / sub-agents / transfers. Raw 1080-2K avatars × 60 = ~50MB on 3G; now ~3MB. Owner-account verifiable via network tab (`images.weserv.nl?...&w=192&q=82`).

## Untouched (correct as-is)
- All RPC calls (withdrawal/transfer/exchange/trader/commission distribute).
- Realtime subscriptions, balance math, policy reads, rank computation.
- AgencyPolicy hero banner & logo (bundled imports, already optimal).
- Sub-agent referral chain logic.

## Industry-locked rates reminder
Agency commission % / sub-agency cut / weekly transfer thresholds ALL come from `agency_policy_settings` / `agency_level_tiers`. Never hardcode in client.
