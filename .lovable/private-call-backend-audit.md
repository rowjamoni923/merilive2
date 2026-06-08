# Private Call Backend Security & Correctness Audit
**Date:** 2025-06-08  
**Scope:** Supabase edge functions + migrations for private-call lifecycle, billing, FCM, and rating  
**Standard:** Chamet/Bigo professional 1-on-1 call platform

---

## Edge Functions Audited
| Function | Role |
|---|---|
| `call-start` | Pre-call balance gate (caller JWT) |
| `call-deliver` | FCM + notifications row dispatch |
| `call-billing-tick` | Per-minute server billing cron worker |

## Tables Audited
`private_calls`, `billing_ledger`, `call_events`, `call_delivery_log`, `device_tokens`, `profiles`

---

## Findings

### 1. Lifecycle Writer Authority

**[BUG/P0] — `private_calls` RLS UPDATE policy has no `WITH CHECK` clause**  
- **File:** `supabase/migrations/20260223122305_*.sql` → policy "Participants can update own calls"  
- **Problem:** Policy is `USING (auth.uid() = caller_id OR auth.uid() = host_id)` with **no `WITH CHECK`**. Any authenticated participant can directly `UPDATE private_calls SET status='ended', coins_spent=0` bypassing all server-side RPCs. A caller can zero out billing or force-accept a call they didn't accept.  
- **Repro:** `supabase.from('private_calls').update({status:'ended', coins_spent:0}).eq('id', callId)`  
- **Severity:** P0

**[MISSING/P1] — Two concurrent billing writers: `deduct_call_coins_per_minute` (authenticated) + `bill_call_minute` (service_role)**  
- **File:** `supabase/migrations/20260524131056_*.sql:436` — `GRANT EXECUTE ON FUNCTION deduct_call_coins_per_minute(uuid) TO authenticated`  
- **Problem:** The old client-callable billing RPC still has `GRANT EXECUTE TO authenticated`. If clients still call it AND pg_cron calls `bill_call_minute`, the same minute can be billed twice. `bill_call_minute` is idempotent via `billing_ledger UNIQUE(call_id, minute_number)`, but `deduct_call_coins_per_minute` writes to `profiles.coins` directly with no ledger guard → double deduction from caller.  
- **Repro:** Client fires `deduct_call_coins_per_minute(call_id)` at T=60s; pg_cron fires `bill_call_minute` at T=60s → both pass the `coins >= rate` check in separate transactions → coins deducted twice.  
- **Severity:** P1

---

### 2. Idempotent Transitions

**[BUG/P1] — `accept_private_call` and `end_private_call` RPCs use caller auth.uid() but no FOR UPDATE on status check**  
- **File:** `supabase/migrations/20260117005439_*.sql` (`accept_private_call`), `20260221133519_*.sql` (`end_private_call`)  
- **Problem:** Both RPCs fetch call row (`SELECT … WHERE id=? AND status='ringing'`) without `FOR UPDATE`. Two concurrent accepts (e.g., double-tap on mobile) can both see `status='ringing'` and both proceed, creating two `UPDATE … SET status='connected'` — Postgres serializes these but both see the WHERE match.  
- **Repro:** Send two simultaneous `accept_private_call` calls; second one succeeds even though status is already `connected`.  
- **Severity:** P1

**[BUG/P1] — `end_private_call` allows endpoint to be called on already-ended call**  
- **File:** `supabase/migrations/20260221133519_*.sql` — `WHERE id=_call_id AND status IN ('ringing','connected')`  
- **Problem:** Guard is present but the final `UPDATE private_calls SET status='ended'` is not atomic with the SELECT; concurrent calls can both pass the guard. Also, a client can bypass the RPC entirely via the RLS UPDATE gap (Finding 1) and set `status='ended'` again, re-triggering any AFTER UPDATE trigger (e.g., `auto_credit_agency_commission_from_call`).  
- **Repro:** Two concurrent POST to `end_private_call` RPC → agency commission trigger fires twice.  
- **Severity:** P1

