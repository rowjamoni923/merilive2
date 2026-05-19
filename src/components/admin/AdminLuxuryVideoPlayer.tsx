import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Maximize2, Pause, Play, RefreshCw, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminLuxuryVideoPlayerProps {
  src: string;
  poster?: string | null;
  mimeType?: string;
  className?: string;
  mediaClassName?: string;
  autoPlay?: boolean;
  canOpenOriginal?: boolean;
  onRetry?: () => void;
  onError?: (reason: string) => void;
  onTimeUpdate?: (current: number, duration: number) => void;
  retryKey?: string | number;
}

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const t = Math.floor(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

const SPEEDS = [0.5, 1, 1.5, 2];

export function AdminLuxuryVideoPlayer({
  src,
  poster,
  mimeType,
  className,
  mediaClassName,
  autoPlay = false,
  canOpenOriginal = true,
  onRetry,
  onError,
  onTimeUpdate,
  retryKey,
}: AdminLuxuryVideoPlayerProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hideTimer = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(autoPlay);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);

  // Reset on src/retry change
  useEffect(() => {
    setPlaying(false);
    setHasStarted(false);
    setLoading(true);
    setCurrent(0);
    setDuration(0);
    setBuffered(0);
  }, [src, retryKey]);

  const showAndAutohide = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    if (playing && !scrubbing) {
      hideTimer.current = window.setTimeout(() => setShowControls(false), 2400);
    }
  }, [playing, scrubbing]);

  useEffect(() => () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setHasStarted(true)).catch(() => {});
    } else {
      v.pause();
    }
  }, []);

  const seekTo = useCallback((pct: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    v.currentTime = Math.max(0, Math.min(v.duration, (pct / 100) * v.duration));
  }, []);

  const handleScrub = useCallback((clientX: number, rect: DOMRect) => {
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    seekTo(pct);
  }, [seekTo]);

  const onBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setScrubbing(true);
    const rect = e.currentTarget.getBoundingClientRect();
    handleScrub(e.clientX, rect);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onBarPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    handleScrub(e.clientX, rect);
  };
  const onBarPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setScrubbing(false);
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  const requestFullscreen = () => {
    const el = wrapRef.current as any;
    if (!el) return;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (fn) { try { fn.call(el); } catch { /* noop */ } }
  };

  const cycleSpeed = () => {
    const v = videoRef.current;
    if (!v) return;
    const idx = SPEEDS.indexOf(rate);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    v.playbackRate = next;
    setRate(next);
  };

  const skip = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
  };

  const pct = duration > 0 ? (current / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-amber-500/30 bg-black shadow-[0_8px_32px_-12px_rgba(251,191,36,0.35)]",
        className,
      )}
      onMouseMove={showAndAutohide}
      onMouseLeave={() => playing && !scrubbing && setShowControls(false)}
    >
      <video
        ref={videoRef}
        key={`${src}-${retryKey ?? ""}`}
        playsInline
        preload="metadata"
        muted={muted}
        autoPlay={autoPlay}
        poster={poster || undefined}
        className={cn("h-full w-full bg-black object-contain", mediaClassName)}
        onClick={togglePlay}
        onPlay={() => { setPlaying(true); setHasStarted(true); showAndAutohide(); }}
        onPause={() => { setPlaying(false); setShowControls(true); }}
        onLoadStart={() => setLoading(true)}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onLoadedData={() => setLoading(false)}
        onPlaying={() => setLoading(false)}
        onLoadedMetadata={(e) => {
          const d = (e.currentTarget as HTMLVideoElement).duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onDurationChange={(e) => {
          const d = (e.currentTarget as HTMLVideoElement).duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget as HTMLVideoElement;
          setCurrent(el.currentTime || 0);
          try {
            const b = el.buffered;
            if (b.length > 0) setBuffered(b.end(b.length - 1));
          } catch { /* noop */ }
          onTimeUpdate?.(el.currentTime || 0, el.duration || 0);
        }}
        onVolumeChange={(e) => {
          const el = e.currentTarget as HTMLVideoElement;
          setMuted(el.muted);
          setVolume(el.volume);
        }}
        onError={(e) => {
          const err = (e.currentTarget as HTMLVideoElement).error;
          const code = err?.code;
          const reason =
            code === 1 ? "Playback aborted."
            : code === 2 ? "Network error while loading video."
            : code === 3 ? "Video is corrupted or cannot be decoded."
            : code === 4 ? "Video format not supported."
            : "Unknown playback error.";
          setLoading(false);
          onError?.(reason);
        }}
        controlsList="nodownload"
        {...({ "webkit-playsinline": "true", "x5-video-player-type": "h5" } as Record<string, string>)}
      >
        {mimeType ? <source src={src} type={mimeType} /> : <source src={src} />}
      </video>

      {/* Center play button — large poster-style overlay before first play */}
      {!hasStarted && !loading && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/20 via-transparent to-black/40 transition-opacity"
          aria-label="Play video"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-black shadow-[0_8px_32px_-4px_rgba(251,191,36,0.6)] ring-4 ring-white/20 transition-transform group-hover:scale-110">
            <Play className="h-9 w-9 fill-current" />
          </span>
        </button>
      )}

      {/* Loading spinner */}
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 backdrop-blur-sm">
          <Loader2 className="h-7 w-7 animate-spin text-amber-400" />
          <span className="text-[11px] font-medium text-white/90">Buffering…</span>
        </div>
      )}

      {/* Top-right utility actions */}
      <div className={cn(
        "absolute right-2 top-2 flex items-center gap-1 transition-opacity",
        showControls ? "opacity-100" : "opacity-0",
      )}>
        <button
          type="button"
          onClick={() => onRetry?.()}
          className="inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-md hover:bg-black/90"
          title="Reload"
        >
          <RefreshCw className="h-3 w-3" /> Reload
        </button>
        {canOpenOriginal && (
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-md hover:bg-black/90"
            title="Open in new tab"
          >
            <ExternalLink className="h-3 w-3" /> Open
          </a>
        )}
      </div>

      {/* Bottom luxury control bar */}
      <div className={cn(
        "absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-2.5 pt-6 transition-opacity",
        showControls ? "opacity-100" : "opacity-0",
      )}>
        {/* Seek bar */}
        <div
          className="group/seek relative h-2 cursor-pointer touch-none"
          onPointerDown={onBarPointerDown}
          onPointerMove={onBarPointerMove}
          onPointerUp={onBarPointerUp}
          onPointerCancel={onBarPointerUp}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/15">
            <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${bufPct}%` }} />
            <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-400 to-amber-500" style={{ width: `${pct}%` }} />
          </div>
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 opacity-0 shadow-[0_0_12px_rgba(251,191,36,0.7)] transition-opacity group-hover/seek:opacity-100"
            style={{ left: `${pct}%` }}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className="rounded-full bg-amber-500/90 p-1.5 text-black shadow-md hover:bg-amber-400"
            title={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          </button>

          <button
            type="button"
            onClick={() => skip(-5)}
            className="rounded-md p-1 text-white/85 hover:bg-white/10 hover:text-white"
            title="Back 5s"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <div className="flex items-center gap-1.5 pl-1">
            <button
              type="button"
              onClick={() => {
                const v = videoRef.current; if (!v) return;
                v.muted = !v.muted;
              }}
              className="rounded-md p-1 text-white/85 hover:bg-white/10 hover:text-white"
              title={muted ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = videoRef.current; if (!v) return;
                const val = Number(e.target.value);
                v.volume = val;
                v.muted = val === 0;
              }}
              className="h-1 w-16 cursor-pointer accent-amber-400"
            />
          </div>

          <span className="ml-1 select-none text-[11px] font-semibold tabular-nums text-white">
            {fmt(current)} <span className="text-white/55">/ {fmt(duration)}</span>
          </span>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={cycleSpeed}
              className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/20"
              title="Playback speed"
            >
              {rate}×
            </button>
            <button
              type="button"
              onClick={requestFullscreen}
              className="rounded-md p-1 text-white/85 hover:bg-white/10 hover:text-white"
              title="Fullscreen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
