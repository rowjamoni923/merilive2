---
name: Phase 13 Cold-launch preconnect warmup
description: Added preconnect/dns-prefetch for LiveKit signaling, Supabase Storage CDN, FCM endpoints to shave 200-500ms off first stream join / image load / push registration on cold launch.
type: feature
---

DONE 2026-06-06. Phase 13 — Pure-HTML additive warmup. No JS, no plugin, no flag dance.

Added to `index.html` `<head>` (parallel TLS handshake before React boots):
- `preconnect` → `https://livekit.merilive.xyz` (LiveKit SFU signaling — saves ~150-300ms on first GoLive / stream join)
- `preconnect` → `https://ayjdlvuurscxucatbbah.storage.supabase.co` (Storage CDN — gift/avatar/banner thumbnails ready before first render)
- `dns-prefetch` → `https://fcm.googleapis.com` (Firebase push registration)
- Existing Supabase REST/Realtime preconnect already there (same host serves both).

Why: Chrome/WebView opens TCP+TLS in parallel during HTML parse. First user action that hits these hosts skips the cold handshake (~50ms TCP + ~100-200ms TLS each). LiveKit is highest-value because GoLive UX is currently bottlenecked by the SFU connect.

Zero regression risk — `preconnect`/`dns-prefetch` are inert hints; browser ignores if it can't resolve. Works on web, iOS WebView, Android WebView equally.
