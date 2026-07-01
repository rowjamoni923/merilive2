# Portrait Camera Surface Fix

## Goal
Stop Go Live / Party / Private Call camera preview from rendering as a horizontal strip on portrait phones; it must render as a vertical phone camera surface.

## Research notes
- Chamet/Bigo/Poppo-style broadcaster screens use a portrait full-screen preview; hosts do not manually select resolution during live setup.
- LiveKit/Agora mobile renderer practice: keep capture stable, then use the renderer scaling mode to fill the target video viewport; black letterbox bands are not acceptable on creator preview/live surfaces.
- The project had switched capture to 3:4 for no-zoom FOV, but the React/native renderers were also set to `contain`/`SCALE_ASPECT_FIT`, causing portrait phones to show a landscape-looking band.

## Fix plan
1. Keep 3:4 capture constants to avoid CameraX digital sensor zoom.
2. Change full-screen/primary camera renderers to portrait fill (`cover` / `SCALE_ASPECT_FILL`) so the surface is vertical.
3. Apply consistently to Go Live, Create Party, Party room seats, Private Call, and persistent handoff surface.

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

# Support Reply Email Provider Fix

## Goal
Stop Admin Support Tickets from calling the inactive Lovable transactional email path for reply notifications, and route those replies through the existing Gmail OAuth support email system that the project already uses.

## Research notes
- Professional support desks keep one authoritative outbound mailbox for ticket replies so users receive responses from the same trusted sender and thread context.
- This project already has a Gmail OAuth support function for support inbox/replies; the broken path is a separate wrapper calling `send-transactional-email`, which is returning EMAIL_SERVICE_AUTH_FAILED.

## Fix plan
1. Replace the `send-support-reply-email` internals so it no longer invokes Lovable transactional email.
2. Use the existing Gmail OAuth credentials and Gmail send API directly for support ticket reply notifications.
3. Keep the admin UI unchanged: reply saving remains primary, email notification remains non-blocking.
4. Return clear success/skipped/errors without the inactive email-service refresh message.

