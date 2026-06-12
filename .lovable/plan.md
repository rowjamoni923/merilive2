## Goal

Admin dashboard-এ একটা নতুন **"Company Profit Analytics"** section যোগ করব যেখানে:
- প্রতিটা revenue sector (Gift, Private Call, Agency Withdrawal Fee, Helper, Exchange, Game, Recharge, VIP/Noble/Subscription, Party Room, PK Battle, Lucky Gift, Shop) থেকে কত profit এসেছে
- **Gross revenue + Net profit side-by-side** (revenue − payouts − gateway cost)
- Date filter: **Today / Yesterday / This Week / This Month / Custom range** (calendar picker)
- প্রতিটা sector card click করলে drill-down detail
- Total app-wide profit + percentage contribution per sector

## Research (auto-run per rule)

**Competitor pattern** (Bigo Live admin, Chamet operator panel, Olamet finance dashboard): সবাই একই pattern follow করে — gross GMV → company commission % → payout cost → gateway fee → net. Granularity day/week/month/custom। Source-of-truth হিসেবে একটা central `commission_config` table থাকে যাতে সব % এক জায়গা থেকে manage হয়।

**Our current state**: Revenue calculation কোথাও centralized নেই — গিফট/কল/withdrawal fee সব আলাদা আলাদা table-এ scattered। কোনো unified analytics view নেই। `recharge_transactions`, `gift_transactions`, `private_calls`, `agency_withdrawals` (fee_percentage column already exists), `helper_orders`, `game_transactions`, `user_beans_exchanges`, `subscription_orders`, `pk_battles`, `lucky_gift_results`, `user_purchases` — সব data আছে কিন্তু aggregate করার কিছু নেই।

## Implementation Plan

### Phase 1 — Database (migration)

**Table 1: `profit_config`** (central source of truth, single row per sector)
```
sector_key TEXT PK   -- 'gift','private_call','agency_withdrawal_fee','helper_order',
                     -- 'exchange','game','recharge','vip_subscription','noble_subscription',
                     -- 'party_room','pk_battle','lucky_gift','shop_purchase'
display_name TEXT
company_cut_percent NUMERIC      -- e.g. 30 = company keeps 30%
default_payout_percent NUMERIC   -- e.g. 70 = host gets 70% (informational, real config still lives in section's own table)
gateway_cost_percent NUMERIC     -- avg payment gateway fee (e.g. 3 for recharge, 0 for internal)
is_active BOOLEAN
notes TEXT
```
Seed with all 13 sectors using current real config values (read from existing tables: `agency_withdrawals.fee_percentage`, helper level configs, etc.)

**Table 2: `profit_daily_snapshots`** (materialized for fast historical query)
```
snapshot_date DATE
sector_key TEXT
gross_revenue_coins BIGINT      -- total coin volume in sector
gross_revenue_usd NUMERIC        -- converted using currency_rates
company_cut_coins BIGINT         -- coins kept by company
company_cut_usd NUMERIC
payout_coins BIGINT              -- coins paid to hosts/agencies/helpers
gateway_cost_usd NUMERIC
net_profit_usd NUMERIC           -- company_cut_usd − gateway_cost_usd
transaction_count INT
PK(snapshot_date, sector_key)
```
RLS: admin only.

**Function: `compute_profit_for_range(start_date, end_date)`** — security definer SQL function returning per-sector aggregate. Reads live from source tables (for current day) + `profit_daily_snapshots` (for historical). Returns gross, company cut, payouts, net profit per sector.

**Cron: nightly snapshot** — pg_cron job runs at 00:05 UTC, computes previous day's totals per sector, upserts into `profit_daily_snapshots`. Idempotent.

### Phase 2 — Edge function

**`admin-profit-analytics`** (verify_jwt=false, admin check inside)
- Input: `{ start_date, end_date, granularity: 'day'|'week'|'month' }`
- Validates caller via `admin_users` + `has_role`
- Calls `compute_profit_for_range` RPC
- Returns: `{ totals: {gross_usd, company_cut_usd, payouts_usd, gateway_cost_usd, net_profit_usd}, sectors: [...], timeline: [{date, ...}] }`

### Phase 3 — Frontend

New page `src/pages/admin/AdminProfitAnalytics.tsx` + route `/admin/profit-analytics`:

- **Header**: date-range picker (Today / Yesterday / Week / Month / Custom). Custom uses shadcn DatePicker with `pointer-events-auto`.
- **Top KPI row**: Gross Revenue | Company Cut | Payouts | Gateway Cost | **Net Profit** | Profit Margin %
- **Sector grid** (13 cards): each shows gross, company %, net profit, % of total profit, sparkline. Click → expands to show transaction count + drill-down link.
- **Timeline chart**: stacked area (recharts) of net profit per sector over selected range.
- **Export CSV** button.

Add link to AdminDashboard quick-tiles + AdminLayout sidebar ("Profit Analytics").

### Phase 4 — Verify

- Owner login (smdollarex923@gmail.com), open `/admin/profit-analytics`, select Today/Week/Month, confirm numbers match a hand-spot-check from one sector (e.g. recharge_transactions sum vs displayed gross).

## Out of scope (this phase)

- Editing the per-sector % from this page (read-only from `profit_config`; separate admin section will manage it later if needed)
- Forecasting / predictions
- Per-host or per-agency drill-down (link to existing pages instead)

## Technical notes

- All UI strings English (per core rule)
- No design change to existing dashboard — additive only
- Snapshot cron makes range queries O(days) instead of O(transactions)
- Single source of truth = `profit_config`; section-specific configs (e.g. `agency_withdrawals.fee_percentage`) remain authoritative for actual transactions, `profit_config` is for analytics display + new-flow defaults
- Currency normalization via existing `currency_rates` table

Approve করলে Phase 1 migration দিয়ে শুরু করব।