---

### 3. Billing Tick Correctness

**[MISSING/P0] — `call-billing-tick` edge function has NO authentication check**  
- **File:** `supabase/functions/call-billing-tick/index.ts:28-37`  
- **Problem:** No JWT verification, no secret header check. CORS allows `*`. Any unauthenticated HTTP POST to the function URL will trigger a full billing run against all connected calls. An attacker can flood it to rack up billing charges or force-end all active calls.  
- **Repro:** `curl -X POST https://<project>.supabase.co/functions/v1/call-billing-tick` with no auth.  
- **Severity:** P0

**[BUG/P1] — pg_cron schedule uses `current_setting('app.settings.service_role_key', true)` which may return NULL**  
- **File:** `supabase/migrations/20260608013016_*.sql:29`  
- **Problem:** `current_setting('app.settings.service_role_key', true)` returns NULL if the PostgreSQL setting is not configured, sending `Authorization: Bearer ` (null string). Because the edge function doesn't validate auth (Finding above), requests succeed, but if auth is ever added, the cron job will silently stop billing. No error alerting.  
- **Repro:** Don't set `app.settings.service_role_key` in DB config → cron fires → billing auth header is blank.  
- **Severity:** P1

**[WEAK/P2] — Per-minute tick, no sub-minute disconnect billing, no reconnect-pause window**  
- **File:** `supabase/functions/call-billing-tick/index.ts`, `bill_call_minute()`  
- **Problem:** Billing fires every 60s via pg_cron. A call that ends at T=119s has billed 1 minute; 60 seconds of usage are free. No reconnect-pause tracking: a caller could disconnect and reconnect every 59s to avoid billing. Chamet/Bigo charge ceil(seconds/60) on disconnect.  
- **Repro:** Connect call, end at 119s → only 1 minute billed, 59s free.  
- **Severity:** P2

**[BUG/P2] — Low-balance warning uses non-atomic stale balance read**  
- **File:** `supabase/functions/call-billing-tick/index.ts:113-141`  
- **Problem:** After `bill_call_minute` deducts coins, a separate SELECT fetches `profiles.coins` to compute remaining minutes. This is a new snapshot query outside the billing transaction — another tick could fire (or a gift purchase) between the deduction and the read, yielding stale `remaining_minutes`.  
- **Repro:** Two concurrent ticks near balance floor → both read the same pre-deduction balance → both compute `remainingMinutes=2` → double warning broadcast.  
- **Severity:** P2

---

### 4. Atomic Deduction

**[BUG/P1] — `bill_call_minute`: coin deduction and host credit are in same PL/pgSQL fn (atomic), but `billing_ledger INSERT` is separate — partial failure path**  
- **File:** `supabase/migrations/20260608010725_*.sql:147-188`  
- **Problem:** Within the same function, profile UPDATE (coins deducted) succeeds (ROW_COUNT=1), but then `INSERT INTO billing_ledger … ON CONFLICT DO NOTHING` can silently swallow a conflict when a concurrent tick races in. If a concurrent tick has already inserted `minute_number=N`, the second tick's ledger insert is a no-op but its `UPDATE profiles` coin deduction still fires (because the `coins >= rate` check passes independently). Net result: coin deducted twice in the same minute without a ledger row for the second deduction.  
- **Repro:** Two concurrent `bill_call_minute(call_id)` RPCs for the same call → first grabs `FOR UPDATE SKIP LOCKED`; second gets `locked_or_not_found` and exits safely. Actually `FOR UPDATE SKIP LOCKED` on `private_calls` prevents this specific path — **this finding is partially mitigated** by the row lock — but is still present if the lock doesn't cover `profiles`.  
- **Severity:** P1 (reduced risk due to SKIP LOCKED, but not fully closed)

