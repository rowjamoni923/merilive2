# MeriLive Flutter — Install Referrer & Image Push Notifications Spec

> **Audience:** Gemini / Android-Flutter dev. This is the complete, copy-paste-ready spec to implement two production features in the existing `merilive_flutter/` app. No backend work needed — the `apply_install_referrer` RPC and `send-push-notification` edge function are already deployed and accept the exact payloads described below.

---

## FEATURE 1 — Play Install Referrer Attribution (Invite + Agency code)

### Goal
When a new user installs the app from Google Play via a referral URL like:

```
https://play.google.com/store/apps/details?id=com.merilive.app&referrer=invite_code%3D1234567890%26agency_code%3DAG88X
```

…the app must automatically capture `invite_code` and/or `agency_code` from the Install Referrer **on first launch after install** and call the backend RPC so the new user is linked to the inviter / agency without any manual code entry.

### Dependency
Add to `pubspec.yaml`:
```yaml
dependencies:
  play_install_referrer: ^0.2.1   # official Google Play Install Referrer wrapper
  shared_preferences: ^2.2.0      # already present
  supabase_flutter: ^2.x          # already present
```

Run `flutter pub get`.

### Android manifest
No special permission required — the Play Install Referrer Library uses the Play Store service binding. Just confirm `applicationId = "com.merilive.app"` matches the Play Store listing.

### Implementation — `lib/services/install_referrer_service.dart`

```dart
import 'package:play_install_referrer/play_install_referrer.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class InstallReferrerService {
  static const _kHandledKey = 'install_referrer_handled_v1';
  static const _kPendingInviteKey = 'pending_invite_code';
  static const _kPendingAgencyKey = 'pending_agency_code';
  static const _kPendingInviterUidKey = 'pending_inviter_app_uid';

  /// Call ONCE on app cold-start, BEFORE the user signs in.
  /// Safe to call multiple times — it's idempotent.
  static Future<void> captureOnFirstLaunch() async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_kHandledKey) == true) return;

    try {
      final details = await PlayInstallReferrer.installReferrer;
      final raw = details.installReferrer; // e.g. "invite_code=1234567890&agency_code=AG88X"
      if (raw == null || raw.isEmpty) {
        await prefs.setBool(_kHandledKey, true);
        return;
      }

      final params = Uri.splitQueryString(raw);
      final invite = params['invite_code']?.trim();
      final agency = params['agency_code']?.trim();
      final inviterUid = params['inviter_app_uid']?.trim();

      if (invite != null && invite.isNotEmpty) await prefs.setString(_kPendingInviteKey, invite);
      if (agency != null && agency.isNotEmpty) await prefs.setString(_kPendingAgencyKey, agency);
      if (inviterUid != null && inviterUid.isNotEmpty) {
        await prefs.setString(_kPendingInviterUidKey, inviterUid);
      }

      await prefs.setBool(_kHandledKey, true);
    } catch (e) {
      // Don't mark handled on failure — retry next launch
      print('[InstallReferrer] capture failed: $e');
    }
  }

  /// Call IMMEDIATELY after a successful signup (when supabase has a session).
  /// Idempotent on backend — safe to call multiple times.
  static Future<void> applyForUser(String userId) async {
    final prefs = await SharedPreferences.getInstance();
    final invite = prefs.getString(_kPendingInviteKey);
    final agency = prefs.getString(_kPendingAgencyKey);
    final inviterUid = prefs.getString(_kPendingInviterUidKey);

    if (invite == null && agency == null && inviterUid == null) return;

    try {
      final res = await Supabase.instance.client.rpc(
        'apply_install_referrer',
        params: {
          'p_user_id': userId,
          'p_invite_code': invite,
          'p_agency_code': agency,
          'p_inviter_app_uid': inviterUid,
        },
      );
      print('[InstallReferrer] apply result: $res');

      // Clear after successful apply so we don't re-apply on re-login
      await prefs.remove(_kPendingInviteKey);
      await prefs.remove(_kPendingAgencyKey);
      await prefs.remove(_kPendingInviterUidKey);
    } catch (e) {
      print('[InstallReferrer] apply failed (will retry next session): $e');
    }
  }
}
```

