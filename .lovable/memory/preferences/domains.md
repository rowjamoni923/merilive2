---
name: Project domains & hosting
description: Which domain hosts what — main app on Cloudflare, landing on Lovable. NEVER confuse.
type: preference
---
**Hosting split:**
- **`merilive.com` → hosted on Cloudflare** (NOT Lovable). This is the **main production app** — users open this. Do NOT try to connect it to Lovable Custom Domains, do NOT touch its DNS from Lovable side.
- **`merilive.top` → hosted on Lovable** (custom domain in this project). Used **only for the landing page**.
- **`merilive2.lovable.app`** = Lovable published URL (backup of landing page).
- **LiveKit SFU:** `wss://livekit.merilive.xyz` (self-hosted VPS, unchanged).

**Implications:**
- Supabase Edge Functions → Allowed Origins MUST include `https://merilive.com` + `https://www.merilive.com` (+ lovable preview/published origins). Without these the main Cloudflare-hosted app gets `forbidden_origin` on edge function calls.
- OAuth redirects / CORS / any "main app domain" config → `merilive.com`.
- Never suggest "connect merilive.com to Lovable" — it's deliberately on Cloudflare so Cloudflare can serve the app.
- Never call `merilive.top` the main domain.
