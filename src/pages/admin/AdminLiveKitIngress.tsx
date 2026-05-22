/**
 * Pkg137 UI — Admin LiveKit Ingress Ops Dashboard.
 *
 * Read-only inspection + safe delete of LiveKit RTMP/WHIP ingresses (Pkg109).
 * Stream keys are server-masked (`•••XXXX`) — full keys never reach the client.
 *
 * Server kill-switch: app_settings.livekit_signaling_enabled.ingress_ops
 * Backend: livekit-ingress-ops edge fn (Pkg137) — admin-only via x-admin-access-token.
 *
 * Adheres to admin no-auto-refresh policy (Pkg39) + $1400-rule.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Antenna,
  RefreshCw,
  Loader2,
  Search,
  Eye,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  listLiveKitIngress,
  getLiveKitIngress,
  deleteLiveKitIngress,
  type LiveKitIngressSummary,
} from "@/lib/livekitIngressOps";

function statusBadge(status: string | null | undefined) {
  const s = (status || "").toLowerCase();
  const color = s.includes("active") || s.includes("publishing")
    ? "bg-emerald-500"
    : s.includes("end") || s.includes("complete")
      ? "bg-slate-500"
      : s.includes("fail") || s.includes("error")
        ? "bg-red-500"
        : s ? "bg-amber-500" : "bg-muted";
  return <Badge className={`${color} text-white text-[10px]`}>{status || "idle"}</Badge>;
}

function fmtMs(ms?: number | null) {
  if (!ms || ms <= 0) return "—";
  try { return format(new Date(ms), "MMM d, HH:mm"); } catch { return "—"; }
}

export default function AdminLiveKitIngress() {
  const [rows, setRows] = useState<LiveKitIngressSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [inspect, setInspect] = useState<LiveKitIngressSummary | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LiveKitIngressSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listLiveKitIngress(roomFilter ? { roomName: roomFilter.trim() } : {});
      setRows(list);
    } catch (e: any) {
      console.warn("[Pkg137] listLiveKitIngress error", e);
      const msg = String(e?.message || e || "");
      if (msg.includes("ingress_ops") || msg.includes("kill")) {
        toast.error("Ingress Ops kill-switch is OFF. Enable it in app_settings → livekit_signaling_enabled.ingress_ops.");
      } else {
        toast.error(msg || "Could not load ingresses");
      }
    } finally {
      setLoading(false);
    }
  }, [roomFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.ingressId, r.name, r.roomName, r.participantIdentity, r.participantName, r.inputType, r.url]
        .some((v) => (v || "").toString().toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => {
      const s = (r.state?.status || "").toLowerCase();
      return s.includes("active") || s.includes("publishing");
    }).length;
    const rtmp = rows.filter((r) => (r.inputType || "").toLowerCase().includes("rtmp")).length;
    const whip = rows.filter((r) => (r.inputType || "").toLowerCase().includes("whip")).length;
    return { total, active, rtmp, whip };
  }, [rows]);

  const onInspect = useCallback(async (row: LiveKitIngressSummary) => {
    setInspect(row);
    if (!row.ingressId) return;
    // Refresh full record (state may change between list + open)
    try {
      const full = await getLiveKitIngress(row.ingressId);
      if (full) setInspect(full);
    } catch (e) {
      // Non-fatal — keep list snapshot.
    }
  }, []);

  const onDelete = useCallback(async () => {
    if (!confirmDelete?.ingressId) return;
    setDeleting(true);
    try {
      const ok = await deleteLiveKitIngress(confirmDelete.ingressId);
      if (ok) {
        toast.success("Ingress deleted");
        setConfirmDelete(null);
        await load();
      } else {
        toast.error("Delete returned false");
      }
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  }, [confirmDelete, load]);

  const copy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  }, []);

  return (
    <div className="admin-content space-y-4 p-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
            <Antenna className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">LiveKit Ingress</h1>
            <p className="text-xs text-muted-foreground">
              Pkg137 — RTMP/WHIP ingress jobs (read-only + safe delete)
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard label="Total" value={stats.total} icon={<Antenna className="h-4 w-4" />} />
        <StatCard label="Active" value={stats.active} icon={<CheckCircle2 className="h-4 w-4" />} accent="text-emerald-600" />
        <StatCard label="RTMP" value={stats.rtmp} icon={<Antenna className="h-4 w-4" />} />
        <StatCard label="WHIP" value={stats.whip} icon={<Antenna className="h-4 w-4" />} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search ID / name / participant / URL…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Input
            placeholder="Filter by room name (exact)"
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(); }}
            className="sm:w-72"
          />
        </CardContent>
      </Card>

      {/* List */}
      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="admin-empty-state py-12 flex flex-col items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-6 w-6 opacity-60" />
            No ingresses match your filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map((r) => (
            <Card key={r.ingressId || Math.random()} className="hover:border-primary/40 transition-colors">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-md bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
                  <Antenna className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold truncate">
                      {r.name || r.ingressId?.slice(0, 12) || "—"}
                    </span>
                    {statusBadge(r.state?.status)}
                    {r.inputType && (
                      <Badge variant="outline" className="text-[10px] uppercase">{r.inputType}</Badge>
                    )}
                    {r.reusable && (
                      <Badge variant="secondary" className="text-[10px]">Reusable</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    Room: <span className="font-mono">{r.roomName || "—"}</span> · Identity:{" "}
                    <span className="font-mono">{r.participantIdentity || "—"}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtMs(r.state?.startedAt)}</span>
                    {r.state?.error && <span className="text-rose-500 truncate">⚠ {r.state.error}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => onInspect(r)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-500 hover:text-rose-600"
                    disabled={!r.ingressId}
                    onClick={() => setConfirmDelete(r)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Inspect dialog */}
      <Dialog open={!!inspect} onOpenChange={(o) => !o && setInspect(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Antenna className="h-5 w-5 text-primary" />
              Ingress details
            </DialogTitle>
          </DialogHeader>
          {inspect && (
            <ScrollArea className="max-h-[65vh]">
              <div className="space-y-3 text-sm">
                <DetailRow label="Ingress ID" value={inspect.ingressId} mono copyable onCopy={copy} />
                <DetailRow label="Name" value={inspect.name} />
                <DetailRow label="Input type" value={inspect.inputType} />
                <DetailRow label="Status" value={inspect.state?.status} />
                <DetailRow label="Room" value={inspect.roomName} mono />
                <DetailRow label="Participant identity" value={inspect.participantIdentity} mono />
                <DetailRow label="Participant name" value={inspect.participantName} />
                <DetailRow label="Reusable" value={inspect.reusable ? "yes" : "no"} />
                <DetailRow label="Started" value={fmtMs(inspect.state?.startedAt)} />
                <DetailRow label="Ended" value={fmtMs(inspect.state?.endedAt)} />
                <DetailRow label="Resource ID" value={inspect.state?.resourceId} mono />
                {inspect.state?.error && (
                  <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
                    ⚠ {inspect.state.error}
                  </div>
                )}
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Publish URL</div>
                  <div className="text-xs font-mono break-all flex items-start gap-2">
                    <span className="flex-1">{inspect.url || "—"}</span>
                    {inspect.url && (
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => copy(inspect.url!, "URL")}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                    <KeyRound className="h-3 w-3" /> Stream key (masked)
                  </div>
                  <div className="text-xs font-mono break-all">{inspect.streamKey || "—"}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Full keys never leave the server. To rotate, delete this ingress and create a new one.
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && !deleting && setConfirmDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500">
              <Trash2 className="h-5 w-5" /> Delete ingress?
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-2">
            <p>This permanently removes the ingress from LiveKit. The host will need to create a new one (new RTMP URL + stream key) to broadcast again.</p>
            {confirmDelete && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-1">
                <div><span className="text-muted-foreground">Name:</span> {confirmDelete.name || "—"}</div>
                <div><span className="text-muted-foreground">Room:</span> <span className="font-mono">{confirmDelete.roomName || "—"}</span></div>
                <div><span className="text-muted-foreground">Type:</span> {confirmDelete.inputType || "—"}</div>
                <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{confirmDelete.ingressId}</span></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={onDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label, value, icon, accent,
}: { label: string; value: React.ReactNode; icon: React.ReactNode; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center ${accent || "text-primary"}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className={`text-base font-semibold truncate ${accent || ""}`}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label, value, mono, copyable, onCopy,
}: { label: string; value?: string | null; mono?: boolean; copyable?: boolean; onCopy?: (text: string, label: string) => void }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-36 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground pt-0.5">{label}</div>
      <div className={`flex-1 min-w-0 text-sm ${mono ? "font-mono break-all" : ""}`}>
        {value || <span className="text-muted-foreground">—</span>}
      </div>
      {copyable && value && onCopy && (
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onCopy(value, label)}>
          <Copy className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
