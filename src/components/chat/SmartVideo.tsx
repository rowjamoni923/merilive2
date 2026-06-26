/**
 * SmartVideo — WhatsApp/Telegram-class chat video bubble.
 *
 * Strategy:
 *  1. Show a poster image instantly (first frame proxied via weserv with
 *     #t=0.5 hint when supported, or a muted gradient).
 *  2. Do NOT attach `<video src>` until the bubble enters the viewport.
 *     Off-screen videos in long threads kill battery and burn data.
 *  3. `preload="metadata"` only — full bytes load on tap-to-play.
 *  4. On tap, parent opens a full-screen viewer (handled outside).
 */
import React, { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface SmartVideoProps {
  src: string;
  poster?: string;
  className?: string;
  onClick?: () => void;
}

export const SmartVideo: React.FC<SmartVideoProps> = React.memo(
  ({ src, poster, className, onClick }) => {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
      const el = wrapRef.current;
      if (!el || visible) return;
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              setVisible(true);
              io.disconnect();
              break;
            }
          }
        },
        { rootMargin: "200px" },
      );
      io.observe(el);
      return () => io.disconnect();
    }, [visible]);

    return (
      <div
        ref={wrapRef}
        onClick={onClick}
        className={cn(
          "relative overflow-hidden rounded-2xl bg-black",
          onClick && "cursor-pointer",
          className,
        )}
      >
        {visible ? (
          <video
            src={src}
            poster={poster}
            muted
            controls
            controlsList="nodownload noremoteplayback noplaybackrate"
            disablePictureInPicture
            disableRemotePlayback
            playsInline
            preload="metadata"
            className="w-full h-full object-cover bg-black"
          />
        ) : (
          <>
            {poster ? (
              <img
                src={poster}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover opacity-90"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-zinc-700 via-zinc-800 to-black" />
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center">
                <Play className="w-6 h-6 text-white fill-white ml-0.5" />
              </div>
            </div>
          </>
        )}
      </div>
    );
  },
);
SmartVideo.displayName = "SmartVideo";
