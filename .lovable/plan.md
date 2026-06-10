# Wave 3 — Database / RLS / Storage Security Audit

Supabase linter এ মোট **1347 issues** ধরা পড়েছে। Wave 2-এর মতোই sub-waves এ ভাগ করে আগাব, প্রতিটা sub-wave এর পরে আপনার approval নিয়ে পরেরটা শুরু করব।

## Issue distribution (linter snapshot)

| Severity | Count | Issue |
|---|---|---|
| ERROR | 4 | Security Definer Views |
| WARN | 564 | SECURITY DEFINER fn callable by `anon` |
| WARN | 764 | SECURITY DEFINER fn callable by `authenticated` |
| WARN | 8 | Public storage bucket allows listing |
| WARN | 1 | RLS policy `USING (true)` on write op |
| WARN | 1 | Extension installed in `public` schema |
| INFO | 5 | RLS enabled but no policy |

## Sub-wave plan (small → high impact, safe → invasive)

### 3A — Quick wins (4 ERRORs + INFOs)
- **4 SECURITY DEFINER views** → recreate as `security_invoker=true` views (Postgres 15+) so they enforce the *caller's* RLS, not the creator's. Identify each view, check what it exposes, and convert in one migration.
- **5 RLS-enabled-no-policy tables** → either add the missing policy or, if the table is server-only, leave RLS on (deny-all is the correct posture) and document why.
- **1 `USING (true)` write policy** → identify and tighten to `auth.uid()`-scoped.
- **1 extension in `public`** → move to `extensions` schema if it's `pg_trgm`/`uuid-ossp`/etc., or document acceptance.

### 3B — Storage buckets (8 buckets with public listing)
For each of the 8 buckets:
1. Inspect the bucket purpose (avatars / gift-media / chat-attachments / etc.).
2. Decide if **read** must be public (gift assets — yes) vs **listing** must be public (almost never).
3. Replace the broad `SELECT * FROM storage.objects` policy with a path-scoped policy that allows reading individual objects but not enumerating the whole bucket.

### 3C — SECURITY DEFINER function exposure (1328 warns)
This is the biggest chunk. Strategy:
1. Pull the full list of `SECURITY DEFINER` functions in `public`.
2. Classify each into:
   - **Client-callable via `supabase.rpc()`** (e.g. `has_role`, `claim_*`, `get_*` helpers) — keep `EXECUTE` to the role that legitimately calls it (`authenticated` only, almost never `anon`).
   - **Trigger-only / called internally by other definer fns** — REVOKE `EXECUTE FROM PUBLIC, anon, authenticated`. Triggers still run as table owner.
   - **Edge-function-only (called with service_role)** — REVOKE from everyone except `service_role`.
3. Generate a single migration that revokes excess EXECUTE grants. Touch nothing the app actually calls.

Risk note: aggressive revoke can break `supabase.rpc('fn_name')` calls in the React code. Mitigation = grep `src/` for every `.rpc(` call and whitelist those function names before revoking.

### 3D — High-value table RLS deep audit
Manual review of the most sensitive tables (independent of linter):
- `profiles` (127 cols, 6 policies) — column-level overshare check, especially for phone/email/balance/device fields visible to other users.
- `coin_transactions`, `recharge_transactions`, `coin_transfers`, `billing_ledger` — verify no cross-user reads, no client INSERT/UPDATE on balance-bearing rows.
- `private_calls`, `messages`, `conversations`, `group_messages` — verify participant-only visibility.
- `user_roles`, `admin_users`, `admin_*` — confirm no client-side INSERT/UPDATE; verify `has_role()` is the only way to read.
- `face_verification_submissions`, `face_records`, `play_integrity_verdicts` — verify owner-only reads (PII).
- `device_tokens`, `device_session_exchange_tokens`, `phone_otps`, `email_otps`, `password_reset_otps`, `admin_login_otps` — verify zero client read access.

For each table: read current policies, identify gaps, write a migration to tighten. Anything flagged for change goes through your approval before the migration runs.

### 3E — Data API GRANT audit
Bulk-verify every `public` table has correct GRANTs for its policy scope. Common mistakes to look for:
- `anon SELECT` on tables whose every policy is `auth.uid()`-scoped.
- Missing `service_role` grant on edge-function-touched tables.
- `authenticated INSERT/UPDATE` on tables that should be admin-only.

### 3F — Auth/security memory + scanner cleanup
Update `.lovable/memory/security-memory.md` with:
- What's intentionally public (gift media, avatars, public profile fields).
- What's intentionally server-only (OTP tables, audit logs).
- Findings that were investigated and accepted as safe.

So future scans don't keep re-flagging the same intentional patterns.

## Technical details (for reference, not user-facing)

- All migrations will follow project convention (`GRANT` block in same migration as `CREATE TABLE` / `CREATE POLICY`).
- No data UPDATEs in migrations — use the insert tool if data fix is ever needed.
- Each sub-wave produces an audit doc at `.lovable/db-audit-3X.md` (matching Wave 2 pattern).
- Owner test account (`smdollarex923@gmail.com`) will be used to smoke-test profile/wallet/call flows after sub-waves 3C, 3D, 3E.
- Research-first rule respected — competitor patterns (Chamet/Bigo/Olamet use server-authoritative balance + role tables + signed asset URLs) already match our target posture; no extra research needed before 3A/3B. 3C/3D will get a quick competitor cross-check before code.

## Recommended order

1. **3A** (small, safe, immediate wins) — start here.
2. **3B** (storage bucket listing) — short, contained.
3. **3D** (high-value table RLS) — most important security gain.
4. **3E** (GRANTs audit) — supports 3D findings.
5. **3C** (bulk SECURITY DEFINER revoke) — biggest scope, most risk → do last after rpc whitelist is solid.
6. **3F** (memory cleanup) — closes the wave.

## Confirm to proceed

3A থেকে শুরু করব? নাকি অন্য order চান (যেমন আগে 3D, পরে বাকিগুলো)?