### Wire-up

**1. In `main.dart`** — call capture before `runApp`:
```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(...);
  await InstallReferrerService.captureOnFirstLaunch(); // ← ADD
  runApp(const MyApp());
}
```

**2. In your signup success handler** (auth screen, OTP verify, Google sign-in callback) — after `signUp` returns a session:
```dart
final session = Supabase.instance.client.auth.currentSession;
if (session != null) {
  await InstallReferrerService.applyForUser(session.user.id); // ← ADD
}
```

**3. Also on every cold start** if the user is already logged in (covers the rare case where capture succeeded but apply failed last time):
```dart
final user = Supabase.instance.client.auth.currentUser;
if (user != null) {
  InstallReferrerService.applyForUser(user.id); // fire-and-forget
}
```

### Backend RPC contract (already deployed)
```
SELECT public.apply_install_referrer(
  p_user_id        := <new user uuid>,
  p_invite_code    := '1234567890',  -- inviter's app_uid (10-digit numeric)
  p_agency_code    := 'AG88X',       -- agencies.referral_code (case-insensitive)
  p_inviter_app_uid:= NULL
);
```
Returns:
```json
{ "success": true, "inviter_linked": true, "inviter_id": "uuid",
  "agency_linked": true, "agency_id": "uuid" }
```
All three params are optional and idempotent. Already-linked users get `{"agency_linked": false, "reason": "already_in_agency"}` — no error.

### Generating referral links (admin/agency UI side — already works)
- **User invite link:** `https://play.google.com/store/apps/details?id=com.merilive.app&referrer=invite_code%3D{inviter_app_uid}`
- **Agency host link:** `https://play.google.com/store/apps/details?id=com.merilive.app&referrer=agency_code%3D{agency_referral_code}`
- **Combined:** `...&referrer=invite_code%3D{uid}%26agency_code%3D{code}`

> The `&` in the referrer payload **must be URL-encoded as `%26`** because the whole thing sits inside a single `referrer=` query param.

---

## FEATURE 2 — Image Push Notifications (BigPictureStyle)

### Backend already supports this
The `send-push-notification` edge function accepts `imageUrl` and forwards it to FCM in three places:
- `notification.image` (FCM v1 Android display)
- `data.image_url` (so the app can re-render when bringing notification from data-only payload)
- `android.notification.image` (Android-specific override)
- `apns.payload.aps.mutable-content` + `fcm_options.image` (iOS rich)

So **no backend change needed.** The Flutter app just needs to render the image when a notification arrives in the foreground (Android shows it natively when app is background/killed already).

### Dependencies (likely already present — confirm)
```yaml
firebase_messaging: ^15.x
flutter_local_notifications: ^17.x
http: ^1.x
```

### Implementation — `lib/services/push_notification_service.dart`

