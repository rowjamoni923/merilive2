# Reliable Call Delivery — Flutter Native Spec (v1)

Goal: 99%+ private-call delivery rate, WhatsApp/Messenger parity.
**Ring timeout: 30 seconds** (server-driven via `app_settings.call_ring_timeout_seconds`).

## 7-Layer Architecture

| # | Layer | Tech | Responsibility |
|---|---|---|---|
| 1 | Push | **FCM High-Priority + data-only message** (`priority: high`, `content_available: true`, TTL=30s) | Wakes device through Doze |
| 2 | Server Retry | Edge function `call-deliver` — 3 attempts, exponential backoff (2s, 4s, 8s), aborts if call no longer pending | Survives transient FCM failures |
| 3 | Realtime Fallback | Existing Supabase Realtime channel on `private_calls` | Foreground users get instant signal even if FCM lags |
| 4 | Native UI | **Android ConnectionService + CallStyle Notification** (Android 12+) | OEM kill-resistant, lock-screen full ringer |
| 5 | Wake | **ForegroundService (`FOREGROUND_SERVICE_PHONE_CALL`)** + Wake Lock + `USE_FULL_SCREEN_INTENT` permission | Bypass Doze/Standby |
| 6 | Delivery Receipt | Phone calls `mark_call_delivered(call_id)` RPC the moment FCM arrives | Real delivery rate visible in admin |
| 7 | OEM Auto-start Guide | One-time onboarding screen for Xiaomi/Vivo/Oppo/Realme/Honor | Prevents background kill |

## Required Flutter Packages

```yaml
dependencies:
  firebase_messaging: ^15.1.3
  flutter_callkit_incoming: ^2.0.4+2  # ConnectionService wrapper
  flutter_foreground_task: ^8.10.0
  permission_handler: ^11.3.1
  wakelock_plus: ^1.2.8
  supabase_flutter: ^2.8.0
```

## AndroidManifest.xml additions

```xml
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL"/>
<uses-permission android:name="android.permission.MANAGE_OWN_CALLS"/>
<uses-permission android:name="android.permission.WAKE_LOCK"/>
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
```

## Backend Hooks (already deployed)

- **Edge function**: `POST /functions/v1/call-deliver`
  Body: `{ callId, calleeId, callerId, callType, callerName, callerAvatar }`
  Trigger: from `private-call/initiate` after `private_calls` insert.

- **DB Table**: `call_delivery_log` (per-attempt FCM/realtime tracking, RLS: own + admin)
- **RPC**: `mark_call_delivered(p_call_id, p_channel, p_device_info)` — call from Dart on FCM receive
- **Settings (`app_settings`)** — admin-tunable, no hardcoded fallback in Dart:
  - `call_delivery_max_retries` = 3
  - `call_delivery_retry_gap_ms` = 2000
  - `call_ring_timeout_seconds` = 30
  - `call_delivery_sms_fallback_enabled` = false

## Dart Flow

```dart
// 1. Background FCM handler (top-level function)
@pragma('vm:entry-point')
Future<void> _bgHandler(RemoteMessage msg) async {
  if (msg.data['type'] != 'incoming_call') return;
  await Firebase.initializeApp();

  final callId = msg.data['call_id']!;
  final timeoutSec = int.tryParse(msg.data['ring_timeout_seconds'] ?? '30') ?? 30;

  // 2. Confirm delivery to server immediately
  await Supabase.instance.client.rpc('mark_call_delivered', params: {
    'p_call_id': callId,
    'p_channel': 'fcm',
    'p_device_info': {'platform': 'android', 'sdk': Platform.operatingSystemVersion},
  });

  // 3. Show ConnectionService incoming call UI
  await FlutterCallkitIncoming.showCallkitIncoming(CallKitParams(
    id: callId,
    nameCaller: msg.data['caller_name'] ?? 'Unknown',
    avatar: msg.data['caller_avatar'],
    type: msg.data['call_type'] == 'video' ? 1 : 0,
    duration: timeoutSec * 1000,
    extra: {'caller_id': msg.data['caller_id']},
    android: const AndroidParams(
      isCustomNotification: true,
      isShowLogo: false,
      ringtonePath: 'system_ringtone_default',
      backgroundColor: '#0955fa',
      actionColor: '#4CAF50',
      isImportant: true,
      isBubble: true,
    ),
  ));
}

void main() {
  FirebaseMessaging.onBackgroundMessage(_bgHandler);
  FirebaseMessaging.onMessage.listen(_bgHandler); // foreground too
}
```

## Server-side (call initiate)

After inserting into `private_calls`, fire-and-forget call:
```ts
supabase.functions.invoke('call-deliver', { body: {
  callId, calleeId, callerId, callType, callerName, callerAvatar,
}});
```

## OEM Auto-start Guide (one-time onboarding)

Detect manufacturer via `device_info_plus`. For Xiaomi/Vivo/Oppo/Realme/Honor, show a screen instructing the user to enable:
- Auto-start permission
- Battery optimization → No restrictions
- Lock screen → Show on lock screen
- Background pop-up windows

Deep-link to OEM settings via package-specific intents (handled by `flutter_callkit_incoming` helper).

## QA Checklist (must verify before Play Store release)

- [ ] Doze mode: phone idle 30+ min → call still rings within 3s
- [ ] App swiped from recents → call still rings
- [ ] Lock screen → full-screen incoming UI shows
- [ ] Xiaomi/Vivo with battery saver ON → rings (after auto-start enabled)
- [ ] No internet for 5s → reconnect → call rings if still <30s old
- [ ] FCM token rotated → server retries other active tokens
- [ ] Two devices logged in same account → both ring (fan-out)
- [ ] `call_delivery_log` row appears within 1s with `status=delivered`

## Limits (industry-wide, unavoidable)

- Phone fully OFF / battery dead → cannot deliver
- Force-stopped via system settings → cannot deliver until next app open
- No internet on callee → cannot deliver
- Custom OEM ROMs that disable FCM (rare, mostly Chinese ROMs without Google Services)

Everything else: **delivered with retry + delivery confirmation**.
