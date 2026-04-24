# MeriLive — Antigravity / Flutter Section-by-Section Integration Map

> **Purpose**: Complete reference so Antigravity (the AI generating Flutter code) wires every screen to the correct table / RPC / column. Mirrors the live web behaviour 1:1.
> **Schema**: `public` only · **Date**: 2026-04-24

For low-level auth, security rules, storage buckets, and conversion constants see [`API_REFERENCE.md`](./API_REFERENCE.md). This file is the **screen → backend map**.

---

## Section 1 — Profile (3 personas)

The platform has **three** profile personas. The view always reads the same `profiles` row, but the rendered UI depends on derived role (`UserRole`).

### 1.1 User Profile (default)

| UI element | Source |
|---|---|
| Avatar + frame | `profiles.avatar_url` + `equipped_frame_id` (resolve via `avatar_frames`) |
| Name / @username | `display_name`, `username` |
| Diamonds | `coins` (read-only — never `update`) |
| Level badge | `level` → join `user_level_tiers` |
| Country flag | `country_code` → flag emoji |

**RPCs**: `update_profile_safe`, `ensure_profile_exists`, `normalize_profile_identity`.

### 1.2 Host Profile (Female + approved)

Adds on top of User Profile:

| UI element | Source |
|---|---|
| Host badge | computed `hostStatus == 'approved' && isFaceVerified && !isBlocked` (use `ProfileModel.isVerifiedHost`) |
| Beans (My Beans) | `beans` |
| Host level | `host_level` → join `host_levels` |
| Total earnings | `total_earnings` (read-only) |
| Live status | join `live_streams` where `host_id = profile.id` |

**Eligibility** (must all be true): gender = `Female`, `host_status = 'approved'`, `face_verified = true`, `is_blocked = false`. Anything else → render as **User Profile**.

### 1.3 Agency Owner Profile

Adds on top of User Profile:

| UI element | Source |
|---|---|
| Agency badge | `is_agency_owner = true` |
| Agency name / logo | join `agencies_public` on `owner_id = profile.id` |
| Agency wallet (USD) | `agencies.wallet_balance` |
| Agency level | `agencies.level` → `agency_level_tiers` |
| Total hosts | `agencies.total_hosts` |

> **CRITICAL** — Profile screen MUST be crash-proof. If `profiles` row is missing for the current `auth.uid()`, call `ensure_profile_exists` then retry the SELECT. Do NOT throw.

---

## Section 2 — Helper System (Levels 1–5)

Two separate dashboards based on `topup_helpers.trader_level`.

### 2.1 Standard Helper Dashboard (levels 1–4)

Screen: `lib/screens/standard_helper_dashboard.dart`

| Block | Source |
|---|---|
| Pending top-up requests | `helper_topup_requests` where `assigned_helper_id = me` and `status = 'pending'` |
| My orders | `helper_orders` where `helper_id = me` |
| Diamond balance | `profiles.coins` (helper acts as recharge agent) |
| Payment methods | `helper_payment_methods` where `helper_id = me` |
| Rank | `topup_helper_levels` |

**RPCs**: `helper_topup_user(_target_user_id, _diamonds, _payment_ref)`, `helper_complete_order(_order_id, _proof)`.

### 2.2 Level-5 Payroll Helper Dashboard

Screen: `lib/screens/level5_helper_dashboard.dart`

Adds:

| Block | Source |
|---|---|
| Pending agency withdrawals | `agency_withdrawals` where `assigned_helper_id = my topup_helper.id` and `status IN ('pending','processing')` |
| Withdrawal history | same table, `status IN ('paid','rejected')` |
| Earnings | aggregate of `helper_transactions` |

**RPCs**: `helper_claim_withdrawal(_withdrawal_id)`, `helper_complete_withdrawal(_withdrawal_id, _proof jsonb)`.

> Visibility rule (`helper-recharge-visibility-logic`): payment number is shown only when `trader_level = 5 AND payroll_enabled = true`.

