---
name: merilive.top is landing-only — never an app/edge origin
description: Strict rule — merilive.top serves only the marketing landing page. App, edge functions, OAuth, CORS allow-lists must use merilive.com only.
type: constraint
---

# merilive.top = landing page ONLY

**Locked 2026-06-10 by user explicit instruction (3rd time).**

## Rule
- **App / Android WebView / OAuth / Edge function CORS / API calls** → use **`merilive.com`** (the main domain) only.
- **`merilive.top`** is the marketing/download landing page hosted via the AdminLandingPageManager — nothing else.
- **Never** add `https://merilive.top` or `https://www.merilive.top` to:
  - any CORS allow-list (`ALLOWED_APP_ORIGINS`, per-function origin sets)
  - OAuth redirect URIs
  - API base URLs
  - share-link generators (`adminLinkOrigin` already correctly blocks .top for admin routes — keep it that way)
  - email / push deep links

## Where `.top` IS allowed (do not break these)
- `src/utils/publicRoutes.ts` — host check that recognizes `.top` as landing-only.
- `src/utils/adminLinkOrigin.ts` — blocks admin links from being generated on `.top`.
- `src/utils/inAppNavigation.ts` — recognises `.top` as a marketing host.
- `src/pages/admin/AdminLandingPageManager.tsx` — admin UI to manage `.top` landing content.
- `src/App.tsx` — host-based routing that serves landing-only on `.top`.
- Migration `20260607222142_*.sql` — historical asset URL on `.top`.

## Why
User said (verbatim, 2026-06-10): "এখানে আমাদের শুধুমাত্র main domain টাকে ব্যবহার করবি … আমি এখানে তোর এখানে এটা connect করছি শুধুমাত্র এটার landing page এর জন্য top domain টা।"

## How to apply
Before adding any new domain to a CORS list, OAuth config, deep link, or API constant: **only** `merilive.com` + Lovable preview origins + Capacitor origins. If you catch yourself typing "merilive.top" anywhere outside the landing-page surfaces listed above → STOP and re-read this file.
