# MeriLive — DU-6 Diamond Unify Certificate (HONEST)

> **Owner:** `APPROVE DU-6` — 2026-07-19
> **Purpose:** End-state checklist + current truth — **not** a fake "100% live done" stamp
> **Rule:** Green only when evidence pasted. Pack-ready ≠ production-complete.

---

## Verdict (as of pack freeze 2026-07-19)

| Question | Answer |
|----------|--------|
| Is the **business model** locked? | **YES** — Diamond spend · Beans earn · Coin not a 3rd currency |
| Are **Wave apply packs** drafted DU-1…DU-5? | **YES** — all under `docs/MERILIVE_DU*_*.md` |
| Is **live prod** already single Diamond column? | **NO** — Wave has not confirmed apply of DU-2…DU-5 in this chat |
| Is **Android** diamonds-only (no `max`)? | **NO** — waiting `APPROVE DU-x ANDROID` after Wave |
| Full-product certificate GREEN? | **NOT YET** — see §D gates |

**Certificate status: `PLAN + PACKS COMPLETE` · `LIVE UNIFY = PENDING WAVE EVIDENCE`**

---

## A) Locked business (must never regress)

### A1 — Two wallets only

| Wallet | Role | Canonical (target) |
|--------|------|--------------------|
| **My Diamonds** | Spend (= old `coins`) | `profiles.diamonds` |
| **My Beans** | All earning / withdraw | `profiles.beans` |

### A2 — Diamond spend (examples — not closed list)

Gift · private/random call (caller) · games · VIP/shop/mall · any former coin purchase.
Credits: Play/recharge · invitation · leaderboard/task diamond rewards.

### A3 — Beans = all earning

Gift receive (host/user/agency per admin %) · call host share · admin timed host beans · leaderboard beans · agency/host earn paths that already credit beans.

### A4 — Call

Callee = callable host only. Gift ≠ call rules. Male→male call never (existing).

### A5 — Never

- Invent gift/call math
- Merge Beans into Diamonds
- Client-side diamond grant
- Treat Coin as third currency
- Flutter-only "fix" without server

---

## B) Pack registry (what owner gives Wave)

| Phase | Pack | Live apply? |
|-------|------|-------------|
| DU-0 | Master plan §A | N/A (frozen) |
| DU-1 | `MERILIVE_DU1_WAVE_INVENTORY_PACK.md` | Read-only inventory |
| DU-2 | `MERILIVE_DU2_WAVE_APPLY_PACK.md` + `DU2A_*.sql` | Sync + canonical diamonds |
| DU-3 | `MERILIVE_DU3_WAVE_APPLY_PACK.md` | Admin/web language |
| DU-4 | `MERILIVE_DU4_CALL_HOST_ONLY_PACK.md` | Call CTA + verify RPC |
| DU-5 | `MERILIVE_DU5_RETIRE_COINS_PACK.md` + `DU5A_*.sql` | Retire/alias `coins` |
| DU-6 | **This file** | Certificate board |

---

## C) Target end-state (GREEN means all true)

```
[ ] Live: profiles spend = diamonds only (DU-2 + DU-5 path)
[ ] Live: diverge coins↔diamonds = 0 (or coins generated/dropped)
[ ] Live: zero coins-only spend writers (or only documented wrappers → diamonds)
[ ] Live: Beans RPCs unchanged (gift % · call host · bonuses)
[ ] Web: useUserBalance = diamonds; UI language Diamonds/Beans
[ ] Admin: spend labels Diamonds; packages still admin-driven
[ ] Call: CTA + RPC callee = host; gift still open
[ ] Android: balance read diamonds; no max(coins,diamonds); no client credit
[ ] Play path: Billing → verify-google-purchase → process_google_play_purchase → diamonds
[ ] No invented APIs / no migration history rewrite
```

---

## D) Evidence gates (owner pastes → flip checks)

| Gate | Evidence needed | Flip when |
|------|-----------------|-----------|
| G1 Inventory | DU-1.1 / 1.6–1.8 results | Wave ran DU-1 |
| G2 Sync | DU-2 V1 diverge=0 + trigger/RPC list | Wave applied DU-2 |
| G3 Language | DU-3 checklist | Wave deployed web/admin |
| G4 Call | DU-4.1 + CTA smoke | Wave + optional Android |
| G5 Retire | DU-5 P1–P4 + 5A/5C verify | Wave after soak |
| G6 Android | `APPROVE DU-* ANDROID` done | Flutter diamonds-only |

