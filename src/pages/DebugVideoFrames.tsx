/**
 * DebugVideoFrames — visual QA page for camera framing.
 *
 * Opens the local camera once and mirrors it into every representative
 * portrait surface used across the app:
 *   - GoLive full-screen preview
 *   - LiveStream host tile
 *   - ActiveCall primary + PiP
 *   - Party seat tile (video party)
 *   - Game party small seat
 *
 * Each tile uses the same production pattern: one real camera video filling
 * the whole surface with `object-cover`. No blurred duplicate, no letterbox.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type Tile = {
  key: string;
  label: string;
  wrapperClass: string;
  mirror?: boolean;
};

const TILES: Tile[] = [
  { key: "golive",   label: "GoLive preview (full)",       wrapperClass: "w-[260px] h-[462px]",  mirror: true },
  { key: "live",     label: "LiveStream host",             wrapperClass: "w-[220px] h-[391px]",  mirror: true },
  { key: "call-pri", label: "ActiveCall primary",          wrapperClass: "w-[200px] h-[356px]",  mirror: true },
  { key: "call-pip", label: "ActiveCall PiP",              wrapperClass: "w-[110px] h-[155px]",  mirror: true },
  { key: "seat",     label: "Party video seat",            wrapperClass: "w-[140px] h-[249px]",  mirror: true },
  { key: "game",     label: "Game party small seat",       wrapperClass: "w-[96px] h-[170px]",   mirror: true },
];

export default function DebugVideoFrames() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGuides, setShowGuides] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        setStream(s);
      } catch (e: any) {
        setError(e?.message || "Camera failed");
      }
    })();
    return () => {
      cancelled = true;
      setStream((prev) => { prev?.getTracks().forEach((t) => t.stop()); return null; });
    };
  }, []);

  const trackInfo = useMemo(() => {
    const t = stream?.getVideoTracks()[0];
    const s = t?.getSettings?.() as MediaTrackSettings | undefined;
    if (!s) return null;
    return { w: s.width, h: s.height, ratio: s.width && s.height ? (s.width / s.height).toFixed(3) : "?" };
  }, [stream]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Video Frame Debug</h1>
          <p className="text-xs text-white/60">
            Same camera rendered in every portrait surface used by GoLive / LiveStream / Call / Party / Game.
          </p>
        </div>
        <Link to="/" className="text-xs px-3 py-1.5 rounded-full bg-white/10 border border-white/15">Home</Link>
      </header>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />
          Frame guides
        </label>
        {trackInfo && (
          <span className="ml-auto text-white/60">
            Sensor: {trackInfo.w}×{trackInfo.h} (ratio {trackInfo.ratio}) — target 9:16 ≈ 0.563
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 text-red-200 text-sm p-3">
          Camera error: {error}
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        {TILES.map((tile) => (
          <FrameTile
            key={tile.key}
            tile={tile}
            stream={stream}
            showGuides={showGuides}
          />
        ))}
      </div>

      <div className="text-[11px] text-white/50 leading-relaxed max-w-xl">
        Pass criteria: the actual camera fills every tile edge-to-edge, with no black bars and no blur layer.
      </div>
    </div>
  );
}

function FrameTile({
  tile, stream, showGuides,
}: {
  tile: Tile;
  stream: MediaStream | null;
  showGuides: boolean;
}) {
  const mainRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = mainRef.current;
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
    }
  }, [stream]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-white/15 bg-black flex items-center justify-center",
          tile.wrapperClass,
        )}
      >
        {/* Main video — real camera fills the full surface. */}
        <video
          ref={mainRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover pointer-events-none z-[1]"
          style={{
            objectFit: "cover",
            objectPosition: "center center",
            transform: tile.mirror ? "scaleX(-1)" : undefined,
          }}
        />

        {/* Guides */}
        {showGuides && (
          <>
            <div className="absolute inset-0 border-2 border-emerald-400/60 rounded-2xl pointer-events-none z-[2]" />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-emerald-400/40 z-[2]" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-emerald-400/40 z-[2]" />
          </>
        )}
      </div>
      <div className="text-[10px] text-white/70 text-center">{tile.label}</div>
      <div className="text-[9px] text-white/40">{tile.wrapperClass.replace("w-[", "").replace("] h-[", " × ").replace("]", "")}</div>
    </div>
  );
}