**[RACE/P1] — `deduct_call_coins_per_minute` (legacy) has no row lock on `private_calls`**  
- **File:** `supabase/migrations/20260117015349_*.sql`  
- **Problem:** Legacy RPC does `SELECT * FROM private_calls WHERE id=? AND status='connected'` (no `FOR UPDATE`), then separately `UPDATE profiles SET coins = coins - _coins_to_deduct`. Two concurrent calls both see `coins >= rate`, both deduct. No `billing_ledger` guard.  
- **Repro:** Fire two concurrent `rpc('deduct_call_coins_per_minute', {_call_id})` → double deduction.  
- **Severity:** P1

---

### 5. Low-Balance Kick

**[WEAK/P2] — Low-balance kick only fires at per-minute boundary, not intra-minute**  
- **File:** `supabase/functions/call-billing-tick/index.ts:95-108`, `bill_call_minute():156-171`  
- **Problem:** If caller's balance drops to zero between ticks (e.g., they buy coins via recharge then spend them elsewhere), the call only terminates at the NEXT 60-second tick boundary. Up to 59s of uncompensated call time possible.  
- **Severity:** P2

**[MISSING/P2] — No server-side pre-call balance reservation (escrow)**  
- **File:** `supabase/functions/call-start/index.ts`  
- **Problem:** `call-start` checks balance but does NOT escrow/lock coins. Between balance check and first billing tick (~60s), caller's coins can drop below the rate (e.g., gift purchase, another session). Call proceeds with 0-balance caller for up to 60s.  
- **Severity:** P2

---

### 6. End-Reason Enum

**[MISSING/P1] — `end_reason` is `TEXT` with no CHECK constraint**  
- **File:** `supabase/migrations/20260114003544_*.sql:11` — `end_reason TEXT` (no CHECK)  
- **Problem:** Any string can be written to `end_reason` by any participant via the RLS UPDATE gap (Finding 1). Values seen across migrations include: `'normal'`, `'declined'`, `'timeout'`, `'cleanup'`, `'stale_cleanup'`, `'stale_orphan'`, `'insufficient_funds'`, `'insufficient_coins'`, `'insufficient_balance'` — three different spellings for the same condition. No enum or CHECK constraint enforces valid values. Downstream analytics/admin panels relying on this field will silently miss events.  
- **Severity:** P1

---

### 7. FCM Dispatch

**[WEAK/P2] — FCM OAuth2 access token fetched once before retry loop; not refreshed on token expiry errors**  
- **File:** `supabase/functions/call-deliver/index.ts:273`  
- **Problem:** `getAccessToken` is called once, then the retry loop runs up to 3 attempts with exponential back-off. Token TTL is 3600s so within one call this is fine, but `UNAUTHENTICATED` FCM errors from token expiry (e.g., if the function is slow) will permanently fail all retries without re-fetching a fresh token.  
- **Severity:** P2

**[WEAK/P2] — `call-deliver` is caller-initiated (not trigger-initiated)**  
- **File:** `supabase/functions/call-deliver/index.ts:1-5`  
- **Problem:** The Flutter client calls `call-deliver` manually after `start_private_call`. A crashed/killed app will not send the notification. Should be triggered by a DB trigger on `private_calls INSERT` (via `pg_net` + service_role) to guarantee delivery regardless of client state.  
- **Severity:** P2

**[OK] — Data-only FCM payload (no `notification` field) — correct for high-priority + Doze**  
- Android: `priority: high`, no `notification` block. iOS: `content-available: 1`, no `alert`. Correct.

**[OK] — Stale token deactivation on UNREGISTERED/INVALID_ARGUMENT — correct.**

---

### 8. Ring Timeout

