/**
 * Pkg114: Host RTMP simulcast UI.
 *
 * Add up to 5 RTMP/RTMPS destinations (YouTube / Facebook / Twitch / Kick /
 * Trovo / custom) and push the live LiveKit room out via room-composite
 * stream egress. Stream keys are MASKED server-side before persisting —
 * never displayed back in full.
 *
 * Server kill-switch: `stream_egress`. Auth: host-only (JWT, owns the
 * `live_streams` row). Zero new Supabase Realtime channels, zero polling.
 */
import { useCallback, useEffect, useState } from "react";
import { Cast, Plus, Square, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  startStreamSimulcast,
  stopStreamSimulcast,
  listMySimulcasts,
  isLikelyRtmpUrl,
} from "@/lib/livekitStreamEgress";

type Layout = "speaker" | "grid" | "single-speaker";

interface ActiveSim {
  egressId: string;
  providers: string[];
  rtmpUrlsMasked: string[];
  startedAt: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  streamId: string | null | undefined;
}

const MAX_URLS = 5;

export function SimulcastDialog({ open, onClose, streamId }: Props) {
  const [urls, setUrls] = useState<string[]>([""]);
  const [layout, setLayout] = useState<Layout>("speaker");
  const [audioOnly, setAudioOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<ActiveSim | null>(null);
  const [recent, setRecent] = useState<any[]>([]);

  const refreshRecent = useCallback(async () => {
    const rows = await listMySimulcasts(10);
    setRecent(rows ?? []);
    // Adopt any still-active row so Stop survives reopen
    const live = (rows ?? []).find((r: any) => r.status === "active" || r.status === "starting");
    if (live && !active) {
      setActive({
        egressId: live.egress_id,
        providers: Array.isArray(live.providers) ? live.providers : [],
        rtmpUrlsMasked: Array.isArray(live.rtmp_urls_masked) ? live.rtmp_urls_masked : [],
        startedAt: live.started_at ? new Date(live.started_at).getTime() : Date.now(),
      });
    }
  }, [active]);

  useEffect(() => {
    if (!open) return;
    refreshRecent();
  }, [open, refreshRecent]);

  const updateUrl = (idx: number, val: string) => {
    setUrls((prev) => prev.map((u, i) => (i === idx ? val : u)));
  };
  const addUrl = () => {
    setUrls((prev) => (prev.length >= MAX_URLS ? prev : [...prev, ""]));
  };
  const removeUrl = (idx: number) => {
    setUrls((prev) => (prev.length === 1 ? [""] : prev.filter((_, i) => i !== idx)));
  };

  const handleStart = useCallback(async () => {
    if (!streamId) return;
    const cleaned = urls.map((u) => u.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      toast.error("Add at least one RTMP URL");
      return;
    }
    const invalid = cleaned.find((u) => !isLikelyRtmpUrl(u));
    if (invalid) {
      toast.error("One of the URLs doesn't look like a valid RTMP URL");
      return;
    }
    setLoading(true);
    try {
      const r = await startStreamSimulcast(streamId, cleaned, { layout, audioOnly });
      if (!r) {
        toast.error("Couldn't start simulcast. Admin may have disabled it.");
        return;
      }
      setActive({
      });
      toast.success(`Simulcasting to ${r.providers.join(", ") || cleaned.length + " destination(s)"}`);
      refreshRecent();
    } finally {
      setLoading(false);
    }
  }, [streamId, urls, layout, audioOnly, refreshRecent]);

  const handleStop = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    const ok = await stopStreamSimulcast(active.egressId);
    setLoading(false);
    if (ok) {
      setActive(null);
      setUrls([""]);
      toast.success("Simulcast stopped");
      refreshRecent();
    } else {
      toast.error("Couldn't stop simulcast");
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
            <Cast className="h-5 w-5 text-amber-500" />
            Simulcast (RTMP)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {!active && (
            <>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  RTMP / RTMPS URLs (max {MAX_URLS})
                </label>
                <div className="space-y-2">
                  {urls.map((u, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        value={u}
                        onChange={(e) => updateUrl(i, e.target.value)}
                        placeholder="rtmps://a.rtmp.youtube.com/live2/STREAM_KEY"
                        disabled={loading}
                        className="text-xs font-mono"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeUrl(i)}
                        disabled={loading}
                        className="h-8 w-8 shrink-0"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addUrl}
                  disabled={loading || urls.length >= MAX_URLS}
                  className="mt-2 h-7 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add destination
                </Button>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Stream keys are masked server-side and never stored in plain text.
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
                  <Cast className="h-4 w-4 mr-2" />
                )}
                Start Simulcast
              </Button>
            </>
          )}

          {active && (
            <div className="space-y-3">
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                  <span className="font-medium">Simulcasting</span>
                  <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground">
                    {active.rtmpUrlsMasked.length} dest
                  </span>
                </div>
                {active.providers.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mb-1">
                    {active.providers.join(" · ")}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {active.rtmpUrlsMasked.map((u, i) => (
                    <li key={i} className="text-[10px] font-mono text-muted-foreground break-all">
                      {u}
                    </li>
                  ))}
                </ul>
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
                Stop Simulcast
              </Button>
            </div>
          )}

          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                Recent simulcasts
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
              <p className="text-[11px] text-muted-foreground italic">No simulcasts yet.</p>
            ) : (
              <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                {recent.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 text-[11px] rounded bg-muted/40 px-2 py-1.5"
                  >
                    <span className="uppercase font-mono text-[10px] text-muted-foreground w-10 truncate">
                      {(r.providers?.[0] || "rtmp")}
                    </span>
                    <span className={`flex-1 ${statusColor(r.status)}`}>
                      {r.status || "pending"}
                      {r.duration_seconds ? ` · ${Math.round(r.duration_seconds)}s` : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {Array.isArray(r.rtmp_urls_masked) ? r.rtmp_urls_masked.length : 0}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SimulcastDialog;
