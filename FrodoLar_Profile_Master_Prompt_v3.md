# FrodoLar — Profile Section Master Prompt v3 (Web-Parity Lockdown)

> **Use this prompt verbatim with the Flutter AI.** It supersedes v2 by adding a strict **REMOVE list** (things the Flutter team wrongly added), **admin-panel data-source map**, exact **header element order**, and the **complete Agency Dashboard Quick Actions grid** (verified against `src/pages/Profile.tsx`, `AgencyDashboard.tsx`).

Backend project: `ayjdlvuurscxucatbbah` (anon key only). All money/exchange/withdraw operations go through existing Postgres RPCs and edge functions — **never recompute on client**.

---

## 0. THINGS TO REMOVE FROM CURRENT FLUTTER PROFILE (CRITICAL — DO THIS FIRST)

The Flutter build currently shows things the web does NOT have. Remove all of these from the `/profile` route:

- ❌ **Search icon / search bar** at the top of Profile — DELETE.
- ❌ **Standalone diamond icon / balance pill** in the top app bar — DELETE.
- ❌ **Leaderboard button / leaderboard section** on Profile — DELETE.
- ❌ Any "Trending hosts", "Recommended", "Banner carousel" inserted into Profile — DELETE.
- ❌ Any tabs (Posts / Media / About) on the Profile page — the web has none.
- ❌ Any extra "Wallet", "Earnings summary", "Today stats" cards not listed in §3 below.

The Profile page on web has **only**: a fixed back button (top-left), the avatar/header block, the Diamonds + Beans (+ optional Trader Wallet) cards, and the ordered menu list. Nothing else above or between.

---

## 1. EXACT HEADER ELEMENT ORDER (top → bottom, isOwnProfile)

```
[Fixed back button — top-left, glass circle, 40×40, ArrowLeft]   (does NOT scroll)

(scroll content begins, padding-top 56)

  ┌─ Avatar with Level-Based Frame (xl) ─┐
  │   • src = profile.avatar_url        │
  │   • frame = equipped role_frame     │
  │     (user_role_frames) → fallback   │
  │     to level_tiers.level_icon       │
  │   • glow ring iff displayLevel ≥ 10 │
  │   • verified badge bottom-right     │
  │     iff is_verified || face_verified│
  └──────────────────────────────────────┘

  Name        — resolvedProfileName (display_name preferred, weak names skipped)
  ID badge    — glass pill, "ID" gradient circle + profile.app_uid (10-digit, copy on tap)
  Country/City/Language pills (row, wrap):
      Country (emerald) — ALWAYS visible — flag + country name
      City    (white/5) — only if isOwnProfile || !profile.hide_location
      Language (orange) — derived from country
  Stats row — Friends | Following | Followers   (tap own → /following)
  Action buttons (only when !isOwnProfile): Follow • Call (female host only) • Message
```

NO extra elements between header and Cards Section. NO search, NO leaderboard, NO diamond pill in app bar.

---

## 2. ADMIN-PANEL → PROFILE DATA SOURCE MAP

Every dynamic value below MUST come from the listed source. Never hardcode. Show a loading shimmer until the source resolves; on resolve-failure, show explicit error text — never silent default.

| UI element | Source (admin-controlled) | How to read |
|---|---|---|
| Avatar URL | `profiles.avatar_url` (own) / `profiles_public.avatar_url` (other) | direct select |
| Avatar Frame (animated SVGA/Lottie) | Equipped row in `user_role_frames` joined to `avatar_frames`/`role_frames`; fallback `level_tiers.level_icon` | `unified-visual-assets-api` edge function (5 min cache) |
| Display name | `profiles.display_name` (with weak-name fallback chain) | direct select |
| App UID | `profiles.app_uid` (auto-generated 10-digit numeric) | direct select |
| Country / Flag | `useGeolocation()` (server consensus) → fallback `profiles.country_name` / `country_flag` | hook |
| City | `useGeolocation().city` | hook |
| Verified badge | `profiles.is_verified` OR latest `face_verification_submissions.status='approved'` | select |
| Friends / Following / Followers | RPC `profile_follow_stats(uid)` | rpc |
| **My Diamonds** balance | `profiles.coins` (= `diamonds`) + singleton `useUserBalance` cache | select + cache |
| **My Beans** balance | `profiles.beans` ONLY (NEVER `agencies.wallet_balance`) | select |
| **Trader Wallet** | `coin_traders.wallet_balance WHERE user_id = me AND status='active'` | select |
| Diamond → Beans exchange rate, fee, min | `app_settings.setting_key='coin_exchange'` (jsonb) | select; realtime subscribe |
| Beans → USD withdrawal rate | `app_settings.setting_key='beans_to_usd_rate'` (NO fallback) | select |
| Withdrawal min beans | `GREATEST(app_settings.withdrawal_settings.min_withdrawal, app_settings.agency_commission.min_payout)` | select |
| Withdrawal min net USD | `app_settings.agency_commission.min_usd` | select |
| Call rate per minute (host) | `app_settings.setting_key='call_rates'` → `level_rates[hostLevel].rate` (override: `profiles.call_rate_per_minute`) | select |
| Host commission % | `app_settings.call_rates.host_commission_percent` | select |
| Helper visibility threshold | `app_settings.helper_recharge_visibility` (≥ 300k) | select |
| Helper contact info | `app_settings.helper_contact_info` | select |
| Level tiers (number, name, icon, min topup, min earning) | `level_tiers` table | select all, sort `level_number` |
| Current user level | `profiles.level` (HWM, never decreases) | select |
| Level progress to next | RPC `get_level_progress(uid)` or computed from level_tiers + `profiles.lifetime_topup` | rpc |
| VIP tier | `user_vip_subscriptions WHERE user_id=me AND expires_at>now()` | select |
| VIP plans, perks | `vip_plans`, `vip_perks` | select |
| Shop items | `avatar_frames`, `role_frames`, `entry_effects`, `chat_bubbles`, `gift_items` (active only) | select |
| Recharge packages | `recharge_packages WHERE is_active=true ORDER BY display_order` | select |
| Tasks (daily / weekly / achievement) | `tasks_definitions` + `user_task_progress` | RPC `update_task_progress` |
| Has unclaimed reward | RPC `has_unclaimed_task_reward(uid)` | rpc |
| Agency tiers (commission %, requirements) | `agency_level_tiers` | select |
| Agency code, level, commission rate, created | `agencies` (own) / `agencies_public` (others) | select |
| Agency Total Beans (Dashboard) | `agencies.wallet_balance` (NEVER mix into profile My Beans) | select |
| Maintenance mode | `app_settings.maintenance_mode` (fail-open) | select |
| App icon, splash, branding | `app_icon_registry`, `app-assets` edge function | edge fn |
| Banners (engagement) | `engagement_banners` (sequential rotation) | select |

