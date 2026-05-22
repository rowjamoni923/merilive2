/**
 * Pkg136 UI — Admin LiveKit Egress Ops Dashboard.
 *
 * Read-only inspection of all LiveKit egress jobs (Pkg111 MP4 / Pkg126 HLS /
 * Pkg114 RTMP simulcast / Pkg113 Track / Pkg129 Auto-record) + the one safe
 * mid-stream mutation: layout swap.
 *
 * Server kill-switch: app_settings.livekit_signaling_enabled.egress_ops
 * Backend: livekit-egress-ops edge fn (Pkg136) — admin-only via x-admin-access-token.
 *
 * Adheres to admin no-auto-refresh policy (Pkg39) + $1400-rule.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Film,
  RefreshCw,
  Loader2,
  Search,
  Eye,
  Layout,
  Clock,
  X,
  CheckCircle2,
  Radio,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  listLiveKitEgress,
  getLiveKitEgress,
  updateLiveKitEgressLayout,
  type LiveKitEgressSummary,
  type LiveKitEgressLayout,
} from "@/lib/livekitEgressOps";

const LAYOUTS: LiveKitEgressLayout[] = [
  "speaker",
  "speaker-dark",
  "speaker-light",
  "grid",
  "grid-dark",
  "grid-light",
  "single-speaker",
  "single-speaker-dark",
  "single-speaker-light",
];

function statusBadge(status: string | null) {
  const s = (status || "").toLowerCase();
  const color = s.includes("active") || s.includes("starting")
    ? "bg-emerald-500"
    : s.includes("end") || s.includes("complete")
      ? "bg-slate-500"
      : s.includes("fail") || s.includes("abort")
        ? "bg-red-500"
        : "bg-amber-500";
  return <Badge className={`${color} text-white text-[10px]`}>{status || "—"}</Badge>;
}

function kindOf(e: LiveKitEgressSummary): "MP4" | "HLS" | "RTMP" | "TRACK" | "?" {
  if (e.segmentResults?.length) return "HLS";
  if (e.streamResults?.length) return "RTMP";
  if (e.fileResults?.length) return "MP4";
  return "?";
}

function formatBytes(n: number | null): string {
  if (!n || n < 0) return "—";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds < 0) return "—";
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function AdminLiveKitEgress() {
  const [items, setItems] = useState<LiveKitEgressSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [detail, setDetail] = useState<LiveKitEgressSummary | null>(null);
  const [layoutChoice, setLayoutChoice] = useState<LiveKitEgressLayout>("speaker");
  const [applyingLayout, setApplyingLayout] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listLiveKitEgress({ active: activeOnly });
      setItems(list);
    } catch (e: any) {
      const msg = String(e?.message || e || "");
      if (/egress_ops_disabled/i.test(msg)) {
        toast.error("Kill-switch 'egress_ops' is OFF. Enable in Pricing Hub → LiveKit.");
      } else {
        toast.error(`Failed to load egress jobs: ${msg || "unknown"}`);
      }
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openDetail = useCallback(async (e: LiveKitEgressSummary) => {
    setDetail(e);
    setLayoutChoice("speaker");
    if (!e.egressId) return;
    try {
      const fresh = await getLiveKitEgress(e.egressId);
      if (fresh) setDetail(fresh);
    } catch {
      /* keep stale */
    }
  }, []);

  const applyLayout = useCallback(async () => {
    if (!detail?.egressId) return;
    setApplyingLayout(true);
    try {
      const updated = await updateLiveKitEgressLayout(detail.egressId, layoutChoice);
      if (updated) setDetail(updated);
      toast.success(`Layout → ${layoutChoice}`);
      fetchList();
    } catch (e: any) {
      toast.error(`Layout swap failed: ${e?.message || "unknown"}`);
    } finally {
      setApplyingLayout(false);
    }
  }, [detail, layoutChoice, fetchList]);

  const stats = useMemo(() => {
    const t = { total: items.length, mp4: 0, hls: 0, rtmp: 0, track: 0, active: 0 };
    for (const e of items) {
      const k = kindOf(e);
      if (k === "MP4") t.mp4++;
      else if (k === "HLS") t.hls++;
      else if (k === "RTMP") t.rtmp++;
      else if (k === "TRACK") t.track++;
      const s = (e.status || "").toLowerCase();
      if (s.includes("active") || s.includes("starting")) t.active++;
    }
    return t;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (e) =>
        (e.egressId || "").toLowerCase().includes(q) ||
        (e.roomName || "").toLowerCase().includes(q) ||
        (e.status || "").toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-0 admin-content">
      <div className="bg-gradient-to-r from-rose-500 via-orange-500 to-amber-500 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Film className="w-6 h-6" />
              LiveKit Egress
            </h1>
            <p className="text-white/80 text-xs sm:text-sm mt-1">
              Pkg136 — every active recording / HLS / RTMP simulcast job. Kill-switch
              <code className="ml-1 px-1.5 py-0.5 rounded bg-black/20 text-[10px]">
                egress_ops
              </code>
              .
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setActiveOnly((v) => !v)}
              variant="outline"
              className="border-white/30 text-white hover:bg-white/20"
            >
              {activeOnly ? "Show all" : "Active only"}
            </Button>
            <Button
              onClick={fetchList}
              variant="outline"
              disabled={loading}
              className="border-white/30 text-white hover:bg-white/20"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Total</p>
            <p className="text-white font-bold text-xl">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Active</p>
            <p className="text-emerald-400 font-bold text-xl">{stats.active}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">MP4</p>
            <p className="text-rose-400 font-bold text-xl">{stats.mp4}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">HLS</p>
            <p className="text-amber-400 font-bold text-xl">{stats.hls}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">RTMP</p>
            <p className="text-fuchsia-400 font-bold text-xl">{stats.rtmp}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Track</p>
            <p className="text-sky-400 font-bold text-xl">{stats.track}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search egress id / room / status…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-slate-900 border-slate-600 text-white placeholder:text-slate-400 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-12 text-center">
            <Film className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400">No egress jobs.</p>
            <p className="text-slate-500 text-xs mt-2">
              Recordings / HLS / RTMP simulcasts will appear here when running.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => {
            const kind = kindOf(e);
            return (
              <motion.div
                key={e.egressId || Math.random()}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card
                  className="bg-slate-800 border-slate-700 hover:border-rose-500/50 transition-colors cursor-pointer"
                  onClick={() => openDetail(e)}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                      <Film className="w-5 h-5 text-rose-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge className="bg-slate-600 text-white text-[10px]">{kind}</Badge>
                          {statusBadge(e.status)}
                          <span className="text-sm text-white font-mono truncate">
                            {e.roomName || "—"}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {e.startedAt
                              ? format(new Date(e.startedAt), "dd MMM HH:mm:ss")
                              : "—"}
                          </span>
                          <span className="font-mono">
                            id: {(e.egressId || "").slice(0, 16)}…
                          </span>
                          {e.error && (
                            <span className="text-red-400 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              {e.error.slice(0, 40)}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openDetail(e);
                        }}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Inspect
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!detail}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
      >
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Film className="w-5 h-5 text-rose-400" />
              <span className="font-mono truncate">{detail?.egressId || "—"}</span>
              {detail && statusBadge(detail.status)}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-slate-800 rounded p-2">
                  <p className="text-slate-500">Room</p>
                  <p className="font-mono text-white truncate">{detail.roomName || "—"}</p>
                </div>
                <div className="bg-slate-800 rounded p-2">
                  <p className="text-slate-500">Started</p>
                  <p className="text-white">
                    {detail.startedAt
                      ? format(new Date(detail.startedAt), "dd MMM HH:mm")
                      : "—"}
                  </p>
                </div>
                <div className="bg-slate-800 rounded p-2">
                  <p className="text-slate-500">Updated</p>
                  <p className="text-white">
                    {detail.updatedAt
                      ? format(new Date(detail.updatedAt), "HH:mm:ss")
                      : "—"}
                  </p>
                </div>
                <div className="bg-slate-800 rounded p-2">
                  <p className="text-slate-500">Ended</p>
                  <p className="text-white">
                    {detail.endedAt
                      ? format(new Date(detail.endedAt), "HH:mm:ss")
                      : "—"}
                  </p>
                </div>
              </div>

              {detail.error && (
                <div className="bg-red-950/40 border border-red-700 rounded p-2 text-xs text-red-200">
                  <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                  {detail.error}
                </div>
              )}

              {detail.fileResults?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    File outputs ({detail.fileResults.length})
                  </p>
                  <div className="space-y-1">
                    {detail.fileResults.map((f, i) => (
                      <div key={i} className="bg-slate-800 rounded p-2 text-[11px]">
                        <p className="font-mono text-white truncate">{f.location || "—"}</p>
                        <p className="text-slate-500">
                          {formatBytes(f.size)} · {formatDuration(f.duration)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.streamResults?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5" />
                    RTMP streams ({detail.streamResults.length})
                  </p>
                  <div className="space-y-1">
                    {detail.streamResults.map((s, i) => (
                      <div
                        key={i}
                        className="bg-slate-800 rounded p-2 text-[11px] flex items-center justify-between gap-2"
                      >
                        <p className="font-mono text-white truncate flex-1 min-w-0">
                          {s.url || "—"}
                        </p>
                        {statusBadge(s.status)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.segmentResults?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5" />
                    HLS segments
                  </p>
                  <div className="space-y-1">
                    {detail.segmentResults.map((s, i) => (
                      <div key={i} className="bg-slate-800 rounded p-2 text-[11px]">
                        <p className="font-mono text-white truncate">
                          {s.playlistLocation || s.playlistName || "—"}
                        </p>
                        <p className="text-slate-500">
                          {s.segmentCount ?? 0} segments
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {kindOf(detail) === "MP4" || kindOf(detail) === "HLS" ? (
                <div className="bg-slate-800/60 border border-slate-700 rounded p-3 space-y-2">
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Layout className="w-3.5 h-3.5" />
                    Swap layout (room-composite only)
                  </p>
                  <div className="flex gap-2">
                    <Select
                      value={layoutChoice}
                      onValueChange={(v) => setLayoutChoice(v as LiveKitEgressLayout)}
                    >
                      <SelectTrigger className="bg-slate-900 border-slate-600 text-white text-xs h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700 text-white">
                        {LAYOUTS.map((l) => (
                          <SelectItem key={l} value={l}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={applyLayout}
                      disabled={applyingLayout}
                      size="sm"
                      className="bg-rose-600 hover:bg-rose-700 text-white"
                    >
                      {applyingLayout ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : (
                        <Layout className="w-3.5 h-3.5 mr-1" />
                      )}
                      Apply
                    </Button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Stop / cancel handled by feature owner (host My Recordings,
                    live_streams.egress_id, etc.).
                  </p>
                </div>
              ) : null}

              <div className="flex justify-end pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setDetail(null)}
                  className="text-slate-300"
                >
                  <X className="w-4 h-4 mr-1" />
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
