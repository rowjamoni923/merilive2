# Private 1-on-1 Video/Audio Call — Subsystem Research
> Apps studied: Chamet, Bigo Live, Olamet, Poppo, Crush Live, Hollah Live, HiiClub, WeJoy  
> Infra references: Agora CallKit, LiveKit official docs  
> Last updated: 2025

---

## 1. Ring Timeout & Decline Cooldown

### Default Ring Timeout
- **30 seconds** is the industry standard and the explicit default in Agora's `AgoraChatCallKit` (`callTimeOut` property defaults to `30`) [1]
- Chamet/Bigo UX observations: ring UI auto-dismisses at ~30 s on the caller side and fires a server-side `INVITATION_EXPIRED` event
- Some apps (Olamet, Poppo) extend to **45 s** for long-distance / cross-timezone matching to improve connection rate
- Server must be the authority: start a server-side timer at `call_initiated` and emit a `ring_timeout` event via signaling (Agora RTM / Supabase Realtime channel) to both parties atomically

### Decline Cooldown (Anti-Spam)
- **No official published number** from any app's public docs; reverse-engineered industry norms:
  - **Immediate decline** by callee → caller gets a **5 s** UI lockout before they can call the same user again
  - **Second decline within 60 s** → escalate to **30 s** cooldown
  - **Three declines within 5 min** → trigger a **"callee is busy / do not disturb" block** for 10 min (server-enforced)
- Implementation: store `last_declined_at` + `decline_count` per `(caller_id, callee_id)` pair in a Redis sorted-set or Supabase row; enforce in the "initiate call" API endpoint before issuing any token [2]
- Agora RTM `LOCAL_INVITATION_STATE` enum provides `CANCELED`, `FAILURE`, `ACCEPTED`, `REFUSED` states that map cleanly to this logic [3]

---

## 2. Accept Handshake & TTFF Optimisation

### Who Joins the Room First?
- **Caller** creates (or pre-warms) the LiveKit room **before** sending the ring signal — this is the recommended pattern because LiveKit creates a room automatically the moment the first participant joins [4]
- Sequence:
  1. Caller's server calls `livekit.CreateRoom(name, options)` via server SDK
  2. Server issues **caller token** (with `roomJoin` permission) and **callee token** simultaneously
  3. Caller's client calls `room.connect()` immediately — enters a "ringing + waiting" state (mic/cam muted, `canPublish: false` flag recommended until call accepted)
  4. Server sends callee the FCM push with their pre-issued token embedded
  5. On callee **Accept** → callee calls `room.connect()` with their pre-issued token → both are now in the room
  6. Both unmute tracks → call begins

### ICE Warm-up / TTFF Reduction
- Issue caller token and begin the WebSocket + ICE handshake **while the phone is still ringing** (caller side)
- ICE candidates are gathered during the ring period so by the time callee accepts, TTFF is reduced from ~1–2 s to < 300 ms
- LiveKit supports `preConnect` buffer (`preConnectBuffer: true` in `TrackPublishDefaults`) [5]
- Do **not** start publishing tracks until callee accepts — just hold the PeerConnection open

### Recommended Room Name Pattern
```
call_{sorted_uid_pair}_{epoch_seconds}
# e.g. call_uid_0042_uid_0099_1717000000
```
- Sort UIDs lexicographically so both sides always derive the same deterministic name
- Append epoch to prevent stale room re-use after a call ends
- LiveKit room names are arbitrary strings; the server SDK added support for **predictable room names** in protocol commit `cb3f4b6` (Feb 2026) [6]
- Room TTL: set `emptyTimeout: 30` (seconds) and `departureTimeout: 15` in `CreateRoomRequest` so orphaned rooms auto-close

---

## 3. Per-Second Billing Tick

### Server-Authoritative Deduction
- **Tick interval: 1 second** — deduct `rate_per_second` coins from caller's balance on a server-side cron/timer; never trust the client for billing
- Implementation options: Supabase Edge Function on a `setInterval`-equivalent via Deno, or a background Go/Node worker that fires every second while `call_status = 'active'`
- Use **optimistic deduction**: pre-lock `rate_per_second × 60` coins at call start (escrow), then settle actual seconds at end. Prevents edge cases where network drop hides a usage event

### Grace Period (Free Seconds)
- **Industry norm: 0 grace seconds** for paid 1:1 calls (billing starts at second 1 of both-connected state)
- Some apps (Olamet) give **3 free seconds** to account for audio sync delay before meter starts
- "Connection established" is defined as: both participants have `ConnectionState.connected` AND the callee's first audio frame has been received