### 2.3 Helper Application

Screen: `lib/screens/helper_application_form_screen.dart` (build using `HelperApplicationModel`).

| RPC | Params |
|---|---|
| `submit_helper_application` | `_country_code text, _whatsapp text, _documents jsonb` |
| `get_helper_application_status` | — |

---

## Section 3 — Agency System

### 3.1 Agency Dashboard

Screen: `lib/screens/agency_dashboard_screen.dart`

| Block | Source |
|---|---|
| Wallet (USD + Beans) | `agencies.wallet_balance`, `beans_balance`, `diamond_balance` |
| Hosts list | `agency_hosts` join `profiles_public` (use `AgencyHostModel`) |
| Weekly settlement | `agency_earnings_transfers` where `agency_id = me`, `period_start/period_end` filtered |
| Commission history | `agency_commission_history` |
| Withdrawal requests | `agency_withdrawals` |

### 3.2 Withdrawal Flow

`agency_request_withdrawal(_amount numeric, _method text, _details jsonb)`

Validation (`agency-withdrawal-validation-logic` memory): `epay` requires merchant ID; `lpft` requires bank routing; `usdt` requires TRC20/ERC20 chain.

### 3.3 Beans → Diamonds Exchange

RPC: `exchange_user_beans_to_diamonds(_amount_beans bigint)` — role-aware (User → My Diamonds; Agency Owner → Agency Diamonds).

### 3.4 Coin Trader / Smart Link / Policy

| Screen | Source |
|---|---|
| Coin Exchange | `agency_diamond_transactions` |
| Smart Link | `agencies.agency_code` → deep link `merilive://join?code=` |
| Policy | `agency_policy_settings` (English content) |

### 3.5 Agency Sign-Up

Dual OTP (Email + App notification) via `agency-signup-verification-standard`. Use `submit_agency_signup` followed by `verify_agency_signup` RPCs.

---

## Section 4 — Messaging System

### 4.1 Direct Messages

Screen: `lib/screens/direct_chat_screen.dart`

- Conversations: `conversations` (use `ConversationModel`).
- Messages: `messages` (use `MessageModel`). Realtime channel name pattern: `dm:<conversationId>`.
- Encryption keys: `conversation_encryption_keys` (per conversation symmetric key).
- Status updates: client must update `delivered_at` on receipt and `read_at` on view.

### 4.2 Group / Party Messages

- `party_room_messages` (Realtime).
- `room_welcome_messages` for system intros.

### 4.3 Stream Chat (live)

- `stream_chat` table — Realtime `live:<streamId>:chat`.

### 4.4 Support Messages

- `support_messages` for user-to-admin tickets.

### 4.5 AI Chat (Settings → AI Helper)

Use edge function `ai-chat` with `AiChatRequest` body. Persist user-visible thread to `messages` only if user opts in (do not by default to keep tokens cheap).

> Contact-sharing detection runs server-side via `chat_moderation_logs` insert trigger. Client should also display a warning banner if message contains numeric runs ≥ 7 digits.

---

## Section 5 — Shop

Screen: `lib/screens/shop_screen.dart` — uses `ShopItemModel`.

| Filter | Query |
|---|---|
| Tab = Frames | `category = 'frame' AND is_active` |
| Tab = Entry | `category = 'entrance' AND is_active` |
| Tab = Vehicles | `category = 'vehicle'` |
| Tab = Bubbles | `category = 'bubble'` |
| Tab = Medals | `category = 'medal'` |

**Card image** policy: prefer `preview_url` (static, fast); use `animation_url` / `svga_url` only on detail page or when item is equipped.

**Purchase RPC**: `purchase_shop_item(_item_id uuid, _payment_currency text)` where `_payment_currency ∈ ('coins','diamonds')`.

**Equip RPC**: `equip_user_item(_item_id uuid, _category text)` — updates corresponding `equipped_*_id` column on `profiles` (protected by trigger, RPC uses `app.bypass_profile_protection`).

