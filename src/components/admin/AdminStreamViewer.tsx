import { useEffect, useRef, useState } from "react";
import { getLiveKitToken } from "@/services/livekitService";
import { Room, RoomEvent, Track, RemoteTrackPublication, RemoteParticipant } from "livekit-client";
import { Volume2, VolumeX, Maximize, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hardenVideoElementForNative } from "@/utils/videoNativeHardening";

interface Props {
  streamId: string;
  roomName: string;
  hostName: string;
  onClose: () => void;
}

export default function AdminStreamViewer({ streamId, roomName, hostName, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [muted, setMuted] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      try {
        const { token, url } = await getLiveKitToken(roomName, "viewer_stream", `admin-monitor-${Date.now()}`);
        if (cancelled) return;

        const room = new Room({
          // CRYSTAL CLEAR: No adaptive downgrade
          adaptiveStream: false,
          dynacast: false,
          disconnectOnPageLeave: false,
          reconnectPolicy: {
            nextRetryDelayInMs: (context) => {
              return context.retryCount < 3 ? 500 : null;
            },
          },
        });
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
          if (track.kind === Track.Kind.Video && videoRef.current) {
            hardenVideoElementForNative(videoRef.current, { muted: true });
            track.attach(videoRef.current);
          }
          if (track.kind === Track.Kind.Audio) {
            const audioEl = track.attach();
            audioEl.muted = true; // start muted
            document.body.appendChild(audioEl);
          }
        });

        room.on(RoomEvent.ParticipantConnected, () => {
          setViewerCount(room.remoteParticipants.size);
        });
        room.on(RoomEvent.ParticipantDisconnected, () => {
          setViewerCount(room.remoteParticipants.size);
        });

        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) setStatus("error");
        });

        await room.connect(url, token);
        if (cancelled) { room.disconnect(); return; }

        setStatus("connected");
        setViewerCount(room.remoteParticipants.size);

        // Attach existing tracks
        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((pub) => {
            if (pub.track && pub.track.kind === Track.Kind.Video && videoRef.current) {
              hardenVideoElementForNative(videoRef.current, { muted: true });
              pub.track.attach(videoRef.current);
            }
          });
        });

      } catch (err) {
        console.error("Admin viewer connect error:", err);
        if (!cancelled) setStatus("error");
      }
    };

    connect();

    return () => {
      cancelled = true;
      roomRef.current?.disconnect();
    };
  }, [roomName]);

  const toggleMute = () => {
    const audioEls = document.querySelectorAll("audio");
    audioEls.forEach(el => el.muted = !muted);
    setMuted(!muted);
  };

  const toggleFullscreen = () => {
    videoRef.current?.requestFullscreen?.();
  };

  return (
    <div className="relative w-full aspect-video bg-black flex items-center justify-center min-h-[300px]">
      {status === "connecting" && (
        <div className="flex flex-col items-center gap-3 text-white/70">
          <div className="w-8 h-8 border-3 border-white/40 border-t-white rounded-full animate-spin" />
          <p className="text-sm">Connecting to {hostName}'s stream...</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-3 text-white/70">
          <p className="text-sm">Stream ended or unavailable</p>
          <Button variant="outline" size="sm" className="text-white border-white/30" onClick={onClose}>
            Close
          </Button>
        </div>
      )}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        controls={false}
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
        // @ts-ignore
        x5-video-player-type="h5"
        x5-video-player-fullscreen="false"
        webkit-playsinline="true"
        x-webkit-airplay="deny"
        className={`w-full h-full object-contain pointer-events-none ${status !== "connected" ? "hidden" : ""}`}
        style={{ touchAction: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
      />

      {status === "connected" && (
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-2 text-white/80 text-xs">
            <Users className="w-3.5 h-3.5" />
            <span>{viewerCount} viewers</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition">
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button onClick={toggleFullscreen} className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition">
              <Maximize className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
