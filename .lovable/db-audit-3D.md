# Sub-wave 3D — High-value table RLS deep audit

## Scope
Manually reviewed RLS policies on 20 sensitive tables: identity, money, messaging, calls, admin, PII, secrets.

## ✅ Already correctly hardened (no change needed)

| Table | Posture |
|---|---|
| `profiles` | Authenticated users see **only own row**; admins via header. Cross-user reads must go through `profiles_public` view or RPC. |
| `coin_transactions` | Owner SELECT only; **no client writes** (all credits/debits via SECURITY DEFINER rpc whitelisted in 3C). |
| `coin_transfers` | Owner-or-counterparty SELECT; INSERT/UPDATE/DELETE explicitly blocked with `false`. |
| `recharge_transactions` | Owner SELECT + admin write; **no client INSERT** (edge fn / service_role only). |
| `billing_ledger` | Participant-only SELECT, no client writes. |
| `private_calls` | Participants SELECT/UPDATE + admin; no client INSERT/DELETE. |
| `messages` | Conversation participants only; block-list enforced on send. |
| `group_messages` | Group-members only; UPDATE/DELETE explicitly `false` for clients. |
| `conversations` | Participants only; block-list enforced on create. |
| `admin_users` | Multi-layer: admin session + owner session + JWT admin check. Owner-only mutations. |
| `device_tokens` | Owner-scoped CRUD (correct — user manages own push tokens). |
| `device_session_exchange_tokens` | `service_role` only. |
| `phone_otps`, `email_otps`, `password_reset_otps`, `admin_login_otps` | No anon/auth read paths; only admin-session or service-role policies. |
| `face_records` | Admin only. |
| `face_verification_submissions` | Owner read/insert + admin (gated by `current_admin_id_from_header()`). |
| `play_integrity_verdicts` | Owner read only. |

## 🟡 One real improvement

**`user_roles`**: currently the **only** SELECT policy is `is_active_admin_session()`. Logged-in users can't read their own role assignments — they have to rely on the `has_role()` SECURITY DEFINER function (which works fine). Adding an explicit self-read policy:
- Lets the React app check its own role list without a function call.
- Doesn't widen exposure (still scoped to `user_id = auth.uid()`).
- Aligns with the canonical Supabase user-roles recipe.

## 📋 Documentation-only findings

### Cross-user `profiles` reads from app code
Grep found ~10 places in `src/` that call `.from('profiles').select(...).in('id', otherUserIds)` or `.eq('id', otherUserId)` for **non-self** users (AgencyDashboard host list, Profile.tsx target user wallet, etc.). With current RLS these return **empty rows** unless the caller has an admin session. They appear to be either:
- Silent dead code (returns empty, UI falls back to placeholder), or
- Working only because the caller is also an admin in test, or
- Pre-existing latent bugs that have not been reported.

**Recommendation (NOT applied here):** migrate these calls to `profiles_public` view (already exposes safe public columns) or to a dedicated RPC. Out of scope for 3D since it's a code change, not RLS hardening — flagging for a future code sweep.

### `roles {anon,authenticated}` on admin policies
Several policies list both `anon` and `authenticated` in their role list while the USING clause requires `is_active_admin_session()` or `current_admin_id_from_header()`. Functionally identical (anon will never satisfy admin gate), but cosmetically noisy. Not changed — non-impact.

## Migration
`wave3d_user_roles_self_read` — single CREATE POLICY.