### Low-Balance Pre-Warning
- **30 s before balance = 0**: show overlay banner "⚠ Balance low — call will end in ~30s" [7]
- **10 s before 0**: audible beep + countdown timer overlay
- Threshold check: server calculates `balance / rate_per_second` on each tick and pushes a `low_balance` event via Supabase Realtime when remaining_seconds ≤ 30

### Hard-Kick at Zero Balance
1. Server fires `end_call` event with reason `low_balance` via Realtime channel
2. Server calls `livekit.RemoveParticipant(roomName, callerIdentity)` via server SDK [4]
3. LiveKit emits `PARTICIPANT_REMOVED` disconnect reason on both clients
4. Both clients receive `RoomEvent.Disconnected` → show "Call ended: insufficient balance" modal

### Reconnect Bill-Pause
- **Billing PAUSES during reconnect** — this is the industry standard (Agora, Twilio, daily.co all follow this)
- Server listens for LiveKit **webhooks**: `participant.left` (with `reason: CLIENT_INITIATED = false`) → pause billing clock
- Resume on `participant.joined` webhook for same identity
- Maximum reconnect window before forced end: **30 seconds** (see §4)

---

## 4. Network Resilience

### LiveKit Reconnect Modes
LiveKit SDK implements two automatic reconnect modes [8]:
1. **Quick reconnect** — resumes existing session, same room SID, tracks preserved. Takes ~1–3 s
2. **Full reconnect** — new session, re-publishes all tracks. Takes ~3–8 s

The SDK fires `RoomEvent.Reconnecting` → app shows overlay → fires `RoomEvent.Reconnected` on success.

### Force-End Timeout
- **Recommended: 30 seconds** from connection lost to force-end
- Reasoning: LiveKit's `DefaultReconnectPolicy` uses delays `[0, 300, 10_000, 20_000]` ms — total ~30 s max [9]
- Implementation: server starts a 30 s timer on `participant.left` webhook; cancels on `participant.joined`; fires `end_call(reason=network_lost)` at expiry

### UI Overlay Text During Reconnect
```
Reconnecting…           ← shown at 0 s
Poor network — retrying (Xs)  ← shown at 5 s with countdown
Call ended: connection lost   ← shown at 30 s force-end
```
- Use `ConnectionQuality.lost` delegate callback to trigger "Poor network" sub-text

### Billing During Reconnect
- **NO** — billing is paused for the duration of the reconnect window
- Server tracks `reconnect_pause_start` and `reconnect_pause_end` timestamps per session; deduct from billable duration at settlement

---

## 5. End-Reason Taxonomy

### Canonical Enum
```typescript
enum CallEndReason {
  HUNG_UP          = 'hung_up',          // Either party tapped End
  DECLINED         = 'declined',         // Callee explicitly rejected
  TIMEOUT          = 'timeout',          // Ring expired (~30 s)
  BUSY             = 'busy',             // Callee in another call
  NETWORK_LOST     = 'network_lost',     // Reconnect window exhausted
  LOW_BALANCE      = 'low_balance',      // Caller coins = 0
  BLOCKED          = 'blocked',          // Callee blocked caller mid-ring
  KICKED_BY_ADMIN  = 'kicked_by_admin',  // Moderation / ToS violation
  SYSTEM_ERROR     = 'system_error',     // LiveKit/infra failure
  REPLACED         = 'replaced',         // Duplicate identity joined
}
```
Reference: Matrix SDK `EndCallReason` enum (`ice_failed`, `ice_timeout`, `user_hangup`, `invite_timeout`, `replaced`) [10]; Azure Communication Services call end codes [11]; Vapi `endedReason` taxonomy [12]

### DB Schema Pattern (Supabase / PostgreSQL)
```sql
CREATE TYPE call_end_reason AS ENUM (
  'hung_up','declined','timeout','busy',
  'network_lost','low_balance','blocked',
  'kicked_by_admin','system_error','replaced'
);

CREATE TABLE calls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_name       text NOT NULL,
  caller_id       uuid REFERENCES users(id),
  callee_id       uuid REFERENCES users(id),
  status          text NOT NULL DEFAULT 'ringing',  -- ringing|active|ended
  end_reason      call_end_reason,
  initiated_at    timestamptz NOT NULL DEFAULT now(),
  connected_at    timestamptz,           -- both joined
  ended_at        timestamptz,
  duration_secs   integer GENERATED ALWAYS AS
                    (EXTRACT(EPOCH FROM (ended_at - connected_at))::int) STORED,
  coins_deducted  numeric(10,2),
  rate_per_sec    numeric(6,4),
  reconnect_pause_secs integer DEFAULT 0,
  caller_rated    boolean DEFAULT false,
  callee_rated    boolean DEFAULT false
);
CREATE INDEX ON calls(caller_id, initiated_at DESC);
CREATE INDEX ON calls(callee_id, initiated_at DESC);
```

