import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Image as ImageIcon, Loader2, Maximize2, RefreshCw, Video } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { isPrivateAdminStorageReference, resolveAdminStorageImageUrl, resolveAdminStorageObjectUrl } from "@/utils/adminStorageImages";

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

const getImageMimeType = (src: string) => {
  const clean = (() => {
    try {
      return new URL(src).pathname.toLowerCase();
    } catch {
      return src.split("?")[0].toLowerCase();
    }
  })();
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".avif")) return "image/avif";
  if (clean.endsWith(".heic")) return "image/heic";
  if (clean.endsWith(".heif")) return "image/heif";
  return undefined;
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
  if (clean.endsWith(".mov") || clean.endsWith(".qt")) return "video/quicktime";
  if (clean.endsWith(".webm")) return "video/webm";
  if (clean.endsWith(".ogg") || clean.endsWith(".ogv")) return "video/ogg";
  return undefined;
};

const objectUrlMimeTypes = new Map<string, string>();

const resolveBlobMimeType = async (url: string) => {
  if (!url.startsWith("blob:")) return "";
  const cached = objectUrlMimeTypes.get(url);
  if (cached) return cached;
  const response = await fetch(url).catch(() => null);
  const blob = await response?.blob().catch(() => null);
  const type = blob?.type || "";
  if (type) objectUrlMimeTypes.set(url, type);
  return type;
};

const formatMediaTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