**Only when G1–G6 checked with paste/logs → change verdict to `LIVE CERTIFICATE GREEN`.**

---

## E) Known open items (do not hide)

1. **DU-2…DU-5 not evidenced applied** in this Android-agent session.
2. **DU-4 §E:** keep vs relax `hosts_cannot_initiate_user_calls` — owner unanswered.
3. **OWN-CALL-START-CURRENCY** / **OWN-PARTY-ROOM-NAME** — separate APPLY tracks.
4. **Package table** `coins_amount` — DU-5 recommends defer rename (UI Diamonds enough).
5. Polish / beauty — explicitly later (after logic).

---

## F) How to mark GREEN later

Owner (or Wave) replies with:

```
DU-6 GREEN
G1: …
G2: …
G3: …
G4: …
G5: …
G6: …
```

Then agent updates this file header to:

`Certificate status: LIVE CERTIFICATE GREEN — <date>`

Until then, status stays **PENDING WAVE EVIDENCE**.

---

## G) One-line truth for owner

**Plans and Wave packs for Diamond unify are complete. Live single-pipeline Diamond + Beans is not certified until Wave applies DU-2→DU-5 and evidence fills §D.**

---

## H) Honest live-DB reality snapshot — 2026-07-19 (this session)

Verified via `supabase--read_query` before saving certificate:

| Probe | Result |
|-------|--------|
| P1 divergence `coins ≠ diamonds` on `profiles` | ✅ **0 rows** |
| P2 mirror trigger `trg_du2_sync_spend_wallet` on `profiles` | ✅ **installed** |
| P3 legacy `SET coins =` spend writers | 🛑 **29 functions** still write to `coins` |
| P4 sum parity | ⏸ skipped — P3 blocks |

**29 pending writers (DU-2 Batch 4 scope):**

```
add_coins, add_coins_to_user, _internal_add_coins,
deduct_coins, deduct_coins_atomic (x2), deduct_coins_from_user,
transfer_coins_to_user, helper_transfer_coins_to_user,
helper_transfer_diamonds_to_self, helper_add_coins_to_user,
admin_add_user_coins, grant_welcome_bonus, claim_parcel_reward,
claim_new_host_live_bonus, claim_task_reward, claim_daily_login_reward,
claim_weekly_login_reward, claim_invitation_reward, claim_vip_daily_reward,
approve_rating_reward, admin_recover_purchase_credit,
user_complete_instant_helper_topup, complete_gateway_helper_topup,
process_helper_order_secure, admin_complete_payment_transaction,
agency_send_diamonds_to_user, _do_reverse_auto_action,
fix_excess_weekly_rewards
```

**Consequence:** DU-5A (`coins` → `GENERATED ALWAYS AS (diamonds) STORED`) **must NOT be applied yet** — Postgres will reject every `SET coins = …` write in the 29 functions above, breaking recharge credit, gifts, daily/weekly rewards, VIP, agency send, helper topup, admin adjust, welcome/task/invitation bonuses in production.

**Correct next step:** DU-2 **Batch 4** — retarget the 29 functions to write `diamonds` (mirror trigger keeps legacy `coins` reads safe during soak). After Batch 4 ships and P1–P4 all pass green, then and only then apply DU-5A.

## I) Gate status (this session)

| Gate | Status |
|------|--------|
| G1 Inventory | 🟡 partial (schema known, functions enumerated) |
| G2 Sync | 🟢 P1 diverge=0, P2 trigger live |
| G3 Language | 🟢 Web + admin labels shipped to Diamonds |
| G4 Call | 🟡 host-only CTA logic present, RPC audit pending owner sign-off |
| G5 Retire | 🔴 **BLOCKED by P3 — DU-2 Batch 4 required first** |
| G6 Android | 🔴 not started (awaits `APPROVE DU-* ANDROID`) |

**Overall: `PENDING WAVE EVIDENCE` — no green certificate issued.**