---

## Section 6 — VIP Membership

Screen: `lib/screens/vip_screen.dart` — uses `VipTierModel`, `VipSubscriptionModel`.

| Block | Source |
|---|---|
| Available tiers | `vip_tiers` where `is_active` |
| My current tier | `user_vip_subscriptions` where `user_id = me AND is_active AND expires_at > now()` |
| Exclusive items | `vip_exclusive_items` filtered by `min_tier_level <= my tier` |

**Purchase RPC**: `purchase_vip_subscription(_tier_id uuid, _months int DEFAULT 1)` — deducts diamonds and creates / extends row in `user_vip_subscriptions`.

---

## Section 7 — Settings Hub

Screen: `lib/screens/settings_screen.dart`

| Item | Backing |
|---|---|
| Edit Profile | `update_profile_safe` |
| Country / Language | hardcoded English (`policy/global-english-standard`); country selector writes via `update_profile_safe` |
| Privacy / About | `app_content` where `page_key IN ('privacy','about','terms')` |
| AI Assistant | edge function `ai-chat` (Section 4.5) |
| Notifications | `notification_preferences` |
| Block list | `blocked_users` join `profiles_public` |
| Sign out / Delete account | `auth.signOut()` ; `delete_my_account` RPC |

---

## Section 8 — Levels (User vs Host)

`business/level-progression-policy`:

- **User level** ⇐ `total_recharged` (diamonds bought). Use `user_level_tiers`.
- **Host level** ⇐ host beans earned. Use `host_levels` (`HostLevelModel.beansRequired`).
- **Agency level** ⇐ weekly performance. Use `agency_level_tiers`.

Realtime hook: subscribe to `profiles` row UPDATE, recompute level locally OR rely on server-set `level` / `host_level` columns.

---

## Section 9 — Realtime channels (must use unique names)

| Purpose | Channel name pattern |
|---|---|
| My profile | `profiles:me:<userId>` |
| DMs | `dm:<conversationId>` |
| Notifications | `notifications:<userId>` |
| Live stream chat | `live:<streamId>:chat` |
| Party room | `party:<roomId>` |
| Agency withdrawals | `agency:<agencyId>:withdrawals` |
| Helper queue | `helper:<helperId>:queue` |
| Session invalidation | `session:<userId>` (for single-device enforcement) |

---

## Section 10 — Forbidden / pitfalls

1. **NEVER** UPDATE `profiles.coins`, `beans`, `host_status`, `face_verified`, `level`, `host_level` directly — triggers reject.
2. **NEVER** ship `service_role_key` in Flutter.
3. **NEVER** show Bengali text in any screen — global English only.
4. **NEVER** read other users via `profiles` directly — use `profiles_public`.
5. **NEVER** reuse a Realtime channel name across subscriptions — append unique id.
6. **ALWAYS** call `ensure_profile_exists` on first profile load to self-heal.
7. **ALWAYS** treat host approval as: `host_status='approved' AND face_verified AND NOT is_blocked`. Face verification alone ≠ host approval.
8. **ALWAYS** poll `app_settings.maintenance_mode` and `app_version_settings` on app start.

---

## Section 11 — Diamond Recharge / Top-Up (My Diamonds page)

> **CRITICAL — Mirror the web `src/pages/Recharge.tsx` 1:1.** Same layout, same 3 tabs, same balance header. No design changes in Flutter.

Screen: `lib/screens/recharge_screen.dart` — uses `CoinPackageModel`, `PaymentGatewayModel`, `RechargeTransactionModel`, `FirstRechargeBonusModel`, `RechargeCampaignModel`, `HelperDiamondPackageModel`.

### 11.1 Top-of-page header (My Diamonds)

| UI element | Source |
|---|---|
| Diamond balance | `profiles.coins` for current `auth.uid()` (read via `useUserBalance` equivalent — single-source cached) |
| Avatar + name | current user `profiles_public` row |
| Refresh button | re-call `ensure_profile_exists` then re-read balance |

