/**
 * Pkg97 UI — Admin LiveKit Webhook Events Viewer.
 *
 * Read-only inspector for the `livekit_room_events` audit table populated by
 * the `livekit-webhook` edge function. Every event LiveKit Cloud sends
 * (room_started, room_finished, participant_*, track_*, egress_*, ingress_*)
 * is rowed here with full JSON payload.
 *
 * - adminSupabase (RLS gated to admin-session)
 * - Manual refresh only (admin no-auto-refresh policy Pkg39)
 * - Zero realtime channels / zero polls — $1400-rule safe
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Webhook,
  RefreshCw,
  Loader2,
  Search,
  X,
  Filter,
  Activity,
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
import { adminSupabase } from "@/integrations/supabase/adminClient";

interface WebhookRow {
  id: number;
  event: string;
  room_name: string | null;
  room_sid: string | null;
  participant_identity: string | null;
  participant_sid: string | null;
  track_sid: string | null;
  payload: any;
  created_at: string;
}

const PAGE_SIZE = 100;

const EVENT_CATEGORIES: Record<string, string> = {
  room_started: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  room_finished: "bg-rose-500/10 text-rose-600 border-rose-500/30",
  participant_joined: "bg-sky-500/10 text-sky-600 border-sky-500/30",
  participant_left: "bg-slate-500/10 text-slate-600 border-slate-500/30",
  track_published: "bg-violet-500/10 text-violet-600 border-violet-500/30",
  track_unpublished: "bg-violet-500/10 text-violet-600 border-violet-500/30",
  egress_started: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  egress_updated: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  egress_ended: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  ingress_started: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30",
  ingress_ended: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30",
};

function eventClass(ev: string) {
  return (
    EVENT_CATEGORIES[ev] || "bg-muted text-muted-foreground border-border"
  );
}

function scopeOfRoom(name: string | null): string {
  if (!name) return "—";
  if (name.startsWith("live_")) return "live";
  if (name.startsWith("party_")) return "party";
  if (name.startsWith("call_")) return "call";
  return "other";
}

export default function AdminLiveKitWebhook() {
  const [rows, setRows] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [detail, setDetail] = useState<WebhookRow | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await adminSupabase
        .from("livekit_room_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (error) throw error;
      setRows((data || []) as WebhookRow[]);
    } catch (e: any) {
      toast.error(`Failed to load webhook events: ${e?.message || "unknown"}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const eventOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.event));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (eventFilter !== "all" && r.event !== eventFilter) return false;
      if (scopeFilter !== "all" && scopeOfRoom(r.room_name) !== scopeFilter)
        return false;
      if (!q) return true;
      return (
        r.event.toLowerCase().includes(q) ||
        (r.room_name || "").toLowerCase().includes(q) ||
        (r.participant_identity || "").toLowerCase().includes(q) ||
        (r.room_sid || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, eventFilter, scopeFilter]);

  const stats = useMemo(() => {
    const out = {
      total: rows.length,
      rooms: new Set<string>(),
      participants: 0,
      egress: 0,
    };
    rows.forEach((r) => {
      if (r.room_sid) out.rooms.add(r.room_sid);
      if (r.event.startsWith("participant_")) out.participants++;
      if (r.event.startsWith("egress_")) out.egress++;
    });
    return {
    };
  }, [rows]);

  return (
    <div className="admin-pro-shell admin-content space-y-4 p-4 md:p-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-3 flex-wrap"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center shadow-md">
            <Webhook className="h-5 w-5 text-slate-900" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">
              LiveKit Webhook Events
            </h1>
            <p className="text-xs text-muted-foreground">
              Pkg97 — last {PAGE_SIZE} events received from LiveKit Cloud
            </p>
          </div>
        </div>
        <Button onClick={fetchRows} disabled={loading} variant="outline">
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Refresh
        </Button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Events shown" value={stats.total} />
        <StatCard label="Unique rooms" value={stats.rooms} />
        <StatCard label="Participant events" value={stats.participants} />
        <StatCard label="Egress events" value={stats.egress} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search event, room, participant, sid…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-[200px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Event" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {eventOptions.map((ev) => (
                <SelectItem key={ev} value={ev}>
                  {ev}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={scopeFilter} onValueChange={setScopeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scopes</SelectItem>
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="party">Party</SelectItem>
              <SelectItem value="call">Call</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading && rows.length === 0 ? (
            <div className="p-12 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="admin-empty-state p-12 text-center text-muted-foreground">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No webhook events match the current filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Event</th>
                    <th className="px-3 py-2 font-medium">Scope</th>
                    <th className="px-3 py-2 font-medium">Room</th>
                    <th className="px-3 py-2 font-medium">Participant</th>
                    <th className="px-3 py-2 font-medium">Track</th>
                    <th className="px-3 py-2 font-medium text-right">Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => setDetail(r)}
                    >
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(r.created_at), "MMM dd HH:mm:ss")}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${eventClass(r.event)}`}
                        >
                          {r.event}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs uppercase text-muted-foreground">
                        {scopeOfRoom(r.room_name)}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono truncate max-w-[200px]">
                        {r.room_name || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono truncate max-w-[160px]">
                        {r.participant_identity || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono truncate max-w-[120px]">
                        {r.track_sid || "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetail(r);
                          }}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="w-4 h-4" />
              {detail?.event}
              {detail && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${eventClass(detail.event)}`}
                >
                  #{detail.id}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <KV k="Time" v={format(new Date(detail.created_at), "PPpp")} />
                <KV k="Scope" v={scopeOfRoom(detail.room_name)} />
                <KV k="Room name" v={detail.room_name || "—"} mono />
                <KV k="Room sid" v={detail.room_sid || "—"} mono />
                <KV
                  k="Participant identity"
                  v={detail.participant_identity || "—"}
                  mono
                />
                <KV
                  k="Participant sid"
                  v={detail.participant_sid || "—"}
                  mono
                />
                <KV k="Track sid" v={detail.track_sid || "—"} mono />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  Raw payload
                </div>
                <pre className="text-[11px] bg-muted/50 rounded-md p-3 overflow-auto max-h-[420px] font-mono">
                  {JSON.stringify(detail.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
          {label}
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {k}
      </span>
      <span
        className={mono ? "font-mono text-xs break-all" : "text-xs"}
        title={v}
      >
        {v}
      </span>
    </div>
  );
}
