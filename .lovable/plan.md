# Signup Host/User Role Mapping Fix

## Goal
Make signup account type deterministic: Female/Host selection must create a host-profile immediately (`is_host=true`, `host_status=pending_face`), while homepage/host privileges remain locked until face verification approves the profile.

## Research notes
- Chamet and Bigo-style live apps separate onboarding identity from creator permissions: selecting a creator/host path marks the profile category first, then identity/face review unlocks broadcast visibility and earning privileges.
- Poppo/OLAMET-style host onboarding uses agency/verification review gates after account creation; the selected role is not silently downgraded to a normal viewer profile.
- LiveKit/Agora transport is unrelated here: this is an auth/profile data integrity issue, so the professional fix is server-authoritative signup finalization, not client-only state.

## Fix plan
1. Ensure every signup path sends selected gender/account type into auth metadata before the profile trigger runs.
2. Add a server-side signup finalizer RPC so the client never tries to directly rewrite locked gender/host columns.
3. Keep female host profiles as `pending_face` until face verification; male/user profiles remain non-host.
4. Remove the misleading “try with Email” failure toast caused by profile race/lock errors.
