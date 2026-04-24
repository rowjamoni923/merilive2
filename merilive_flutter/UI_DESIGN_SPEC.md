# MeriLive — Flutter UI Design Specification (1:1 Web Parity)

> **Goal**: Antigravity must replicate the exact web design in Flutter. This document is the single source of truth for layout, colors, spacing, animations, and data binding for the most critical screens.
>
> **Hard rule**: All text must be **English only**. No Bengali strings anywhere in UI.

---

## 0. Design Tokens (use everywhere)

| Token | HSL / Hex | Usage |
|---|---|---|
| `bgPrimary` | `linear-gradient(180°, #2d1045 0%, #1a0a2e 30%, #0d0618 100%)` | App background (Recharge, VIP) |
| `surface` | `#FFFFFF15` (white 15% alpha) | Glass cards over dark bg |
| `surfaceBorder` | `#FFFFFF20` | 1px border on glass cards |
| `primary` | `#8B5CF6` (purple-500) | Brand primary |
| `secondary` | `#EC4899` (pink-500) | Brand secondary |
| `accent` | `#F59E0B` (amber-500) | Diamond / VIP gold |
| `success` | `#10B981` (emerald-500) | Positive states |
| `danger` | `#EF4444` | Errors, blocked |
| `textOnDark` | `#FFFFFF` | Primary text on dark |
| `textOnDarkMuted` | `#FFFFFFB3` (white 70%) | Secondary text |

**Typography** (use `GoogleFonts.inter` or system equivalent):
- H1: 18sp / w700
- H2: 16sp / w600
- Body: 14sp / w500
- Caption: 11sp / w500
- Tiny: 9–10sp / w500

**Spacing scale**: 4 / 8 / 12 / 16 / 20 / 24 (Flutter `EdgeInsets.all(N)`)

**Radii**: 8 (chips), 12 (buttons), 16 (cards), 20 (modals), 24 (sheets).

---

## 1. Diamond Recharge — `/recharge` (My Diamonds)

### 1.1 Screen anatomy (top to bottom)

```
┌─────────────────────────────────────┐
│ [←]   Diamond Store          [📄]   │  ← Header (gradient purple→pink)
├─────────────────────────────────────┤
│ ┌──── Glass card ────────────────┐ │
│ │ 💎  Your Balance     |  USD $  │ │  ← Balance + Currency chip
│ │     12,345           |         │ │
│ └────────────────────────────────┘ │
├─────────────────────────────────────┤
│ ┌──────────┬──────────┬──────────┐ │
│ │💎Diamonds│🎁 Offers │👥Helpers │ │  ← 3 Tabs (pill, white when active)
│ └──────────┴──────────┴──────────┘ │
├─────────────────────────────────────┤
│ ╔═══════════════════════════════╗   │
│ ║ 🎁 First Recharge Bonus 2X    ║   │  ← Animated banner (only first-time)
│ ╚═══════════════════════════════╝   │
│ ┌─────┬─────┬─────┐                 │
│ │ 100 │ 500 │1000 │  package grid   │  ← 3-column grid, gradient cards
│ └─────┴─────┴─────┘                 │
└─────────────────────────────────────┘
```

### 1.2 Header (fixed, ≈ 180dp tall)

```dart
Container(
  decoration: BoxDecoration(
    gradient: LinearGradient(
      begin: Alignment.topLeft, end: Alignment.bottomRight,
      colors: [Color(0xFF8B5CF6), Color(0xFFEC4899), Color(0xFF8B5CF6)],
    ),
  ),
  child: SafeArea(child: Column(children: [
    // Row 1: Back / Title / History icon (h=56)
    // Row 2: Balance glass card (h=64, padding 12)
    // Row 3: Tab pills (h=40, padding 12)
  ])),
)
```

- **Title**: `"Diamond Store"` — center, white, 18sp/w700.
- **History icon**: top-right, navigates to `/recharge-history`.
- **Balance card**: `Color(0xFFFFFFFF).withOpacity(0.15)` background, 12px radius, 1px white-20% border, `BackdropFilter` blur 16.
- **Diamond icon**: 36×36 rounded square, white-20% bg, 24px Diamond3DIcon inside.
- **Currency chip** (right side, only if `currencyRate != null`): white-20% bg, shows `{symbol} {code}` (e.g. `৳ BDT`).

