import { useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Crown, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { hardenVideoElementForNative } from "@/utils/videoNativeHardening";

interface ParticipantVideoProps {
  stream: MediaStream | null;
  displayName: string | null;
  avatarUrl: string | null;
  isHost: boolean;
  isSelf: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
  position: number;
  roomType: 'video' | 'audio' | 'game';
}

export function ParticipantVideo({
  stream,
  displayName,
  avatarUrl,
  isHost,
  isSelf,
  isMuted = false,
  isVideoOff = false,
  position,
  roomType,
}: ParticipantVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream) {
      // Avoid re-attaching the same MediaStream (causes flash + audio glitch)
      if (el.srcObject !== stream) {
        hardenVideoElementForNative(el, { muted: isSelf });
        el.srcObject = stream;
        el.play().catch(e => console.log("Video play error:", e));
      }
    } else if (el.srcObject) {
      // Clear stale frame when stream goes away
      try { el.pause(); } catch {}
      el.srcObject = null;
    }
    return () => {
      // On unmount, release the MediaStream reference to avoid leaks
      if (el && el.srcObject) {
        try { el.pause(); } catch {}
        el.srcObject = null;
      }
    };
  }, [stream, isSelf]);

  const showVideo = roomType === 'video' && stream && !isVideoOff;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: position * 0.05, type: 'spring', damping: 24, stiffness: 320 }}
      className={cn(
        "relative overflow-hidden transition-all",
        roomType === 'audio'
          ? "aspect-square rounded-2xl"
          : "aspect-[9/16] rounded-3xl",
        "bg-gradient-to-br from-slate-900/70 to-black/50 backdrop-blur-sm border border-white/10"
      )}
      style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
    >
      {/* Pkg167: host live-ring pulse */}
      {isHost && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 pointer-events-none z-[3] animate-[tileLivePulse_1.6s_ease-in-out_infinite]",
            roomType === 'audio' ? "rounded-2xl" : "rounded-3xl"
          )}
        />
      )}

      <div className="w-full h-full relative flex flex-col items-center justify-center">
        {/* Loading shimmer (under video) */}
        {showVideo && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none overflow-hidden z-0"
            style={{ background: 'linear-gradient(135deg, #1a1024 0%, #0c0818 100%)' }}
          >
            <div
              className="absolute inset-y-0 w-1/3 animate-[tileShimmer_1.8s_ease-in-out_infinite]"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.18), transparent)', filter: 'blur(8px)' }}
            />
          </div>
        )}

        {/* Video or Avatar */}
        {showVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isSelf}
            controls={false}
            disablePictureInPicture
            disableRemotePlayback
            controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
            poster=""
            // @ts-ignore
            x5-video-player-type="h5"
            x5-video-player-fullscreen="false"
            webkit-playsinline="true"
            className={cn(
              "absolute inset-0 w-full h-full object-cover z-[1]",
              isSelf && "transform scale-x-[-1]"
            )}
            style={{ touchAction: 'none', pointerEvents: 'none', objectPosition: 'center center', WebkitTouchCallout: 'none', WebkitAppearance: 'none' } as React.CSSProperties}
          />
        ) : (
          <Avatar className={cn(
            "border-2",
            roomType === 'audio' ? "w-12 h-12" : "w-16 h-16",
            isHost ? "border-yellow-400" : "border-purple-400"
          )}>
            <AvatarImage src={avatarUrl || undefined} />
            <AvatarFallback className="bg-purple-600 text-white text-xl">
              {displayName?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
        )}

        {/* Pkg167: cinematic edge vignette */}
        {showVideo && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none z-[2]"
            style={{
              background: 'radial-gradient(120% 90% at 50% 50%, transparent 58%, rgba(0,0,0,0.4) 100%)',
              mixBlendMode: 'multiply',
            }}
          />
        )}

        {/* Host Badge */}
        {isHost && (
          <div className="absolute top-2 left-2 z-[4]">
            <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0 shadow-lg">
              <Crown className="w-3 h-3 mr-1" />
              {isSelf ? 'You' : 'Host'}
            </Badge>
          </div>
        )}

        {/* Mic indicator */}
        <div className={cn(
          "absolute bottom-2 right-2 w-6 h-6 rounded-full flex items-center justify-center z-[4] shadow-md",
          isMuted ? "bg-red-500" : "bg-emerald-500"
        )}>
          {isMuted ? (
            <MicOff className="w-3 h-3 text-white" />
          ) : (
            <Mic className="w-3 h-3 text-white" />
          )}
        </div>

        {/* Name */}
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/85 to-transparent z-[4]">
          <p className="text-white text-xs font-medium truncate text-center">
            {isSelf ? 'You' : (displayName || 'User')}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
