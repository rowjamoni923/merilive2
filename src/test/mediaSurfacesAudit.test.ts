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
    const hook = read("src/hooks/usePartyRoomWebRTC.ts");
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
    { name: "audio/video/game party (usePartyRoomWebRTC)", path: "src/hooks/usePartyRoomWebRTC.ts", needsParticipantConnected: true },
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
    const src = read("src/hooks/usePartyRoomWebRTC.ts");
    expect(src).toMatch(/detachAudioForIdentity\(participant\.identity\)/);
    expect(src).toMatch(/RoomEvent\.ParticipantDisconnected/);
  });

  it("party video seats use effect cleanup instead of callback-ref timers", () => {
    const src = read("src/components/party/UnifiedPartyRoom.tsx");
    expect(src).toMatch(/const videoRef = useRef<HTMLVideoElement \| null>\(null\)/);
    expect(src).toMatch(/timers\.forEach\(clearTimeout\)/);
    expect(src).toMatch(/el\.srcObject = null/);
    expect(src).toMatch(/participants\.find\(p => p\.id === hostInfo\?\.id\)\?\.position/);
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
    expect(fn).toMatch(/roomType === "host_stream"/);
    expect(fn).toMatch(/roomType === "call"/);
    // Viewers (viewer_stream) must NEVER publish.
    expect(fn).not.toMatch(/roomType === "viewer_stream".*canPublish\s*=\s*true/);
    // Admin secret-link tokens are limited to viewer_stream only.
    expect(fn).toMatch(/isAdminBypass && roomType !== "viewer_stream"/);
  });
});