**Realtime channel suffix**: every subscription channel name ends with `_${nanoid(6)}`. Subscribe to:
- `profiles:id=eq.${uid}` (balances, level, vip, beans)
- `balance_audit_log:user_id=eq.${uid}` (invalidate cache)
- `app_settings` (debounced 800 ms refetch of rate-driven UI)
- `face_verification_submissions:user_id=eq.${uid}`
- `agency_hosts:user_id=eq.${uid}`
- `user_vip_subscriptions:user_id=eq.${uid}`

---

## 3. PROFILE BODY ORDER (between header and bottom nav)

Render in this exact sequence (only when `isOwnProfile`):

1. **Diamonds card + Beans card** (2-col grid, ultra-compact)
2. **Trader Wallet card** (full width) — only when `isCoinTrader`
3. **Menu list** — render the 17 items from §3 of v2 in EXACT order with EXACT visibility gating (do not reorder, do not skip, do not add):
   1. Go Offline (host only)
   2. Messages (badge = `globalUnread.messages + notificationCount`)
   3. Face Verification (hide after approved; "Under Review" if pending)
   4. Call Price Update (female host) — right text computed: `floor(diamondRate × commissionPct/100) Beans/min`
   5. Host Registration (rare male path)
   6. My Level — extra widget = `FloatingLevelIcon + Lv${userLevel} + (VIPBadge if vip>0) + Progress + Lv${nextLevel}`
   7. VIP Membership — extra = VIPBadge or "Upgrade Now"
   8. Call History (female host)
   9. Shop ("Frames & Effects")
   10. Host Dashboard (male host — rare)
   11. Agency Details / Join Agency (female host)
   12. Agency Dashboard / Agency Center (male)
   13. My Invitation ("Get Rewards")
   14. My Tasks ("New Reward" + red dot iff `hasUnclaimedReward`)
   15. My Profile (→ /edit-profile)
   16. Settings
   17. Priority Support (`userLevel >= 6`)

Bottom padding = `BottomNav height + 40px`.

---

## 4. AGENCY DASHBOARD — QUICK ACTIONS (exact replica)

When user opens `/agency-dashboard`, render these grids exactly (match icons, gradients, labels, navigation paths). No additions, no removals.

**Row 1 — 4 columns (`grid-cols-4 gap-3`):**

| Tile | Gradient | Icon (3D) | Label | Tap → |
|---|---|---|---|---|
| 1 | blue-500 → cyan-500 | `HostsIcon3D` | **Hosts** | `/agency-host-management` |
| 2 | green-500 → emerald-500 | `WithdrawIcon3D` | **Withdraw** | `/agency-withdrawal` |
| 3 | yellow-500 → orange-500 | `RankingIcon3D` | **Ranking** | `/agent-rank` |
| 4 | green→emerald (hasHelperAccess) / yellow→orange (pending) / purple→pink (default) | `HelperIcon3D` | **Helper** / **Pending** | if access → `/helper-dashboard` (or `/level5-helper-dashboard` for Level 5); else open Helper application dialog |

Tile 4 also shows a red pulsing badge `helperPendingCount` (max "99+") when helper has pending requests, and a small yellow dot when application is pending.

