# MeriLive Flutter — API Reference

> **Authoritative reference for Antigravity AI / Flutter developers.**
> All field names, RPC parameter names, and table column names below are **case-sensitive** and **must match exactly** when calling Supabase from Dart.

- **Supabase URL**: `https://ayjdlvuurscxucatbbah.supabase.co`
- **Supabase Project Ref**: `ayjdlvuurscxucatbbah`
- **Anon Key** (safe in client): see `BuildConfig.SUPABASE_ANON_KEY` in native Kotlin or use `--dart-define=SUPABASE_ANON_KEY=...`
- **Postgres version**: 14.5
- **Schema**: `public` (only)

---

## 1. Authentication

Use `supabase_flutter` SDK. Sign-in is **email OTP** (passwordless) via Gmail SMTP. Anonymous / magic link / phone are disabled.

```dart
await Supabase.instance.client.auth.signInWithOtp(
  email: email,
  shouldCreateUser: true,
);
// then verify with the 6-digit code:
await Supabase.instance.client.auth.verifyOTP(
  email: email,
  token: otpCode,
  type: OtpType.email,
);
```

After login, **call `ensure_profile_exists` RPC** to self-heal a missing profile row (see RPC list below).

---

## 2. Core Tables (Dart-relevant)

### 2.1 `profiles`

User identity, balances, host status, levels.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK = `auth.users.id` |
| `username` | text | display handle |
| `display_name` | text | optional shown name |
| `avatar_url` | text | full URL |
| `gender` | text | `Male` / `Female` (locked once set) |
| `country_code` | text | ISO-2 (e.g. `BD`, `IN`) |
| `language` | text | always `English` (global standard) |
| `coins` | bigint | **Diamonds** (consumption currency) |
| `beans` | bigint | host earnings, NOT spendable |
| `level` | int | user level (recharge based) |
| `host_level` | int | host level (earnings based) |
| `host_status` | text | `not_host` / `pending` / `approved` / `rejected` |
| `face_verified` | bool | true only after admin approval |
| `is_blocked` | bool | global ban flag |
| `total_recharged` | bigint | drives user level |

> **CRITICAL — Direct UPDATE forbidden.** The `protect_sensitive_profile_columns` trigger will reject any direct write to `coins`, `beans`, `host_status`, `face_verified`, `level`, `host_level`. Use the dedicated RPCs (Section 3).

**Read your own profile:**
```dart
final profile = await Supabase.instance.client
    .from('profiles')
    .select()
    .eq('id', userId)
    .maybeSingle();
```

**Read another user (public-safe view):**
```dart
final pub = await Supabase.instance.client
    .from('profiles_public')
    .select()
    .eq('id', otherUserId)
    .maybeSingle();
```

### 2.2 `agencies` / `agencies_public`

See `AgencyModel.fromJson` for the field map. Use `agencies_public` for non-owner reads.

### 2.3 `agency_hosts`

Join table — host membership in an agency.

| Column | Type |
|---|---|
| `agency_id` | uuid |
| `host_id` | uuid |
| `status` | text (`active` / `left`) |
| `joined_at` | timestamptz |

### 2.4 `agency_withdrawals`

| Column | Type |
|---|---|
| `agency_id` | uuid |
| `amount` | numeric |
| `payment_method` | text (`epay` / `lpft` / `usdt`) |
| `payment_method_type` | text |
| `payment_details` | jsonb |
| `status` | text (`pending` / `processing` / `paid` / `rejected`) |
| `assigned_helper_id` | uuid → `topup_helpers.id` |
| `usd_amount` | numeric |

### 2.5 `topup_helpers`

| Column | Type |
|---|---|
| `user_id` | uuid → `profiles.id` |
| `trader_level` | int (1–5) |
| `is_active` | bool |
| `payroll_enabled` | bool (level-5 only) |
| `country_code` | text |

### 2.6 `gifts`

Catalog. Read-only from Flutter.

| Column | Type |
|---|---|
| `name` | text |
| `coin_price` | int (cost in diamonds) |
| `category` | text (`wall` / `lucky` / `luxurious` / `vip` / `pro`) |
| `icon_url` / `animation_url` | text |
| `is_active` | bool |

### 2.7 `agency_policy_settings`

Public read. All content is **English** (as of April 2026).

### 2.8 `app_settings`

Key/value store. Useful keys: `maintenance_mode`, `min_withdrawal_amount`, `usd_to_beans_rate`.

### 2.9 `app_version_settings`

Per-platform version gate.

| Column | Notes |
|---|---|
| `platform` | `android` / `ios` |
| `current_version` | semver |
| `minimum_version` | semver — block app below this |
| `force_update` | bool |
| `is_maintenance` | bool |

---

## 3. RPCs (call via `supabase.rpc()`)

> **All currency / state mutations MUST go through RPCs.** Direct UPDATEs on `profiles`, `agencies`, balance columns are blocked by triggers.

### 3.1 Profile / lifecycle

| RPC | Params | Returns | Purpose |
|---|---|---|---|
| `ensure_profile_exists` | — | `void` | Self-heal missing profile after login |
| `normalize_profile_identity` | `_user_id uuid` | `void` | Fix generic names like "User" / "owner" |
| `update_profile_safe` | `_username text, _display_name text, _avatar_url text, _country_code text, _gender text` | `jsonb` | Edit profile fields |

