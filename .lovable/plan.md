### Implementation Plan: Instant Data Loading & Seamless Permissions

#### 1. Zero-Refresh Real-time Data Sync
- **Messaging (DMs & Groups):** Audit `src/pages/Chat.tsx` and ensure `useUniversalRealtime` is used for conversation list updates and group message delivery to avoid any manual refresh.
- **Official Notices & Notifications:** Ensure `OfficialNoticeList` and `NotificationList` are perfectly synced with Supabase Realtime via the universal bridge, ensuring 0-second latency for new items.
- **Group Systems:** Verify all group-related data (members, settings, messages) updates instantly using real-time listeners.

#### 2. Premium "Auto-Approve" Permission System
- **Mandatory Permissions Gate:** Update `src/components/common/MandatoryPermissionsGate.tsx` to automatically trigger the native system permission dialog (`requestAllPermissions`) on mount, removing the need for an initial manual click. This provides the "premium/auto" feel the user requested.
- **Login Flow:** Ensure the permission gate only appears after successful account verification/login, as requested.

#### 3. Go Live Permission Fix
- **Permission Loop:** Modify `src/pages/GoLive.tsx` to check the global permission cache before showing any prompts. Ensure that if permissions are already granted, the user goes straight to the camera preview without any pop-up interruptions.
- **Native Sync:** Align the `permissionsGranted` state in `GoLive.tsx` with the result from `useNativeCameraPermission.checkPermissionStatus()` to prevent redundant checks.

#### 4. Settings & Logic Fixes
- **Settings Toggles:** Fix the permission switches in `src/pages/Settings.tsx` to correctly toggle and reflect the real-time status of Camera, Mic, and Notifications.
- **Premium Logic:** Add a flag/check to ensure these "auto" behaviors are treated as a premium, seamless experience for all users post-login.

#### Technical Details
- Utilize `useUniversalRealtime` hook for all data sync.
- Leverage `MeriPermissions` native plugin for silent/auto-triggering of system dialogs where possible.
- Optimize state management to prevent UI flickers during permission checks.