```dart
import 'dart:io';
import 'dart:typed_data';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

final FlutterLocalNotificationsPlugin _localNotif = FlutterLocalNotificationsPlugin();

const AndroidNotificationChannel _channel = AndroidNotificationChannel(
  'merilive_default',
  'MeriLive Notifications',
  description: 'General notifications including images',
  importance: Importance.high,
);

Future<void> initLocalNotifications() async {
  const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
  const iosInit = DarwinInitializationSettings(
    requestAlertPermission: true,
    requestBadgePermission: true,
    requestSoundPermission: true,
  );
  await _localNotif.initialize(const InitializationSettings(android: androidInit, iOS: iosInit));
  await _localNotif
    .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
    ?.createNotificationChannel(_channel);
}

/// Download an image to a temp file (required by BigPictureStyle on Android)
Future<String?> _downloadImage(String url) async {
  try {
    final res = await http.get(Uri.parse(url));
    if (res.statusCode != 200) return null;
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/notif_${DateTime.now().millisecondsSinceEpoch}.jpg');
    await file.writeAsBytes(res.bodyBytes);
    return file.path;
  } catch (_) { return null; }
}

/// Foreground handler — Firebase doesn't auto-show notifications when app is open.
Future<void> showRichNotification(RemoteMessage message) async {
  final notification = message.notification;
  final data = message.data;

  final title = notification?.title ?? data['title'] ?? 'MeriLive';
  final body  = notification?.body  ?? data['body']  ?? '';
  final imageUrl = notification?.android?.imageUrl
                ?? notification?.apple?.imageUrl
                ?? data['image_url']
                ?? data['image'];

  AndroidNotificationDetails androidDetails;

  if (imageUrl != null && imageUrl.toString().isNotEmpty) {
    final imagePath = await _downloadImage(imageUrl.toString());
    if (imagePath != null) {
      final bigPicture = BigPictureStyleInformation(
        FilePathAndroidBitmap(imagePath),
        largeIcon: FilePathAndroidBitmap(imagePath),
        contentTitle: title,
        summaryText: body,
        hideExpandedLargeIcon: false,
      );
      androidDetails = AndroidNotificationDetails(
        _channel.id, _channel.name,
        channelDescription: _channel.description,
        importance: Importance.high,
        priority: Priority.high,
        styleInformation: bigPicture,
        largeIcon: FilePathAndroidBitmap(imagePath),
      );
    } else {
      androidDetails = const AndroidNotificationDetails(
        'merilive_default', 'MeriLive Notifications',
        importance: Importance.high, priority: Priority.high,
      );
    }
  } else {
    androidDetails = const AndroidNotificationDetails(
      'merilive_default', 'MeriLive Notifications',
      importance: Importance.high, priority: Priority.high,
    );
  }

  final iosDetails = DarwinNotificationDetails(
    presentAlert: true, presentBadge: true, presentSound: true,
    attachments: imageUrl != null
      ? [DarwinNotificationAttachment(imageUrl.toString())]
      : null,
  );

  await _localNotif.show(
    DateTime.now().millisecondsSinceEpoch ~/ 1000,
    title, body,
    NotificationDetails(android: androidDetails, iOS: iosDetails),
    payload: data['link_url'] ?? '',
  );
}
```

### Wire-up in `main.dart`
```dart
Future<void> _bgHandler(RemoteMessage m) async {
  // System tray will auto-render on Android background — nothing needed unless you want custom
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(...);
  await Supabase.initialize(...);
  await initLocalNotifications();
  await InstallReferrerService.captureOnFirstLaunch();

  FirebaseMessaging.onBackgroundMessage(_bgHandler);
  FirebaseMessaging.onMessage.listen(showRichNotification); // foreground rich render

  runApp(const MyApp());
}
```

### Verification checklist
- [ ] User installs app via `https://play.google.com/store/apps/details?id=com.merilive.app&referrer=invite_code%3D{uid}` → after signup, `user_invitations` row exists with `inviter_id` set.
- [ ] Same with `&referrer=agency_code%3D{code}` → `agency_hosts` row created.
- [ ] Admin sends push with `imageUrl` from `/admin/notifications` → user sees image expanded in their notification tray (Android pull-down).
- [ ] App in foreground also shows the image-styled notification (not just text).

### Test the install referrer locally (without Play Store)
```bash
adb shell am broadcast -a com.android.vending.INSTALL_REFERRER \
  -n com.merilive.app/.InstallReferrerReceiver \
  --es "referrer" "invite_code=1234567890&agency_code=AG88X"
```
Then cold-start the app and check logcat for `[InstallReferrer]` lines.

---

## Summary for Gemini
1. Add `play_install_referrer` package, create `InstallReferrerService`, wire into `main.dart` + signup callback.
2. Update `push_notification_service.dart` to use `BigPictureStyleInformation` when `image_url` is present.
3. Backend RPC `apply_install_referrer` and edge function `send-push-notification` are already deployed — do NOT touch them.
