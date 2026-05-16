import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Image as ImageIcon, Video } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type AdminMediaKind = "auto" | "image" | "video";

const VIDEO_EXT_RE = /\.(mp4|m4v|mov|webm|ogg|ogv|avi|mkv|3gp|3gpp)(?:$|[?#])/i;

export const isAdminVideoUrl = (src?: string | null) => {
  if (!src) return false;
  try {
    const url = new URL(src);
    return VIDEO_EXT_RE.test(url.pathname);
  } catch {
    return VIDEO_EXT_RE.test(src.split("?")[0] || src);
  }
};

const getVideoMimeType = (src: string) => {
  const clean = (() => {
    try {
      return new URL(src).pathname.toLowerCase();
    } catch {
      return src.split("?")[0].toLowerCase();
    }
  })();
  if (clean.endsWith(".mp4") || clean.endsWith(".m4v")) return "video/mp4";
  if (clean.endsWith(".webm")) return "video/webm";
  if (clean.endsWith(".ogg") || clean.endsWith(".ogv")) return "video/ogg";
  if (clean.endsWith(".mov")) return "video/quicktime";
  if (clean.endsWith(".3gp") || clean.endsWith(".3gpp")) return "video/3gpp";
  return undefined;
};

interface AdminMediaFrameProps {
  src?: string | null;
  alt: string;
  kind?: AdminMediaKind;
  poster?: string | null;
  className?: string;
  mediaClassName?: string;
  onOpen?: () => void;
  autoPlay?: boolean;
}

export function AdminMediaFrame({
  src,
  alt,
  kind = "auto",
  poster,
  className,
  mediaClassName,
  onOpen,
  autoPlay = false,
}: AdminMediaFrameProps) {
  const [failed, setFailed] = useState(false);
  const mediaKind = kind === "auto" ? (isAdminVideoUrl(src) ? "video" : "image") : kind;
  const videoType = useMemo(() => (src ? getVideoMimeType(src) : undefined), [src]);

  if (!src) {
    return (
      <div className={cn("flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground", className)}>
        <ImageIcon className="mr-2 h-4 w-4" /> No media
      </div>
    );
  }

  if (failed) {
    return (
      <div className={cn("flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center", className)}>
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <p className="text-sm font-medium text-foreground">Media could not be loaded in this browser.</p>
        <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline">
          Open original <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  if (mediaKind === "video") {
    return (
      <div className={cn("overflow-hidden rounded-lg border border-border bg-background", className)}>
        <video
          key={src}
          controls
          playsInline
          preload="metadata"
          muted={autoPlay}
          autoPlay={autoPlay}
          poster={poster || undefined}
          className={cn("h-full w-full bg-background object-contain", mediaClassName)}
          onError={() => setFailed(true)}
          onLoadedData={() => setFailed(false)}
          controlsList="nodownload"
          {...({
            "webkit-playsinline": "true",
            "x5-video-player-type": "h5",
            "x5-video-player-fullscreen": "false",
          } as Record<string, string>)}
        >
          {videoType ? <source src={src} type={videoType} /> : <source src={src} />}
        </video>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn("block overflow-hidden rounded-lg border border-border bg-muted/20", onOpen && "cursor-zoom-in", className)}
      disabled={!onOpen}
    >
      <img
        key={src}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className={cn("h-full w-full object-contain", mediaClassName)}
        onError={() => setFailed(true)}
        onLoad={() => setFailed(false)}
      />
    </button>
  );
}

interface AdminMediaDialogProps {
  open: boolean;
  src?: string | null;
  title?: string;
  kind?: AdminMediaKind;
  poster?: string | null;
  onOpenChange: (open: boolean) => void;
}

export function AdminMediaDialog({ open, src, title = "Media Preview", kind = "auto", poster, onOpenChange }: AdminMediaDialogProps) {
  const mediaKind = kind === "auto" ? (isAdminVideoUrl(src) ? "video" : "image") : kind;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-5xl border-border bg-background/95 p-2 text-foreground">
        <DialogHeader className="px-2 pb-2">
          <DialogTitle className="flex items-center gap-2 text-sm">
            {mediaKind === "video" ? <Video className="h-4 w-4 text-primary" /> : <ImageIcon className="h-4 w-4 text-primary" />}
            {title}
          </DialogTitle>
        </DialogHeader>
        <AdminMediaFrame
          src={src}
          alt={title}
          kind={mediaKind}
          poster={poster}
          autoPlay={mediaKind === "video"}
          className="max-h-[82dvh] w-full border-0 bg-background"
          mediaClassName="max-h-[82dvh] w-full object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}