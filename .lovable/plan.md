

# Single Device Session Fix Plan

## Problem Summary
Currently, when a user logs in on a new device, the old device does NOT get logged out. This is because single-device enforcement is completely disabled on native platforms (Android/iOS) in `App.tsx` line 274.

## Requirements (Clear Rules)
1. Account NEVER logs out by itself (no random/automatic logouts)
2. After app uninstall and reinstall, login page shows (fresh start)
3. When user logs in on a NEW device, the OLD device gets logged out automatically
4. Only ONE device per account at any time

## Root Cause
In `src/App.tsx` line 274:
```text
const shouldEnforceSingleDevice = !isAdminRoute && !isNativeApp;
```
The `!isNativeApp` condition means native apps NEVER register sessions or check for device changes. So old devices never know they should log out.

## Fix Plan

### Step 1: Enable single-device enforcement on ALL platforms
**File: `src/App.tsx`**

Change line 274 from:
```text
const shouldEnforceSingleDevice = !isAdminRoute && !isNativeApp;
```
To:
```text
const shouldEnforceSingleDevice = !isAdminRoute;
```

This enables session registration and checking on both web AND native platforms.

### Step 2: Make session checking safe and stable
**File: `src/hooks/useSingleDeviceSession.ts`**

The current implementation is already well-designed with these safety features:
- **Grace period (30 seconds)**: After fresh login, no logout can happen for 30s — prevents self-logout
- **Fresh login detection**: Only generates new session ID on actual fresh login, NOT on page reload/app resume
- **Error tolerance**: If DB check fails, returns `true` (valid) — no false logouts
- **Manual logout flag**: `forceLogout` sets `meri_manual_logout` before signing out, so `App.tsx` allows it

No changes needed in this file — it already handles everything correctly.

### Step 3: Update the old comment in useSingleDeviceSession.ts
**File: `src/hooks/useSingleDeviceSession.ts`**

Remove the outdated comment "DISABLED on native platforms" on line 131 since we're now enabling it everywhere.

## How It Works After Fix

1. **User logs in on Device A** -> Session ID registered in `profiles.active_session_id`
2. **User uses app normally on Device A** -> Periodic checks confirm session is valid, no logout
3. **User logs in on Device B (new device)** -> New session ID generated with 30s grace period, overwrites `active_session_id` in DB
4. **Device A detects change** -> Realtime listener or periodic check sees different session ID -> `forceLogout()` called -> Device A logs out
5. **App reinstall** -> localStorage cleared -> Login page shows

## Safety Guarantees
- Random network errors will NOT cause logout (error = return true = stay logged in)
- Page reload / app resume will NOT cause logout (same session ID reused from localStorage)
- Only an ACTUAL login on a different device triggers logout on the old device
- 30-second grace period prevents race conditions during login

## Files Changed
- `src/App.tsx` — Remove `!isNativeApp` condition (1 line change)
- `src/hooks/useSingleDeviceSession.ts` — Update comment only