> Balance MUST update in realtime when a recharge succeeds. Subscribe to `profiles:me:<userId>` channel and on UPDATE, refresh the cached balance.

### 11.2 Three Tabs (mirror web exactly)

| Tab | Backing |
|---|---|
| **Google** (Play Store) | `coin_packages` where `is_active AND product_id IS NOT NULL`. Use Play Billing SDK with `product_id`. |
| **Recommend** (international gateways) | `coin_packages` + `payment_gateways` where `gateway_type IN ('stripe','sslcommerz')` AND user country is in `country_codes`. |
| **Helper** (manual via topup helper) | `helper_diamond_packages` + `topup_helpers` (level 1–5) + `helper_payment_methods`. |

### 11.3 Banners shown in header

| Banner | Source |
|---|---|
| First-recharge bonus | `first_recharge_bonus` where `is_active`, hide if user has any `recharge_transactions` with `status='success'`. |
| Live campaign | `recharge_campaigns` where `is_active AND now() BETWEEN start_at AND end_at AND 'recharge' = ANY(display_locations)`. |

### 11.4 Recharge flow (per gateway type)

1. **Play Store** → `playStoreBilling.purchase(productId)` → on success, edge function `playstore-verify-purchase` validates + credits diamonds via `recharge_user_diamonds` RPC.
2. **Stripe / SSLCommerz** → edge function `create-checkout-session` returns hosted URL → in-app browser → on `stripe-webhook` callback, diamonds credited.
3. **Manual helper** → user picks helper + package + uploads payment proof → INSERT into `helper_topup_requests` (status `pending`). Helper completes via `helper_topup_user` RPC.
4. **ZiniPay (BD auto)** → in-app modal flow with `skip_redirect: true`, polls `zinipay_status` then auto-credits.

### 11.5 Forbidden in this section

- ❌ **Never** UPDATE `profiles.coins` directly. Always go through `recharge_user_diamonds` RPC (server-side, edge-function only).
- ❌ **Never** trust client-side price. The selected package's `price_usd` is re-validated server-side before crediting.
- ❌ **Never** show payment numbers from a non-payroll-enabled helper. Filter helpers in the Helper tab using `trader_level = 5 AND payroll_enabled = true` for withdrawal-related flows; standard recharge uses any active helper.

### 11.6 Realtime updates

| Channel | Event |
|---|---|
| `profiles:me:<userId>` | balance changed → refresh header |
| `recharge_campaigns` | new campaign or expiry → refresh banner |
| `recharge:<userId>` | helper request status change → toast + refresh history |

---

## Section 12 — Model file index (Flutter)

| Domain | File |
|---|---|
| Profile | `lib/models/profile_model.dart` |
| Role | `lib/models/user_role.dart` |
| Agency | `lib/models/agency_model.dart` |
| Agency host | `lib/models/agency_host_model.dart` |
| Helper | `lib/models/helper_model.dart` |
| Withdrawal | `lib/models/withdrawal_model.dart` |
| Gift | `lib/models/gift_model.dart` |
| Message | `lib/models/message_model.dart` |
| VIP | `lib/models/vip_model.dart` |
| Shop | `lib/models/shop_item_model.dart` |
| Levels | `lib/models/level_model.dart` |
| AI chat | `lib/models/ai_chat_model.dart` |
| App version | `lib/models/app_version_model.dart` |
| Trader / payment | `lib/models/trader_model.dart`, `payment_gateway_model.dart` |
| Diamond package (legacy) | `lib/models/package_model.dart` |
| **Recharge / Diamond Top-Up** | **`lib/models/recharge_model.dart`** (CoinPackage, PaymentGateway, RechargeTransaction, FirstRechargeBonus, RechargeCampaign, HelperDiamondPackage) |

Whenever the DB schema changes, regenerate the affected models and update both this file and `API_REFERENCE.md`.
