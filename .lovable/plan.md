# Portrait Camera Surface Fix

## Zoom-out correction — 2026-07-01

### Research notes
- LiveKit Android docs for `VideoCaptureParameter.adaptOutputToDimensions` state that enabling adaptation can scale/crop captured frames to the requested aspect ratio; keep it `false` to avoid SDK-level center-crop zoom: https://docs.livekit.io/reference/client-sdk-android/livekit-android-sdk/io.livekit.android.room.track/-video-capture-parameter/adapt-output-to-dimensions.html
- LiveKit Android issue #651 documents the exact symptom: local tracks looked zoomed/cropped even when CameraX zoom ratio was `1.0`; the professional fix path is preventing internal crop and using correct capture format: https://github.com/livekit/client-sdk-android/issues/651
- MDN `resizeMode` says `crop-and-scale` lets the browser crop raw camera output, while `none` uses the hardware/driver resolution. For web preview, avoid 9:16 crop requests and keep `resizeMode:'none'`: https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints
- MDN/Web.dev PTZ docs confirm browser zoom-out is only the track capability minimum via `getCapabilities().zoom` + `applyConstraints()`, not negative zoom; if min is `1.0`, only a wider physical lens can move farther back: https://web.dev/articles/camera-pan-tilt-zoom

### Root cause found
- The native Android path was already 3:4 (`1440x1920`) with `adaptOutputToDimensions=false`, but the web/Lovable preview path had silently drifted back to 9:16 (`1080x1920`). On mobile Chrome/WebView that asks the browser to center-crop the selfie sensor before rendering, producing the close-face zoom in the uploaded screenshot.

### Fix plan
1. Restore web preview capture defaults and fallbacks to 3:4 portrait (`1440x1920`, `1080x1440`, `720x960`) while keeping the current full-screen UI/render area unchanged.
2. Keep `resizeMode:'none'` and hardware-minimum zoom lock so the browser/native driver cannot add digital crop zoom.
3. Mark web camera tracks as `contentHint:'detail'` for sharper host preview/live thumbnails instead of motion-biased blur.
4. Bump persistent camera session version so stale 9:16 crop-scaled streams are discarded on next preview open.

# Home Host Card Full-Photo Fix

## Goal
Every home/host/live card must show one uninterrupted full-bleed photo. No white bottom area, no empty info panel, no card-colored gap under verified host/user photos.

## Research notes
- Chamet/Bigo/Poppo-style discovery grids use fixed-ratio portrait media cards with text/badges floating over the image, not separate blank info panels. References: https://www.bigo.tv/ and Chamet Play Store listing https://play.google.com/store/apps/details?id=com.hkfuliao.chamet
- Professional implementation standard: card image is `object-cover` over the full tile; name, level, country, live/viewer status sit as overlays with shadow/gradient legibility.
- The project already generates stable placeholder photos for missing avatars and verified hosts have real profile photos, so the UI should never reveal a white/empty fallback area.
- Root cause found in current app: mobile global CSS `img:not([width]):not(.shrink-0) { height:auto; }` overrides Tailwind `h-full` on host card images, so the image renders at natural height and exposes the white page/card surface below.

## Fix plan
1. Add a dedicated host-card photo lock class/data attribute that forces `width:100%`, `height:100%`, and `object-fit:cover` for card media.
2. Exclude host-card media from the mobile global `height:auto` image rule.
3. Apply the media lock to Index home cards plus reusable `UserCard`, `LiveStreamCard`, and `PremiumLiveStreamCard`.
4. Keep all existing overlay text/badges/click behavior unchanged.

## Goal
Stop Go Live / Party / Private Call camera preview from rendering as a horizontal strip on portrait phones; it must render as a vertical phone camera surface.

## Research notes
- Chamet/Bigo/Poppo-style broadcaster screens use a portrait full-screen preview; hosts do not manually select resolution during live setup.
- LiveKit/Agora mobile renderer practice: keep capture stable, then use the renderer scaling mode to fill the target video viewport; black letterbox bands are not acceptable on creator preview/live surfaces.
- The project had switched capture to 3:4 for no-zoom FOV, but the React/native renderers were also set to `contain`/`SCALE_ASPECT_FIT`, causing portrait phones to show a landscape-looking band.
- Android CameraX docs: `setLinearZoom(0.0)` is minimum zoom and `0.5` is midpoint zoom-in; `setZoomRatio()` must stay within `ZoomState.minZoomRatio..maxZoomRatio`, and min is often `1.0` unless zoom-out/ultra-wide is supported.
- LiveKit Android docs: `VideoCaptureParameter(width,height,fps, adaptOutputToDimensions=true)` crops captured frames to the requested aspect ratio when the capturer cannot output that exact shape; setting `adaptOutputToDimensions=false` avoids that internal crop/zoom.
- MDN Media Capture docs: browser `resizeMode: 'none'` asks the UA to use the hardware/driver resolution instead of crop-and-scale; forcing 9:16 `crop-and-scale` can digitally center-crop the phone sensor and make the face look zoomed in.
- Chrome camera controls docs: live preview zoom is changed through `MediaStreamTrack.getCapabilities()` + `applyConstraints({advanced:[{zoom}]})`; on Android this can become available only after first frames, so zoom must be retried after startup.
- LiveKit Android CameraX pattern: the active CameraX camera can expose `zoomState.minZoomRatio..maxZoomRatio`; `setZoomRatio()` must clamp inside that range. A professional app should request `minZoomRatio` for true zoom-out and never digitally zoom above 1x.
- Google/Android CameraX docs confirm real zoom-out is **minimum zoom ratio**, not negative zoom: read `CameraInfo.zoomState.minZoomRatio` and call `CameraControl.setZoomRatio(minZoomRatio)`. If the device reports min=`1.0`, software cannot go farther back without selecting a different physical ultra-wide lens.
- MDN/web.dev camera PTZ docs confirm browser zoom must be applied after stream start with `MediaStreamTrack.getCapabilities().zoom` + `applyConstraints`; invalid/unsupported values are ignored or rejected, so the app must target the capability minimum and retry.
- Android WebView/Chromium reports `zoom` support inconsistently; professional fallback is to enumerate camera devices after permission and switch to a labelled wide/ultra-wide/selfie-wide camera when the device exposes one, then still apply the hardware minimum zoom lock.

## Fix plan
1. Use 3:4 capture constants to avoid CameraX/WebView digital center-crop zoom.
2. Keep full-screen/primary camera renderers on portrait fill (`cover` / `SCALE_ASPECT_FILL`) so the surface stays vertical without black bars.
3. Lock browser zoom constraints to the hardware minimum zoom ratio capped at 1x (never above 1x), so supported devices move backward/zoom-out instead of zooming in.
4. Apply consistently to Go Live, Create Party, Party room seats, Private Call, and persistent handoff surface.
5. Disable LiveKit Android capture adaptation (`adaptOutputToDimensions=false`) and browser crop-scaling (`resizeMode:'none'`) so zoom-out comes from wider captured FOV, not fake CSS bars.
6. Apply true minimum optical zoom-out on both browser tracks and native LiveKit CameraX tracks, with delayed retries so Live/Party/Private Call all move backward as far as the hardware allows without changing UI surface area.
7. For Lovable/web preview, after the first permission-granted stream, scan `enumerateDevices()` for a wide/ultra-wide or other same-facing physical camera and reopen that exact `deviceId` before attaching/publishing, so preview/Live/Party/Private Call use the farthest available lens instead of the default cropped lens.

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

