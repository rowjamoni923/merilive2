
# Reinstall-survive Auto-Login + Single-Device Session

## Goal
1. App uninstall/reinstall → Start screen shows "Welcome back, [name]" card for the previous account. Tap → instant login. Only factory reset clears this.
2. Same account logging in on a new device → old device is force-logged-out instantly with a toast: "Signed in on another device".
3. Single account per device history (latest one only).

## Industry pattern verified
Chamet / Bigo / Olamet / Poppo all use Android `Settings.Secure.ANDROID_ID` (SSAID) for uninstall-survival, paired with a server-side `device_id → user_id` mapping and a Realtime force-logout broadcast on the old session. Identical translation for our LiveKit/Supabase stack.

---

## Phase 1 — Device fingerprint (Capacitor, native)

- Add `@capacitor/device` (already may exist) and use `Device.getId()`:
  - Android → returns `ANDROID_ID` (survives uninstall, cleared on factory reset). ✅
  - iOS → returns IDFV (best-effort survival via Keychain). Acceptable fallback.
  - Web → returns random UUID (no survival; just session-scoped).
- Wrap in `src/utils/deviceIdentity.ts`:
  - `getStableDeviceId()` → returns the hardware ID, memoized.
  - `getDevicePlatform()` → 'android' | 'ios' | 'web'.

**APK rebuild required** (native plugin call).

## Phase 2 — Backend tables + RPCs

New table `device_account_bindings`:
```
device_id          text PK   -- hardware fingerprint (ANDROID_ID etc.)
user_id            uuid NOT NULL → profiles.id ON DELETE CASCADE
platform           text       -- 'android' | 'ios' | 'web'
display_name       text       -- snapshot for Start screen card
avatar_url         text       -- snapshot
app_uid            text       -- snapshot
last_login_at      timestamptz
created_at, updated_at
```
Only one binding per `device_id` (latest login overwrites — matches "single account history" choice).

GRANT to authenticated + service_role; no anon. RLS: a row is readable/upsertable only by the auth user whose `user_id` matches OR by service_role.

RPCs (all SECURITY DEFINER):
- `bind_device_to_user(_device_id, _platform)` — call right after every successful sign-in. Upserts the binding with current `auth.uid()`, snapshots profile fields, returns the binding row. Also writes/updates `user_active_sessions` with `(user_id, device_id)` and **broadcasts a Realtime force-logout to the previously-bound device** (see Phase 4).
- `lookup_device_account(_device_id)` — public-callable (anon allowed), returns `{exists, display_name, avatar_url, app_uid}` ONLY (never any token). Used by Start screen to decide whether to render the "Welcome back" card.
- `request_device_relogin(_device_id)` — when user taps the Welcome-back card. Issues a short-lived (5 min, single-use) `device_session_exchange_tokens` row tied to that device + the bound user. Uses the existing `device_session_exchange_tokens` table (already in schema) or extends it.

## Phase 3 — Auto-login on Start screen

Existing splash/start route logic change:
1. On mount → `getStableDeviceId()` → `lookup_device_account(device_id)`.
2. If `exists` and there is no active Supabase session → render the **"Welcome back, [name]" card** with avatar + "Continue as …" CTA + "Use another account" link.
3. CTA → call `request_device_relogin` → exchange returned token for a Supabase session via an edge function (`device-session-exchange`) that uses service role to mint a fresh session for the bound user.
4. On success → Realtime force-logout fires on any other device tied to that user (Phase 4) → navigate into the app.
5. "Use another account" → clears the local hint and shows the normal signup/login flow (the device binding is NOT cleared until the new login completes — then it's overwritten).

If there's already an active session, skip the Start card entirely.

## Phase 4 — Single-device enforcement

Reuse `user_active_sessions`. On every successful sign-in flow (`signInWithPassword`, OTP, exchange-token, social):
1. `bind_device_to_user` runs and:
   - Finds the previously-bound device for this `user_id` (if different).
   - Inserts a row into a new `auth_force_logout_events(user_id, kicked_device_id, reason, created_at)` table.
   - Sends Realtime broadcast on channel `user-session:{user_id}` event `force_logout` with `{new_device_id, reason: 'signed_in_elsewhere'}`.
2. Old device's app subscribes to `user-session:{user_id}` on app start (after auth restored). On `force_logout` event where `new_device_id !== myDeviceId`:
   - Show toast: "Signed in on another device".
   - `supabase.auth.signOut()`.
   - Clear the Welcome-back hint for the old device (so it doesn't re-offer the same account).
   - Navigate to Start screen.

A client-side fallback: every 60s (or on app foreground) `users_active_sessions` is checked; if our row was replaced, we self-logout. Belt-and-braces against missed Realtime events.

## Phase 5 — Subscription wiring (one place, leak-safe)

`src/hooks/useForceLogoutListener.ts` mounted once in the authenticated app shell:
- Subscribes to the channel inside `useEffect`, removes via `supabase.removeChannel` on unmount (per project realtime rule).
- Triggers the toast + signOut path above.

## Phase 6 — QA matrix (owner test account)

Reproducible via owner login `smdollarex923@gmail.com`:
1. Login on Device A → record device_id → uninstall → reinstall → Start screen shows "Welcome back, smdollarex923" card → tap → in instantly. ✅
2. While Device A is open, login same account on Device B → Device A within ~2s shows toast + lands on Start screen. ✅
3. On Device A tap "Use another account" → Start flow shows signup; old binding only cleared once new account login completes. ✅
4. Factory-reset simulated by clearing app data + uninstall → `ANDROID_ID` rotates → Start screen shows normal signup (no card). ✅

## Files touched (estimate)

- New: `supabase/migrations/<ts>_device_bindings.sql`, `supabase/functions/device-session-exchange/index.ts`, `src/utils/deviceIdentity.ts`, `src/hooks/useForceLogoutListener.ts`, `src/components/start/WelcomeBackCard.tsx`.
- Edited: Start/splash route, auth context wrapper, every sign-in success path (signup, login, OTP, social) — single helper `bindCurrentSessionToDevice()` invoked from each.

## Honest caveats

- **APK rebuild MANDATORY** for the native device ID. Web preview will work but with a random per-tab UUID — only Android device test gives the real reinstall-survive behavior.
- **iOS** survival is best-effort (IDFV + Keychain shim). Same logical flow, weaker guarantee — Apple-imposed.
- **Factory reset** intentionally rotates the ID — that's the desired "fresh phone = fresh account" behavior you asked for.
- **No tokens** ever flow through the public `lookup_device_account` RPC; only display name + avatar. Actual session minting requires the short-lived exchange token, only mintable by the device that already owns the binding.

Approve কর — তারপর Phase 1→6 sequentially build করব।
