/**
 * Pkg111 + Pkg126: Host recording UI.
 *
 * Single dialog for both formats:
 *  - MP4 (Pkg111 room-composite, single downloadable file)
 *  - HLS (Pkg126 .m3u8 + .ts, browser-playable)
 *
 * Server kill-switches: `egress` (MP4) / `hls_egress` (HLS). Layout +
 * audio-only toggle map straight to the edge fn payloads. Tracks the in-flight
 * egressId locally so Stop works without an extra fetch. Recent recordings
 * list is read-only from `stream_recordings` (RLS-owned).
 *
 * Pkg112 webhook finalizes status/duration/size async — no polling here.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Square,
  Loader2,
  RefreshCw,
  Film,
  Radio as RadioIcon,
  Mic,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  startStreamRecording,
  stopStreamRecording,
  listMyRecordings,
} from "@/lib/livekitEgress";
import {
  startStreamHlsRecording,
  stopStreamHlsRecording,
} from "@/lib/livekitHlsEgress";

type RecFormat = "mp4" | "hls";
type Layout = "speaker" | "grid" | "single-speaker";

interface ActiveRec {
  egressId: string;
  format: RecFormat;
  url: string | null;
  startedAt: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  streamId: string | null | undefined;
}

export function RecordingDialog({ open, onClose, streamId }: Props) {
  const [format, setFormat] = useState<RecFormat>("mp4");
  const [layout, setLayout] = useState<Layout>("speaker");
  const [audioOnly, setAudioOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<ActiveRec | null>(null);
  const [recent, setRecent] = useState<any[]>([]);

  const refreshRecent = useCallback(async () => {
    const rows = await listMyRecordings(10);
    setRecent(rows ?? []);
  }, []);

  useEffect(() => {
    if (!open) return;
    refreshRecent();
  }, [open, refreshRecent]);

  const handleStart = useCallback(async () => {
    if (!streamId) return;
    setLoading(true);
    try {
      if (format === "mp4") {
        const r = await startStreamRecording(streamId, { layout, audioOnly });
        if (!r) {
          toast.error("Couldn't start recording. Admin may have disabled it.");
          return;
        }
        setActive({
          egressId: r.egressId,
          format: "mp4",
          url: r.fileUrl,
          startedAt: Date.now(),
        });
        toast.success(r.alreadyRecording ? "Recording already running" : "Recording started");
      } else {
        const r = await startStreamHlsRecording(streamId, { layout, audioOnly });
        if (!r) {
          toast.error("Couldn't start HLS recording. Admin may have disabled it.");
          return;
        }
        setActive({
          egressId: r.egressId,
          format: "hls",
          url: r.playlistUrl,
          startedAt: Date.now(),
        });
        toast.success(r.alreadyRecording ? "HLS recording already running" : "HLS recording started");
      }
      refreshRecent();
    } finally {
      setLoading(false);
    }
  }, [streamId, format, layout, audioOnly, refreshRecent]);

  const handleStop = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    const ok = active.format === "mp4"
      ? await stopStreamRecording(active.egressId)
      : await stopStreamHlsRecording(active.egressId);
    setLoading(false);
    if (ok) {
      setActive(null);
      toast.success("Recording stopped — finalizing");
      refreshRecent();
    } else {
      toast.error("Couldn't stop recording");
    }
  }, [active, refreshRecent]);

  const statusColor = (s: string | null | undefined) => {
    if (!s) return "text-muted-foreground";
    if (s === "completed") return "text-emerald-500";
    if (s === "failed" || s === "aborted") return "text-rose-500";
    if (s === "active" || s === "starting") return "text-sky-500";
    return "text-muted-foreground";
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="h-5 w-5 text-fuchsia-500" />
            Record Live Stream
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {!active && (
            <>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Format
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={format === "mp4" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFormat("mp4")}
                    disabled={loading}
                  >
                    <Film className="h-4 w-4 mr-2" />
                    MP4 (download)
                  </Button>
                  <Button
                    variant={format === "hls" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFormat("hls")}
                    disabled={loading}
                  >
                    <RadioIcon className="h-4 w-4 mr-2" />
                    HLS (replay)
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {format === "mp4"
                    ? "Single MP4 file — best for archive / download."
                    : "Browser-playable .m3u8 + .ts segments — best for replay UI."}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Layout
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["speaker", "grid", "single-speaker"] as Layout[]).map((l) => (
                    <Button
                      key={l}
                      variant={layout === l ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLayout(l)}
                      disabled={loading || audioOnly}
                      className="capitalize text-xs"
                    >
                      {l === "single-speaker" ? "Solo" : l}
                    </Button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={audioOnly}
                  onChange={(e) => setAudioOnly(e.target.checked)}
                  disabled={loading}
                  className="h-4 w-4"
                />
                <Mic className="h-4 w-4 text-muted-foreground" />
                <span>Audio-only</span>
              </label>

              <Button
                onClick={handleStart}
                disabled={loading || !streamId}
                className="w-full"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Film className="h-4 w-4 mr-2" />
                )}
                Start Recording
              </Button>
            </>
          )}

          {active && (
            <div className="space-y-3">
              <div className="rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                  <span className="font-medium">Recording in progress</span>
                  <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground">
                    {active.format}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground break-all">
                  Egress ID: <span className="font-mono">{active.egressId.slice(0, 16)}…</span>
                </p>
              </div>

              <Button
                onClick={handleStop}
                disabled={loading}
                variant="destructive"
                className="w-full"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Square className="h-4 w-4 mr-2" />
                )}
                Stop Recording
              </Button>
            </div>
          )}

          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                Recent recordings
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshRecent}
                className="h-6 px-2"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
            {recent.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">No recordings yet.</p>
            ) : (
              <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                {recent.map((r) => {
                  const url = r.file_url || r.playlist_url;
                  const fmt = r.format || (r.playlist_url ? "hls" : "mp4");
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 text-[11px] rounded bg-muted/40 px-2 py-1.5"
                    >
                      <span className="uppercase font-mono text-[10px] text-muted-foreground w-7">
                        {fmt}
                      </span>
                      <span className={`flex-1 ${statusColor(r.status)}`}>
                        {r.status || "pending"}
                        {r.duration_seconds ? ` · ${Math.round(r.duration_seconds)}s` : ""}
                      </span>
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Open
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default RecordingDialog;
