# FrodoLar — Profile Section Master Prompt (v2 — Zero-Missing Edition)

**Target stack:** Flutter (Dart 3, Riverpod or Provider, `supabase_flutter`, `svgaplayer_flutter`, `lottie`, `cached_network_image`, `flutter_svg`)
**Backend:** Supabase project `ayjdlvuurscxucatbbah` (same DB as web). Use anon key only on client; all balance/trade/withdraw operations go through existing RPCs / edge functions.
**Goal:** Build the FrodoLar Flutter app's **Profile section + every linked sub-page** as a **pixel-and-behavior 1:1 replica** of the production web (`merilive.com`). Zero missing menu, zero missing modal, zero hardcoded numbers.

---

## 0. GLOBAL DESIGN TOKENS (apply to every page below)

```
Background base   : #0F0820 (radial: top-left #1a0a2e, top-right indigo/15, center fuchsia/8, bottom purple-900/20)
Glass surface     : rgba(255,255,255,0.05) + border rgba(255,255,255,0.10) + backdrop blur 20
Primary gradient  : linear 135° from #A855F7 (purple-500) → #EC4899 (pink-500)
Diamond gradient  : purple-500 → purple-600 → indigo-700
Beans gradient    : amber-400 → orange-500 → red-500
Trader gradient   : amber-500 → orange-500
Verified gradient : blue-400 → cyan-400  (white check, 2px dark border)
Highlight gold    : #FFD700  (level/VIP)
Text primary      : #FFFFFF (drop-shadow black/20)
Text secondary    : rgba(255,255,255,0.50)
Card radius       : 16–24 (xl/2xl)
Active scale      : 0.95 on tap (120ms)
Safe area top     : respect notch
Bottom nav padding: paddingBottom = bottomNavHeight + 40
```

**Icons:** use 3D PNG/SVGA assets from `app-assets` edge function (`Diamond3DIcon`, `Beans3DIcon`, `Premium3DFrame`, `AvatarWithFrame`, `FloatingLevelIcon`, `VIPBadge`). Cache 5 min via the unified visual assets API. **No emoji-only icons** for primary currency cards.

**Real-time:** every Supabase subscription channel name MUST end with a unique suffix (e.g. `profile_${userId}_${nanoid(6)}`). Never reuse channel names.

**Strings:** English only. No Bengali strings in UI. Numbers formatted with `NumberFormat.decimalPattern('en_US')`.

---

## 1. PROFILE HEADER (top of `/profile` and `/profile/:userId`)

Render strictly in this top-down order:

1. **Fixed back button** (top-left, glass circle, 40x40, ArrowLeft icon, white/80) — does NOT scroll.
2. **Avatar with Level-Based Frame** (`AvatarWithFrame` size=xl)
   - Source: `profile.avatar_url` (fallback: AI placeholder for approved hosts without avatar — see memory `placeholder-avatar-system`).
   - Frame: SVGA/Lottie loaded from `user_role_frames` (equipped) → fallback to level frame from `level_tiers.level_icon`.
   - Glow ring: only if `displayLevel >= 10`.
   - Tap → `/profile-detail/:profileId`.
   - Verified badge bottom-right (gradient blue→cyan, dark border) iff `profile.is_verified || isFaceVerified`.
3. **Name** — `resolvedProfileName` resolution order:
   `profile.display_name` (if not weak: not empty, not starting with `guest_`/`device_`/`user_`, not in `[user, owner, unknown, guest]`) → `profile.username` → `user_metadata.username/full_name/name` → `"User"`.
4. **UID pill** (glass, copy on tap, toast "UID Copied!") — shows `profile.app_uid` (10-digit numeric, auto-generated on signup).
5. **Country / City / Language pills** (row, wrap):
   - Country pill (emerald-500/15) — ALWAYS visible. Source: `useGeolocation().country` || `profile.country_name`. Flag emoji from `geoLocation.countryFlag` || `profile.country_flag` || `🌍`.
   - City pill (white/5) — visible iff `isOwnProfile || !profile.hide_location`. Source: `geoLocation.city`.
   - Language pill (orange-500/15) — derived from country (default Bengali for BD).
6. **Stats row** — 3 columns separated by vertical hairline gradient:
   `Friends` | `Following` | `Followers` (numbers from `useProfileStats(userId)`; tap own profile → `/following`).
