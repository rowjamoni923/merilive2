# Sub-wave 2D — Moderation / Face / Anti-abuse audit

Hardened (added `isAllowedOrigin` defense-in-depth, browser-only origins rejected with 403; native/curl/server-to-server unaffected):

1. content-moderate — JWT-gated (auth.getUser), AWS Comprehend.
2. detect-vpn — public lookup; origin guard limits browser abuse.
3. face-check — JWT-gated (auth.getUser).
4. face-verification-analyze — JWT or x-cron-secret path; guard applied (no-origin server calls still allowed).
5. live-frame-monitor — JWT-gated, stream-owner check.
6. live-voice-moderate — JWT-gated.
7. moderate-reel-rekognition — JWT-gated.
8. moderate-video-sightengine — JWT or x-admin-token.
9. process-face-verification-v3 — JWT-gated.
10. verify-play-integrity — JWT-gated.

Already secure / no changes:
- ai-moderator → `x-moderator-token` shared secret (agent-only).
- livekit-auto-moderator → `x-auto-moderator-secret` shared secret.
- livekit-moderate → admin token OR host JWT with row-level ownership check.
- admin-rerun-face-verify → admin-validated JWT.
- migrate-face-avatars → admin-validated JWT.
- purge-face-verification-images → `x-cron-secret` / `x-internal-secret`, no CORS.
- auto-face-verify → neutered (410 Gone, Pkg357).

Next: Sub-wave 2E.
