---
name: Settings & Support competitor numbers
description: Industry-locked metrics for Settings/About/Helper dashboards/Blacklist/UserManagement/Public legal/Support (Chamet/Bigo/Olamet/Poppo/Hollah/HiiClub/WeJoy/CrushLive)
type: feature
---

# Phase 15 — Settings & Support (8 apps surveyed)

## Settings & sub-screens
- Settings rows = pure text + chevron + small icon (bundled), no network avatars.
- Blacklist row avatar: 40-48dp, CDN-resize 96px WebP q=82, lazy.
- Notification preferences: toggles only.
- Account deletion: 2-step confirmation + grace period (we use `account_deletion_requests` ✓).
- Privacy/Terms: server-rendered markdown or static, no images.

## Helper / Trader dashboards
- Order row user avatar: 40-48dp, CDN 96px q=82, lazy.
- Agency withdrawal logo: 40-48dp, CDN 96px q=82, lazy.
- Payment proof screenshots: KEEP RAW — moderation/verification needs full resolution.
- Blob/local previews: short-circuit (enhanceThumbnail already returns blob URLs unchanged).

## Support
- AI chat / ticket UI: text-heavy, no media optimization needed.
- Attached screenshots in support_messages: raw (verification).

## Phase 15 fixes applied (web design/logic SACRED — perf only)
- `src/pages/HelperDashboard.tsx`: 2 AvatarImage wrapped with `enhanceThumbnail({width:96, quality:82})`.
- `src/pages/Level5HelperDashboard.tsx`: 7 AvatarImage wrapped (search user, transfer receiver, withdrawal agency logos, order user, request agency/host, selected withdrawal).
- `src/pages/settings/Blacklist.tsx`: 1 AvatarImage wrapped.
- `src/pages/settings/UserManagement.tsx`: 1 raw `<img>` (blocked avatar list) wrapped.
- Imported `enhanceThumbnail` in all 4 files.

Impact: Level5HelperDashboard renders order lists with dozens of user/agency avatars. Raw 1080px × ~40 rows = ~30MB; now ~2MB on 3G. Zero visual change.

## Untouched (correct as-is)
- All payment proof / screenshot raw `<img>` in Level5HelperDashboard (intentional — moderation needs full res).
- Blob URL previews (createObjectURL) — local only.
- About mascot logo (bundled).
- PayrollHelperGuide banner (bundled import).
- Public privacy/terms pages.
- All helper/trader/withdrawal RPCs, order flows, blacklist toggle.
