

# Admin Panel Full Audit & Fix Plan

## Summary
After scanning all 110+ admin pages, menu items, routes, and the real-time system, I found the following issues that need fixing:

---

## Issues Found

### 1. Pages Missing Real-time (`useAdminRealtime`) — 8 pages need it
These pages have no live updates; changes require manual refresh:

| Page | Tables to Monitor |
|------|-------------------|
| `AdminSupportTickets.tsx` | `support_tickets`, `support_messages` |
| `AdminGameProviders.tsx` | `game_providers` |
| `AdminGameServer.tsx` | `game_server_settings` |
| `AdminVIPPrivileges.tsx` | `vip_tiers` |
| `AdminVerifiedBadges.tsx` | `branding_settings` |
| `AdminAppVersion.tsx` | `app_version_settings` |
| `AdminGmailSupport.tsx` | `support_tickets` |
| `AdminHostSearch.tsx` | `profiles` |

*(AdminAuth, AdminBlueprint, AdminPushBroadcast, AdminEmailBroadcast, AdminLandingPageManager are write-only/static pages — no realtime needed)*

### 2. Missing Tables in `GLOBALLY_MONITORED_TABLES`
These tables should be in the global set so AdminLayout gets notifications:

- `helper_orders` — already in `pendingTables` but missing from `GLOBALLY_MONITORED_TABLES` ✅ already there
- `game_providers` — not monitored
- `vip_tiers` — not monitored
- `branding_settings` — not monitored
- `app_version_settings` — not monitored
- `host_applications` — not in global set (only `face_verification_submissions` and `host_conversion_requests`)

### 3. Missing Alert Toast Configs in AdminLayout
The `alertTableConfig` map is missing entries for:
- `helper_orders` → should toast "New Helper Order" → `/admin/helper-orders`
- `face_verification_submissions` → already has custom handler ✅
- `chat_moderation_logs` → should toast "Contact Violation Detected" → `/admin/contact-violations`
- `live_face_violations` → should toast "Face Violation Detected" → `/admin/face-violations`
- `live_bans` → should toast "New Live Ban" → `/admin/live-bans`

### 4. Notification Path Mapping Gaps
In `getAdminNotificationPath()`, missing mappings for:
- `helper_orders` type → `/admin/helper-orders`
- `chat_moderation` type → `/admin/contact-violations`
- `face_violation` type → `/admin/face-violations`
- `app_version` type → `/admin/app-version`
- `game` type → `/admin/game-management`

---

## Implementation Plan

### Step 1: Add `useAdminRealtime` to 8 missing pages
Add the import and hook call to each page with their relevant tables, wired to their existing `fetch` functions.

### Step 2: Expand `GLOBALLY_MONITORED_TABLES` in `useAdminRealtime.ts`
Add: `game_providers`, `vip_tiers`, `branding_settings`, `app_version_settings`, `host_applications`

### Step 3: Add missing `alertTableConfig` entries in AdminLayout
Add toast+sound configs for: `helper_orders`, `chat_moderation_logs`, `live_face_violations`, `live_bans`

### Step 4: Fix notification path mapping in AdminLayout
Add missing type→path mappings in `getAdminNotificationPath()` for helper_orders, chat_moderation, face_violation, game, app_version types.

### Step 5: Build verification
Run TypeScript build to ensure zero errors.

---

## Technical Details

**Files to edit:**
1. `src/pages/admin/AdminSupportTickets.tsx` — add useAdminRealtime
2. `src/pages/admin/AdminGameProviders.tsx` — add useAdminRealtime
3. `src/pages/admin/AdminGameServer.tsx` — add useAdminRealtime
4. `src/pages/admin/AdminVIPPrivileges.tsx` — add useAdminRealtime
5. `src/pages/admin/AdminVerifiedBadges.tsx` — add useAdminRealtime
6. `src/pages/admin/AdminAppVersion.tsx` — add useAdminRealtime
7. `src/pages/admin/AdminGmailSupport.tsx` — add useAdminRealtime
8. `src/pages/admin/AdminHostSearch.tsx` — add useAdminRealtime
9. `src/hooks/useAdminRealtime.ts` — expand GLOBALLY_MONITORED_TABLES
10. `src/pages/admin/AdminLayout.tsx` — add alertTableConfig entries + notification path mappings

**No database migrations needed** — all tables already exist.

