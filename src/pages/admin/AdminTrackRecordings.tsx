/**
 * Pkg113: Admin Track Recordings — per-participant moderation evidence.
 *
 * Distinct from AdminRecordings (Pkg111 room-composite). Lists every
 * track-egress job started via `livekit-track-egress` (admin-only). Allows
 * stopping an active recording and opening the finalized file.
 *
 * Server kill-switch: app_settings.livekit_signaling_enabled.track_egress
 * Reads `track_recordings` (admin-session RLS only).
 */
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Mic,
  Video as VideoIcon,
  RefreshCw,
  Square,
  Loader2,
  Film,
  Search,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  listTrackRecordings,
  stopTrackEgress,
} from "@/lib/livekitTrackEgress";
import useAdminRealtime from "@/hooks/useAdminRealtime";

interface TrackRow {
  id: string;
  room_name: string | null;
  participant_identity: string | null;
  track_sid: string | null;
  track_kind: "audio" | "video" | string | null;
  egress_id: string | null;
  file_url: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  reason: string | null;
}

export default function AdminTrackRecordings() {
  const [rows, setRows] = useState<TrackRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTrackRecordings({ limit: 100 });
      setRows(data as TrackRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);
  useAdminRealtime(["track_recordings"], () => fetchRows());

  const handleStop = useCallback(async (row: TrackRow) => {
    if (!row.egress_id) return;
    if (!confirm("Stop this track recording?")) return;
    setStoppingId(row.id);
    const ok = await stopTrackEgress(row.egress_id);
    setStoppingId(null);
    if (ok) {
      toast.success("Stop signal sent — finalizing");
      fetchRows();
    } else {
      toast.error("Couldn't stop recording");
    }
  }, [fetchRows]);

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.room_name?.toLowerCase().includes(q) ||
      r.participant_identity?.toLowerCase().includes(q) ||
      r.egress_id?.toLowerCase().includes(q) ||
      r.reason?.toLowerCase().includes(q)
    );
  });

  const formatDuration = (s: number | null) => {
    if (!s) return "—";
    if (s < 60) return `${Math.round(s)}s`;
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}m ${sec}s`;
  };
  const formatSize = (b: number | null) => {
    if (!b) return "—";
    if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
    if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
    if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${b} B`;
  };
  const statusBadge = (s: string | null) => {
    if (!s) return <Badge variant="secondary">pending</Badge>;
    if (s === "active" || s === "starting") return <Badge className="bg-rose-500 text-white animate-pulse">{s}</Badge>;
    if (s === "completed") return <Badge className="bg-emerald-500 text-white">completed</Badge>;
    if (s === "failed" || s === "aborted") return <Badge className="bg-red-600 text-white">{s}</Badge>;
    return <Badge variant="secondary">{s}</Badge>;
  };

  const active = rows.filter((r) => r.status === "active" || r.status === "starting").length;
  const completed = rows.filter((r) => r.status === "completed").length;

  return (
    <div className="admin-pro-shell space-y-4 sm:space-y-6 px-2 sm:px-0">
      <div className="bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-600 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Film className="w-6 h-6" />
              Track Recordings (Moderation)
            </h1>
            <p className="text-slate-700 text-xs sm:text-sm mt-1">
              Per-participant audio/video evidence. Admin-only — kill-switch
              <code className="ml-1 px-1.5 py-0.5 rounded bg-black/20 text-[10px]">track_egress</code>.
            </p>
          </div>
          <Button onClick={fetchRows} variant="outline" className="border-white/30 text-slate-900 hover:bg-white/20">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Total</p>
            <p className="text-slate-900 font-bold text-xl">{rows.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Active</p>
            <p className="text-rose-400 font-bold text-xl">{active}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Completed</p>
            <p className="text-emerald-400 font-bold text-xl">{completed}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search room / identity / egress / reason…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-12 text-center">
            <Film className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400">No track recordings yet.</p>
            <p className="text-slate-500 text-xs mt-2">
              Start one from a live moderation tool with <code>startTrackEgress</code>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="bg-slate-50 border-slate-200 hover:border-fuchsia-500/40 transition-colors">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                    <div className="flex items-center gap-2 sm:w-10">
                      {r.track_kind === "audio" ? (
                        <Mic className="w-5 h-5 text-sky-400" />
                      ) : (
                        <VideoIcon className="w-5 h-5 text-fuchsia-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {statusBadge(r.status)}
                        <span className="text-xs text-slate-400 font-mono truncate">
                          {r.room_name || "—"}
                        </span>
                        <span className="text-xs text-slate-500">·</span>
                        <span className="text-xs text-slate-900 truncate">
                          {r.participant_identity || "—"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>track: <span className="font-mono">{r.track_sid?.slice(0, 12) || "—"}…</span></span>
                        <span>egress: <span className="font-mono">{r.egress_id?.slice(0, 12) || "—"}…</span></span>
                        <span>dur: {formatDuration(r.duration_seconds)}</span>
                        <span>size: {formatSize(r.size_bytes)}</span>
                        {r.started_at && (
                          <span>started: {format(new Date(r.started_at), "dd MMM HH:mm")}</span>
                        )}
                      </div>
                      {r.reason && (
                        <p className="text-[11px] text-amber-400/80 mt-1 truncate">
                          Reason: {r.reason}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 sm:ml-auto">
                      {r.file_url && (
                        <a
                          href={r.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-xs text-fuchsia-300 hover:text-fuchsia-200 gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open
                        </a>
                      )}
                      {(r.status === "active" || r.status === "starting") && r.egress_id && (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={stoppingId === r.id}
                          onClick={() => handleStop(r)}
                        >
                          {stoppingId === r.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Square className="w-3.5 h-3.5 mr-1" />
                          )}
                          Stop
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