### 1.3 Tabs (3 pills inside white-10% pill row)

| id | label | icon |
|---|---|---|
| `google` | 💎 Diamonds | `Icons.diamond` |
| `recommend` | 🎁 Offers | `Icons.star` |
| `helper` | 👥 Helpers | `Icons.workspace_premium` |

Active state: white background, primary text. Inactive: white-80% text, transparent.

### 1.4 First-Recharge Banner (conditional)

Show only when `is_first_recharge == true` AND user has no row in `first_recharge_claims`.
Data source: `first_recharge_bonus` table (`bonus_multiplier`, `banner_image_url`, `banner_title`, `banner_subtitle`, `banner_type`).

- If `banner_type == 'image'` and `banner_image_url` present → show full-bleed image, h=80dp, radius 12.
- Else → animated gradient (`#1a0a2e → #2d1045`), gold shimmer overlay, 3D treasure-chest asset (`assets/treasure_chest_3d.png`) on left, gold gradient text center: `"FIRST RECHARGE 2X BONUS"`.

Use `flutter_animate` for shimmer (`.shimmer(duration: 3.seconds)`) and `.scale()` bounce on chest.

### 1.5 Package Grid (Tab = `google` / `recommend`)

- 3 columns, `crossAxisSpacing: 8`, `mainAxisSpacing: 8`, `childAspectRatio: 0.85`.
- Card layout (per package):
  ```
  ┌─────────────┐
  │   💎 (3D)   │
  │   1,000     │   ← diamonds (w800, 18sp)
  │  +100 BONUS │   ← bonus_diamonds chip (only if >0)
  ├─────────────┤
  │   $9.99     │   ← price_display (gradient text)
  └─────────────┘
  ```
- Popular package (`is_popular == true`): purple→pink gradient border, `★ POPULAR` ribbon top-right.
- Discount (`discount > 0`): red badge `-{discount}%` top-left.
- Tap → triggers Play Billing flow on Android, Stripe checkout on iOS/web.

### 1.6 Helpers Tab (`helper`)

List of L1–L4 trader helpers (`topup_helpers` where `trader_level != 5` and `wallet_balance >= 100,000` and country matches user). One card per helper:

```
┌────────────────────────────────────────┐
│ [avatar+frame]  Display Name  🇧🇩 LVL3 │
│                 ★ 1,250 sold | online● │
│ [WhatsApp btn]              [Message]  │
└────────────────────────────────────────┘
```

Below the helper list: "Local Pay" section showing L5 payroll helper payment methods (`helper_country_payment_methods` joined with verified helpers). Each row shows method logo + masked account number + Copy button.

### 1.7 Real-time

```dart
supabase.channel('recharge:user:${userId}')
  .onPostgresChanges(
    event: PostgresChangeEvent.update,
    schema: 'public', table: 'profiles', filter: 'id=eq.$userId',
    callback: (p) => updateBalance(p.newRecord['coins']),
  ).subscribe();
```

Also subscribe to `coin_packages` and `currency_rates` for admin-driven updates.

### 1.8 NEVER-DO list

- ❌ Never call `supabase.from('profiles').update({coins: ...})` — always go through `recharge_user_diamonds` RPC.
- ❌ Never show Bengali text — use English only.
- ❌ Never bypass `is_active` filter on packages or gateways.

---

## 2. Profile (3 personas)

The same `/profile` route renders three different layouts based on role.

### 2.1 Persona detection

```dart
enum ProfilePersona { user, host, agency }

ProfilePersona detectPersona(ProfileModel p, AgencyModel? a) {
  if (a != null && a.ownerId == p.id) return ProfilePersona.agency;
  if (p.isVerifiedHost) return ProfilePersona.host;  // approved + face_verified + !blocked
  return ProfilePersona.user;
}
```

### 2.2 Common header (all personas)

```
┌───────────────────────────────────────┐
│ [cover image, 200dp, gradient overlay]│
│           ┌──────────┐                │
│           │ avatar   │  ← AvatarWithFrame (96dp)
│           │ + frame  │                │
│           └──────────┘                │
│           Display Name ✓              │  ← verified tick if isVerified
│           ID: 123456 🇧🇩               │
│        Level 12 ★ | VIP Gold 👑       │
└───────────────────────────────────────┘
```

### 2.3 USER persona

