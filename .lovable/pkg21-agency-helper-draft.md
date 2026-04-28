# Package 21 — Agency + Helper Dashboard Architecture (A-to-Z)

> **STATUS:** DRAFT — awaiting your verbatim dictation for Trader Wallet Diamond Sources.
> Sections marked `[YOU FILL: ...]` are slots where I will paste your exact words.
> Sections marked `[AUDITED FROM CODE]` are facts I extracted from the current codebase + DB and need your **confirm / correct** stamp.

---

## 1. Role Hierarchy

| Role | Code identity | DB anchor |
|------|---------------|-----------|
| **Agency Owner** | `agencies.owner_id = auth.uid()` | `agencies` row (one per owner) |
| **Helper L1–L4** | `topup_helpers.user_id = auth.uid()` AND `topup_helper_levels.level_number IN (1..4)` | `topup_helpers` + `topup_helper_levels` |
| **Helper L5** (Senior) | `topup_helpers.user_id = auth.uid()` AND `topup_helper_levels.level_number = 5` | Same tables, elevated UI in `Level5HelperDashboard.tsx` |
| **Sub-Agent** | `agencies.parent_agency_id IS NOT NULL` | child `agencies` row |
| **Admin / Owner** | `admin_users` + active `admin_session` | adminClient with `x-admin-token` |

---

## 2. Page → File Map

| Surface | File | Lines |
|---------|------|-------|
| Agency Dashboard (Owner) | `src/pages/AgencyDashboard.tsx` | 2,223 |
| Agency Coin Trader (Buy/Sell) | `src/pages/AgencyCoinTrader.tsx` | 1,022 |
| Agency Coin Exchange (Beans→Diamonds) | `src/pages/AgencyCoinExchange.tsx` | 1,333 |
| Agency Withdrawal | `src/pages/AgencyWithdrawal.tsx` | — |
| Agency Commission History | `src/pages/AgencyCommissionHistory.tsx` | — |
| Agency Host Management | `src/pages/AgencyHostManagement.tsx` | — |
| Helper Dashboard L1–L4 | `src/pages/HelperDashboard.tsx` | 2,406 |
| Helper Dashboard L5 | `src/pages/Level5HelperDashboard.tsx` | 3,561 |
| Admin Agency Hub | `src/pages/admin/AdminAgencyHub.tsx` | — |
| Admin Helper Mgmt | `src/pages/admin/AdminHelperManagement.tsx` | — |
| Admin Level 5 Helpers | `src/pages/admin/AdminLevel5Helpers.tsx` | — |
| Admin Helper Diamond Pricing | `src/pages/admin/AdminHelperDiamondPricing.tsx` | — |
| Admin Helper Orders | `src/pages/admin/AdminHelperOrders.tsx` | — |

---

## 3. Database Tables (Discovered)

**Agency side:**
- `agencies` — owner row. Columns: `owner_id, name, agency_code, level, total_hosts, total_agents, wallet_balance (int), diamond_balance (bigint), beans_balance (int), commission_rate, parent_agency_id, is_active, is_blocked, logo_url, email, whatsapp_number`
- `agency_hosts` — host membership: `agency_id, host_id, joined_via, referral_code, status, joined_at, left_at`
- `agency_diamond_transactions` — ledger: `agency_id, transaction_type, beans_amount, diamond_amount, fee_amount, user_id`
- `agency_earnings_transfers` — payroll transfers
- `agency_commission_history`
- `agency_performance`, `agency_rankings`, `agency_level_tiers`, `agency_policy_settings`
- `agency_withdrawals`, `agency_withdrawal_locks`
- `sub_agent_commissions`

**Helper side:**
- `topup_helpers` — wallet & verification: `user_id, is_active, is_verified, commission_rate, buy_rate, sell_rate, total_bought, wallet_balance, …`
- `topup_helper_levels` — `level_number (1..5), level_name, upgrade_cost_usd, min_withdrawal_amount, max_withdrawal_amount, commission_rate, badge_color`
- `helper_diamond_packages` — `diamond_amount, price_usd, local_prices(jsonb)`
- `helper_orders` — customer purchases: `helper_id, customer_id, package_id, diamond_amount, total_price_usd, local_price, payment_method, status, commission_amount, commission_rate`
- `helper_topup_requests` — helper recharge to admin: `helper_id, amount, status, payment_proof_url`
- `helper_upgrade_requests`
- `helper_withdrawal_requests`
- `helper_transactions`, `helper_notifications`, `helper_admin_messages`, `helper_message_replies`
- `helper_assigned_countries`, `helper_country_payment_methods`, `helper_payment_methods`, `helper_accepted_payment_methods`
- `payroll_requests`

**Beans exchange:**
- `user_beans_exchange_history`, `user_beans_exchange_tiers`

---

## 4. Trader Wallet — Diamond Source Mapping

> **THIS IS THE CRITICAL SECTION YOU WILL DICTATE.**
> I will fill each `[YOU SAY: ...]` block verbatim from your words.

### 4.1 Agency Owner — Trader Wallet Diamond Sources

