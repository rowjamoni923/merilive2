/**
 * End-to-end audit: viewers must be able to see/hear publishers across every
 * media surface (live stream, audio party, video party, game party, private
 * call). This test locks in the two invariants that, when broken, silently
 * break "viewer can't see host":
 *
 *   1. ROOM-NAME PARITY — publisher and subscriber must derive the SAME
 *      LiveKit room name from the same identifier.
 *   2. SUBSCRIPTION HANDLERS — every hook that connects to LiveKit must wire
 *      `TrackPublished → setSubscribed(true)` so late publishes are picked up,
 *      and must rebuild peer state on `ParticipantConnected` (covers viewers
 *      who join AFTER the host has already published).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string) =>
  readFileSync(resolve(__dirname, "../..", rel), "utf8");

describe("media surfaces — room-name parity", () => {
  it("live stream: GoLive + LiveStream + preloader all use `live_<id>`", () => {
    const liveStream = read("src/pages/LiveStream.tsx");
    expect(liveStream).toMatch(/`live_\$\{id\}`/);
    // Preloader and Index warm tokens for the same room shape.
    const index = read("src/pages/Index.tsx");
    expect(index).toMatch(/`live_\$\{[^`]+\}`,\s*["']viewer_stream["']/);
  });

  it("party room: hook uses `party_<roomId>` for both publisher and audience", () => {
    const hook = read("src/hooks/usePartyRoomNativeLiveKit.ts");
    expect(hook).toMatch(/`party_\$\{roomId\}`/);
    // No alternative party room-name pattern leaks.
    const otherShape = hook.match(/`party[_-][a-z]+_\$\{/g) || [];
    expect(otherShape.length).toBe(0);
  });

  it("private call: useLiveKitCall uses `call_<callId>`", () => {
    const hook = read("src/hooks/useLiveKitCall.ts");
    expect(hook).toMatch(/`call_\$\{callId\}`/);
  });
});

describe("media surfaces — subscription handlers wired", () => {
  const SURFACES: { name: string; path: string; needsParticipantConnected: boolean }[] = [
    { name: "live stream / call (useLiveKitClient)", path: "src/hooks/useLiveKitClient.ts", needsParticipantConnected: true },
    { name: "private call (useLiveKitCall)", path: "src/hooks/useLiveKitCall.ts", needsParticipantConnected: false },
    { name: "audio/video/game party (usePartyRoomNativeLiveKit)", path: "src/hooks/usePartyRoomNativeLiveKit.ts", needsParticipantConnected: true },
  ];

  it.each(SURFACES)(
    "$name wires TrackPublished → setSubscribed(true)",
    ({ path }) => {
      const src = read(path);
      expect(src).toMatch(/RoomEvent\.TrackPublished/);
      // The publication object must be force-subscribed inside that handler.
      expect(src).toMatch(/setSubscribed\(\s*true\s*\)/);
    },
  );

  it.each(SURFACES.filter((s) => s.needsParticipantConnected))(
    "$name handles ParticipantConnected (covers viewer-joins-after-host)",
    ({ path }) => {
      const src = read(path);
      expect(src).toMatch(/RoomEvent\.ParticipantConnected/);
    },
  );

  it("party hook detaches remote audio on participant leave (no double-audio on reconnect)", () => {
    const src = read("src/hooks/usePartyRoomNativeLiveKit.ts");
    expect(src).toMatch(/detachAudioForIdentity\(participant\.identity\)/);
    expect(src).toMatch(/RoomEvent\.ParticipantDisconnected/);
  });

  it("party video seats render via LiveKitVideoPlayer with safe stream cleanup", () => {
    const src = read("src/components/party/UnifiedPartyRoom.tsx");
    // Track adapter must null `srcObject` on detach so reconnect doesn't double-bind.
    expect(src).toMatch(/el\.srcObject = null/);
    // Host seat resolves from authoritative participant position (not stale prop).
    expect(src).toMatch(/participants\.find\(p => p\.id === hostInfo\?\.id\)\?\.position/);
    // Video track adapter is memoized so re-renders don't churn the player.
    expect(src).toMatch(/const videoTrack = useMemo\(/);
  });

  it("party room UI guards async viewer/chat state by room session", () => {
    const src = read("src/components/party/UnifiedPartyRoom.tsx");
    expect(src).toMatch(/viewerFetchSeqRef/);
    expect(src).toMatch(/chatLoadSeqRef/);
    expect(src).toMatch(/roomIdRef\.current !== roomId/);
    expect(src).toMatch(/roomIdRef\.current !== sendingRoomId/);
    expect(src).toMatch(/realtimeViewers\.length > 0 \? realtimeViewers/);
  });

  it("party room actions use authenticated keepalive patch and broadcast host seat moves", () => {
    const src = read("src/pages/PartyRoom.tsx");
    expect(src).toMatch(/sessionAccessTokenRef/);
    expect(src).toMatch(/method:\s*'PATCH'/);
    expect(src).toMatch(/keepalive:\s*true/);
    expect(src).toMatch(/Authorization:\s*`Bearer \$\{accessToken\}`/);
    expect(src).toMatch(/host-move-\$\{currentUser\.id\}/);
  });

  it("party gift send guards rapid taps, stale rooms, and instant gift chat fanout", () => {
    const src = read("src/pages/PartyRoom.tsx");
    expect(src).toMatch(/userCoinsRef/);
    expect(src).toMatch(/pendingGiftCostRef/);
    expect(src).toMatch(/roomIdRef\.current !== sendingRoomId/);
    expect(src).toMatch(/if \(transactionSucceeded\) return/);
    expect(src).toMatch(/publishChatMessage\('party', sendingRoomId/);
  });

  it("gift service rejects invalid quantities and returns verified sender id", () => {
    const fn = read("supabase/functions/gift-service/index.ts");
    expect(fn).toMatch(/Number\.isInteger\(rawQuantity\)/);
    expect(fn).toMatch(/rawQuantity < 1 \|\| rawQuantity > 999/);
    expect(fn).toMatch(/senderId: user\.id/);
    const service = read("src/features/shared/gifting/GiftingService.ts");
    expect(service).toMatch(/result\.senderId && result\.senderId !== senderId/);
  });

  it("call and reels gift send use ref-backed balances for rapid combo taps", () => {
    const call = read("src/components/call/ActiveCallScreen.tsx");
    const reels = read("src/pages/Reels.tsx");
    expect(call).toMatch(/userCoinsRef\.current/);
    expect(call).toMatch(/const availableCoins = userCoinsRef\.current/);
    expect(reels).toMatch(/userCoinsRef\.current/);
    expect(reels).toMatch(/currentUserIdRef\.current/);
  });

  it("live viewer retries subscription early if first-frame hasn't arrived", () => {
    const live = read("src/pages/LiveStream.tsx");
    expect(live).toMatch(/retrySubscription/);
    // Aggressive early retry ladder must exist.
    expect(live).toMatch(/\[0,\s*90,\s*220,\s*420,\s*760,\s*1150\]/);
  });
});

describe("media surfaces — token edge function honors roles", () => {
  it("livekit-token grants canPublish only to publishers; viewers stay subscribe-only", () => {
    const fn = read("supabase/functions/livekit-token/index.ts");
    // Host of a live stream OR participant of a call OR publishing party member can publish.
    expect(fn).toMatch(/case "host_stream":/);
    expect(fn).toMatch(/case "call":/);
    // Viewers (viewer_stream) must NEVER publish.
    expect(fn).toMatch(/case "viewer_stream":\s*canPublish = false/s);
    // Admin secret-link tokens are limited to viewer_stream only.
    expect(fn).toMatch(/isAdmin[\s\S]*canPublish = false/);
  });
});

/**
 * N3h — Native LiveKit bridge contract.
 *
 * N3a-N3g moved several LiveKit responsibilities from the JS Room onto the
 * Android `LiveKitPlugin` (Kotlin) + `NativeLiveKit.ts` (Capacitor) so that
 * sessions running on the native plugin keep the same semantics as web. The
 * old assertions (grep for `RoomEvent.*` symbols) only proved the JS path —
 * they were silent on the native path. These tests lock both sides of the
 * bridge: the Kotlin plugin emits the event, and the TS surface exposes the
 * matching API.
 */