Tabs / sections:
1. **Wallet card**: My Diamonds | My Beans | Recharge button → `/recharge`
2. **Apply as Host** CTA (if `gender == 'female' && !isHost`):
   - Big gradient button: `"Become a Host →"` → opens `/host-application`.
3. Quick links: VIP, Shop, Tasks, Invitation, Settings, Level.
4. **Reels** tab (user's posted reels grid).

### 2.4 HOST persona (verified host)

Same header but with `host_level` badge (gold ring around avatar if `level >= 30`).

Sections:
1. **Earnings card**: Today / Week / Month earnings (from `host_earnings_summary` view).
2. **Beans → Diamonds** exchange button (uses `exchange_user_beans_to_diamonds` RPC; if `is_agency_owner` then routes diamonds to agency).
3. **Auto-transfer to Agency**: if user belongs to agency, show toggle "Auto-transfer earnings to my agency at week-end" (writes to `host_settings.auto_transfer_to_agency`).
4. **Go Live** button (gradient pink→purple) → `/live/start`.
5. Quick links: VIP, Shop, Withdraw, Host Dashboard, Settings.

### 2.5 AGENCY persona

Sections:
1. **Agency card**: name, logo, agency_code, hosts count, total_beans (from `agencies` table where `owner_id = userId`).
2. **Quick stats grid** (2×2): Total Hosts | Active Today | Weekly Income | Pending Withdrawals.
3. CTAs: Manage Hosts, Withdraw Funds, Agency Dashboard, Invite Host.
4. Same wallet/VIP/Settings sections at bottom.

### 2.6 Apply-as-Host flow (for user persona)

When user taps "Become a Host":
1. Opens `/host-application` form (English) — collects name, age, gender, country, intro video.
2. POST inserts into `host_applications` with `status = 'pending'`.
3. After admin sets `status = 'approved'`, profile shows **"Complete Face Verification"** banner.
4. User completes face verification → `face_verifications.status = 'approved'` → trigger flips `profiles.is_host = true`, `host_status = 'approved'`, `is_face_verified = true`.
5. **Only now** is the user a Verified Host. UI flips to HOST persona automatically via realtime subscription on `profiles`.

> **Mantra**: `isVerifiedHost = host_status == 'approved' && is_face_verified && !is_blocked`. Until all three are true, treat as USER.

### 2.7 Profile click → instant navigation (crash fix)

When tapping any profile (feed, chat, room):
```dart
Navigator.pushNamed(context, '/profile-detail', arguments: profileId);
```
Inside `ProfileDetailPage.initState`:
```dart
// 1. Show shimmer skeleton immediately
// 2. Fire profile fetch (with 5s timeout)
// 3. On error/timeout → show "User not found" empty state, NEVER throw
```
Wrap the build tree in a top-level `try/catch` via `ErrorWidget.builder` to convert any synchronous render error into a graceful fallback card. This prevents the historical "tap profile = crash" issue.

---

## 3. VIP Membership — `/vip`

### 3.1 Layout

```
┌─────────────────────────────────────┐
│ [←]  👑 VIP Membership   💎 12,345  │  ← Header gradient purple→pink
├─────────────────────────────────────┤
│ ┌── VIP Plans ──┬── My Progress ──┐ │  ← 2 Tabs (gradient when active)
│ └────────────────┴─────────────────┘ │
├─────────────────────────────────────┤
│  Current Status: VIP Gold (28d left)│  ← only if has active VIP
├─────────────────────────────────────┤
│  ┌──── Tier Card ────┐              │
│  │  [VIP Bronze]     │              │
│  │  30 Days · $9.99  │              │
│  │  ✓ Entry effect   │              │
│  │  ✓ Chat bubble    │              │
│  │  [   Subscribe   ]│              │
│  └───────────────────┘              │
└─────────────────────────────────────┘
```

### 3.2 VIP Plans tab

- Read `vip_tiers` (active = true), order by `tier_level`.
- Each card uses tier-specific gradient:
  - Bronze: `#CD7F32 → #8B4513`
  - Silver: `#C0C0C0 → #808080`
  - Gold: `#FFD700 → #DAA520`
  - Platinum: `#E5E4E2 → #BCC6CC`
  - Diamond: `#B9F2FF → #00CED1`
- Subscribe button: deducts `price_diamonds` via `purchase_vip_subscription` RPC, never direct update.

### 3.3 My Progress tab

- Privileges grid: 4 columns of icons. For each `vip_privilege_categories` row:
  - Show all available items (frames, entrances, bubbles, vehicles, medals).
  - User picks 1 per category (badge "Choose 1").
  - Equipping writes via `equip_vip_item` RPC.
- Progress bar at top: current_xp / next_tier_xp with gold gradient fill.

---

## 4. My Invitation — `/invitation`

### 4.1 Layout

```
┌─────────────────────────────────────┐
│ [←]  My Invitation                  │
├─────────────────────────────────────┤
│ ┌── Share Card (gradient) ────────┐ │
│ │  Earn 10% of your invitee's     │ │
│ │  recharges forever 💎           │ │
│ │  ┌─ MyCode: ABC123 [Copy] ─┐    │ │
│ │  [ Share Link ] [ QR Code ]     │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│  Stats: 12 invited · $45 earned     │
├─────────────────────────────────────┤
│  Invited Users (list)               │
│  • avatar + name + level + earnings │
└─────────────────────────────────────┘
```

Data: `invitation_codes` (own code), `invitation_referrals` (list joined with profiles), `invitation_earnings` (sum).

Share link format: `https://merilive.com/?ref={code}` — uses `share_plus` Flutter package.

---

## 5. My Tasks — `/tasks`

### 5.1 Layout

```
┌─────────────────────────────────────┐
│ [←]  Daily Missions                 │
├─────────────────────────────────────┤
│ ┌── Daily progress bar ───────────┐ │
│ │ 3 / 7 completed   +500💎 today  │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Today's Tasks                       │
│ ┌─────────────────────────────────┐ │
│ │ 📅 Daily Login    +50💎  [Claim]│ │
│ │ 💬 Send 10 msgs   +100💎  3/10  │ │
│ │ 🎁 Send a gift    +200💎  [Claim]│ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

Data sources (already implemented in admin per memory `task-center-sync-and-reward-logic`):
- `daily_tasks` table — admin-defined task templates.
- `user_task_progress` — current user state.
- `claim_task_reward` RPC — atomic claim, never direct profile update.

---

## 6. Common widgets (build once, reuse)

### `AvatarWithFrame`
```dart
class AvatarWithFrame extends StatelessWidget {
  final String? avatarUrl;
  final String? frameUrl;   // equipped_frame_id → resolved url
  final double size;
  // Renders avatar + 1.15× scaled frame overlay (memory: avatar-frame-alignment)
}
```

### `Diamond3DIcon`
- Use a single PNG/SVG asset at `assets/icons/diamond_3d.png`.
- Sizes: 16, 20, 24, 32, 48.

### `GradientHeader`
- Reusable purple→pink header used by Recharge, VIP, Invitation, Tasks.

### `GlassCard`
- White-15% background, 1px white-20% border, blur 16, radius 16.

---

## 7. Realtime subscriptions checklist

| Screen | Channel | Tables |
|---|---|---|
| Recharge | `recharge:user:{id}` | profiles, coin_packages, currency_rates, first_recharge_bonus |
| Profile | `profile:{id}` | profiles, host_applications, face_verifications, agencies |
| VIP | `vip:user:{id}` | vip_tiers, user_vip_subscriptions |
| Tasks | `tasks:user:{id}` | daily_tasks, user_task_progress |
| Invitation | `invites:user:{id}` | invitation_referrals, invitation_earnings |

Use unique channel names per memory `supabase-realtime-subscription-standard` to avoid the "cannot add callbacks after subscribe" error.

---

## 8. Localization rule (HARD)

- All `Text(...)` widgets must contain English-only strings.
- Date/number formatting: `intl` with `'en_US'` locale.
- Currency formatting: use `currency_rates.currency_code` symbol + `NumberFormat.currency(locale: 'en_US')`.

---

## 9. Build checklist for Antigravity

When generating Flutter screens, verify:
- [ ] Header gradient matches token (`#8B5CF6 → #EC4899 → #8B5CF6`)
- [ ] Tab pills use white-10% background, white when active
- [ ] All currency mutations go through RPCs (never direct table update)
- [ ] Profile persona detection uses `isVerifiedHost` getter
- [ ] First-recharge banner respects `first_recharge_claims` table
- [ ] All strings are English
- [ ] Realtime channels use unique names
- [ ] Errors show empty-state cards, never crash the page