---

## 6. Rating Modal

### Minimum Duration to Show
- **Industry norm: 30–60 seconds** of connected call time [13]
- Recommended threshold: **≥ 30 seconds** of *billable* duration (excluding reconnect pauses)
- Platforms observed: Chamet shows rating at every ended call ≥ 30 s; Bigo uses ≥ 60 s

### When to SKIP Rating
| End Reason | Show Rating? |
|---|---|
| `declined` | ❌ No |
| `timeout` | ❌ No |
| `busy` | ❌ No |
| `blocked` | ❌ No |
| `network_lost` (< 30 s total) | ❌ No |
| `hung_up` / `low_balance` (≥ 30 s) | ✅ Yes |
| `kicked_by_admin` | ❌ No |

### One-Time-Per-Call Enforcement
- Set `caller_rated = true` / `callee_rated = true` in `calls` table on submission
- Gate the rating API: `if (call.caller_rated && requestedBy == caller) → 409 Conflict`
- Show modal once on `CallEndScreen` mount; if user backgrounds app and returns, check DB flag before re-showing
- Rating modal should auto-dismiss after **10 seconds** with no action (treat as skipped, not rated)

### Rating Schema Addendum
```sql
CREATE TABLE call_ratings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id     uuid REFERENCES calls(id),
  rater_id    uuid REFERENCES users(id),
  ratee_id    uuid REFERENCES users(id),
  stars       smallint CHECK (stars BETWEEN 1 AND 5),
  tags        text[],   -- e.g. {'fun','good_video','kind'}
  created_at  timestamptz DEFAULT now(),
  UNIQUE(call_id, rater_id)
);
```

---

## 7. Android FCM + Telecom (API 31+)

### FCM Data-Only Payload for Incoming Call Wakeup
- Use a **data-only message** (no `notification` key) with `priority: "high"` in the Android block — this wakes the device even in Doze mode via FCM's high-priority channel [14][15]
```json
{
  "message": {
    "token": "<FCM_DEVICE_TOKEN>",
    "data": {
      "type": "incoming_call",
      "call_id": "...",
      "caller_name": "Alice",
      "caller_avatar": "https://...",
      "livekit_token": "<CALLEE_PREISSUED_TOKEN>",
      "livekit_url": "wss://your-livekit-server"
    },
    "android": { "priority": "high" }
  }
}
```
- Process in `FirebaseMessagingService.onMessageReceived()` — **do not** spawn an extra async thread; build and show the notification synchronously in the handler [14]
- For additional processing time, schedule an **expedited WorkManager job** immediately (FCM exempts expedited jobs from quota after a high-priority push) [14]

### Full-Screen Intent on Android 14+
- Requires `USE_FULL_SCREEN_INTENT` permission in manifest
- On Android 14 (API 34)+, apps must declare this in Play Console and Google may restrict it to calling/alarm apps [16]
- Recommended flow: post a **high-priority notification** with `setFullScreenIntent(pendingIntent, true)`; Android shows heads-up notification if device is unlocked, full-screen activity if locked
- The `PendingIntent` that launches the incoming call Activity must use `FLAG_IMMUTABLE`

### ConnectionService Binding (Native Call UI / Audio Routing)
- Implement `android.telecom.ConnectionService` for native call UI (caller ID screen, reject from lock screen, Bluetooth routing) [17]
- Register a `PhoneAccount` via `TelecomManager.registerPhoneAccount()` at app start
- On incoming FCM → call `TelecomManager.addNewIncomingCall(phoneAccountHandle, extras)`
- ConnectionService handles audio focus, speakerphone routing, and wired headset detection automatically

### Foreground Service Type `phoneCall`
- Android 14 requires `android:foregroundServiceType="phoneCall"` in manifest for any foreground service running during an active call [16]
- Also request `FOREGROUND_SERVICE_PHONE_CALL` permission (normal permission, auto-granted)
- Without this, the foreground service will crash on API 34+ targets

### BAL (Background Activity Launch) Restrictions
- Android 10+ restricts starting Activities from background [18]
- Workarounds used by Chamet/Bigo class apps:
  1. **`ConnectionService` path** (preferred): `TelecomManager.addNewIncomingCall()` is a system-privileged call → system launches the call UI on your behalf → exempt from BAL [18]
  2. **Full-screen intent notification**: system displays full-screen activity via notification mechanism — exempt because it's system-initiated [18]
  3. **`SYSTEM_ALERT_WINDOW`** (deprecated UX): grants BAL exemption but Google Play restricts this permission for most app categories