interface AdminMediaFrameProps {
  src?: string | null;
  alt: string;
  kind?: AdminMediaKind;
  bucket?: string;
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
  bucket = "face-verification",
  poster,
  className,
  mediaClassName,
  onOpen,
  autoPlay = false,
}: AdminMediaFrameProps) {
  const [failed, setFailed] = useState(false);
  const [failReason, setFailReason] = useState<string>("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [displayPoster, setDisplayPoster] = useState<string | null>(poster || null);
  const [resolutionFailed, setResolutionFailed] = useState(false);
  const isPrivateStorage = isPrivateAdminStorageReference(src, bucket);
  const [blobMimeType, setBlobMimeType] = useState("");
  const [blobMimeChecked, setBlobMimeChecked] = useState(false);
  const rawKind = blobMimeType.startsWith("video/")
    ? "video"
    : blobMimeType.startsWith("image/")
      ? "image"
      : kind === "auto"
        ? (isAdminVideoUrl(src) || (!!displaySrc && !displaySrc.startsWith("blob:") && isAdminVideoUrl(displaySrc)) ? "video" : "image")
        : kind;
  const [imageFallbackFailed, setImageFallbackFailed] = useState(false);
  const mediaKind = rawKind;

  useEffect(() => {
    if (!displaySrc?.startsWith("blob:")) {
      setBlobMimeChecked(false);
      return;
    }
    let cancelled = false;
    setBlobMimeChecked(false);
    resolveBlobMimeType(displaySrc).then((mime) => {
      if (cancelled) return;
      setBlobMimeType(mime);
      setBlobMimeChecked(true);
      if (mime.startsWith("video/") || mime.startsWith("image/")) setFailed(false);
    });
    return () => {
      cancelled = true;
    };
  }, [displaySrc]);

  useEffect(() => {
    setFailed(false);
    setFailReason("");
    setVideoLoading(true);
    setImageFallbackFailed(false);
    setBlobMimeType("");
    setBlobMimeChecked(false);
    setResolutionFailed(false);
    if (!src) {
      setDisplaySrc(null);
      setDisplayPoster(null);
      return;
    }
    let cancelled = false;
    setDisplaySrc(null);
    setDisplayPoster(null);
    (async () => {
      const resolver = bucket === "face-verification" || bucket === "host-verification" || isPrivateStorage
        ? resolveAdminStorageObjectUrl
        : resolveAdminStorageImageUrl;
      const [resolved, resolvedPoster] = await Promise.all([
        resolver(src, bucket),
        resolver(poster, bucket),
      ]);
      if (!cancelled) {
        setDisplaySrc(resolved || src);
        setDisplayPoster(resolvedPoster || null);
        setResolutionFailed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, poster, bucket, retryNonce]);

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
      <div className={cn("flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted/20 text-muted-foreground", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-xs">Resolving signed media URL…</span>
      </div>
    );
  }

  const effectiveMediaKind = displaySrc.startsWith("blob:") && blobMimeChecked && !blobMimeType
    ? (kind === "video" ? "video" : kind === "image" ? "image" : rawKind)
    : mediaKind;

  if (failed) {
    if (displaySrc && !imageFallbackFailed && effectiveMediaKind !== "video") {
      return (
        <div className={cn("block overflow-hidden rounded-lg border border-border bg-muted/20", className)}>
          <img
            key={`image-fallback-${displaySrc}`}
            src={displaySrc}
            alt={alt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className={cn("h-full w-full object-contain", mediaClassName)}
            onError={() => setImageFallbackFailed(true)}
          />
        </div>
      );
    }
    return (
      <div className={cn("flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center", className)}>
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <p className="text-sm font-medium text-foreground">
          {effectiveMediaKind === "video" ? "Video could not be played." : "Media could not be loaded."}
        </p>
        {failReason && <p className="text-[11px] text-muted-foreground">{failReason}</p>}
        {effectiveMediaKind === "video" && (videoDuration > 0 || videoTime > 0) && (
          <div className="flex w-full max-w-xs flex-col gap-1 pt-1">
            <div className="flex items-center justify-between text-[11px] font-semibold tabular-nums text-foreground">
              <span>Stopped at {formatMediaTime(videoTime)}</span>
              <span className="text-muted-foreground">/ {formatMediaTime(videoDuration)}</span>
            </div>
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-destructive"
                style={{ width: videoDuration > 0 ? `${Math.min(100, (videoTime / videoDuration) * 100)}%` : "0%" }}
              />
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => { setFailed(false); setFailReason(""); setVideoLoading(true); setRetryNonce((n) => n + 1); }}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
          {displaySrc && (
            <a href={displaySrc} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90">
              Open original <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    );
  }

  if (effectiveMediaKind === "video") {
    const sourceType = blobMimeType || getVideoMimeType(displaySrc);
    const canOpenOriginal = !displaySrc.startsWith("blob:");
    const requestFullscreen = () => {
      const el = videoElRef.current as any;
      if (!el) return;
      const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitEnterFullscreen || el.msRequestFullscreen;
      if (fn) {
        try { fn.call(el); } catch { /* noop */ }
      }
    };
    return (
      <div className={cn("relative overflow-hidden rounded-lg border border-border bg-black", className)}>
        <video
          key={`${displaySrc}-${retryNonce}`}
          controls
          playsInline
          preload="metadata"
          muted={autoPlay}
          autoPlay={autoPlay}
          poster={displayPoster || undefined}
          className={cn("h-full w-full bg-black object-contain", mediaClassName)}
          onError={(e) => {
            const err = (e.currentTarget as HTMLVideoElement).error;
            const code = err?.code;
            const reason =
              code === 1 ? "Playback aborted."
              : code === 2 ? "Network error while loading video."
              : code === 3 ? "Video is corrupted or cannot be decoded."
              : code === 4 ? "Video format or MIME type not supported by this browser."
              : "Unknown playback error.";
            setFailReason(reason);
            setVideoLoading(false);
            setFailed(true);
          }}
          onLoadStart={() => { setVideoLoading(true); }}
          onWaiting={() => { setVideoLoading(true); }}
          onStalled={() => { setVideoLoading(true); }}
          onLoadedMetadata={(e) => {
            const d = (e.currentTarget as HTMLVideoElement).duration;
            if (Number.isFinite(d) && d > 0) setVideoDuration(d);
          }}
          onDurationChange={(e) => {
            const d = (e.currentTarget as HTMLVideoElement).duration;
            if (Number.isFinite(d) && d > 0) setVideoDuration(d);
          }}
          onTimeUpdate={(e) => {
            setVideoTime((e.currentTarget as HTMLVideoElement).currentTime || 0);
          }}
          onLoadedData={() => { setFailed(false); setVideoLoading(false); }}
          onCanPlay={() => { setFailed(false); setVideoLoading(false); }}
          onPlaying={() => { setVideoLoading(false); }}
          controlsList="nodownload"
          ref={(el) => {
            if (el && el.dataset.adminLoadedSrc !== `${displaySrc}-${retryNonce}`) {
              el.dataset.adminLoadedSrc = `${displaySrc}-${retryNonce}`;
              try { el.load(); } catch { /* noop */ }
            }
          }}
          {...({
            "webkit-playsinline": "true",
            "x5-video-player-type": "h5",
            "x5-video-player-fullscreen": "false",
          } as Record<string, string>)}
        >
          {sourceType ? <source src={displaySrc} type={sourceType} /> : <source src={displaySrc} />}
          {sourceType && <source src={displaySrc} />}
        </video>

        {videoLoading && !failed && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
            <span className="text-[11px] font-medium text-white/90">Loading video…</span>
          </div>
        )}

        {/* Time + progress overlay — visible even when playback fails mid-way */}
        {(videoDuration > 0 || videoTime > 0) && (
          <div className="pointer-events-none absolute bottom-12 left-2 right-2 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 backdrop-blur-sm">
            <span className="text-[11px] font-semibold tabular-nums text-white">
              {formatMediaTime(videoTime)} <span className="text-white/60">/ {formatMediaTime(videoDuration)}</span>
            </span>
            <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/20">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-150"
                style={{ width: videoDuration > 0 ? `${Math.min(100, (videoTime / videoDuration) * 100)}%` : "0%" }}
              />
            </div>
          </div>
        )}


        <div className="absolute top-2 right-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => { setFailed(false); setFailReason(""); setVideoLoading(true); setRetryNonce((n) => n + 1); }}
            className="inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium text-white hover:bg-black/85"
            title="Reload video"
          >
            <RefreshCw className="h-3 w-3" /> Reload
          </button>
          {canOpenOriginal && (
            <a
              href={displaySrc}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium text-white hover:bg-black/85"
              title="Open video in new tab"
            >
              <ExternalLink className="h-3 w-3" /> Open
            </a>
          )}
        </div>
      </div>
    );
  }

  const image = (
    <img
      key={displaySrc}
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
  bucket?: string;
  poster?: string | null;
  onOpenChange: (open: boolean) => void;
}

export function AdminMediaDialog({ open, src, title = "Media Preview", kind = "auto", bucket = "face-verification", poster, onOpenChange }: AdminMediaDialogProps) {
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
          bucket={bucket}
          poster={poster}
          autoPlay={mediaKind === "video"}
          className="max-h-[82dvh] w-full border-0 bg-background"
          mediaClassName="max-h-[82dvh] w-full object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}