**[BUG/P2] — Ring timeout in `cleanup_stale_in_call_flags` uses hardcoded `60 seconds`; `call_ring_timeout_seconds` setting is `30`**  
- **File:** `supabase/migrations/20260524200343_*.sql` — `started_at < now() - interval '60 seconds'`  
- **Problem:** App settings configure `call_ring_timeout_seconds = 30`, but the pg_cron cleanup function uses `60 seconds`. FCM payload also sends `ring_timeout_seconds=30` to the client. Client UI times out at 30s but server keeps the row as `ringing` for another 30s — a second FCM delivery attempt within that window will still see `ringing` and re-ring the device.  
- **Repro:** Ring call → callee dismisses at 30s → caller immediately re-sends delivery → FCM re-fires because server hasn't expired the row yet.  
- **Severity:** P2

**[OK] — Server-side ring cleanup is pg_cron every 60s (server-authoritative).** ✓

---

### 9. Rating

**[MISSING/P1] — `submit_call_rating` / `submit_private_call_rating` have no minimum call duration threshold**  
- **File:** `supabase/migrations/20260608031002_*.sql` (latest version), `20260524133038_*.sql`  
- **Problem:** Only checks `status = 'ended'`. A call that lasts 0 seconds (declined, timed-out, or force-ended at T=0) can receive a rating. Chamet/Bigo require ≥30s connected duration to unlock rating. No `duration_seconds >= N` guard.  
- **Repro:** Caller hangs up immediately → calls `submit_private_call_rating` → succeeds.  
- **Severity:** P1

**[BUG/P1] — Rating direction is SWAPPED in latest migration**  
- **File:** `supabase/migrations/20260524133038_*.sql:50-55`  
- **Problem:** `submit_private_call_rating` sets `host_rating` when `v_uid = v_call.caller_id` (caller rates the host — correct semantics would set `host_rating`) but earlier version `submit_call_rating` (20260608031002) sets `caller_rating` when uid=caller_id. Inconsistent column semantics across two co-existing RPCs. If both are callable, they produce opposite results.  
- **Repro:** Caller calls `submit_private_call_rating(call_id, 5)` → `host_rating=5` set; caller calls `submit_call_rating(call_id, 5)` → `caller_rating=5` set.  
- **Severity:** P1

---

### 10. RLS Gaps

**[BUG/P0] — RLS UPDATE with no `WITH CHECK`: any participant can write to any column**  
*(See Finding 1 — same issue.)*

**[MISSING/P1] — `billing_ledger` has no INSERT restriction on `authenticated` role**  
- **File:** `supabase/migrations/20260608010725_*.sql:41` — `GRANT SELECT ON public.billing_ledger TO authenticated`  
- **Problem:** `GRANT SELECT` only; INSERT/UPDATE/DELETE not granted to authenticated. However, RLS is enabled but **no INSERT policy is defined** for `authenticated`. Since RLS is enabled and there's no matching INSERT policy, direct inserts are blocked by default — but a `service_role` call without RLS bypasses this entirely. Callers cannot forge ledger rows. This is **OK** but note that `billing_ledger` has no RLS SELECT policy allowing the host to see their own rows — wait, it does (line 47-52). **OK on SELECT; INSERT correctly restricted.**

**[BUG/P1] — `call_events` INSERT policy allows any participant to insert any event type**  
- **File:** `supabase/migrations/20260223123615_*.sql:183` — `FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM private_calls WHERE ... caller_id=auth.uid() OR host_id=auth.uid()))`  
- **Problem:** Any call participant can insert `call_events` rows with any `event_type` and any `event_data`. A malicious caller can forge events like `'minute_charged_server'` with false billing amounts, corrupting admin audit logs and analytics.  
- **Repro:** `supabase.from('call_events').insert({call_id, event_type:'minute_charged_server', event_data:{viewer_deducted:1000000}})`  
- **Severity:** P1

**[WEAK/P2] — Third-party isolation: not exploitable for reads (SELECT policy is participants-only). ✓**

---

## Top 10 P0/P1 Issues to Fix First

