import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Image as ImageIcon, Video } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { resolveAdminStorageImageUrl } from "@/utils/adminStorageImages";

export type AdminMediaKind = "auto" | "image" | "video";

const VIDEO_EXT_RE = /\.(mp4|m4v|mov|qt|webm|ogg|ogv|avi|mkv|3gp|3gpp|3g2|mpg|mpeg|hevc|ts|m3u8|mpd)(?:$|[?#])/i;

export const isAdminVideoUrl = (src?: string | null) => {
  if (!src) return false;
  try {
    const url = new URL(src);
    // Captured face-angle stills were historically uploaded as JPEG blobs with
    // a .webm filename, so extension-only detection renders them as broken video.
    if (url.pathname.includes("/face-angles/")) return false;
    return VIDEO_EXT_RE.test(url.pathname);
  } catch {
    const clean = src.split("?")[0] || src;
    if (clean.includes("/face-angles/")) return false;
    return VIDEO_EXT_RE.test(clean);
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
  if (clean.endsWith(".mp4") || clean.endsWith(".m4v") || clean.endsWith(".hevc")) return "video/mp4";
  if (clean.endsWith(".webm")) return "video/webm";
  if (clean.endsWith(".ogg") || clean.endsWith(".ogv")) return "video/ogg";
  if (clean.endsWith(".mov") || clean.endsWith(".qt")) return "video/quicktime";
  if (clean.endsWith(".3gp") || clean.endsWith(".3gpp")) return "video/3gpp";
  if (clean.endsWith(".3g2")) return "video/3gpp2";
  if (clean.endsWith(".mkv")) return "video/x-matroska";
  if (clean.endsWith(".avi")) return "video/x-msvideo";
  if (clean.endsWith(".mpg") || clean.endsWith(".mpeg")) return "video/mpeg";
  if (clean.endsWith(".ts")) return "video/mp2t";
  if (clean.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (clean.endsWith(".mpd")) return "application/dash+xml";
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
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [displayPoster, setDisplayPoster] = useState<string | null>(poster || null);
  const [resolutionFailed, setResolutionFailed] = useState(false);
  const mediaKind = kind === "auto" ? (isAdminVideoUrl(displaySrc || src) ? "video" : "image") : kind;
  const videoType = useMemo(() => (displaySrc ? getVideoMimeType(displaySrc) : undefined), [displaySrc]);

  useEffect(() => {
    setFailed(false);
    if (!src) {
      setDisplaySrc(null);
      return;
    }
    let cancelled = false;
    setDisplaySrc(null);
    setDisplayPoster(null);
    setResolutionFailed(false);
    (async () => {
      const [resolved, resolvedPoster] = await Promise.all([
        resolveAdminStorageImageUrl(src, "face-verification"),
        resolveAdminStorageImageUrl(poster, "face-verification"),
      ]);
      if (!cancelled) {
        setDisplaySrc(resolved);
        setDisplayPoster(resolvedPoster || null);
        setResolutionFailed(!resolved);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, poster]);

  if (!src) {
    return (
      <div className={cn("flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground", className)}>
        <ImageIcon className="mr-2 h-4 w-4" /> No media
      </div>
    );
  }

  if (resolutionFailed) {
    return (
      <div className={cn("flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center", className)}>
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <p className="text-sm font-medium text-foreground">Media could not be signed for admin preview.</p>
      </div>
    );
  }

  if (!displaySrc) {
    return (
      <div className={cn("flex min-h-32 items-center justify-center rounded-lg border border-border bg-muted/20 text-muted-foreground", className)}>
        <ImageIcon className="mr-2 h-4 w-4 animate-pulse" /> Loading media
      </div>
    );
  }

  if (failed) {
    return (
      <div className={cn("flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center", className)}>
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <p className="text-sm font-medium text-foreground">Media could not be loaded in this browser.</p>
        <a href={displaySrc} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline">
          Open original <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  if (mediaKind === "video") {
    return (
      <div className={cn("overflow-hidden rounded-lg border border-border bg-background", className)}>
        <video
          key={displaySrc}
          controls
          playsInline
          preload="metadata"
          muted={autoPlay}
          autoPlay={autoPlay}
          poster={displayPoster || undefined}
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
          {videoType ? <source src={displaySrc} type={videoType} /> : <source src={displaySrc} />}
        </video>
      </div>
    );
  }

  const image = (
    <img
      key={src}
      src={displaySrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={cn("h-full w-full object-contain", mediaClassName)}
      onError={() => setFailed(true)}
      onLoad={() => setFailed(false)}
    />
  );

  if (!onOpen) {
    return <div className={cn("block overflow-hidden rounded-lg border border-border bg-muted/20", className)}>{image}</div>;
  }

  return (
    <button type="button" onClick={onOpen} className={cn("block overflow-hidden rounded-lg border border-border bg-muted/20 cursor-zoom-in", className)}>
      {image}
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