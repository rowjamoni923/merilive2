## Wave 2: Edge Functions Audit (150 functions total)

ভাই, honest reality: **150 edge functions আছে।** এক session-এ সবগুলো "100% নিখুঁত" করা মানে কোনোটাই ঠিকমতো audit হবে না — শুধু surface scan হবে আর নতুন bug আসবে। Memory-র research-first rule অনুযায়ী প্রতি function-এ Chamet/Bigo equivalent + current code + gap analysis দরকার।

তাই Wave 2-কে **risk-ordered 6 sub-wave**-এ ভাঙছি। আজকে Sub-wave 2A (highest-risk: money/auth) শুরু করব, বাকিগুলো পরের session-এ। প্রতিটা sub-wave নিজে নিজে complete + verifiable।

### Sub-wave 2A — Money & Auth (TODAY, ~15 functions)
সবচেয়ে বেশি abuse risk। এক bug = সরাসরি টাকার ক্ষতি।
- **Recharge/Payment:** `create-local-payment`, `local-payment-ipn`, `swift-pay-create-deposit`, `swift-pay-poll-deposits`, `swift-pay-create-payout`, `verify-google-purchase`, `admin-verify-purchase`, `apply-vip-recharge-bonus`, `noble-purchase`
- **Auth/Session:** `device-session-exchange`, `otp-direct-signin`, `verify-email-otp`, `send-email-otp`, `send-password-otp`, `force-reset-guest-password`, `link-device-to-account`, `link-email-to-account`

Audit checklist প্রতিটার জন্য:
1. JWT validation (`getClaims` present?)
2. Zod input validation
3. CORS headers in all responses (incl. errors)
4. service_role usage scoped (never returned to client)
5. Idempotency for money paths (idempotency_keys table use)
6. Replay/race protection
7. Amount/coin validation server-side (client-supplied amounts rejected)
8. Rate limiting

### Sub-wave 2B — LiveKit & Calls (~25 functions)
`livekit-*` (20), `call-*` (3), `webrtc-signaling`, `agora-*` (2 legacy — check if removable)

### Sub-wave 2C — Gift / Game / Reward (~15)
`gift-service`, `game-*` (7), `leaderboard-rewards`, `distribute-leaderboard-rewards`, `claim-vip-daily-reward`, `payroll-helper-bonus`, `pk-battle-tick`, `pk-invite-deliver`

### Sub-wave 2D — Moderation / Face / Anti-abuse (~15)
`face-*`, `auto-face-verify`, `process-face-verification-v3`, `content-moderate`, `ai-moderator`, `live-frame-monitor`, `live-voice-moderate`, `verify-play-integrity`, `detect-vpn`, `scan-image-contact`, `scan-svga-audio`, `moderate-*`

### Sub-wave 2E — Notifications / Push / Email (~20)
`send-*-otp`, `send-*-email`, `send-push-notification`, `send-app-notification`, `send-reengagement-push`, `push-on-notification`, `notify-new-message`, `broadcast-app-update`, `auth-email-hook`, `handle-email-*`

### Sub-wave 2F — Admin / Maintenance / Misc (~60)
`admin-*` (16), `bulk-*`, `migrate-*`, `sync-*`, `fix-*`, `fetch-exchange-rates`, `r2-*`, `tencent-beauty-sign`, `translate`, `ai-chat*`, `support-*`, helpers, agency, party-room, presence, ranking, etc.

### Approach for Sub-wave 2A
1. Research-first: WebSocket+REST patterns Bigo/Chamet payment IPN, Google Play DTSv2 verification standards, OTP rate-limit norms (Twilio/Firebase guidelines).
2. Read all 17 functions in parallel.
3. Build gap matrix in `.lovable/edge-audit-2A.md`.
4. Fix gaps via parallel file writes — one migration if DB changes needed (idempotency_keys hardening).
5. Verify with `supabase--curl_edge_functions` using owner test account.

### Why not all 150 at once
- Per-function research + gap doc takes real tokens; quality drops past ~20/session.
- Money/auth functions changed wrong = revenue loss + lockouts. Must verify each.
- Research-first memory rule explicitly forbids "skip and bulk-fix."

**Approve → আমি এখনই Sub-wave 2A start করব।** Sub-wave 2B-2F পরের message-এ একই pattern-এ।
