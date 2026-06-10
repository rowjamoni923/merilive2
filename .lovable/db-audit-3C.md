# Sub-wave 3C — SECURITY DEFINER function exposure cleanup

## Risk
Linter flagged **1328 warnings** (564 anon + 764 authenticated) for `SECURITY DEFINER` functions in `public` that are callable by browser clients without restriction. Many are internal helpers (`_internal_*`, `_pkg*_*`, trigger functions, money mutators like `add_coins_to_user`) that should never be reachable from a logged-in client — calling them directly would bypass intended business logic and let any user mutate balances, bypass admin checks, or trigger expensive operations.

## Strategy
1. **Whitelist** = every `supabase.rpc('<name>', …)` call in `src/` (Lovable React app). Grep produced **265 unique function names**.
2. **Bulk REVOKE** `EXECUTE` from `PUBLIC, anon, authenticated` on every `SECURITY DEFINER` function in `public` (handles overloads via `pg_get_function_identity_arguments`).
3. **Re-GRANT** `EXECUTE TO authenticated` only for whitelisted names.
4. `service_role` retains execute implicitly (superuser-like) — edge functions unaffected.
5. Triggers fire as the table owner, not the caller — REVOKE doesn't break them.

## Why this is the right shape
- Removes `anon` execute entirely. The React app does not call any definer fn pre-login — OTP / signup / password reset flows all go through edge functions that themselves use `service_role`.
- Authenticated users can still call the 265 functions the app actually needs.
- Internal helpers (`_*`-prefixed, `_pkg*_*`, `_internal_*`, trigger fns, admin-only-via-service-role fns) get locked down — even if a logged-in user crafts a raw `rpc` request, they get `permission denied`.

## Risks & mitigations
- **Risk**: a definer fn called by the app via something other than `supabase.rpc(name)` (e.g., dynamic name, generated from a variable) won't be in the whitelist. Mitigation: grep used a literal-string regex; any dynamic call wouldn't have been a fn we recognize as such.
- **Risk**: an Android/Capacitor path that calls an rpc not in `src/`. Mitigation: source-of-truth for client RPC is `src/`; native plugins use the same Supabase JS client built from `src/`.
- **Verify after**: smoke-test owner test account flows post-migration (live enter, gift send, private call accept, PK battle, party seat).

## Files
- Migration: `wave3c_secdef_function_lockdown` (DO block, loops over all definer fns)
- Whitelist source: `src/**` grep → 265 names
