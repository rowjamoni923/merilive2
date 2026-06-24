
## Country Super Admin (CSA) System

## Agency closed visibility fix — 2026-06-24

- **Research note:** BIGO describes agencies as operators that recruit/manage broadcasters, so owner/admin agency panels must retain agency records even when an agency becomes inactive/closed for operational review. Source: https://www.bigo.tv/blog/bigo-live-agency
- **Research note:** Professional live agency tooling emphasizes roster/bonus/retention visibility across the whole managed roster, not hiding inactive business records. Source: https://streampace.io/agencies
- **Research note:** BIGO agency/portal systems separate agency operators from normal users and rely on portal-level permissions, so owner/admin-console sessions must be authorized by the admin session layer, not only end-user auth. Source: https://bigoads.com/help/detail?currentLan=EN&id=74&moduleId=11
- **Verified DB numbers:** current database has **4 closed agencies**, **1 pending agency**, and **2 active official agencies**. The closed rows have `activation_status='closed'`, `is_active=false`, `is_blocked=true`.
- **Gap found:** the admin page's **Closed / Cancelled / Inactive** filter was only loading `is_active=false` agencies that were **not** `activation_status='closed'`, so all real closed agencies were hidden from that filter even though the badge counted them.
- **Fix direction:** keep the dedicated **Closed** tab, but make the inactive filter include closed agencies too, label their status as **Closed**, and make reactivation call the proper `admin_reactivate_agency` RPC so the 30-day / 10-active-host window resets correctly.
- **2026-06-24 permission gap:** screenshot shows `permission denied for function admin_search_closed_agencies`; DB confirmed the function granted only authenticated/service_role while the Owner Admin Console calls through the admin-session header path. Fix: grant anon execution but keep the RPC locked internally to `current_admin_id_from_header()` or real authenticated admin role, so public callers still receive `Admin only`.

A new role — **Country Super Admin** — granted by main admin to an existing agency owner. Each CSA is locked to **one country only** and gets a separate luxurious dashboard (part of admin panel) to manage that country's deposit/withdrawal payment methods and view local volume.

---

### 1. Agency protection
- New `agencies.is_country_super_admin boolean` flag.
- Treated like `is_official` in `auto_close_overdue_agencies()` and `recalc_agency_activation()` — **never auto-closed, never blocked**, regardless of host count.
- Cleared if CSA power is revoked.

### 2. Granting CSA power (main admin panel)
- New button **"Grant Country Super Admin"** on each agency row in `AdminAgencies` → opens popup with:
  - **Country dropdown** (BD / IN / PK / …) — single select, locked after grant.
  - **Official email** (will be CSA login email).
  - **Password** (auto-generated suggestion + manual override; min 10 chars).
  - **Optional commission %** (defaults from `country_super_admin_settings`).
- On submit → calls `admin_grant_country_super_admin` RPC which:
  1. Creates/updates an auth user with the given email+password (via edge function using service role).
  2. Inserts `user_roles (user_id, role='country_super_admin')`.
  3. Inserts/updates `country_super_admins` row with `country_code`, `agency_id`, `owner_user_id`, `assigned_by`, `commission_percent`, `is_active=true`.
  4. Sets `agencies.is_country_super_admin = true` and force-reopens it.
  5. Sends owner an in-app notification with login URL + credentials reminder.
- **Revoke** button: deactivates row + clears flag + revokes role (agency keeps its hosts; just loses CSA protection going forward).

### 3. CSA Login & Routing
- CSA logs in via the normal `/auth` page with the email/password we set.
- Add new route `/country-admin` (gated by `has_role(uid, 'country_super_admin')`).
- New menu chip "Country Admin Panel" appears in their profile when role is present.
- Main admins can also impersonate-view by clicking the agency's CSA badge in admin panel.

### 4. CSA Dashboard (`/country-admin`) — country-scoped, luxurious design
Layout: dark gradient hero with country flag + name + "Country Super Admin" crest, glass cards, gold accents.

Tabs:
- **Overview** — KPI cards: Total deposit (this month), Total withdrawal (this month), Net flow, # active local payment methods, # pending top-ups, # pending withdrawals.
- **Top-Up Methods** — list of `topup_payment_methods` filtered by `country_codes @> [my country]`. CSA can:
  - Toggle active/inactive
  - Mark **Recommended** (new column `is_recommended boolean`) — shown with a star badge in user top-up flow.
  - Reorder, edit instructions/number/account name.
  - Add new method (country auto-stamped to their country).
- **Withdrawal Methods** — same but for `helper_country_payment_methods` filtered to their country.
- **Transactions** — paginated list of recharge_transactions + agency_withdrawals filtered to their country (read-only, search by UID/tx ref).

### 5. Country lock (hard)
Every CSA RPC takes the CSA's `country_code` from `country_super_admins` row (not from client input). Every `INSERT`/`UPDATE`/`DELETE` on `topup_payment_methods` and `helper_country_payment_methods` from CSA path forces `country_codes = ARRAY[csa.country_code]`. RLS policy `csa_country_scoped_payment_methods` blocks any row whose `country_codes` doesn't intersect with the CSA's country. A Pakistan CSA literally cannot see or touch BD/IN rows.

### 6. Top-up flow "Recommended" badge
In the existing user-facing top-up screen, sort `topup_payment_methods` so `is_recommended = true` shows first with a "⭐ Recommended" badge (gold). No other logic change — admin/CSA setup drives everything.

---

### Technical notes
- **Migration**: add columns (`agencies.is_country_super_admin`, `topup_payment_methods.is_recommended`), create `country_super_admins` table (if not exists) with `user_id, agency_id, country_code, commission_percent, is_active, assigned_by, assigned_at, revoked_at`, add `country_super_admin` value to `app_role` enum, GRANT + RLS, update `auto_close_overdue_agencies()` + `recalc_agency_activation()` to skip CSA agencies, add RPCs: `admin_grant_country_super_admin`, `admin_revoke_country_super_admin`, `csa_get_my_context`, `csa_upsert_topup_method`, `csa_toggle_topup_method`, `csa_upsert_withdrawal_method`, `csa_country_kpis`.
- **Edge function**: `admin-create-csa-user` (service role) — creates auth user with given email+password, returns user_id; called by `admin_grant_country_super_admin`.
- **Frontend new files**: `src/pages/CountryAdminDashboard.tsx`, `src/components/admin/agency/GrantCsaDialog.tsx`, `src/components/country-admin/*` (KPIs, MethodsTable, TransactionsTable).
- **Frontend edits**: `AdminAgencies.tsx` (Grant CSA button + dialog), `AppRoutes` (new `/country-admin`), top-up payment-method picker (sort + recommended badge), `AgencyDashboard` gating already handles `is_official` — extend the official check to also accept `is_country_super_admin`.
- **Memory rule** to log after build: "CSA agencies are exempt from auto-close; CSA scope is single-country, hard-enforced server-side."

---

### One question before I build

CSA login model — কোনটা চাও?

1. **Same email-OTP flow as normal users** (CSA এর email-এ OTP যাবে যেমন normal user-দের যায়; password field বাদ)। সহজ, কোন password manage করতে হবে না।
2. **Custom email+password** (popup-এ যে password set করব সেটাই দিয়েই login করবে; আমাদের separate password page বানাতে হবে কারণ app-এর main auth flow OTP-based)। বেশি control, কিন্তু extra UI।

আমি **option 1 (email-OTP)** recommend করছি — কারণ app-এর existing auth flow এটাই, কোন parallel password system maintain করতে হবে না, এবং admin-set password বললে CSA পরে নিজেই change করতে পারে না (security weak)। তোমার মতামত?
