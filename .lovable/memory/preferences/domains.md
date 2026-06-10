---
name: Project domains
description: Which domain is the main app vs landing page. Critical — never confuse again.
type: preference
---
**Main app domain: `merilive.com`** (this is THE production app users open)
**Landing page domain: `merilive.top`** (marketing/landing only, NOT the app)
**Lovable published URL: `merilive2.lovable.app`** (backup)
**LiveKit SFU: `wss://livekit.merilive.xyz`** (self-hosted VPS, unchanged)

When adding Supabase Edge Function Allowed Origins / CORS / OAuth redirects / any "main domain" config → use `merilive.com` (and `www.merilive.com`), NOT `merilive.top`. Never call merilive.top the main domain.