1. **[P0] RLS UPDATE on `private_calls` — no column restriction** (`WITH CHECK (false)` or column-level grants needed; all status transitions must go through SECURITY DEFINER RPCs only).
2. **[P0] `call-billing-tick` edge function has zero auth** — Add service-role JWT verification; reject non-service-role callers.
3. **[P1] `deduct_call_coins_per_minute` still GRANTED to `authenticated`** — REVOKE immediately; only `bill_call_minute` (service_role-only) should bill.
4. **[P1] `accept_private_call` and `end_private_call` missing `FOR UPDATE` row lock** — Prevents double-accept / double-end races.
5. **[P1] `end_reason` column is plain TEXT with no constraint** — Add `CHECK (end_reason IN ('normal','declined','timeout','cancelled','insufficient_balance','stale_orphan','caller_hangup','callee_hangup'))` and consolidate 3 spellings of "insufficient funds".
6. **[P1] Two co-existing rating RPCs with swapped column semantics** — Drop `submit_call_rating`; keep only `submit_private_call_rating`; add minimum duration check (`duration_seconds >= 30`).
7. **[P1] `call_events` INSERT policy allows forged audit events** — Remove the authenticated INSERT policy; only service_role triggers should write `call_events`.
8. **[P1] pg_cron auth header may be NULL** — Store service-role key in `vault.secrets` and reference via `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='service_role_key'` in the cron body.
9. **[P1] `auto_credit_agency_commission_from_call` AFTER UPDATE trigger fires on every status change** — Guard with `IF NEW.status = 'ended' AND OLD.status <> 'ended' AND (NEW.settled_at IS NOT NULL)` to prevent double-firing on concurrent updates.
10. **[P1] Rating functions allow rating of 0-second calls** — Add `IF v_call.duration_seconds IS NULL OR v_call.duration_seconds < 30 THEN RETURN error`.

---

## DB Schema Gaps

### Missing Columns
| Table | Missing Column | Why Needed |
|---|---|---|
| `private_calls` | `reconnect_pause_seconds` | Track disconnect/reconnect windows to prevent billing evasion |
| `private_calls` | `caller_hangup_at` / `callee_hangup_at` | Per-side hangup timestamps for dispute resolution |
| `private_calls` | `min_rating_duration_seconds` | Per-call configurable rating threshold |
| `private_calls` | `settled_at` | Present in `settle_private_call` code but not in original schema definition |
| `private_calls` | `last_billing_at` | Added via migration but missing from initial schema doc |
| `billing_ledger` | `platform_deducted` | Only stores `viewer_deducted` and `host_credited`; platform cut not explicitly recorded |

### Missing Constraints
| Table | Column | Issue |
|---|---|---|
| `private_calls` | `end_reason` | No CHECK constraint; any string allowed |
| `private_calls` | `status` | `'cancelled'` written in some code paths but not in original CHECK constraint |
| `private_calls` | `caller_rating` / `host_rating` | CHECK exists (1–5) ✓ but no constraint preventing rating when `status != 'ended'` |
| `private_calls` | `viewer_rate_per_min` | No NOT NULL or CHECK > 0 for connected calls |
| `billing_ledger` | `call_id` | No FK to `private_calls.id` (comment in migration: "no PK on id") — billing rows can reference deleted calls |

### Missing Indexes
| Table | Missing Index | Query Pattern |
|---|---|---|
| `private_calls` | `(caller_id, status)` | Checking if caller is already in call (`start_private_call` hot path) |
| `private_calls` | `(host_id, status)` | Checking if host is busy (same hot path) |
| `private_calls` | `(status, started_at)` WHERE status IN ('ringing','pending') | `cleanup_stale_in_call_flags` ring-timeout query |
| `call_events` | `(call_id, event_type)` | Admin call timeline lookups |
| `device_tokens` | `(user_id, is_active, platform)` | FCM token lookup on every `call-deliver` invocation |
| `billing_ledger` | `(created_at DESC)` | Billing audit time-range queries |