**[AUDITED FROM CODE]** Currently the Agency owner sees diamonds from:
- `agencies.wallet_balance` (line 481, 811 in `AgencyCoinTrader.tsx`)
- `agencies.diamond_balance` (separate column, used in some flows)

**[YOU SAY: Agency Owner এর Trader Wallet এ Diamond কোন কোন source থেকে আসে? কতগুলো section? কোন priority order এ?]**
```
1. ___________________________________
2. ___________________________________
3. ___________________________________
4. ___________________________________
```

### 4.2 Helper L1–L4 — Trader Wallet Diamond Sources

**[AUDITED FROM CODE]** In `HelperDashboard.tsx` line 252:
```ts
const totalAvailable = (agency?.wallet_balance ?? 0) + (helperData?.wallet_balance ?? 0);
```
i.e. currently shown = **agency wallet + helper wallet** (sum).

Tiered deduction RPC used: `helper_transfer_diamonds_to_self` / `helper_add_diamonds_to_agency` (helper wallet → agency → personal coins).

**[YOU SAY: L1-L4 Helper এর Trader Wallet এ Diamond কোন কোন source থেকে আসে? কতগুলো section মিলিয়ে এক জায়গায় show হয়?]**
```
1. ___________________________________
2. ___________________________________
3. ___________________________________
```

### 4.3 Helper L5 (Senior) — Trader Wallet Diamond Sources

**[AUDITED FROM CODE]** `Level5HelperDashboard.tsx` uses `deduct_helper_wallet` RPC (line 1669) and otherwise mirrors helper flow with elevated limits.

**[YOU SAY: L5 Helper এর Trader Wallet এ Diamond কোন কোন source থেকে আসে? L1-L4 এর সাথে কোথায় difference?]**
```
1. ___________________________________
2. ___________________________________
3. ___________________________________
4. ___________________________________
```

---

## 5. Commission Calculation

### 5.1 Agency Commission
**[AUDITED]** `agencies.commission_rate` (numeric) × host earnings → `agency_commission_history`.
Weekly payroll edge function (Sunday midnight) per `mem://business/agency-payroll-transfer-logic`.

**[YOU CONFIRM/CORRECT]:** `__________________________________________________`

### 5.2 Sub-Agency Commission
**[AUDITED]** `sub_agent_commissions` table; `agencies.parent_agency_id` defines hierarchy.

**[YOU CONFIRM/CORRECT formula]:** `__________________________________________________`

### 5.3 Helper Commission per Order
**[AUDITED]** `helper_orders.commission_amount` = `total_price_usd × commission_rate` (rate from `topup_helper_levels.commission_rate` for that level).

**[YOU CONFIRM]:** `__________________________________________________`

---

## 6. Admin Panel Reporting Pipeline

| Admin Page | RPC / Source | Pkg6 Aggregation |
|------------|--------------|------------------|
| AdminAgencyHub | `admin_agency_overview_stats` | ✅ |
| AdminHelperManagement | `admin_helper_management_stats` (9 counts → 1) | ✅ |
| AdminHelperApplications | `admin_helper_applications_stats` | ✅ |
| AdminHelperRequests | `admin_helper_requests_stats` | ✅ |
| AdminPayrollOrders | `admin_payroll_orders_stats` | ✅ |
| AdminLevel5Helpers | _direct table (audit pending)_ | ❓ |
| AdminHelperDiamondPricing | `helper_diamond_packages` direct (config) | n/a |
| AdminHelperOrders | _direct table (audit pending)_ | ❓ |

**[YOU SAY: Admin panel এ কোন report কোথা থেকে যায়? কোন data কোন admin page এ দেখা উচিত?]**

---

## 7. End-to-End Money Flow (to be confirmed)

```
USER recharges
  ↓ (ZiniPay auto / Helper-mediated)
HELPER receives order in helper_orders
  ↓ commission_amount kept by helper
  ↓ remainder → ?
AGENCY wallet updated via ?
  ↓ host gifting consumes diamonds
HOST earns beans (per admin %)
  ↓ Beans → Diamonds exchange (25% fee, 100k min)
AGENCY accumulates beans_balance
  ↓ Sunday midnight payroll
AGENCY withdraws via 9000 Beans = $1 USD
```

**[YOU FILL each `?` above with verbatim explanation.]**

---

## 8. Dictation Slots Summary

When you reply, please answer in this exact numbered format so I can paste verbatim:

```
4.1 Agency Owner Trader Wallet sources:
  1. ...
  2. ...
4.2 L1-L4 Helper Trader Wallet sources:
  1. ...
  2. ...
4.3 L5 Helper Trader Wallet sources:
  1. ...
  2. ...
5.1 Agency commission formula: ...
5.2 Sub-agency commission formula: ...
5.3 Helper commission rule: ...
6. Admin reporting flow notes: ...
7. End-to-end money flow ?-fills: ...
```

Once you dictate, I will:
1. Lock this draft into `mem://features/agency/dashboard-architecture-v1.md`
2. Create `mem://features/helper/l1-l4-dashboard-v1.md`
3. Create `mem://features/helper/l5-dashboard-v1.md`
4. Create `mem://business/trader-wallet-diamond-sources-v1.md`
5. Update `mem://index.md` Core section so every future AI session honors these rules.