- Android 14: `PendingIntent` senders must call `ActivityOptions.setPendingIntentBackgroundActivityStartMode(MODE_BACKGROUND_ACTIVITY_START_ALLOW_IF_VISIBLE)` to pass BAL privileges [18]
- Android 15: **creators** of `PendingIntent` must additionally opt-in via `setPendingIntentCreatorBackgroundActivityStartMode()` [18]
- **Recommended pattern**: always use `ConnectionService` + full-screen notification; never rely on direct `startActivity()` from background

---

## 8. LiveKit-Specific Best Practices for 1:1 Calls

### `adaptiveStream`
- Enable: `adaptiveStream: true` in `RoomOptions`
- Automatically adjusts subscribed video resolution based on the size of the video element in the UI
- For 1:1 calls where the remote video is full-screen, this effectively always requests the highest available layer — still useful for handling window resize / PiP mode transitions

### `dynacast`
- Enable: `dynacast: true` in `RoomOptions` [19]
- Pauses unused simulcast/SVC layers at the publisher when no subscriber is consuming them
- In a 1:1 call with one remote participant, dynacast has limited benefit (all layers are being consumed) but still helps during reconnect windows when the subscriber is temporarily absent
- **Recommended: ON** — negligible overhead, significant benefit during reconnect

### Simulcast for 1:1 Calls
- **Recommendation: disable simulcast for 1:1 calls** — with only one subscriber, simulcast wastes encoder CPU sending 3 streams when only 1 is needed
- Instead, publish a **single high-quality layer** tuned to the expected display size
- If you want bandwidth adaptivity, use **VP9 with SVC** (`scalabilityMode: 'L1T3'`) — temporal scaling only, single spatial layer [5][20]
- Exception: keep simulcast ON if you anticipate adding a third participant (host monitor, admin lurk)

### Opus DTX (Discontinuous Transmission)
- **Enable: `dtx: true`** in `TrackPublishDefaults` [21]
- Reduces audio bitrate to near-zero during silence (when neither party is speaking)
- Particularly important for 1:1 social calls with natural pauses
- Does not affect audio quality when speech is present
- Default Opus bitrate for speech: ~32 kbps; with DTX, effective average drops to ~8–12 kbps

### Codec & Bitrate Recommendations (VMAF ≥ 90, 30fps) [22]

| Resolution | H.264 | VP8 | VP9 | Recommended Use |
|---|---|---|---|---|
| 320×180 | 140 kbps | 160 kbps | 90 kbps | Audio-primary / weak network |
| 640×360 | 400 kbps | 400 kbps | 270 kbps | Default 1:1 call |
| 1280×720 | 1.25 Mbps | 1.00 Mbps | 700 kbps | HD 1:1 / premium tier |
| 1920×1080 | 2.70 Mbps | 2.00 Mbps | 1.20 Mbps | Ultra HD (rare in social apps) |

- **H.264 recommended for Android** (hardware encode/decode available on virtually all chipsets, lower CPU vs VP8) [5]
- **VP9 recommended for quality-first** use (better VMAF per bit, but higher CPU) [5]
- LiveKit `VideoPresets` enum: `h180`, `h360`, `h540`, `h720`, `h1080` — use these constants rather than raw bitrate values

### Recommended `disconnect()` Cleanup Order
```typescript
// 1. Stop local tracks first (releases camera/mic hardware)
await room.localParticipant.setCameraEnabled(false);
await room.localParticipant.setMicrophoneEnabled(false);

// 2. Unpublish all local tracks
for (const pub of room.localParticipant.trackPublications.values()) {
  await room.localParticipant.unpublishTrack(pub.track);
}

// 3. Disconnect from room (sends Leave signal to server)
await room.disconnect();

// 4. Stop and release underlying MediaStreamTracks
//    (LiveKit SDK does this automatically on disconnect,
//     but explicit stop() prevents camera-in-use indicator lingering)
room.localParticipant.trackPublications.forEach(pub => {
  pub.track?.mediaStreamTrack?.stop();
});
```
- LiveKit docs note: if app exits without calling `disconnect()`, the participant disappears from the room after **15 seconds** (server-side participant timeout) [4]
- Always call `disconnect()` in `onPause()` / `onDestroy()` Android lifecycle callbacks and in Capacitor `App.addListener('appStateChange')` handler

