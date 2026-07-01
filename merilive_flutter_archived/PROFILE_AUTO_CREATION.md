# Profile Auto-Creation Guarantee (100% — never null)

> Goal: Whenever **any** user signs up (Email OTP, Google, Apple, Phone), a row in `public.profiles` is **guaranteed** to exist before they reach the home screen. No race conditions, no nulls, no crashes.

This is implemented by a **3-layer safety net**: DB trigger → DB self-healing RPC → Flutter client recovery.

---

## Layer 1 — DB trigger (`handle_new_user` on `auth.users` insert)

**Status: Already deployed** (migration `20260411102716`).

Behaviour:
1. Generates `app_uid` like `U00123456`.
2. Reads `display_name` from any of: `display_name`, `full_name`, `name`, else `'User'`.
3. If a soft-deleted profile exists with the same `device_id`, **reuses** that row (just updates email).
4. Else `INSERT INTO profiles (...)` with safe defaults (coins=0, beans=0, level=1, etc.) and `ON CONFLICT (id) DO NOTHING`.
5. Wrapped in `EXCEPTION WHEN unique_violation` → never blocks signup.

This trigger is `SECURITY DEFINER` so RLS cannot block it.

---

## Layer 2 — Self-healing RPC (`ensure_user_profile`)

If, for any reason (network drop mid-signup, OAuth race), the trigger's row is missing when the client first reads, this RPC creates it on demand.

```sql
-- Already part of architecture (memory: profile-self-healing-recovery)
SELECT public.ensure_user_profile();  -- returns the profile row
```

The Flutter client calls this **once** right after signup, before navigating to home.

---

## Layer 3 — Flutter client recovery

```dart
// lib/services/profile_bootstrap.dart

class ProfileBootstrap {
  static final _supabase = Supabase.instance.client;

  /// Call this after EVERY successful auth event (signup, signin, oauth callback).
  /// Guarantees a profile row exists; otherwise throws so caller can show retry.
  static Future<ProfileModel> ensureProfile({int retries = 3}) async {
    final user = _supabase.auth.currentUser;
    if (user == null) throw StateError('No auth session');

    for (var i = 0; i < retries; i++) {
      // 1. Try direct fetch
      final row = await _supabase
          .from('profiles')
          .select()
          .eq('id', user.id)
          .maybeSingle()
          .timeout(const Duration(seconds: 5));

      if (row != null) return ProfileModel.fromJson(row);

      // 2. Trigger may not have fired yet — call self-healing RPC
      try {
        final created = await _supabase.rpc('ensure_user_profile').timeout(const Duration(seconds: 5));
        if (created != null) return ProfileModel.fromJson(created as Map<String, dynamic>);
      } catch (e) {
        // ignore and retry
      }

      // 3. Backoff before retry
      await Future.delayed(Duration(milliseconds: 300 * (i + 1)));
    }

    throw Exception('Profile creation failed after $retries attempts');
  }
}
```

Wire it into auth state changes:

```dart
// lib/main.dart (or your auth provider)
Supabase.instance.client.auth.onAuthStateChange.listen((data) async {
  switch (data.event) {
    case AuthChangeEvent.signedIn:
    case AuthChangeEvent.userUpdated:
    case AuthChangeEvent.tokenRefreshed:
      try {
        final profile = await ProfileBootstrap.ensureProfile();
        ProfileProvider.of(navigatorKey.currentContext!).set(profile);
      } catch (e) {
        // Show full-screen error with "Retry" button — never silently navigate
        navigatorKey.currentState?.pushReplacementNamed('/auth-error', arguments: e.toString());
      }
      break;
    case AuthChangeEvent.signedOut:
      ProfileProvider.of(navigatorKey.currentContext!).clear();
      break;
    default:
      break;
  }
});
```

---

## Defaults guaranteed on every new profile

| Field | Default | Source |
|---|---|---|
| `coins` | 0 | trigger |
| `diamonds` | 0 | trigger |
| `beans` | 0 | trigger |
| `beans_balance` | 0 | trigger |
| `user_level` | 1 | trigger |
| `host_level` | 0 | trigger |
| `is_verified` | false | trigger |
| `is_online` | false | trigger |
| `is_host` | false | trigger |
| `host_status` | null | (set only after admin approval) |
| `is_face_verified` | false | (set only after face-verification approval) |
| `display_name` | `'User'` or OAuth name | trigger |
| `app_uid` | `U` + 8 random digits | trigger |
| `country_code` | `'BD'` | DB column default |
| `language` | `'English'` | DB column default |

---

## NEVER-DO

- ❌ Never `INSERT INTO profiles` from the client during signup — let the trigger do it.
- ❌ Never assume `profile == null` means "show empty home" — block navigation with a retry screen.
- ❌ Never store `coins/beans/diamonds` defaults > 0 here — those must be set via balance RPCs only.
