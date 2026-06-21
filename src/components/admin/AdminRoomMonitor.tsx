/**
 * AdminRoomMonitor — invisible admin viewer for multi-publisher rooms
 * (party rooms + private calls).
 *
 * Invariant (industry standard, Bigo/Chamet/Agora pattern):
 *   • LiveKit token forced hidden=true via getLiveKitToken(asAdmin=true)
 *   • canPublish=false, canPublishData=false (server side)
 *   • Identity prefix `admin-monitor-{ts}` (server overrides to admin-{role}-{uuid})
 *   • NEVER writes to party_room_participants, call_events, stream_viewers
 *   • NEVER sends chat / gift / data messages
 *   • Other participants get NO ParticipantConnected event (LiveKit SFU strips
 *     hidden participants from peer notifications)
 *
 * Renders a tile per remote participant with a video track. Audio
 * starts muted and is mixed into the page only when admin toggles unmute.
 */
import { useEffect, useRef, useState } from "react";
import { getLiveKitToken } from "@/services/livekitService";
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
} from "livekit-client";
import { Volume2, VolumeX, Users, EyeOff } from "lucide-react";
import { hardenVideoElementForNative } from "@/utils/videoNativeHardening";

interface Props {
  roomName: string;
  roomType: "party" | "call";
  label: string;
  onClose: () => void;
}

interface ParticipantTile {
  identity: string;
  name: string;
  videoTrack: RemoteTrack | null;
  hasAudio: boolean;
}

export default function AdminRoomMonitor({ roomName, roomType, label, onClose }: Props) {
  const roomRef = useRef<Room | null>(null);
  const audioElsRef = useRef<HTMLAudioElement[]>([]);
  const videoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [muted, setMuted] = useState(true);
  const [tiles, setTiles] = useState<ParticipantTile[]>([]);

  useEffect(() => {
    let cancelled = false;

    const refreshTiles = (room: Room) => {
      const next: ParticipantTile[] = [];
      room.remoteParticipants.forEach((p) => {
        // Defensive: never show another admin monitor in the grid.
        if (p.identity.startsWith("admin-")) return;
        let videoTrack: RemoteTrack | null = null;
        let hasAudio = false;
        p.trackPublications.forEach((pub) => {
          if (pub.track?.kind === Track.Kind.Video && !videoTrack) {
            videoTrack = pub.track;
          }
          if (pub.track?.kind === Track.Kind.Audio) {
            hasAudio = true;
          }
        });
        next.push({
          identity: p.identity,
          name: p.name || p.identity.slice(0, 8),
          videoTrack,
          hasAudio,
        });
      });
      setTiles(next);
    };

    const attachAudio = (track: RemoteTrack, currentMuted: boolean) => {
      const el = track.attach() as HTMLAudioElement;
      el.muted = currentMuted;
      el.autoplay = true;
      document.body.appendChild(el);
      audioElsRef.current.push(el);
    };

    const connect = async () => {
      try {
        const { token, url } = await getLiveKitToken(
          roomName,
          roomType,
          `admin-monitor-${Date.now()}`,
          true,           // hidden
          undefined,
          true            // asAdmin
        );
        if (cancelled) return;

        const room = new Room({
          adaptiveStream: false,
          dynacast: false,
          disconnectOnPageLeave: false,
          reconnectPolicy: {
            nextRetryDelayInMs: (ctx) => (ctx.retryCount < 3 ? 500 : null),
          },
        });
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) {
            attachAudio(track as RemoteTrack, muted);
          }
          if (!cancelled) refreshTiles(room);
        });
        room.on(RoomEvent.TrackUnsubscribed, () => {
          if (!cancelled) refreshTiles(room);
        });
        room.on(RoomEvent.ParticipantConnected, () => {
          if (!cancelled) refreshTiles(room);
        });
        room.on(RoomEvent.ParticipantDisconnected, () => {
          if (!cancelled) refreshTiles(room);
        });
        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) setStatus("error");
        });

        await room.connect(url, token);
        if (cancelled) {
          room.disconnect();
          return;
        }

        setStatus("connected");

        // Attach any tracks already subscribed at connect-time.
        room.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach((pub) => {
            if (pub.track?.kind === Track.Kind.Audio) {
              attachAudio(pub.track as RemoteTrack, true);
            }
          });
        });
        refreshTiles(room);
      } catch (err) {
        console.error("[AdminRoomMonitor] connect error", err);
        if (!cancelled) setStatus("error");
      }
    };

    connect();

    return () => {
      cancelled = true;
      audioElsRef.current.forEach((el) => {
        try { el.pause(); el.remove(); } catch { /* ignore */ }
      });
      audioElsRef.current = [];
      videoElsRef.current.clear();
      roomRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, roomType]);

  // Attach video tracks to their tiles imperatively whenever tiles change.
  useEffect(() => {
    tiles.forEach((tile) => {
      const el = videoElsRef.current.get(tile.identity);
      if (el && tile.videoTrack) {
        hardenVideoElementForNative(el, { muted: true });
        try { tile.videoTrack.attach(el); } catch { /* ignore */ }
      }
    });
  }, [tiles]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    audioElsRef.current.forEach((el) => { el.muted = next; });
  };

  const tileCount = tiles.length;
  const gridCols = tileCount <= 1 ? "grid-cols-1" : tileCount === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3";

  return (
    <div className="relative w-full bg-black flex flex-col min-h-[320px]">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/90 border-b border-slate-700">
        <div className="flex items-center gap-2 text-white/90 text-xs font-medium">
          <EyeOff className="w-3.5 h-3.5 text-amber-400" />
          <span>Invisible Admin Monitor · {label}</span>
        </div>
        <div className="flex items-center gap-2 text-white/70 text-xs">
          <Users className="w-3.5 h-3.5" />
          <span>{tileCount} publisher{tileCount === 1 ? "" : "s"}</span>
          <button
            onClick={toggleMute}
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition ml-2"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {status === "connecting" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/70 py-12">
          <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-sm">Connecting invisibly to {label}...</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/70 py-12">
          <p className="text-sm">Room ended or unavailable</p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md border border-white/30 text-white text-sm hover:bg-white/10"
          >
            Close
          </button>
        </div>
      )}

      {status === "connected" && (
        <div className="flex-1 p-2">
          {tileCount === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 text-white/60 py-16">
              <p className="text-sm">Connected — no publishers in the room yet.</p>
              <p className="text-[11px]">You are invisible to participants.</p>
            </div>
          ) : (
            <div className={`grid ${gridCols} gap-2`}>
              {tiles.map((tile) => (
                <div
                  key={tile.identity}
                  className="relative aspect-video bg-slate-950 rounded overflow-hidden border border-slate-800"
                >
                  {tile.videoTrack ? (
                    <video
                      ref={(el) => {
                        if (el) videoElsRef.current.set(tile.identity, el);
                        else videoElsRef.current.delete(tile.identity);
                      }}
                      autoPlay
                      playsInline
                      muted
                      controls={false}
                      disablePictureInPicture
                      disableRemotePlayback
                      controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
                      className="w-full h-full object-cover pointer-events-none"
                      style={{ touchAction: "none" } as React.CSSProperties}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-white/40 text-xs">
                      {tile.hasAudio ? "audio only" : "no video"}
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1 right-1 px-2 py-0.5 bg-black/60 rounded text-[11px] text-white truncate">
                    {tile.name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