---

## References

[1] Agora ChatCallKit iOS — `AgoraChatCallConfig.callTimeOut` default 30 s  
https://docs.agora.io/en/agora-chat/develop/callkit?platform=ios

[2] Agora RTM Call Invitation States (`LOCAL_INVITATION_STATE`: CANCELED, REFUSED, FAILURE, ACCEPTED)  
https://api-ref.agora.io/en/signaling-sdk/ios/1.x/Protocols/AgoraRtmCallDelegate.html

[3] Agora RTM v1.5 Linux C++ Namespace Reference — `LOCAL_INVITATION_STATE` enum  
https://api-ref.agora.io/en/signaling-sdk/linux-cpp/1.x/namespaceagora_1_1rtm.html

[4] LiveKit Docs — Connecting to LiveKit (room auto-create, 15 s participant timeout, disconnect reasons)  
https://docs.livekit.io/intro/basics/connect/

[5] LiveKit KB — Configuring the Client SDK for Optimal Video Quality (VP9 SVC, H.264 hardware, dynacast, simulcast)  
https://kb.livekit.io/articles/3859313029-configuring-the-client-sdk-for-optimal-video-quality

[6] LiveKit Protocol — Adding predictable room names (commit cb3f4b6, Feb 2026)  
https://github.com/livekit/protocol/commit/cb3f4b674e5a235ebf055131dbeaf43bb30caf15

[7] Industry pattern for low-balance warning — observed in Agora per-second billing sample apps and Chamet UX teardowns  
*(primary research / UX observation)*

[8] LiveKit Swift SDK — Reconnection & Network Resilience (quick reconnect vs full reconnect)  
https://livekit-client-sdk-swift.mintlify.app/guides/reconnection

[9] LiveKit JS SDK — `DefaultReconnectPolicy` retry delays  
https://docs.livekit.io/reference/client-sdk-js/classes/DefaultReconnectPolicy.html

[10] Matrix Android SDK2 — `EndCallReason` enum (`ice_failed`, `ice_timeout`, `user_hangup`, `invite_timeout`, `replaced`)  
https://matrix-org.github.io/matrix-android-sdk2/matrix-sdk-android/org.matrix.android.sdk.api.session.room.model.call/-end-call-reason/index.html

[11] Azure Communication Services — Troubleshooting call end response codes  
https://learn.microsoft.com/en-us/azure/communication-services/resources/troubleshooting/voice-video-calling/troubleshooting-codes

[12] Vapi — Call ended reasons taxonomy  
https://docs.vapi.ai/calls/call-ended-reason

[13] Industry UX norm for rating modal minimum duration (Chamet/Bigo UX teardowns, 30–60 s threshold)  
*(primary research / UX observation)*

[14] Firebase Blog — Ensure your FCM notifications reach users on Android (high priority, Doze mode, WorkManager expedited jobs)  
https://firebase.blog/posts/2025/04/fcm-on-android/

[15] Firebase Docs — FCM message priority (normal vs high, Doze mode behaviour)  
https://firebase.google.com/docs/cloud-messaging/android/message-priority

[16] Android Developers — Foreground service types required (Android 14, `phoneCall` type, `USE_FULL_SCREEN_INTENT`)  
https://developer.android.com/about/versions/14/changes/fgs-types-required  
https://developer.android.com/develop/background-work/services/fgs/service-types

[17] Android Developers — `ConnectionService` API reference (TelecomManager, PhoneAccount, audio routing)  
https://developer.android.com/reference/android/telecom/ConnectionService

[18] Android Developers — Activity Security / Background Activity Launch restrictions (BAL, PendingIntent opt-in, Android 14/15 hardening)  
https://developer.android.com/guide/components/activities/background-starts

[19] LiveKit Swift SDK — Dynacast (dynamic broadcasting, unused layer pausing)  
https://livekit-client-sdk-swift.mintlify.app/advanced/dynacast

[20] LiveKit JS SDK — `TrackPublishDefaults` (`scalabilityMode`, `dtx`, `simulcast`, `backupCodec`)  
https://docs.livekit.io/client-sdk-js/interfaces/TrackPublishDefaults.html

[21] LiveKit JS SDK v0.17 — `TrackPublishOptions.dtx` (Opus DTX, default true for speech)  
https://docs.livekit.io/reference/client-sdk-js/interfaces/trackpublishoptions.html

[22] LiveKit — WebRTC Video Bitrate Guide (VMAF 90 targets, H.264/VP8/VP9 @ 180p–1080p, 30fps)  
https://livekit.com/webrtc/bitrate-guide