**Row 2 — 3 columns (`grid-cols-3 gap-3 mt-3`):**

| Tile | Gradient | Icon (3D) | Label | Tap → |
|---|---|---|---|---|
| 1 | amber-500 → red-500 | `DiamondExchangeIcon3D` | **Diamond Exchange** | `/agency-coin-exchange` |
| 2 | cyan-500 → blue-600 | `PolicyIcon3D` | **Policy** | `/agency-policy` |
| 3 | indigo-500 → purple-600 | `HistoryIcon3D` | **History** | `/agency-transfer-history` |

Above the Quick Actions grid also keep the **Payroll Helper Guide** banner card (indigo→purple icon, FileText, label "📖 Payroll Helper Guide" with subtext "Learn roles, benefits & diamond trading", tap → opens `PayrollHelperWelcomeModal`).

**Below the grids, in this order:**
1. **Agency Information Card** — 4 rows (Agency Code, Agency Level + name, Host Commission Rate %, Created date). Source: `agencies` row + `agency_level_tiers`.
2. **Tabs** (`grid-cols-4`): `Overview` (BarChart3) • `Hosts` (Users) • `Agents` (UserPlus) • `Charts` (TrendingUp).
3. **Overview tab**: Weekly Income AreaChart (recharts), Total Beans / Diamond Balance / Active Hosts / Pending Requests stat cards — **ALL aggregated server-side via `admin_agency_overview_stats` RPC**, never client SUM.
4. **Hosts tab**: paginated list of agency hosts with this-week beans contribution.
5. **Agents tab**: `SubAgentsPanel` component — sub-agent management.
6. **Charts tab**: pie + bar charts of host distribution, weekly trend.

Sub-routes that must exist and 1:1 match the web:
- `/agency-host-management`
- `/agency-withdrawal`
- `/agent-rank`
- `/helper-dashboard`, `/level5-helper-dashboard`
- `/agency-coin-exchange`
- `/agency-policy`
- `/agency-transfer-history`
- `/agency-commission-history`

---

## 5. FORBIDDEN BEHAVIORS

1. **No client-side balance recompute.** Always read fresh from DB / cache; mutations only via RPC.
2. **No direct SELECT** on `profiles` for non-owner reads → use `profiles_public`. Same for `agencies` → `agencies_public`.
3. **No hardcoded numbers** for: rates, percentages, minimums, fees, commissions, exchange ratios. Read from `app_settings`.
4. **No demo/fake/placeholder data.** Every value resolves from DB live.
5. **No Bengali strings** in UI. English only.
6. **No external browser** for in-app links (exceptions: Play Store, WhatsApp, Telegram).
7. **No `removeAllListeners()`** equivalent — remove subscriptions selectively per page dispose.
8. **No realtime channel reuse** — every channel name ends with a unique 6-char suffix.

---

## 6. ACCEPTANCE CHECK (must all pass)

- [ ] Profile top has **only**: back button, avatar, name, ID, country/city/language, stats. NO search, NO leaderboard, NO diamond pill in app bar.
- [ ] Avatar frame loads from equipped role_frames (admin-gifted shows up); SVGA plays; fallback to level frame works.
- [ ] `app_uid` displays correctly (10-digit numeric) and copies to clipboard with toast.
- [ ] Country flag + name visible always; city hidden when `hide_location=true` for other profiles.
- [ ] Friends/Following/Followers numbers match web (same RPC).
- [ ] Diamonds card value = `profiles.coins`; updates within 1 s after admin recharge.
- [ ] Beans card value = `profiles.beans` ONLY (never includes agency wallet).
- [ ] Trader Wallet card visible iff `isCoinTrader`; opens 4-tab transfer modal.
- [ ] All 17 menu items render in EXACT order with EXACT gating from §3.
- [ ] Call Price text dynamically computed from `app_settings.call_rates` (loading shimmer until ready).
- [ ] Female new sign-up sees Face Verification banner; menu hides Face Verification only after admin approves; Host Dashboard never visible to female; Agency Center never visible to female.
- [ ] Male sees Agency Center; never sees Call Price / Agency Details / Call History.
- [ ] `/agency-dashboard` Quick Actions exactly = 4 + 3 grid above; gradients and labels exact; helper tile shows pending badge.
- [ ] Agency Information Card shows code/level/commission/created dates from DB.
- [ ] Withdrawal screen blocks submit when `app_settings.beans_to_usd_rate` missing — explicit error, no silent fallback.
- [ ] All admin-panel changes (rates, frames gifted, banners, level icons, VIP plans, shop items) reflect in app within ≤ 1 s via realtime.
- [ ] No console error or "duplicate channel" warning on Profile mount → unmount → re-mount.
- [ ] Tab switch back to Profile → instant render from cache (no spinner flash).

---

**Hand this entire v3 document to the Flutter AI verbatim.** It is self-contained and aligned with the production web (`merilive.com`) source. Reference v2 (`FrodoLar_Profile_Master_Prompt.md`) for sub-page-by-sub-page detail of all 16 linked routes.
