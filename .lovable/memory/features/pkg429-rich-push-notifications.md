---
name: Pkg429 Rich Push Notifications
description: BigPictureStyle + large-icon + action buttons on gift + live FCM notifications. Backwards-compatible.
type: feature
---

DONE 2026-06-05. Final 3rd step of the native rollout trio
(Pkg427 Reels, Pkg428 Image Loader, Pkg429 Rich Push).

**Scope** — gift + live FCM notifications now match Instagram / WhatsApp /
TikTok quality: BigPictureStyle, sender / host avatar as large icon, and
contextual action buttons. Implemented entirely inside
`NotificationHelper.java` + minimal field forwarding in
`MeriFirebaseMessagingService.java`. ZERO new receivers, ZERO new manifest
entries — actions route through the existing MainActivity deep-link path.

**`NotificationHelper.java`** — new rich overloads (backwards-compat
wrappers kept):
- `showGiftNotification(ctx, senderName, giftName, value, senderAvatarUrl?,
  giftImageUrl?, senderId?)` — large icon (sender avatar), BigPictureStyle
  (gift artwork) when URL present else BigTextStyle, "Send Back 🎁" action
  → MainActivity with `route="/profile/<senderId>"` (handled by the
  existing `handleNotificationRoute` switch in MainActivity, no new code).
- `showLiveNotification(ctx, hostName, roomId, hostAvatarUrl?,
  coverImageUrl?)` — large icon (host avatar), BigPictureStyle (stream
  cover) when URL present, "Join 🔴" action reusing the main pending
  intent.
- New private `fetchBitmapBestEffort(url)` — guarded HttpURLConnection
  bitmap fetch (6s connect/read timeout, http(s) only, swallow-all errors,
  always closes stream + connection). Caller must run on a background
  thread; FCM `onMessageReceived` already does.

**`MeriFirebaseMessagingService.java`** — `handleGift` + `handleLiveStart`
now forward the new optional fields (`sender_avatar_url`/`avatar_url`,
`gift_image_url`/`image_url`, `sender_id`, `host_avatar_url`/`avatar_url`,
`cover_image_url`/`image_url`). All accept snake_case + camelCase to match
the existing convention.

**Backwards compatibility** — all old call sites (`showGiftNotification(4
args)` + `showLiveNotification(3 args)`) keep working because the new
helper signatures are overloads; the old shapes delegate to the new ones
with `null` for the optional URL/id fields. Existing FCM payloads that
don't carry the new fields render exactly as before.

**Constraint compliance** — `NEVER TOUCH GIFT/ENTRY ANIMATIONS` constraint
respected: zero edits to FullScreenGiftAnimation / FlyingGiftAnimation /
GiftEmojiAnimation / VAPPlayer / gift sound / gift panel / public-gift-media.
This is FCM-only system-notification work — the in-app gift overlay is
untouched.

**APK size** — 0 bytes added (Glide already in APK from Pkg428;
NotificationCompat + BitmapFactory are AndroidX/system).

**Backend payload contract** — edge functions (`send-push-notification`,
`push-on-notification`, `send-app-notification`, `notify-new-message`)
may now optionally include any of:
- `sender_avatar_url`, `sender_id` (gift)
- `gift_image_url` (gift)
- `host_avatar_url` (live)
- `cover_image_url` (live)

When omitted, the helper degrades gracefully to the original
BigTextStyle layout. No backend changes shipped yet — payload additions
are deferred until the user signs off on the visual layout via a test
APK.

**Native rollout trio status (Pkg427 + Pkg428 + Pkg429)**: COMPLETE.
The app is now ~98 % native; remaining 2 % = React UI shell (Home /
Profile / Chat / Settings), which intentionally stays in the WebView per
prior architectural decision.
