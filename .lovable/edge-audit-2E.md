# Sub-wave 2E — Profile / Social / Notifications / Misc audit

Origin guard (`isAllowedOrigin`) added to 19 user-facing endpoints. Native/curl/server-to-server unaffected; unknown browser origins now get 403.

1.  ai-chat (JWT-gated AI chat)
2.  ai-chat-reply (JWT-gated AI reply)
3.  notify-new-message (JWT, recipient push)
4.  translate (JWT, translation)
5.  speech-to-text (audio → text)
6.  support-chat (JWT, support flow)
7.  r2-upload (JWT, R2 signed upload)
8.  delete-reel (JWT or admin token)
9.  detect-phone-number (JWT, OCR phone scan)
10. scan-image-contact (JWT, contact-info OCR)
11. scan-svga-audio (svga payload scan)
12. verify-rating-screenshot (rating proof)
13. tencent-beauty-sign (Tencent SDK sig)
14. sync-user-profile (JWT, profile sync)
15. convert-anonymous-to-guest (guest upgrade)
16. fetch-exchange-rates (admin-token preferred; guard adds defense)
17. analyze-error (admin/internal)
18. ranking-ai-advisor (admin AI)
19. presence (room presence)

Skipped — already secure or intentionally public:
- party-room, live-stream, agora-cloud-recording → neutered (410/deprecated)
- public-gift-media, public-profile-avatar, app-assets, r2-proxy, detect-country → intentional public asset/lookup endpoints (wildcard required)
- All `admin-*` functions → gated by `x-admin-access-token`
- All `livekit-*-ops` / `livekit-webhook*` → server-only (HMAC or cron secret)
- `call-billing-tick`, `pk-battle-tick`, `leaderboard-rewards`, `distribute-leaderboard-rewards`, `game-auto-runner`, `expire-noble-subscriptions`, `agency-weekly-transfer`, `agency-commission-distribute`, `send-reengagement-push`, `fix-bd-hosts-country`, `sync-old-data`, `sync-storage`, `migrate-helper-payment-logos`, `migrate-face-avatars` → cron / one-shot internal (`x-cron-secret` / `x-internal-secret`)
- `livekit-webhook`, `local-payment-ipn`, `game-balance-callback` → HMAC-verified webhooks
- `auth-email-hook`, `handle-email-suppression`, `handle-email-unsubscribe`, `send-*` email/OTP/push → provider-only callers
- `auto-face-verify`, `payroll-helper-bonus` → neutered (410)

## Wave 2 summary
| Sub-wave | Scope | Hardened |
|---|---|---|
| 2A | Money / Auth / OTP | 9 |
| 2B | LiveKit / Calls | 5 |
| 2C | Gift / Game / Reward | 6 |
| 2D | Moderation / Face / Anti-abuse | 10 |
| 2E | Profile / Social / Notifications / Misc | 19 |
| **Total** | | **49** |

All remaining ~100 functions are either admin-token-gated, cron-secret-gated, HMAC-webhook-gated, neutered (410), or intentional public asset endpoints.

Wave 2 (Edge Function Security Audit) **complete**.
