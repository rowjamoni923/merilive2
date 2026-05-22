/**
 * Pkg135 UI — Admin LiveKit Rooms Dashboard.
 *
 * Read-only inspection of live LiveKit SFU state. Lists every active room,
 * lets admin drill in for participant detail. No mutations (those live in
 * Pkg99/127 livekit-moderate + admin moderation pages).
 *
 * Server kill-switch: app_settings.livekit_signaling_enabled.room_ops
 * Backend: livekit-room-ops edge fn (Pkg135) — admin-only via x-admin-access-token.
 *
 * Adheres to admin no-auto-refresh policy (Pkg39) + $1400-rule:
 *   • zero polling, zero realtime channels
 *   • manual Refresh button only
 *   • adminSupabase (auto sends x-admin-access-token)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Radio,
  RefreshCw,
  Loader2,
  Search,
  Users,
  Eye,
  Mic,
  Video,
  Clock,
  X,
  Circle,
  Square,
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
import { toast } from "sonner";
import { format } from "date-fns";
import {
  listLiveKitRooms,
  listLiveKitRoomParticipants,
  type LiveKitRoomSummary,
  type LiveKitParticipantSummary,
  type LiveKitParticipantTrack,
} from "@/lib/livekitRoomOps";
import { startTrackEgress, stopTrackEgress } from "@/lib/livekitTrackEgress";


function scopeOfRoom(name: string): "live" | "party" | "call" | "other" {
  if (name.startsWith("live_")) return "live";
  if (name.startsWith("party_")) return "party";
  if (name.startsWith("call_")) return "call";
  return "other";
}

function formatAge(creationTime: number | null): string {
  if (!creationTime) return "—";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - creationTime));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export default function AdminLiveKitRooms() {
  const [rooms, setRooms] = useState<LiveKitRoomSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [detailRoom, setDetailRoom] = useState<LiveKitRoomSummary | null>(null);
  const [participants, setParticipants] = useState<LiveKitParticipantSummary[]>(
    [],
  );
  const [loadingParts, setLoadingParts] = useState(false);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listLiveKitRooms();
      setRooms(list);
    } catch (e: any) {
      const msg = String(e?.message || e || "");
      if (/room_ops_disabled/i.test(msg)) {
        toast.error(
          "Kill-switch 'room_ops' is OFF. Enable in Pricing Hub → LiveKit.",
        );
      } else {
        toast.error(`Failed to load rooms: ${msg || "unknown"}`);
      }
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const openDetail = useCallback(async (room: LiveKitRoomSummary) => {
    setDetailRoom(room);
    setLoadingParts(true);
    try {
      const list = await listLiveKitRoomParticipants(room.name);
      setParticipants(list);
    } catch (e: any) {
      toast.error(`Failed to load participants: ${e?.message || "unknown"}`);
      setParticipants([]);
    } finally {
      setLoadingParts(false);
    }
  }, []);

  const stats = useMemo(() => {
    const t = {
      total: rooms.length,
      participants: 0,
      publishers: 0,
      recording: 0,
      live: 0,
      party: 0,
      call: 0,
    };
    for (const r of rooms) {
      t.participants += r.numParticipants || 0;
      t.publishers += r.numPublishers || 0;
      if (r.activeRecording) t.recording++;
      const s = scopeOfRoom(r.name);
      if (s === "live") t.live++;
      else if (s === "party") t.party++;
      else if (s === "call") t.call++;
    }
    return t;
  }, [rooms]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.sid.toLowerCase().includes(q) ||
        (r.metadata || "").toLowerCase().includes(q),
    );
  }, [rooms, search]);

  const scopeBadge = (name: string) => {
    const s = scopeOfRoom(name);
    const color =
      s === "live"
        ? "bg-fuchsia-500"
        : s === "party"
          ? "bg-purple-500"
          : s === "call"
            ? "bg-sky-500"
            : "bg-slate-500";
    return (
      <Badge className={`${color} text-white text-[10px]`}>{s}</Badge>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-0 admin-content">
      <div className="bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-600 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Radio className="w-6 h-6" />
              LiveKit Rooms
            </h1>
            <p className="text-white/80 text-xs sm:text-sm mt-1">
              Pkg135 — read-only SFU inspection of every active room
              (call / live / party). Kill-switch
              <code className="ml-1 px-1.5 py-0.5 rounded bg-black/20 text-[10px]">
                room_ops
              </code>
              .
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={fetchRooms}
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

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Rooms</p>
            <p className="text-white font-bold text-xl">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Participants</p>
            <p className="text-emerald-400 font-bold text-xl">
              {stats.participants}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Publishers</p>
            <p className="text-amber-400 font-bold text-xl">{stats.publishers}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Recording</p>
            <p className="text-red-400 font-bold text-xl">{stats.recording}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Live</p>
            <p className="text-fuchsia-400 font-bold text-xl">{stats.live}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Party</p>
            <p className="text-purple-400 font-bold text-xl">{stats.party}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Call</p>
            <p className="text-sky-400 font-bold text-xl">{stats.call}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search room name / sid / metadata…"
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
            <Radio className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400">No active LiveKit rooms.</p>
            <p className="text-slate-500 text-xs mt-2">
              Rooms appear here when a host opens Live / Private Call / Party.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <motion.div
              key={r.sid}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card
                className="bg-slate-800 border-slate-700 hover:border-indigo-500/50 transition-colors cursor-pointer"
                onClick={() => openDetail(r)}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                    <Radio className="w-5 h-5 text-indigo-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {scopeBadge(r.name)}
                        {r.activeRecording && (
                          <Badge className="bg-red-500 text-white text-[10px] animate-pulse">
                            ● REC
                          </Badge>
                        )}
                        <span className="text-sm text-white font-mono truncate">
                          {r.name}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {r.numParticipants} participants
                        </span>
                        <span className="flex items-center gap-1">
                          <Mic className="w-3 h-3" />
                          {r.numPublishers} publishers
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatAge(r.creationTime)}
                        </span>
                        <span className="font-mono">
                          sid: {r.sid.slice(0, 16)}…
                        </span>
                      </div>
                      {r.metadata && (
                        <p className="text-[10px] text-slate-500 mt-1 font-mono truncate">
                          meta: {r.metadata}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail(r);
                      }}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Inspect
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog
        open={!!detailRoom}
        onOpenChange={(o) => {
          if (!o) {
            setDetailRoom(null);
            setParticipants([]);
          }
        }}
      >
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Radio className="w-5 h-5 text-indigo-400" />
              <span className="font-mono">{detailRoom?.name}</span>
              {detailRoom && scopeBadge(detailRoom.name)}
            </DialogTitle>
          </DialogHeader>
          {detailRoom && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-slate-800 rounded p-2">
                  <p className="text-slate-500">SID</p>
                  <p className="font-mono text-white truncate">
                    {detailRoom.sid}
                  </p>
                </div>
                <div className="bg-slate-800 rounded p-2">
                  <p className="text-slate-500">Created</p>
                  <p className="text-white">
                    {detailRoom.creationTime
                      ? format(
                          new Date(detailRoom.creationTime * 1000),
                          "dd MMM HH:mm",
                        )
                      : "—"}
                  </p>
                </div>
                <div className="bg-slate-800 rounded p-2">
                  <p className="text-slate-500">Empty timeout</p>
                  <p className="text-white">
                    {detailRoom.emptyTimeout ?? "—"}s
                  </p>
                </div>
                <div className="bg-slate-800 rounded p-2">
                  <p className="text-slate-500">Recording</p>
                  <p
                    className={
                      detailRoom.activeRecording
                        ? "text-red-400 font-bold"
                        : "text-slate-300"
                    }
                  >
                    {detailRoom.activeRecording ? "● Active" : "—"}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-400 mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Participants ({participants.length})
                </p>
                {loadingParts ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  </div>
                ) : participants.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">
                    No participants currently in this room.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {participants.map((p) => (
                      <div
                        key={p.sid}
                        className="bg-slate-800 rounded p-2 flex flex-wrap items-center gap-2 text-xs"
                      >
                        <span className="font-mono text-white truncate flex-1 min-w-0">
                          {p.identity || "—"}
                        </span>
                        {p.isPublisher && (
                          <Badge className="bg-emerald-600 text-white text-[10px]">
                            <Mic className="w-2.5 h-2.5 mr-1" />
                            publishing
                          </Badge>
                        )}
                        <Badge className="bg-slate-600 text-white text-[10px]">
                          tracks {p.numTracks}
                        </Badge>
                        <span className="text-slate-500 text-[10px]">
                          {p.joinedAt
                            ? format(new Date(p.joinedAt * 1000), "HH:mm:ss")
                            : "—"}
                        </span>
                        <span className="text-slate-500 text-[10px] font-mono">
                          {String(p.sid).slice(0, 10)}…
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setDetailRoom(null)}
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
