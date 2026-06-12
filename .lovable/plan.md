# Background continuity + Heads-up inline-reply notifications

দুটো বড় native Android feature — দুটোই APK rebuild requires. Lovable preview-এ test হবে না, final QA real device-এ।

## What's broken today (audit summary)

App already has `CallForegroundService`, `MeriFirebaseMessagingService`, `MeriConnectionService`, `CameraOwnership`. কিন্তু:

- ForegroundService টা শুধু private-call path থেকে start হয়; **Live streaming + Party room** minimize-এ service start করে না → OS WebView/camera/mic kill করে দেয়।
- LiveKit Room JS-side instance; app background-এ গেলে WebView throttle হয় → publisher track stop, viewers reconnect loop।
- FCM messages এখন simple `notification` payload — heads-up popup আসে কিন্তু **inline reply (RemoteInput)** নেই; tap করলে app খোলে।
- কোনো `MessagingStyle` notification builder নেই → WhatsApp-এর মতো conversation thread + quick-reply দেখায় না।

## Phase 1 — Background continuity (live / call / party)

Goal: home button চাপলে camera/mic/LiveKit chalu thake until user explicitly leaves room.

1. **Promote `CallForegroundService` → `MediaSessionForegroundService`** — accept session type (`private_call` | `live_stream` | `party_room`), foregroundServiceType combine `phoneCall|camera|microphone|mediaPlayback`. Persistent notification with room title + leave button.
2. **Plugin bridge** — new `LiveSessionPlugin.startSession({ type, title, hostName, roomId })` / `stopSession()` invoked from React when:
   - `useGoLive` → publisher track published
   - Party room join confirmed
   - Private call connected (existing path kept)
3. **WebView background keep-alive** — `WebView.setWebContentsDebuggingEnabled` already on; add `WebSettings.setOffscreenPreRaster(true)` + acquire `PARTIAL_WAKE_LOCK` while service running. Crucially: keep MainActivity in `onStop` without finishing — LiveKit JS instance survives.
4. **LiveKit reconnect hardening** — verify `Room.options.adaptiveStream=false` during background (already true for publishers; double-check on `visibilitychange`).
5. **CameraOwnership audit** — make sure background-camera-stop logic (Camera2 release on pause) is **disabled while session active** — currently it auto-releases, killing the publisher.
6. **Battery-optimization prompt** — first time user goes live, request `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` via existing `BatteryOptimizationPlugin` (already there, just wire trigger).

## Phase 2 — WhatsApp-style inline-reply notifications

Goal: DM আসলে notification-এ avatar + name + message + "Reply" text field দেখাবে; reply করলে app না খুলেই Supabase-এ message insert হবে।

1. **FCM payload upgrade** — `notify-new-message` edge function-এ `data` payload-এ যোগ:
   - `conversation_id`, `sender_id`, `sender_name`, `sender_avatar_url`, `message_id`, `message_text`, `notification_type: "dm"`.
   - Remove `notification` block (so handler always runs in app code — required for MessagingStyle).
2. **Native `MeriFirebaseMessagingService` upgrade**:
   - Use `NotificationCompat.MessagingStyle` per `conversation_id` (thread group).
   - Add `RemoteInput.Builder("key_reply")` action labeled "Reply".
   - PendingIntent → new `MessageReplyReceiver` (BroadcastReceiver).
   - Cache last N messages per conversation in SharedPreferences for thread display.
3. **`MessageReplyReceiver`** —
   - Read RemoteInput text, immediately POST to new edge function `send-message-from-notification` (auth via stored user JWT in EncryptedSharedPreferences).
   - Update the same notification with the sent message appended (so user sees confirmation) — no app launch.
4. **Edge function `send-message-from-notification`** — validates JWT, inserts into `messages` table with correct sender/recipient/conversation, returns message_id. Reuses existing RLS.
5. **Notification channel** — dedicated `dm_messages` channel: importance HIGH, vibrate pattern, sound, badge.
6. **Auth token storage** — store refresh token in `EncryptedSharedPreferences` on login (new `SecureTokenStorePlugin`) so background receiver can authenticate.

## Order of work

1. Phase 1.1 + 1.2 + 1.5 (service + plugin + camera-ownership guard) — unblocks live/party background
2. Phase 1.3 + 1.4 + 1.6 — robustness
3. Phase 2.1 + 2.6 (edge function payload + token storage)
4. Phase 2.2 + 2.3 + 2.4 (MessagingStyle + RemoteInput + reply receiver)
5. Phase 2.5 + final QA on real device

## What I'll need from you

- Confirm "yes proceed" before I start coding — this is **large** native work, multiple files, will require **APK rebuild** (Lovable preview only validates compile, not behavior).
- After APK build, test scenarios I'll list: go live → home → wait 60s → return; receive DM with screen off → reply from notification → verify message in app.

## Honesty checkpoint

আমি Lovable preview-এ Phase 1 verify করতে পারব না (foreground service Android-only)। Phase 2 partial (FCM payload + edge function) preview-এ test হবে; native receiver শুধু APK-তে। শুরু করার অনুমতি দিলে Phase 1.1 থেকে শুরু করব।
