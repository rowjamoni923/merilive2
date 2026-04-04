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
    if (videoRef.current && stream) {
      hardenVideoElementForNative(videoRef.current, { muted: isSelf });
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(e => console.log("Video play error:", e));
    }
  }, [stream, isSelf]);

  const showVideo = roomType === 'video' && stream && !isVideoOff;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: position * 0.05 }}
      className={cn(
        "relative overflow-hidden transition-all",
        roomType === 'audio' 
          ? "aspect-square rounded-2xl" 
          : "aspect-[3/4] rounded-3xl",
        "bg-gradient-to-br from-slate-900/60 to-black/40 backdrop-blur-sm border border-white/10"
      )}
    >
      <div className="w-full h-full relative flex flex-col items-center justify-center">
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
              "absolute inset-0 w-full h-full object-cover",
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

        {/* Host Badge */}
        {isHost && (
          <div className="absolute top-2 left-2">
            <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0 shadow-lg">
              <Crown className="w-3 h-3 mr-1" />
              {isSelf ? 'You' : 'Host'}
            </Badge>
          </div>
        )}

        {/* Mic indicator */}
        <div className={cn(
          "absolute bottom-2 right-2 w-6 h-6 rounded-full flex items-center justify-center",
          isMuted ? "bg-red-500" : "bg-green-500"
        )}>
          {isMuted ? (
            <MicOff className="w-3 h-3 text-white" />
          ) : (
            <Mic className="w-3 h-3 text-white" />
          )}
        </div>

        {/* Video off — no icon, just subtle text */}

        {/* Name */}
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-white text-xs font-medium truncate text-center">
            {isSelf ? 'You' : (displayName || 'User')}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
