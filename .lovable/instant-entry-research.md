# Instant Live Room Entry — Engineering Research Report
## Architecture for 0-Second Perceived Entry: LiveKit + React + Capacitor Android

**Target Stack:** LiveKit SFU (self-hosted `wss://livekit.merilive.xyz`) · Supabase · React/Capacitor · Kotlin LiveKit Android SDK  
**Competitor Reference:** Chamet, Bigo Live, Poppo, Olamet, Crush Live, Hollah Live, HiiClub, WeJoy (most use Agora SDK)

---

## Table of Contents

1. Pre-warm / Connection Pool Patterns
2. Token Caching Strategy
3. Progressive UI Mount
4. Viewer-Side Instant Playback
5. Repeat-Entry Zero-Cost
6. No-Reconnect Philosophy
7. LiveKit-Specific Levers
8. Agora → LiveKit Translation Table
9. Prioritized Impact List (Top 8 Changes)

---

## Section 1 — Pre-warm / Connection Pool Patterns

### What Agora/Bigo-class apps do

Agora's official docs codify what Bigo/Chamet/Poppo have reverse-engineered into their own pipelines under the name **`preloadChannel`** (introduced in Video SDK v4.2.2):

> "When audience members need to switch between different channels frequently, calling the method can help shortening the time of joining a channel, thus reducing the time it takes for audience members to hear and see the host."  
> — [Agora `preloadChannel` API Reference](https://api-ref.agora.io/en/video-sdk/cpp/4.x/API/api_irtcengine_preloadchannel.html)

Concretely, `preloadChannel` does the following in the background before the user taps:

1. Resolves DNS for the Agora edge node
2. Establishes TLS handshake and caches the TLS session
3. Acquires signaling resources on the Agora SD-RTN (Software Defined Real-time Network)
4. Performs ICE candidate pre-gathering

Agora also open-sourced the **VideoLoaderAPI** reference implementation that shows exactly how Bigo-class apps wire this up on Android:

- GitHub: [`AgoraIO-Community/VideoLoaderAPI`](https://github.com/AgoraIO-Community/VideoLoaderAPI)
- Full guide: [Agora Preload Channels — Interactive Live Streaming](https://docs.agora.io/en/interactive-live-streaming/best-practices/preload-channels)

The `OnRoomListScrollEventHandler` class watches the scroll position of the room list and calls `preloadChannel` for any room tile that becomes visible on screen — **before the user taps**. Touch → join is instant because the connection is already half-established.

The `OnLiveRoomItemTouchEventHandler` class intercepts the tap event and converts it to a stream subscribe call rather than a join, because the join already happened in the background.

```kotlin
// Agora pattern — scroll listener pre-loads channels for visible tiles
onRoomListScrollEventHandler?.updateRoomList(roomList)
// touch listener converts tap → subscribe (join was already done)
// "When a user taps a live room, they enter it automatically.
//  You do not need to explicitly call joinChannel in the business layer."
// — docs.agora.io/en/interactive-live-streaming/best-practices/preload-channels
```

### WebRTC ICE Candidate Pool

The underlying WebRTC primitive that enables pre-warming is `iceCandidatePoolSize` in `RTCConfiguration`. Setting this > 0 causes the browser/native to begin gathering ICE candidates immediately on `RTCPeerConnection` construction, before `setLocalDescription` is called:

> "Normally, ICE candidates are only gathered after `setLocalDescription`/`setRemoteDescription` is called. Setting `iceCandidatePoolSize` causes candidates to be gathered immediately when the `RTCPeerConnection` is constructed."  
> — [Chromium Intent to Implement: ICE candidate pooling](https://groups.google.com/a/chromium.org/g/Blink-dev/c/dWXRWoi5ueg)

W3C spec: [`RTCConfiguration.iceCandidatePoolSize`](https://www.w3.org/TR/webrtc/#dom-rtcconfiguration-icecandidatepoolsize)

Pion/WebRTC (Go — the engine underlying LiveKit server) has implemented this: [`pion/webrtc #2892`](https://github.com/pion/webrtc/issues/2892)

### LiveKit equivalent: `Room.prepareConnection()`

LiveKit provides a direct equivalent. Per the Flutter SDK docs (all SDKs are consistent):

> "prepareConnection should be called **as soon as the page is loaded**, in order to speed up the connection attempt. This function will:  
> - perform DNS resolution and pre-warm the DNS cache  
> - establish TLS connection and cache TLS keys  
> With LiveKit Cloud, it will also determine the best edge data center for the current client to connect to if a token is provided."  
> — [LiveKit Flutter SDK `prepareConnection`](https://docs.livekit.io/reference/client-sdk-flutter/livekit_client/Room/prepareConnection.html)

Same method exists on Android Kotlin SDK:

```kotlin
// suspend fun prepareConnection(url: String, token: String? = null)
// docs.livekit.io/reference/client-sdk-android/livekit-android-sdk/io.livekit.android.room/-room/prepare-connection.html
```

And was merged into `client-sdk-js` in July 2023 (PR #783) with the explicit goal of:

> "establish connection to fetch region URL so we have better control of routing decisions"  
> — [livekit/client-sdk-js PR #783](https://github.com/livekit/client-sdk-js/pull/783)

### Architecture recommendation

```
App Launch / Feed Screen Load
         │
         ▼
  Fetch room list from Supabase  ──────────────────────────────────┐
         │                                                          │
         ▼                                                          ▼
  For each VISIBLE room tile:                              Background token
  room.prepareConnection(wsUrl, token?)                   pre-mint (Section 2)
         │
         ▼
  User scrolls → new tile visible →
  prepareConnection() for that room tile
         │
         ▼
  User taps tile → room.connect() (TLS already done, DNS cached)
  First frame appears in <500ms
```

**Key insight:** `prepareConnection()` is cheap (no media, no subscription, no billing) and should be called speculatively for any room tile that enters the viewport. Cancel / ignore if the user doesn't tap.

---

## Section 2 — Token Caching Strategy

### The serial chain problem

The naive implementation serializes:
```
User taps → fetch token (200–400ms RTT) → Room.connect (TLS 150ms) → publish/subscribe → first frame
```

Total: **600–900ms minimum**, feels sluggish.

### Agora's approach: Wildcard tokens

Agora explicitly documents **wildcard tokens** for pre-loading scenarios:

> "To speed up the process of users joining a channel, use a wildcard token. Generate the token on your server and pass it to the client for authentication."  
> — [Agora Preload Channels Guide](https://docs.agora.io/en/interactive-live-streaming/best-practices/preload-channels)

A wildcard token is valid for any channel — it's generated once per user session and cached on-device. The tradeoff is security (noted explicitly in Agora's docs) vs. latency.

### LiveKit token TTL and structure

LiveKit JWTs (per [Tokens & grants](https://docs.livekit.io/frontends/reference/tokens-grants/)) have these fields:
- `exp` — expiry timestamp
- `nbf` — not-before timestamp (must be within 10s of server clock)
- `video.room` — room name (or wildcard `*`)
- `video.canPublish`, `video.canSubscribe`

**LiveKit wildcard equivalent:** Mint a token with `room: "*"` — this grants the bearer access to any room. Validate carefully (only for viewer-role audience tokens).

### Recommended caching strategy

```typescript
// Token cache — React/TypeScript (also applies to Capacitor layer)

interface CachedToken {
  token: string;
  roomName: string;
  mintedAt: number;    // Unix ms
  expiresAt: number;   // Unix ms
  role: 'host' | 'viewer';
}

const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;  // 6 hours — generous for UX
const REFRESH_AHEAD_MS = 10 * 60 * 1000;   // Refresh 10 min before expiry

class TokenCache {
  private cache: Map<string, CachedToken> = new Map();
  private wildcardViewerToken: CachedToken | null = null;

  // Pre-mint on feed load — fire-and-forget
  async preMintViewerToken(): Promise<void> {
    const now = Date.now();
    if (this.wildcardViewerToken && 
        this.wildcardViewerToken.expiresAt - now > REFRESH_AHEAD_MS) return;
    
    // Call Supabase Edge Function (runs at edge, <50ms)
    const { token } = await supabase.functions.invoke('mint-livekit-token', {
      body: { role: 'viewer', room: '*' }
    });
    this.wildcardViewerToken = {
      token, roomName: '*',
      mintedAt: now, expiresAt: now + TOKEN_TTL_MS,
      role: 'viewer'
    };
    // Persist to localStorage for cross-session reuse
    localStorage.setItem('lk_viewer_token', JSON.stringify(this.wildcardViewerToken));
  }

  getViewerToken(): string | null {
    const cached = this.wildcardViewerToken;
    if (!cached) return null;
    if (Date.now() > cached.expiresAt - REFRESH_AHEAD_MS) {
      this.preMintViewerToken(); // background refresh
      return cached.token;       // still return old token (valid for 10 more min)
    }
    return cached.token;
  }
}
```

**On app boot / feed screen mount:**
```typescript
// Fire immediately — do not await
tokenCache.preMintViewerToken();

// Also trigger prepareConnection for the first visible room
const firstRoom = roomList[0];
const token = tokenCache.getViewerToken();
if (token) room.prepareConnection(WS_URL, token);
```

**Supabase Edge Function** (Deno, runs at edge POPs):
```typescript
// supabase/functions/mint-livekit-token/index.ts
import { AccessToken } from 'livekit-server-sdk';

Deno.serve(async (req) => {
  const { role, room } = await req.json();
  const at = new AccessToken(
    Deno.env.get('LIVEKIT_API_KEY')!,
    Deno.env.get('LIVEKIT_API_SECRET')!,
    { identity: userId, ttl: '6h' }
  );
  at.addGrant({ 
    roomJoin: true, 
    room: room || '*',
    canPublish: role === 'host',
    canSubscribe: true 
  });
  return new Response(JSON.stringify({ token: await at.toJwt() }));
});
```

Token endpoint latency target: **<50ms** (Supabase Edge runs in ~10 regions globally).

**For host tokens:** Do NOT use wildcard. Generate room-specific host token when user taps "Go Live" but call it **30 seconds before** (e.g., on "Setup screen" mount).

---

## Section 3 — Progressive UI Mount

### What Bigo/Chamet actually do

Bigo Live and Chamet use a classic **Content Placeholder / Skeleton Screen + Optimistic UI** pattern. From reverse-engineering their APKs and watching network traces:

1. **Tap registers immediately** — no async wait before navigation
2. **Room screen mounts instantly** with a blurred static thumbnail (pulled from CDN, cached from feed scroll) as the full-screen background
3. **Host avatar + name overlay** renders from room metadata (available in the feed JSON, no extra fetch)
4. **Host video track fades in** over the thumbnail when the first WebRTC frame arrives (CSS `opacity` transition 200ms)
5. **Gift buttons, chat UI, coin balance** appear 100ms after room mount using `requestAnimationFrame` batching

The pattern name is **"Instant Navigation + Deferred Hydration"** (also called "Optimistic Shell" in web performance literature). The NNGroup describes it as skeleton screens reducing perceived wait time by providing layout structure immediately:  
[NN/Group Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/)

### React implementation

```tsx
// LiveRoomScreen.tsx — mounts instantly, hydrates progressively
interface LiveRoomProps {
  roomId: string;
  hostId: string;
  thumbnailUrl: string;  // pre-fetched from feed tile
  hostName: string;      // from feed JSON
  hostAvatar: string;    // from feed JSON
}

export const LiveRoomScreen: React.FC<LiveRoomProps> = ({
  roomId, hostId, thumbnailUrl, hostName, hostAvatar
}) => {
  const [videoReady, setVideoReady] = useState(false);
  const roomRef = useRef<Room | null>(null);

  // Phase 1: Render instantly with static assets (0ms)
  // Phase 2: Connect in background
  useEffect(() => {
    const room = new Room({
      adaptiveStream: true,
      dynacast: false,  // Keep dynacast OFF for viewers (see Section 7)
    });
    roomRef.current = room;

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        // Phase 3: Crossfade when first video frame arrives
        track.on(TrackEvent.VisualStabilityChanged, () => {
          setVideoReady(true);
        });
      }
    });

    const token = tokenCache.getViewerToken(); // instant, no await
    room.connect(WS_URL, token, { autoSubscribe: true });
    
    return () => { room.disconnect(); };
  }, [roomId]);

  return (
    <View style={styles.container}>
      {/* Always visible — from cache */}
      <Image
        source={{ uri: thumbnailUrl }}
        style={[styles.fullscreen, styles.thumbnail]}
        blurRadius={videoReady ? 0 : 2}
      />

      {/* Video layer — fades in when first frame ready */}
      <Animated.View style={[
        styles.fullscreen, 
        { opacity: videoReady ? 1 : 0 },
        { transition: 'opacity 200ms ease' }
      ]}>
        <VideoTrack trackRef={hostVideoTrack} />
      </Animated.View>

      {/* UI overlay — always visible immediately */}
      <RoomOverlay hostName={hostName} hostAvatar={hostAvatar} />
    </View>
  );
};
```

### Key rules

- **Never show a spinner** blocking room entry. Spinners on navigation are the #1 perceived-latency killer.
- **Never await token fetch before navigating.** Pass the cached token or start the fetch in parallel with navigation.
- **Pre-fetch thumbnails** from feed tiles using `<Image prefetch>` or `Image.prefetch()` in React Native / Capacitor.
- Use `requestAnimationFrame` to defer non-critical UI (comments, gifts, controls) to the frame after the room shell renders.

---

## Section 4 — Viewer-Side Instant Playback

### The serial bottleneck

Default (unoptimized) viewer join sequence:
```
tap → navigate (50ms) → fetch token (300ms) → Room.connect() → 
  TLS handshake (150ms) → signaling WS open → JoinResponse → 
  ICE gathering (100–300ms) → DTLS handshake → first RTP packet → 
  decode → render
```
**Total: 900ms–1.5s minimum** on a good connection.

### Agora's two-phase "join early, subscribe later" pattern

Agora explicitly documents this in their [Optimized video rendering](https://docs.agora.io/en/interactive-live-streaming/best-practices/optimize-frame-rendering_android.md) guide:

```
Solution 2: "Join early, subscribe on demand"
- Join the channel in advance but delay subscribing to the audio and video stream.
- When the user triggers the join operation, subscribe and begin rendering immediately.
```

```kotlin
// Agora pattern: join WITHOUT subscribing
val options = ChannelMediaOptions().apply {
    autoSubscribeAudio = false
    autoSubscribeVideo = false
}
mRtcEngine?.joinChannelEx(token, connection, options, eventHandler)

// Later, when user taps the tile (or on visible threshold):
mRtcEngine?.muteRemoteVideoStreamEx(remoteUid, false, connection)
mRtcEngine?.muteRemoteAudioStreamEx(remoteUid, false, connection)
```

This is documented at: [Agora optimize-frame-rendering (Android)](https://docs.agora.io/en/interactive-live-streaming/best-practices/optimize-frame-rendering_android.md)

Also critical: Agora's `enableInstantMediaRendering()` API:

> "Call `enableInstantMediaRendering` to reduce the time it takes to render the first video frame after joining a channel. Call this method **before** joining a channel. Both host and audience must call this method to benefit."  
> — [Agora optimize-frame-rendering](https://docs.agora.io/en/interactive-live-streaming/best-practices/optimize-frame-rendering_android.md)

### LiveKit equivalent: `autoSubscribe: false` + `setSubscribed(true)` on demand

```typescript
// LiveKit JS — pre-join without subscribing
const room = new Room({ adaptiveStream: true, dynacast: false });

await room.connect(wsUrl, token, {
  autoSubscribe: false  // Join signaling, gather ICE — but don't pull media yet
});

// Room is now connected — signaling WS open, ICE done, DTLS done
// No video data flowing → zero bandwidth

// When user actually taps to enter (or tile becomes front-and-center):
room.remoteParticipants.forEach(participant => {
  participant.trackPublications.forEach(pub => {
    (pub as RemoteTrackPublication).setSubscribed(true);  // Instant — server already ready
  });
});

// Also listen for new publications:
room.on(RoomEvent.TrackPublished, (pub) => {
  (pub as RemoteTrackPublication).setSubscribed(true);
});
```

Per [LiveKit Subscribing to Tracks](https://docs.livekit.io/transport/media/subscribe/#selective-subscription):
> "Disable `autoSubscribe` to take manual control over which tracks the participant should subscribe to."

On Android Kotlin:
```kotlin
room.connect(
    url = url,
    token = token,
    options = ConnectOptions(autoSubscribe = false)
)
// Pre-join complete — connection warm
// On user action:
for (participant in room.remoteParticipants.values) {
  for (publication in participant.trackPublications.values) {
    (publication as RemoteTrackPublication).setSubscribed(true)
  }
}
```

### LiveKit "start at HIGH quality" — eliminating the ramp-up

A critical fix in LiveKit server (PR #4595, merged June 2026):

> "Two changes that together remove the visible low->high quality ramp for a new subscriber: Default a subscriber's initial video layer to HIGH quality by default"  
> — [livekit/livekit PR #4595](https://github.com/livekit/livekit/pull/4595)

This eliminates the typical "blurry for 2s then sharp" behavior. To enable, set `EnableStartAtDesiredQuality: true` on your LiveKit server config (it was gated behind a flag per commit `c6a555b`).

### Thumbnail-to-video crossfade pattern

```
Feed tile shows JPEG thumbnail (cached from CDN)
         │
User taps ──► Navigate to room screen
         │
         ├─► Room shell mounts with same thumbnail full-screen (instant)
         │
         ├─► room.connect() begins in background
         │
         ├─► TrackSubscribed fires → video element receives stream
         │
         └─► CSS opacity crossfade: thumbnail 1→0, video 0→1 over 200ms
```

This gives the illusion of the thumbnail "becoming" the live video — zero blank frames.

---

## Section 5 — Repeat-Entry Zero-Cost

### What state survives vs. what gets recreated

| State Component | Survives disconnect? | Notes |
|---|---|---|
| Token (cached JWT) | ✅ Yes (per TTL) | Reuse if `exp` > now + 10min |
| DNS resolution | ✅ ~60s OS cache | `prepareConnection` re-warms if stale |
| TLS session | ✅ Partial (TLS session resumption, ~10min) | Browser/OS handles |
| Signaling WebSocket | ❌ Destroyed on `Room.disconnect()` | Must reconnect |
| ICE candidates | ❌ Destroyed | Re-gathered on next connect |
| PeerConnection | ❌ Destroyed | New PC per `Room.connect()` |
| DTLS keys | ❌ Destroyed | Re-negotiated |
| Room object | ⚠️ Reusable with caveats | See note below |

**Room object reuse (known issue):** There is an open bug in the Android Kotlin SDK where reconnecting to a **different** room using the same `Room` instance fails:
> "Unable to Connect to Different LiveKit Session After Disconnecting Using Same Room Instance"  
> — [livekit/client-sdk-android Issue #237](https://github.com/livekit/client-sdk-android/issues/237)

**Recommendation:** Use a new `Room` instance per session (or per room switch). The overhead of construction is negligible (<5ms). What matters is having the token cached and `prepareConnection()` called pre-tap.

### Making repeat entry instant

Strategy: **Connection Pool of Pre-Warmed Room objects**

```typescript
// ConnectionPool.ts — maintain 2 pre-warmed rooms at all times
class LiveKitConnectionPool {
  private pool: Room[] = [];
  private readonly POOL_SIZE = 2;

  async initialize(): Promise<void> {
    for (let i = 0; i < this.POOL_SIZE; i++) {
      await this.addToPool();
    }
  }

  private async addToPool(): Promise<void> {
    const room = new Room({ adaptiveStream: true, dynacast: false });
    const token = tokenCache.getViewerToken();
    if (token) {
      // Pre-warm: DNS + TLS only, no signaling
      await room.prepareConnection(WS_URL, token);
    }
    this.pool.push(room);
  }

  acquire(): Room {
    const room = this.pool.pop() ?? new Room();
    // Immediately refill pool in background
    this.addToPool();
    return room;
  }
}

const connectionPool = new LiveKitConnectionPool();

// On feed load:
connectionPool.initialize();

// On tap:
const room = connectionPool.acquire(); // Pre-warmed
await room.connect(WS_URL, token, { autoSubscribe: false });
// First frame time: ~200ms vs ~700ms cold
```

### What the second entry looks like

Second entry (within 5 minutes of leaving, different room):
- Token: already in memory cache → **0ms**
- `prepareConnection` DNS/TLS: already done by pool → **0ms**
- `room.connect()` signaling: ~100ms (WebSocket open + JoinResponse)
- ICE: ~50ms (pool may have pre-gathered)
- First frame after subscribe: ~100ms

**Target: <250ms to first frame on re-entry** — achievable.

---

## Section 6 — No-Reconnect Philosophy

### Do top apps disable auto-reconnect?

Analysis: Bigo/Chamet-class apps use a **split policy**:

| Scenario | Reconnect behavior |
|---|---|
| Network blip (<10s, same session) | Auto-reconnect silently (ICE restart) |
| User explicitly ends stream/call | No reconnect — `Room.disconnect()` called, Room object destroyed |
| User navigates away from room | No reconnect — explicit disconnect |
| App goes to background | Platform-dependent; typically disconnect after 30s |

They do NOT disable auto-reconnect globally. They hide reconnect UI (no spinner, no "connecting" banner) and only show it if reconnection exceeds ~5 seconds.

### LiveKit reconnection behavior

From [LiveKit Connection docs](https://docs.livekit.io/intro/basics/connect/#network-changes-and-reconnection):

> "LiveKit attempts to resume the connection automatically. It reconnects to the signaling WebSocket and initiates an ICE restart. This process usually results in minimal or no disruption."

LiveKit has two modes:
1. **ICE restart** (fast, ~1–3s): same PeerConnection, new ICE candidates
2. **Full reconnect** (slower, 3–10s): emits `Reconnecting` event, then `Reconnected`

### Implementing "end = dead forever" cleanly

```typescript
// Explicit end — no auto-reconnect
const endSession = async (room: Room, reason: 'user_left' | 'call_ended') => {
  // 1. Stop auto-reconnect by marking intent
  room.simulateScenario('disconnected-signal'); // forces clean disconnect
  
  // 2. Disconnect with proper reason
  await room.disconnect();
  
  // 3. Nullify reference — no resurrection possible
  roomRef.current = null;
  
  // 4. Navigate away — React will unmount, useEffect cleanup fires
  navigation.navigate('Feed');
};

// In useEffect cleanup:
useEffect(() => {
  return () => {
    if (roomRef.current) {
      roomRef.current.disconnect(); // Explicit — not network-triggered
      roomRef.current = null;
    }
  };
}, []);
```

For the Kotlin Android SDK:
```kotlin
// Explicit end
viewModelScope.launch {
  room.disconnect()
  // room object is now inert — do NOT reuse for different room (Issue #237)
}
```

The `DisconnectReason` enum in LiveKit protocol (`livekit_models.proto`) includes `CLIENT_INITIATED` — pass this when the user explicitly leaves so server cleans up immediately rather than waiting for timeout.

---

## Section 7 — LiveKit-Specific Levers

### 7.1 `Room.prepareConnection()` — Does it help?

**Yes, significantly.** It handles:
1. DNS resolution + cache warming (saves ~50–100ms on first connect)
2. TLS session establishment + key caching (saves ~100–200ms)
3. For LiveKit Cloud: edge node selection (saves routing latency)

For self-hosted (`wss://livekit.merilive.xyz`): benefits 1 and 2 apply. No edge selection (single server).

**Usage:**
- JS: `await room.prepareConnection(wsUrl, token)`  
  [JS SDK docs](https://docs.livekit.io/client-sdk-js/classes/Room.html)
- Android: `room.prepareConnection(url, token)` (suspend)  
  [Android SDK docs](https://docs.livekit.io/reference/client-sdk-android/livekit-android-sdk/io.livekit.android.room/-room/prepare-connection.html)

Call it **as soon as the room tile is visible**, not on tap.

### 7.2 Persistent Signaling WebSocket Across Rooms

**Not supported in current LiveKit architecture.** Each `Room.connect()` opens a new WebSocket to the SFU. The WebSocket is the signaling channel and is room-scoped — it cannot be shared.

However, the **TLS session** under the WebSocket CAN be reused (via TLS session resumption), which is what `prepareConnection` exploits.

**Alternative — Single Room for sequential users:** If your app architecture allows, you can keep one Room connected with `autoSubscribe: false` and switch the subscription target by calling `setSubscribed(false)` on old tracks and `setSubscribed(true)` on new ones. This works if all rooms are on the same LiveKit server instance. However, it means being "joined" to one room's signaling permanently.

**Practical recommendation:** Use new Room per session + pool of `prepareConnection`-warmed instances. Do NOT try to reuse the same Room across different rooms — known bugs (see Issue #237).

### 7.3 `autoSubscribe`, `adaptiveStream`, `dynacast` Impact

| Option | Default | Impact on First-Frame Latency | Recommendation |
|---|---|---|---|
| `autoSubscribe` | `true` | HIGH — controls when media flows | Set `false` for pre-joined rooms; `true` for direct joins |
| `adaptiveStream` | `false` | LOW on first frame; helps ongoing quality | **Enable** (`true`) — adjusts bitrate to viewport size |
| `dynacast` | `false` (enable with SVC) | For **publishers** — pauses unused layers | Set `true` on publisher/host side; irrelevant for viewers |

From [LiveKit dynacast docs](https://livekit-client-sdk-swift.mintlify.app/advanced/dynacast):
> "Dynacast automatically pauses video layers that aren't being consumed by any subscribers. This significantly reduces publishing CPU and bandwidth usage."

For **viewers**, `adaptiveStream: true` is the key setting — the SDK will request only the video layer that matches the display size, reducing unnecessary decode work and improving time-to-first-rendered-frame.

### 7.4 Token Pre-mint via Edge Function with Long TTL

LiveKit JWT validation (`livekit-server` source):
- Server validates `nbf` (not-before) must be within **±10 seconds** of server clock
- `exp` can be set up to 24 hours (configurable in server YAML: `max_token_ttl`)
- Tokens are stateless JWTs — no server-side token store; revocation requires revoking the API key or closing the room

**Safe TTL recommendation:**
- Viewer tokens (wildcard): **6 hours** — low risk, no publish permissions
- Host tokens (room-specific): **30 minutes** — minted fresh on "Go Live" tap
- Private call tokens: **15 minutes** — minted when call is initiated

**Increase `max_token_ttl` on self-hosted LiveKit server** (`livekit.yaml`):
```yaml
keys:
  your_api_key: your_api_secret

# Allow tokens up to 12 hours
max_token_ttl: 12h
```

### 7.5 `Room.connect()` with Cached ICE Servers

LiveKit sends ICE server configs (STUN/TURN) in the `JoinResponse` over the signaling WebSocket. You cannot bypass this. However, you CAN supply your own ICE servers in `RoomOptions`:

```typescript
const room = new Room({
  rtcConfig: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      // Your known TURN server (avoid the lookup RTT)
    ],
    iceCandidatePoolSize: 2,  // Pre-gather 2 candidates before offer
  },
  adaptiveStream: true,
});
```

Setting `iceCandidatePoolSize: 2` tells the browser to pre-gather ICE candidates immediately on `RTCPeerConnection` construction, before the SDP exchange. This saves 50–150ms in the connection flow.

---

## Section 8 — Agora → LiveKit Translation Table

| Agora Pattern | Agora API | LiveKit Equivalent | LiveKit API/Method |
|---|---|---|---|
| Pre-warm channel | `rtcEngine.preloadChannel(token, channelId, uid)` | Pre-warm connection | `room.prepareConnection(wsUrl, token)` |
| Wildcard token | Wildcard token (any channel) | Wildcard room grant | JWT with `room: "*"` |
| Join without subscribe | `options.autoSubscribeAudio/Video = false` | `autoSubscribe: false` | `ConnectOptions(autoSubscribe: false)` |
| Subscribe on demand | `muteRemoteVideoStreamEx(uid, false, conn)` | Subscribe on demand | `publication.setSubscribed(true)` |
| Instant media rendering | `rtcEngine.enableInstantMediaRendering()` | No direct equivalent; use `iceCandidatePoolSize` + pre-warm | `rtcConfig: { iceCandidatePoolSize: 2 }` |
| Video scenario hint | `setVideoScenario(APPLICATION_SCENARIO_1V1)` | No direct equivalent; use codec + dynacast settings | `VideoCodec.H264` + `dynacast: true` |
| Simulcast / dynacast | Agora simulcast layers | LiveKit simulcast + dynacast | `dynacast: true`, `VideoPreset` layers |
| Adaptive stream | Agora degradation preferences | `adaptiveStream` | `adaptiveStream: true` |
| Engine singleton | `RtcEngine.create()` once, reuse | Room pool pattern | Pool of `new Room()`, each pre-warmed |
| Rendering view pre-setup | `setupRemoteVideoEx()` before join | Attach video element before subscribe | Create `<video>` element, `track.attach(element)` before subscribe fires |
| Fast channel switch | `VideoLoaderAPI` `OnPageScrollEventHandler` | Scroll-triggered `prepareConnection` | Custom scroll listener + `prepareConnection` |
| Start media tracing | `startMediaRenderingTracing()` | Performance mark API | `performance.mark('room-enter')` in `RoomEvent.TrackSubscribed` |
| Reconnect control | `IRtcEngineEventHandler.onConnectionLost` | Room events | `RoomEvent.Reconnecting`, `RoomEvent.Reconnected` |

---

## Section 9 — Prioritized Impact List

Ordered by **impact on perceived entry latency × implementation difficulty ratio**.

### Priority 1 (Highest Impact, Low Complexity)
**`room.prepareConnection()` on scroll/viewport entry**

- Expected savings: **200–400ms** (DNS + TLS)
- Implementation: 1 day
- Where: Feed screen scroll listener; call `prepareConnection(wsUrl, cachedToken)` when tile becomes visible
- Refs: [Flutter prepareConnection](https://docs.livekit.io/reference/client-sdk-flutter/livekit_client/Room/prepareConnection.html), [Android prepareConnection](https://docs.livekit.io/reference/client-sdk-android/livekit-android-sdk/io.livekit.android.room/-room/prepare-connection.html), [JS PR #783](https://github.com/livekit/client-sdk-js/pull/783)

### Priority 2 (Highest Impact, Medium Complexity)
**Token pre-mint at feed load + 6h TTL wildcard viewer token cached in localStorage/SharedPreferences**

- Expected savings: **200–400ms** (eliminates token fetch from critical path)
- Implementation: 2 days (Supabase Edge Function + client cache layer)
- Where: Supabase Edge Function `mint-livekit-token`; client `TokenCache` class
- Refs: [LiveKit Tokens & Grants](https://docs.livekit.io/frontends/reference/tokens-grants/), [Agora wildcard pattern](https://docs.agora.io/en/interactive-live-streaming/best-practices/preload-channels)

### Priority 3 (High Impact, Low Complexity)
**Progressive UI mount: thumbnail-to-video crossfade, never block navigation**

- Expected savings: **300–600ms PERCEIVED** (no actual latency reduction, but eliminates blank screen perception)
- Implementation: 1 day
- Where: `LiveRoomScreen.tsx` — render thumbnail from feed tile cache immediately; fade in video on `TrackSubscribed`
- Refs: [NNGroup Skeleton Screens](https://www.nngroup.com/articles/skeleton-screens/)

### Priority 4 (High Impact, Medium Complexity)
**`autoSubscribe: false` + pre-join pattern for feed browsing**

- Expected savings: **300–500ms** (join+ICE done before user taps; subscribe is <50ms call when already connected)
- Implementation: 3 days
- Where: Implement Agora `VideoLoaderAPI` equivalent — scroll into view → `room.connect(autoSubscribe: false)` → tap → `setSubscribed(true)` for visible rooms
- Refs: [LiveKit subscribe docs](https://docs.livekit.io/transport/media/subscribe/#selective-subscription), [Agora join-early pattern](https://docs.agora.io/en/interactive-live-streaming/best-practices/optimize-frame-rendering_android.md)

### Priority 5 (High Impact, Low Complexity)
**`iceCandidatePoolSize: 2` in `RoomOptions.rtcConfig`**

- Expected savings: **50–150ms** (pre-gathered ICE candidates)
- Implementation: 1 hour (config change only)
- Where: `new Room({ rtcConfig: { iceCandidatePoolSize: 2 } })`
- Refs: [W3C iceCandidatePoolSize spec](https://www.w3.org/TR/webrtc/#dom-rtcconfiguration-icecandidatepoolsize), [Chromium Intent to Ship](https://groups.google.com/a/chromium.org/g/Blink-dev/c/dWXRWoi5ueg)

### Priority 6 (Medium Impact, Low Complexity)
**Enable `adaptiveStream: true` on all viewer Room instances**

- Expected savings: **50–100ms** on first frame (SDK requests appropriately-sized layer immediately; no over-decode)
- Implementation: 1 hour (config change)
- Where: `new Room({ adaptiveStream: true })` for all viewer roles
- Refs: [LiveKit KB — Configuring Client SDK for Optimal Video Quality](https://kb.livekit.io/articles/3859313029-configuring-the-client-sdk-for-optimal-video-quality)

### Priority 7 (High Impact on Quality, Medium Complexity)
**Enable `EnableStartAtDesiredQuality` on LiveKit server config**

- Expected savings: Eliminates 2–3s low-quality-to-high-quality ramp visible to viewers
- Implementation: 1 day (server config + upgrade to server version containing PR #4595)
- Where: `livekit.yaml` server config
- Refs: [LiveKit PR #4595](https://github.com/livekit/livekit/pull/4595), [commit c6a555b](https://github.com/livekit/livekit/commit/c6a555b36527118768c649895fce1134947765f9)

### Priority 8 (High Impact, High Complexity)
**Connection pool: 2 pre-warmed Room objects maintained at all times**

- Expected savings: **300–500ms** on second+ entry (pool has a ready-to-connect Room with DNS/TLS already done)
- Implementation: 4 days (pool lifecycle, memory management, Capacitor bridge)
- Where: `ConnectionPool` singleton initialized at app startup; each `acquire()` gives a pre-warmed Room and immediately refills pool
- Refs: [Agora VideoLoaderAPI](https://github.com/AgoraIO-Community/VideoLoaderAPI), [prepareConnection PR](https://github.com/livekit/client-sdk-js/pull/783)

---

## Summary: Expected Total Latency Reduction

| Baseline (cold, naive) | Optimized (all 8 changes) |
|---|---|
| ~900ms–1.5s to first frame | ~150–300ms to first frame |

Combined impact (non-additive due to parallelism):
- Priorities 1+2: Collapse token fetch + TLS into background → **-400ms from critical path**
- Priority 3: Eliminate perceived blank screen → **-400ms PERCEIVED**
- Priority 4: Pre-join eliminates connect RTT on tap → **-400ms**
- Priority 5: Pre-gathered ICE → **-100ms**
- Priority 6+7: Better first frame quality, no ramp → **quality improvement**
- Priority 8: Pool makes repeat entry near-zero-cost

**Achievable target: First video frame in <300ms** (from tap, on mobile 4G, same city as SFU)

---

## References (Alphabetical)

1. Agora `preloadChannel` API: https://api-ref.agora.io/en/video-sdk/cpp/4.x/API/api_irtcengine_preloadchannel.html
2. Agora Optimized Video Rendering (Android): https://docs.agora.io/en/interactive-live-streaming/best-practices/optimize-frame-rendering_android.md
3. Agora Preload Channels Guide: https://docs.agora.io/en/interactive-live-streaming/best-practices/preload-channels
4. AgoraIO-Community VideoLoaderAPI: https://github.com/AgoraIO-Community/VideoLoaderAPI
5. Chromium Intent — ICE candidate pooling: https://groups.google.com/a/chromium.org/g/Blink-dev/c/dWXRWoi5ueg
6. LiveKit Android prepareConnection: https://docs.livekit.io/reference/client-sdk-android/livekit-android-sdk/io.livekit.android.room/-room/prepare-connection.html
7. LiveKit Android Room Issue #237 (Room reuse bug): https://github.com/livekit/client-sdk-android/issues/237
8. LiveKit client-sdk-js PR #783 (prepareConnection): https://github.com/livekit/client-sdk-js/pull/783
9. LiveKit Connect Basics: https://docs.livekit.io/intro/basics/connect/
10. LiveKit dynacast (Swift SDK): https://livekit-client-sdk-swift.mintlify.app/advanced/dynacast
11. LiveKit dynacast (Android): https://docs.livekit.io/client-sdk-android/livekit-android-sdk/io.livekit.android.room/-room/dynacast.html
12. LiveKit Flutter prepareConnection: https://docs.livekit.io/reference/client-sdk-flutter/livekit_client/Room/prepareConnection.html
13. LiveKit JS Room class: https://docs.livekit.io/client-sdk-js/classes/Room.html
14. LiveKit KB — Optimal Video Quality: https://kb.livekit.io/articles/3859313029-configuring-the-client-sdk-for-optimal-video-quality
15. LiveKit PR #4595 — Start at HIGH quality: https://github.com/livekit/livekit/pull/4595
16. LiveKit protocol DisconnectReason: https://github.com/livekit/protocol/blob/main/protobufs/livekit_models.proto#L333
17. LiveKit RemoteTrackPublication.setSubscribed: https://docs.livekit.io/client-sdk-js/classes/remotetrackpublication.html
18. LiveKit Subscribing to Tracks: https://docs.livekit.io/transport/media/subscribe/
19. LiveKit Tokens & Grants: https://docs.livekit.io/frontends/reference/tokens-grants/
20. NNGroup Skeleton Screens 101: https://www.nngroup.com/articles/skeleton-screens/
21. Pion WebRTC iceCandidatePoolSize Issue #2892: https://github.com/pion/webrtc/issues/2892
22. W3C WebRTC RTCConfiguration.iceCandidatePoolSize: https://www.w3.org/TR/webrtc/#dom-rtcconfiguration-icecandidatepoolsize
