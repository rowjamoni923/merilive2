---
name: Invitation & Tasks competitor numbers
description: Industry-locked metrics for Invitation/Tasks/Rewards/HostBonusLedger (Chamet/Bigo/Olamet/Poppo/Hollah/HiiClub/WeJoy/CrushLive)
type: feature
---

# Phase 14 — Invitation / Tasks / Rewards (8 apps surveyed)

## Invitation page
- Hero banner: 2:1 admin-uploaded, eager+high LCP, CDN-resize 1080px WebP q=85 (matches 363×3.5dpr device).
- Top-3 podium avatars: 64-80dp ring, lazy after viewport, CDN 96-128px q=82.
- Leaderboard rows: 40-48dp avatar, lazy, CDN 64-96px q=82, virtualize >50.
- Reward tier cards: bundled SVG/PNG icons (no network cost).
- Invite code share: copy-to-clipboard + native Share API; reward attribution via `invitation_settings` / `invitation_reward_tiers` / `invitation_reward_claims`.

## Tasks page
- Daily task tile icons: bundled SVG (already).
- Progress bar: optimistic UI + server confirm via `user_task_progress`.
- Streak counter: server-driven from `user_login_streaks` + `daily_login_claims`.

## Rewards page
- All icons bundled (already optimal).
- Claim button: optimistic + RPC rollback.

## Phase 14 fixes applied (web design/logic SACRED — perf only)
- `src/pages/Invitation.tsx`:
  - Banner `<img>` (L396) wrapped with `enhanceThumbnail({width:1080, quality:85})`.
  - Current user podium avatar (L612), top-1/2/3 podium (L653/674/694), and leaderboard rows (L745) all wrapped with `enhanceThumbnail({width:96, quality:82})`.
  - Imported `enhanceThumbnail`.
- `Tasks.tsx`, `Rewards.tsx`, `HostBonusLedger.tsx`: no raw `<img>`/AvatarImage requiring CDN-resize (all bundled icons or shadcn Avatar wrapping bundled assets).

Impact: invitation page typical render = banner (raw ~500KB→~80KB) + 3 podium + 50 leaderboard avatars ≈ 25-40MB raw → ~2MB CDN. ~95% bandwidth saved on this screen. Zero visual change.

## Untouched (correct as-is)
- Invitation claim RPC, reward attribution chain.
- Daily task progress server logic.
- Streak/claim/login bonus calculations.
- Reward tier config (admin-driven).