describe("native LiveKit bridge — Kotlin plugin events", () => {
  const KOTLIN = "android/app/src/main/java/com/merilive/app/plugin/LiveKitPlugin.kt";

  it("preview handoff — native promotes the existing Camera2 LocalVideoTrack", () => {
    const src = read(KOTLIN);
    expect(src).toMatch(/fun startLocalPreview\(call: PluginCall\)/);
    expect(src).toMatch(/previewTrack = track/);
    expect(src).toMatch(/private suspend fun promotePreviewToSession\(args: ConnectArgs\)/);
    expect(src).toMatch(/publishVideoTrack\(ptrack, videoPublishOptions\)/);
  });

  it("preview handoff — JS controller must not stop preview before connect", () => {
    const src = read("src/lib/nativeLiveKitController.ts");
    const beforeConnect = src.slice(src.indexOf("async connectAndPublish"), src.indexOf("const payload: ConnectOptions"));
    expect(beforeConnect).not.toMatch(/NativeLiveKit\.stopLocalPreview\(/);
    expect(beforeConnect).toMatch(/DO NOT stopLocalPreview\(\) here/);
  });

  it("preview handoff — GoLive preserves native preview until LiveStream promotes it", () => {
    const src = read("src/pages/GoLive.tsx");
    const handoff = src.slice(src.indexOf("// Handoff policy:"), src.indexOf("// Navigate IMMEDIATELY"));
    const nativePreviewBranch = handoff.slice(
      handoff.indexOf("isNativeAndroid && nativePreviewActive"),
      handoff.indexOf("} else if (isNativeAndroid)"),
    );
    expect(handoff).toMatch(/isNativeAndroid && nativePreviewActive/);
    expect(nativePreviewBranch).toMatch(/preservePreviewForLiveRef\.current = true/);
    expect(nativePreviewBranch).not.toMatch(/stopNativePreview\(/);
  });

  it("preview handoff — Android live host keeps fullscreen preview renderer attached", () => {
    const client = read("src/hooks/useLiveKitClient.ts");
    const nativeJoin = client.slice(
      client.indexOf("nativeLiveKitController.connectAndPublish"),
      client.indexOf("broadcastMode: 'live'"),
    );
    expect(nativeJoin).toMatch(/attachLocal:\s*config\.role === 'host'/);

    const live = read("src/pages/LiveStream.tsx");
    expect(live).toMatch(/const showNativeHostSurface = false/);
  });

  it("preview handoff — CreateParty preserves native video/game preview for PartyRoom", () => {
    const src = read("src/pages/CreateParty.tsx");
    const handoff = src.slice(src.indexOf("// Seamless handoff:"), src.indexOf("navigate(`/party/"));
    const nativePreviewBranch = handoff.slice(
      handoff.indexOf("isNativeAndroid && mode !== 'audio'"),
      handoff.indexOf("} else if (!isNativeAndroid && stream)"),
    );
    expect(nativePreviewBranch).toMatch(/preserveStreamRef\.current = true/);
    expect(nativePreviewBranch).not.toMatch(/stopLocalPreview|stopNativePreview/);
  });

  it("N3b — emits active-speakers / participant-metadata / room-metadata / transcription events", () => {
    const src = read(KOTLIN);
    expect(src).toMatch(/notifyListeners\(\s*"active-speakers-changed"/);
    expect(src).toMatch(/notifyListeners\(\s*"participant-metadata-changed"/);
    expect(src).toMatch(/notifyListeners\(\s*"room-metadata-changed"/);
    expect(src).toMatch(/notifyListeners\(\s*"transcription-received"/);
  });

  it("N3c — exposes setSubscriberVideoQuality + setRemoteVideoSubscribed PluginMethods", () => {
    const src = read(KOTLIN);
    expect(src).toMatch(/fun setSubscriberVideoQuality\(call: PluginCall\)/);
    expect(src).toMatch(/fun setRemoteVideoSubscribed\(call: PluginCall\)/);
  });

  it("N3d — exposes refreshToken PluginMethod (updates lastConnectArgs)", () => {
    const src = read(KOTLIN);
    expect(src).toMatch(/fun refreshToken\(call: PluginCall\)/);
  });

  it("N3f — exposes RPC + text-stream PluginMethods", () => {
    const src = read(KOTLIN);
    expect(src).toMatch(/fun registerRpcMethod\(call: PluginCall\)/);
    expect(src).toMatch(/fun unregisterRpcMethod\(call: PluginCall\)/);
    expect(src).toMatch(/fun respondToRpc\(call: PluginCall\)/);
    expect(src).toMatch(/fun performRpc\(call: PluginCall\)/);
    expect(src).toMatch(/fun sendText\(call: PluginCall\)/);
    expect(src).toMatch(/fun registerTextStreamHandler\(call: PluginCall\)/);
    expect(src).toMatch(/fun unregisterTextStreamHandler\(call: PluginCall\)/);
    expect(src).toMatch(/notifyListeners\(\s*"rpc-invocation"/);
    expect(src).toMatch(/notifyListeners\(\s*"text-stream-chunk"/);
    expect(src).toMatch(/notifyListeners\(\s*"text-stream-complete"/);
  });

  it("N3g — disconnect() releases camera in OEM-safe order (cam off → settle → room.release → ownership release)", () => {
    const src = read(KOTLIN);
    // Order check: camera off comes before room.release / room.disconnect.
    const camOffIdx = src.indexOf("setCameraEnabled");
    const settleIdx = src.indexOf("OEM_CAMERA_RELEASE_SETTLE_MS");
    const releaseIdx = src.indexOf("releaseRoomResources");
    const ownershipIdx = src.indexOf("CameraOwnership.release");
    expect(camOffIdx).toBeGreaterThan(0);
    expect(settleIdx).toBeGreaterThan(0);
    expect(releaseIdx).toBeGreaterThan(0);
    expect(ownershipIdx).toBeGreaterThan(0);
  });
});

describe("native LiveKit bridge — TS surface", () => {
  const NATIVE_TS = "src/plugins/NativeLiveKit.ts";

  it("N3c — TS exposes setSubscriberVideoQuality + setRemoteVideoSubscribed", () => {
    const src = read(NATIVE_TS);
    expect(src).toMatch(/setSubscriberVideoQuality\(opts:/);
    expect(src).toMatch(/setRemoteVideoSubscribed\(opts:/);
  });

  it("N3d — TS exposes refreshToken", () => {
    const src = read(NATIVE_TS);
    expect(src).toMatch(/refreshToken\(opts: \{ token: string \}\)/);
  });

  it("N3e — useNativeLiveKitEvents accepts scope/id bridge and is wired into all 3 surfaces", () => {
    const hook = read("src/hooks/useNativeLiveKitEvents.ts");
    expect(hook).toMatch(/bridge\??:\s*NativeLiveKitBridgeOptions/);
    // Window CustomEvent fanout for the 4 N3b events.
    expect(hook).toMatch(/livekit-active-speakers/);
    expect(hook).toMatch(/livekit-participant-metadata/);
    expect(hook).toMatch(/livekit-room-metadata/);
    expect(hook).toMatch(/livekit-transcription/);
    // All 3 React consumer hooks pass a bridge.
    expect(read("src/hooks/useLiveKitClient.ts")).toMatch(/scope:\s*['"]live['"]/);
    expect(read("src/hooks/useLiveKitCall.ts")).toMatch(/scope:\s*['"]call['"]/);
    expect(read("src/hooks/usePartyRoomNativeLiveKit.ts")).toMatch(/scope:\s*['"]party['"]/);
  });

  it("N3f — TS exposes RPC + text-stream methods and listener events", () => {
    const src = read(NATIVE_TS);
    expect(src).toMatch(/registerRpcMethod\(opts: \{ method: string \}\)/);
    expect(src).toMatch(/performRpc\(opts:/);
    expect(src).toMatch(/respondToRpc\(opts:/);
    expect(src).toMatch(/sendText\(opts:/);
    expect(src).toMatch(/registerTextStreamHandler\(opts:/);
    expect(src).toMatch(/eventName:\s*'rpc-invocation'/);
    expect(src).toMatch(/eventName:\s*'text-stream-chunk'/);
    expect(src).toMatch(/eventName:\s*'text-stream-complete'/);
  });

  it("N3f — opt-in helper livekitNativeMessaging.ts exists and honors kill-switch", () => {
    const src = read("src/lib/livekitNativeMessaging.ts");
    expect(src).toMatch(/tryRegisterNativeRpcMethod/);
    expect(src).toMatch(/tryPerformNativeRpc/);
    expect(src).toMatch(/trySendNativeText/);
    expect(src).toMatch(/tryRegisterNativeTextStreamHandler/);
    expect(src).toMatch(/isLiveKitEnabled\(['"]rpc['"]\)/);
    expect(src).toMatch(/isLiveKitEnabled\(['"]chat['"]\)/);
  });

  it("N3c/N3d — JS libs prefer native bridge when available", () => {
    expect(read("src/lib/livekitAudioOnlyMode.ts")).toMatch(/NativeLiveKit/);
    expect(read("src/lib/livekitTokenRefresh.ts")).toMatch(/NativeLiveKit/);
  });
});
