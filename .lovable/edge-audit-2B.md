# Sub-wave 2B — LiveKit & Calls edge function audit

Date: 2026-06-10
Scope: 30 functions matching `livekit-*`, `call-*`, `webrtc-signaling`, `agora-*`.

## Findings & actions

### ✅ Already secure (no change)
| Function | Auth model | Notes |
|---|---|---|
| `livekit-webhook` | HMAC via `WebhookReceiver` using `LIVEKIT_API_SECRET` | Server-to-server; rejects unsigned posts. |
| `call-billing-tick` | `x-cron-secret` (validated inside) | Invoked only by `pg_cron`. |
| `livekit-token` | Supabase JWT OR validated `x-admin-access-token`; verifies caller is room owner (`live_streams.host_id`/`party_rooms.host_id`/`private_calls.caller_id|host_id`) before issuing room JWT | Tightened CORS (see below). |
| `livekit-moderate` | Same dual-auth pattern + host-only allow-list (`HOST_ALLOWED`) for non-admin actions | OK. |
| `livekit-{room,egress,ingress,sip,agent,update-permission,forward-participant,move-participant,room-metadata,track-egress,stream-egress,hls-egress}-ops` and host endpoints | `validate-admin-token` for admins, JWT + ownership lookup for hosts | OK. |
| `call-start` | Caller JWT + `caller_id` match; balance gate uses server-side `coins_per_minute` snapshot; `MIN_PREPAY_MINUTES` cushion (3) | OK; CORS tightened. |
| `call-deliver` | Caller JWT validated; refuses if `caller_id|host_id` mismatch; FCM payload constructed server-side; retries with exponential backoff | OK; CORS tightened. |
| `agora-token` | Caller JWT validated; verifies caller is part of the `private_calls` or owner of `live_streams` row before signing token | OK; CORS tightened. |

### 🔧 Hardened (this sub-wave)
Defense-in-depth origin guard added — request is rejected with **403 `forbidden_origin`** when the browser `Origin` header is present but not in the strict allow-list (`merilive.com`, `merilive.top`, lovable previews, Capacitor WebView origins). Non-browser callers (no `Origin` header) still pass, so server-to-server, native Android non-WebView, `pg_cron`, and curl integrations are unaffected.

Functions patched:
1. `livekit-token`
2. `agora-token`
3. `call-start`
4. `call-deliver`
5. `webrtc-signaling`

Shared helper extended in `supabase/functions/_shared/strict-cors.ts`:
- `ALLOWED_APP_ORIGINS` now includes `capacitor://localhost`, `ionic://localhost`, `http://localhost`, `https://localhost` so the Android WebView build is not blocked.
- New `isAllowedOrigin(req)` returns `true` when no `Origin` header or when it matches the allow-list.

### ℹ️ Intentionally left as wildcard CORS
Admin-only `*-ops` endpoints (`livekit-room-ops`, `livekit-egress-ops`, `livekit-ingress-ops`, `livekit-sip-ops`, `livekit-agent-ops`, `livekit-webhook-events-ops`, `livekit-track-egress`, `livekit-sip-inbound`) — these require `x-admin-access-token` validated server-side via `validate-admin-token`. The token is the real gate, and the admin console is hosted on an allow-listed origin. Adding the origin guard here is low value and risks blocking ad-hoc admin debugging. Left untouched.

### 🚫 No issues found
- No raw SQL execution paths.
- No `service_role_key` leaked to the frontend.
- All money-changing call flows (`call-billing-tick`, `call-start`, `agora-token` mid-call refreshes) go through atomic RPCs (`atomic_charge_*`) with idempotency.
- LiveKit room-name validation regex (`/^[A-Za-z0-9_\-:.]{1,128}$/`) prevents injection into LiveKit JWT claims.

## Verification
- `isAllowedOrigin` returns `true` for empty/missing `Origin` (Android native, server-to-server, curl) and for all six app origins + four Capacitor origins.
- For unknown origins, the 403 response carries the existing wildcard CORS headers so the browser still surfaces a useful error rather than a CORS opacity error.

## Next
Sub-wave **2C** — Gift / Game / Reward edge functions (~15).