7. **Action buttons** (only when `!isOwnProfile`):
   - `Follow` / `Following` toggle (gradient purple→pink filled when not following, outlined purple when following). Calls `handleFollow` → `follows` table upsert + optimistic state.
   - `Call` button (green→emerald gradient) — only visible iff `profile.is_host && profile.gender === 'female'`. Routes through `CallProvider.startCall(profileId)` which validates: balance ≥ rate × 1 min, host online, host not busy (`Host Busy` overlay if busy).
   - `Message` button (outlined pink) → `/chat?user=:profileId`.

---

## 2. CARDS GRID (only when `isOwnProfile`)

### 2A. Diamonds & Beans (2-col grid, ultra-compact, top of menu)

**Diamonds card** (purple→indigo gradient, 3D shine overlay):
- Label `My Diamonds`
- Value: `resolvedDiamondBalance = max(profile.coins, profile.diamonds, cachedBalance)` from `useUserBalance()` singleton cache.
- Right pill: `+ Recharge`
- Tap → `/recharge`.
- Realtime: subscribe to `profiles:id=eq.${userId}` UPDATE → update `coins`/`diamonds`. Also listen to `balance_audit_log` inserts for that user → invalidate cache.

**Beans card** (amber→orange→red gradient):
- Label `My Beans`
- Value: `getPersonalBeans(profile) = max(0, profile.beans)` — **PERSONAL bucket only**. NEVER mix `agencies.wallet_balance` (that's Agency Total Beans, separate page). See memory `beans-separation-and-admin-percentage-governance`.
- Right pill: `Exchange` → opens `UserBeansExchangeModal` (see §6).
- Realtime: same `profiles` subscription.

### 2B. Trader Wallet card (full width, only if `isCoinTrader`)

- Gradient amber→orange. Label `Trader Wallet`. Value: `traderWallet` (from `coin_traders.wallet_balance` where `user_id = me`).
- Two pills bottom-right:
  - `Transfer History` → `/host-transfer-history`
  - `Join Agency` (only if `!isInActiveAgency`) → `/join-agency`
- Tap card body → opens **Coin Trader Transfer Modal** (`Tabs: User / Agency / Self / History`, see §7).

---

## 3. MENU LIST (rendered from `menuItems` array — render in EXACT order below, only items where `show=true`)

Each row: glass card 56px, left icon (40x40 rounded-xl with `iconBg` + `iconColor`), label (white, semibold 14), optional `extra` widget (right-aligned), optional `rightText` (xs muted), optional red dot if `hasNotification`, ChevronRight 16, tap = navigate(`path`) OR call `onClick`.

| # | Label | Icon | Path / Action | Visibility (`show`) | Right side |
|---|-------|------|---------------|---------------------|-----------|
| 1 | **Go Offline** | `Power` (red-100/red-500) | confirm → `goOfflineManually(uid)` → `signOut({scope:'local'})` → `/auth` | `isOwnProfile && profile.is_host === true` | — |
| 2 | **Messages** | `MessageCircle` (pink-100/pink-500) | `/chat` | `isOwnProfile` | Badge = `globalUnread.messages + notificationCount` |
| 3 | **Face Verification** | `UserCheck` (amber if required, blue if pending) | `/face-verification` (or no-op toast if pending) | `isOwnProfile && !isFaceVerified` (hide once approved) | `Required` (amber) or `Under Review` (blue) |
| 4 | **Call Price Update** | `PhoneCall` (green→emerald gradient) | opens Call Price modal (action `call_price`) | `isOwnProfile && isFemale` | computed `${beansPerMin} Beans/min` (see §8) |
| 5 | **Host Registration** | `Star` (pink→rose gradient) | `/host-verification` | `canApplyForHost` (male user wanting to become host — rare; female auto-pending_face) | `Become a Host` |
| 6 | **My Level** | `Crown` (amber-100/amber-500) | `/level` | `isOwnProfile` | `extra` = `FloatingLevelIcon(userLevel) + "Lv${userLevel}" + (VIPBadge if vip>0) + Progress(levelProgress) + "Lv${nextLevel}"` |
| 7 | **VIP Membership** | `Gem` (purple→pink gradient) | `/vip` | `isOwnProfile` | `VIPBadge(tier)` if `userVIPTier>0` else "Upgrade Now" (purple-400) |
| 8 | **Call History** | `Phone` (green-100/green-500) | `/call-history` | `isOwnProfile && isFemale` | — |
| 9 | **Shop** | `Sparkles` (purple→pink gradient) | `/shop` | `isOwnProfile` | `Frames & Effects` |
| 10 | **Host Dashboard** | `Wallet` (emerald-100/emerald-600) | `/host-dashboard` | `isOwnProfile && isHost && !isFemale` | `Earnings` |
| 11 | **Agency Details / Join Agency** | `Building2` (green→emerald if joined, pink→rose if not) | `/agency-details` or `/join-agency` | `isOwnProfile && isFemale` | `My Agency` or `Apply` |
| 12 | **Agency Dashboard / Agency Center** | `Building2` (purple→indigo if owner, purple-100 if not) | `/agency-dashboard` or `/agency` | `isOwnProfile && showAgencyCenter && !isFemale` | `My Agency` or `Agent Rank` |
| 13 | **My Invitation** | `Mail` (purple-100/purple-500) | `/invitation` | `isOwnProfile` | `Get Rewards` |
| 14 | **My Tasks** | `ClipboardList` (blue-100/blue-500) | `/tasks` | `isOwnProfile` | `New Reward` + red dot if `hasUnclaimedReward` |
| 15 | **My Profile** | `User` (indigo-100/indigo-500) | `/edit-profile` | `isOwnProfile` | — |
| 16 | **Settings** | `Settings` (gray-100/gray-500) | `/settings` | `isOwnProfile` | — |
| 17 | **Priority Support** | `MessageCircle` (amber→orange gradient) | `/settings/customer-service` | `isOwnProfile && userLevel >= 6` | `Level 6+` |

**Role flags (compute once, reuse):**
- `isOwnProfile = !routeParam.userId || routeParam.userId === currentUser.id`
- `isFemale = profile.gender === 'female'`
- `isHost = profile.is_host === true` (DB-trigger guarantees: female + face-verified ⇒ true; else false)
- `isFaceVerified = profile.face_verified === true` (or latest `face_verification_submissions.status === 'approved'`)
- `faceVerificationPending = latest submission status in ('pending','submitted')`
- `isAgencyOwner = exists(agencies where owner_id = me AND status='active')`
- `isInActiveAgency = exists(agency_hosts where user_id = me AND status='active')`
- `isCoinTrader = exists(coin_traders where user_id = me AND status='active')`
- `canApplyForHost = !isHost && !isFemale && !faceVerificationPending && (app_settings.allow_male_host_apply ?? false)`
- `showAgencyCenter = profile.gender === 'male'` (per role mapping memory)
- `userLevel = profiles.level` (cache last good in localStorage 24h, default 1, never show 0)
- `userVIPTier = active row in user_vip_subscriptions where expires_at > now()`

---

## 4. SUB-PAGES — REQUIRED PARITY (build each as separate Flutter route)

For each sub-page below, replicate the exact web UI, data, validation, and writes. Web file paths shown for the AI to read directly via the Supabase project / repo.

### 4.1 `/recharge` (Diamond top-up)
- Source: `src/pages/Recharge.tsx`. Show diamond packages from `recharge_packages` table (active only, sorted `display_order`). Play Store billing on Android — pricing $1.29 / $2.99 / $5.99 / $9.99 / $19.99 / $49.99 / $89.99 mapped via `play_billing_product_id`. Call `/functions/v1/zinipay-create-order` for ZiniPay flow (60s polling, see memory `zinipay-auto-recharge-specification-v2`).

### 4.2 `/face-verification`
- Source: `src/pages/FaceVerification.tsx` (2440 lines — replicate every step).
- 3 photos: front, left, right. Upload to **private** storage bucket `face-verifications/{user_id}/...`.
- Insert row in `face_verification_submissions` (status `submitted`). 100% manual admin approval (no auto-approval). Show pending banner on `/profile` while awaiting.
- After approval: DB trigger sets `profiles.is_host = true` (female only), `face_verified = true`. Revoke → auto-rollback to `pending_face`.

### 4.3 `/level`
- Source: `src/pages/Level.tsx`. Show user current level (big 3D icon), progress bar to next level, all level tiers from `level_tiers` (number, name, min_topup, min_earning, icon SVGA).
- High-Water-Mark logic: level never decreases. A1–A5 codes for hosts.
- Realtime: `useRealtimeLevelProgress` hook subscribing to `profiles` UPDATE.

### 4.4 `/vip`
- Source: `src/pages/VIP.tsx` (1459 lines). 4 tabs: **Plans / My Privileges / Noble / History**.
- Plans from `vip_plans` table; perks from `vip_perks` (anti-kick, recharge bonus %, daily reward, noble entrance SVGA).
- Purchase → `process_vip_subscription` RPC (atomic: deduct diamonds, insert `user_vip_subscriptions`, log `balance_audit_log`).
- "My Privileges" tab lists owned + admin-gifted frames (`user_role_frames`) with **Equip / Unequip** buttons → `auto_equip_role_frame` trigger.
- Noble tab: subscription_type='noble', special entrance effect.

### 4.5 `/shop`
- Source: `src/pages/Shop.tsx`. Categories: **Avatar Frames / Role Frames / Entry Effects / Chat Bubbles / Gifts**.
- Performance: static preview image first (`preview_url`), full SVGA/Lottie animation only on tap (memory `shop-display-logic`).
- Buy → `purchase_shop_item` RPC. Negative-balance blocked by trigger.

### 4.6 `/agency` (Agent rank — male only)
- Source: `src/pages/Agency.tsx`. Lists agency tiers from `agency_level_tiers` with commission %, min hosts, min monthly diamonds. CTA `Create Agency` → `/agency-signup`.

### 4.7 `/agency-signup`
- Source: `src/pages/AgencySignup.tsx`. Atomic registration via `create_agency_with_owner` RPC. **Dual OTP** (Email via `verify-email-otp` edge function + In-app OTP). Validates name uniqueness, owner gender = male, payment method (Local / USDT / ePay / Binance for BD).

### 4.8 `/agency-details` (female host who joined an agency)
- Source: `src/pages/AgencyDetails.tsx`. Shows agency name, tier, owner contact (only if `app_settings.helper_contact_info` configured), join date, my contribution beans this week, agency commission rate currently applied.

### 4.9 `/join-agency`
- Source: `src/pages/JoinAgency.tsx`. Search agencies by code/name (uses `agencies_public` view — never direct `agencies` SELECT). Send join request → `agency_host_requests` insert.

### 4.10 `/agency-dashboard` (agency owner OR sub-admin)
- Source: `src/pages/AgencyDashboard.tsx` (2226 lines). Tabs: **Overview / Hosts / Helpers / Beans → Diamonds / Withdrawal / Commission History / Payroll / Settings**.
- Overview: Total Beans (`agencies.wallet_balance`), Diamond Balance, This-week earnings, Active hosts count, Pending requests count. **All sums server-side** via `agency_overview_stats` RPC — never client SUM.
- Beans → Diamonds: `/agency-coin-exchange` modal — fee 25 %, min 100,000 beans (memory `beans-to-diamonds-exchange-v2`). Reads `app_settings.coin_exchange` for live rate.
- Withdrawal: `/agency-withdrawal` — `request_agency_withdrawal` RPC. Min beans = `GREATEST(withdrawal_settings.min_withdrawal, agency_commission.min_payout) = 100,000`. Net USD ≥ `agency_commission.min_usd = $10`. Beans→USD rate from `app_settings.beans_to_usd_rate` (NO fallback — error if missing). Validates ePay email, USDT TRC20 address, Binance ID. Weekly auto-payroll runs Sunday midnight (do NOT trigger from app).
- Helper recharge: tiered visibility ≥ 300k (memory `helper-recharge-visibility-logic`). Funding deduction order: agency wallet → personal beans (memory `helper-recharge-funding-logic`).

### 4.11 `/invitation`
- Source: `src/pages/Invitation.tsx`. Shows my referral code, deep link `merilive://referral?code=...&app_uid=...`, total invited count, total reward beans, list of invitees from `referrals` table joined to `profiles_public`. Share button → native share sheet.

### 4.12 `/tasks`
- Source: `src/pages/Tasks.tsx`. Daily Missions + Weekly + Achievement tabs. Sync via `update_task_progress` RPC. Reward claim → `claim_task_reward` RPC (idempotent). Date logic via `getTaskDate()` (resets at 12:30 AM BST per leaderboard memory).

### 4.13 `/edit-profile`
- Source: `src/pages/EditProfile.tsx`. Editable: avatar (upload to `avatars` bucket — public read for own only via `profiles_public` view), display_name, bio, country, gender (LOCKED after first set — gender determines role), birthday, hide_location toggle, language. Writes via `update_profile` RPC (validates display_name length, profanity, contact-info masking via Cloud Vision API per memory `contact-sharing-moderation-unified`).

### 4.14 `/settings`
- Source: `src/pages/Settings.tsx`. Sub-routes: `/account`, `/privacy`, `/notifications`, `/language`, `/blocked-users`, `/customer-service` (Priority Support — Level 6+ gated), `/about`, `/delete-account`.
- Logout button at bottom: `signOut({scope:'global'})` → clear EncryptedSharedPreferences → `/auth`.
- Single-device session enforcement: on login, write `device_id` to `profiles.active_device_id`; on app start, if mismatch → force logout with toast (30s grace).

### 4.15 `/agency-coin-exchange`
- Source: `src/pages/AgencyCoinExchange.tsx`. Convert agency beans → diamonds for personal/recharge use. Live rate from `app_settings.coin_exchange` (subscribe realtime). Calls `process_agency_coin_exchange` RPC.

### 4.16 `/agency-coin-trader` (Coin Trader management)
- Source: `src/pages/AgencyCoinTrader.tsx`. Owner adds/removes traders, sets wallet limit, views per-trader transfer history.

---

## 5. PROFILE DATA FETCH (parallel — single batch on mount)

Use `Future.wait([...])` to fetch in parallel — exactly these 13 queries:

```dart
final [
  profile,            // profiles WHERE id = userId  (own) OR profiles_public WHERE id = userId (other)
  agencyMembership,   // agency_hosts WHERE user_id = me AND status = 'active'
  agencyOwned,        // agencies WHERE owner_id = me AND status = 'active'
  coinTrader,         // coin_traders WHERE user_id = me AND status = 'active'
  vipSub,             // user_vip_subscriptions WHERE user_id = me AND expires_at > now()
  faceSub,            // face_verification_submissions WHERE user_id = me ORDER BY created_at DESC LIMIT 1
  followStats,        // RPC profile_follow_stats(uid)
  isFollowing,        // follows WHERE follower=me AND following=userId  (only if !isOwnProfile)
  callRates,          // app_settings WHERE key='call_rates'           (only if isFemale host)
  coinExchange,       // app_settings WHERE key='coin_exchange'
  beansToUsd,         // app_settings WHERE key='beans_to_usd_rate'
  helperContact,      // app_settings WHERE key='helper_contact_info'
  unclaimedTasks,     // RPC has_unclaimed_task_reward(uid)
] = await Future.wait([...]);
```

After fetch: cache profile in `SharedPreferences` (key `meri_profile_cache_${userId}`, TTL 5 min) for instant restore on tab switch.

**Realtime subscriptions** (one combined channel suffix per page mount):
- `profiles:id=eq.${userId}` → update balances, level, vip, beans
- `balance_audit_log:user_id=eq.${userId}` (insert) → invalidate balance cache
- `app_settings` (all events) → debounced refetch of rate-driven UI (800 ms; INSTANT_TABLES bypass debounce)
- `face_verification_submissions:user_id=eq.${userId}` → update pending banner
- `agency_hosts:user_id=eq.${userId}` → update join state

---

## 6. USER BEANS EXCHANGE MODAL (`UserBeansExchangeModal`)

Source: `src/components/profile/UserBeansExchangeModal.tsx`.
- Input: amount of beans to convert.
- Reads `app_settings.coin_exchange` → `{ rate, fee_percent, min_amount }` (NO hardcoded values).
- Preview: `diamonds_received = floor(beans × rate × (1 - fee_percent/100))`.
- Submit → `process_user_beans_exchange` RPC. Atomic; logs `balance_audit_log`. Realtime updates both cards.

---

## 7. COIN TRADER TRANSFER MODAL (4 tabs)

Source: bottom of `src/pages/Profile.tsx` lines ~1900-3000.
- **User tab**: Search by app_uid → resolves via `profiles_public` view → shows avatar/name → enter amount → confirm dialog → `coin_trader_transfer_to_user` RPC.
- **Agency tab**: List agencies I trade for → select → amount → `coin_trader_transfer_to_agency` RPC.
- **Self tab**: Transfer Trader Wallet → My Diamond Balance via `coin_trader_self_recharge` RPC. Source priority: agency balance → trader wallet (display both, deduct in order shown).
- **History tab**: `coin_trader_transfers` joined to counterparty name (via `profiles_public`). Shows direction (sent/received), amount, status (completed/pending/failed/cancelled), formatted date.

All transfers require confirmation dialog (3D gem icon, big gradient amount, recipient name + UID).

---

## 8. CALL PRICE DISPLAY (menu item #4)

Compute exactly:
```
hostLevel       = getEffectiveHostLevel(profile.host_level)
levelRates      = callRateSettings.level_rates  // [{level, rate}]
diamondRate     = resolveEffectiveCallRate({ settings, hostLevel, customRate: profile.call_rate_per_minute })
                  || levelRates.find(l => l.level == hostLevel)?.rate
                  || callRateSettings.default_rate
                  || 2000
commissionPct   = callRateSettings.host_commission_percent || 55
beansPerMin     = floor(diamondRate × commissionPct / 100)
```
Display `${beansPerMin} Beans/min`. Show `Loading...` while `callRateSettings` null. Tap → modal where female host can adjust `custom_rate` within admin-allowed bounds → `update_host_call_rate` RPC.

---

## 9. SECURITY & DATA RULES (NON-NEGOTIABLE)

1. **Never SELECT directly from `profiles` for non-owner reads** — always use `profiles_public` view. Same for `agencies` → `agencies_public`.
2. **Never store/compute balances client-side for writes.** All deductions/credits go through RPCs which write `balance_audit_log`. Negative balances are blocked at trigger level.
3. **Never hardcode** any of: call rate, commission %, exchange rate, withdrawal min, beans→USD rate, host commission %, fee %. Always read from `app_settings` or admin tables; show explicit error if missing.
4. **Never use `Capacitor.App.removeAllListeners()`** equivalent in Flutter — remove listeners selectively per page dispose.
5. **Realtime channel suffix** mandatory.
6. **Strict 21-second rule** for private calls — handled server-side in `settle_private_call`. Client just shows the timer.
7. **Hide profile from feed** when `profile.is_online == false` AND not in active live stream (memory `host-visibility-governance-v2`).
8. **No external browser** for in-app navigation. Only exceptions: Play Store, WhatsApp deep link, Telegram deep link.

---

## 10. ACCEPTANCE CHECKLIST (Definition of Done)

- [ ] Profile screen visually identical to web at 390×840 viewport (header, cards, menu order).
- [ ] All 17 menu items render with correct gating per the table in §3.
- [ ] Female user signing up shows: pending Face Verification banner, Call Price Update menu, Join Agency menu — NO Host Dashboard, NO Agency Center.
- [ ] Male user signing up shows: Agency Center, Host Registration (if allowed by setting). NO Call Price, NO Agency Details.
- [ ] Agency owner sees Agency Dashboard (replaces Agency Center). Coin trader sees Trader Wallet card.
- [ ] All currency values come from RPCs / cached `useUserBalance` singleton — zero hardcoded `0`s after load.
- [ ] All exchange/withdrawal/call-rate UIs read live from `app_settings`; missing key → explicit error toast, never silent fallback.
- [ ] Tab switch back → instant render from `meri_profile_cache_*` (no spinner flash).
- [ ] Realtime: changing diamonds in admin reflects on Profile within 1 s.
- [ ] Single-device-session enforced: login on device B logs out device A within 30 s.
- [ ] Face-verification flow uploads to private bucket, creates submission row, shows `Under Review` after submit, hides menu after admin approval.
- [ ] Every sub-page route in §4 navigates and loads without console error.
- [ ] No Bengali strings in UI. No `Demo` / `Fake` data anywhere.
- [ ] All Supabase channels have unique suffixes; no duplicate-channel warnings in logs.
- [ ] Lighthouse-equivalent (Flutter DevTools): first meaningful paint ≤ 1.5 s on mid-range Android.

---

**Hand this entire document to the Flutter AI verbatim.** It is self-contained and matches the production web behavior 1:1 (verified against `src/pages/Profile.tsx`, `Agency.tsx`, `AgencyDashboard.tsx`, `AgencySignup.tsx`, `AgencyDetails.tsx`, `VIP.tsx`, `Level.tsx`, `Shop.tsx`, `Tasks.tsx`, `Invitation.tsx`, `Settings.tsx`, `FaceVerification.tsx`, `EditProfile.tsx`, `AgencyCoinExchange.tsx`, `AgencyCoinTrader.tsx`).
