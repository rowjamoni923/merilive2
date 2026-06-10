# Sub-wave 3A — Quick wins (Views + RLS gaps + permissive policy)

## Findings & actions

### 1. SECURITY DEFINER-equivalent views (4 ERRORs)
Views without `WITH (security_invoker=on)` run with the view-owner's (postgres) permissions, bypassing the caller's RLS. Affected:

| View | Risk | Action |
|---|---|---|
| `agencies_public` | Public agency list — intentionally public, but should respect `agencies` RLS | `ALTER VIEW ... SET (security_invoker=on)` |
| `auto_action_log` | UNION of recharge_transactions / agency_withdrawals / helper_withdrawal_requests / payroll_requests / agency_commission_history — **money rows!** | `security_invoker=on` (critical) |
| `pk_agency_leaderboard` | Aggregates `pk_battles` + `agency_hosts` | `security_invoker=on` |
| `profiles_public` | Curated public profile columns | `security_invoker=on` |

### 2. RLS-enabled-no-policy (5 INFOs)
| Table | anon/auth grants? | Action |
|---|---|---|
| `admin_login_challenges` | None | OK — deny-all by design (server-only). Document. |
| `agency_app_otps` | None | OK — server-only. Document. |
| `followers_unfollow_audit` | None | OK — audit log, server-only. Document. |
| `notification_push_dispatches` | None | OK — server-only. Document. |
| `otp_exchange_tokens` | **anon+auth ALL** | REVOKE all client grants (server-only OTP exchange). |

### 3. Always-true write policy (1 WARN)
`private_call_diag.diag_system_insert` (`INSERT TO authenticated WITH CHECK(true)`) — any logged-in user can write any rows with any `auth_uid` value. Tighten to require `auth_uid = auth.uid()`.

### 4. Extension in public (1 WARN)
`pg_net` in `public`. **Accepted** — moving `pg_net` between schemas in a live project can break cron jobs / edge functions / triggers that reference `net.http_post(...)` without a fully-qualified path. Documented in security memory.

## Migration
Single migration `wave3a_rls_view_hardening` applies all changes atomically.