### 3.2 Host application

| RPC | Params | Returns |
|---|---|---|
| `submit_host_application` | `_documents jsonb, _country_code text` | `jsonb` |
| `get_host_application_status` | — | `jsonb` |

> Approval is **manual** via admin panel. Face verification alone does NOT auto-approve.

### 3.3 Diamond / Beans economy

| RPC | Params | Purpose |
|---|---|---|
| `process_gift_transaction` | `_sender_id, _receiver_id, _gift_id, _quantity, _room_id` | Send gift; deducts diamonds, credits beans (admin-percentage governed) |
| `process_call_transaction` | `_caller_id, _host_id, _duration_seconds, _rate_per_minute` | Settle 1-on-1 call |
| `exchange_user_beans_to_diamonds` | `_amount_beans` | Convert beans → diamonds (role-aware destination) |
| `recharge_user_diamonds` | `_user_id, _diamonds, _payment_ref, _gateway` | Credit diamonds on verified payment (server-side only via edge function) |

### 3.4 Agency

| RPC | Params |
|---|---|
| `create_agency_for_user` | `_name text, _country_code text, _whatsapp_number text` |
| `process_weekly_agency_transfers` | `_period_start date, _period_end date` |
| `agency_request_withdrawal` | `_amount numeric, _method text, _details jsonb` |

### 3.5 Helper / payroll

| RPC | Params |
|---|---|
| `helper_claim_withdrawal` | `_withdrawal_id uuid` |
| `helper_complete_withdrawal` | `_withdrawal_id uuid, _proof jsonb` |
| `helper_topup_user` | `_target_user_id uuid, _diamonds bigint, _payment_ref text` |

### 3.6 Admin (helpers / Flutter generally won't call)

| RPC | Notes |
|---|---|
| `admin_authenticate` | Admin login — separate session, NEVER from user app |
| `admin_list_blocked_users` | SECURITY DEFINER — admin only |
| `is_admin` | `(_uid uuid) → bool` |

---

## 4. Realtime

Subscribe to instant tables via:
```dart
Supabase.instance.client
  .channel('public:messages:user:$userId')
  .onPostgresChanges(
    event: PostgresChangeEvent.insert,
    schema: 'public',
    table: 'messages',
    filter: PostgresChangeFilter(
      type: PostgresChangeFilterType.eq,
      column: 'receiver_id',
      value: userId,
    ),
    callback: (payload) { /* ... */ },
  )
  .subscribe();
```

**Tables in `supabase_realtime` publication** (zero-latency):
`messages`, `notifications`, `profiles`, `agency_withdrawals`, `gifts_sent`, `topup_helpers`, `agency_earnings_transfers`, `live_streams`, `party_rooms`, `coin_transfers`, `app_settings`, `app_version_settings`.

> Use a **unique channel name per subscription** (include user_id / room_id). Reusing names triggers `cannot add callbacks after subscribe`.

---

## 5. Storage Buckets

| Bucket | Public | Use |
|---|---|---|
| `avatars` | yes | profile images |
| `gifts` | yes | gift assets (SVGA, Lottie, PNG, MP4) |
| `host-documents` | no | identity docs (signed URL only) |
| `chat-media` | no | private DMs |
| `agency-logos` | yes | agency branding |

---

## 6. Edge Functions (HTTPS POST, JWT in `Authorization`)

| Function | Purpose |
|---|---|
| `app-assets` | Unified visual assets API — single call returns frames/banners/icons |
| `agency-weekly-transfer` | Cron-triggered settlement |
| `zinipay-callback` | BD recharge gateway webhook |
| `stripe-webhook` | International recharge webhook |
| `send-otp-email` | Gmail SMTP free OTP delivery |

Call from Dart:
```dart
final res = await Supabase.instance.client.functions.invoke(
  'app-assets',
  body: {'kind': 'gift_icons', 'limit': 100},
);
```

---

## 7. Security Rules (must respect)

1. **Never** write to `coins`, `beans`, `host_status`, `face_verified`, `level`, `host_level` directly — triggers will reject.
2. **Never** ship `service_role_key` in the Flutter app.
3. **Always** use RPCs for state-changing operations.
4. **Always** use the `_public` views (`profiles_public`, `agencies_public`) when reading other users' data.
5. **Single-device session** is enforced server-side — handle `session_invalidated` realtime events to log out.
6. **Maintenance mode**: poll `app_settings.maintenance_mode` on app start; show maintenance screen if `'true'`.

---

## 8. Currency Conversion Constants

| From → To | Rate | Source |
|---|---|---|
| Beans → USD | 9000 beans = 1 USD | `mem://business/agency-withdrawal-conversion-rate` |
| 100,000 diamonds | 2200 BDT | recharge tier |
| Gift price | configurable per gift (`gifts.coin_price`) | DB |
| Call cost | admin-configured per minute | `app_settings` |

---

## 9. Versioning

This document tracks the live database schema as of **2026-04-24**. Whenever the schema changes (new RPCs, columns), regenerate `lib/models/*.dart` and update this file.
