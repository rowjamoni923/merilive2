/**
 * Pkg117: Admin Agent Dispatches — Voice/AI LiveKit Agent worker control.
 *
 * Lists every row in `agent_dispatches` (admin RLS), lets an admin dispatch
 * a registered agent worker into any room (call/live/party) or cancel a
 * pending/dispatched job. Workers themselves register out-of-band with the
 * LiveKit Cloud — this page only fires AgentDispatchClient via the
 * `livekit-agent` edge function (admin auth) and surfaces audit.
 *
 * Server kill-switch: app_settings.livekit_signaling_enabled.agent
 * Reads `agent_dispatches` (admin-session RLS only); writes via edge fn.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  Plus,
  RefreshCw,
  Loader2,
  X,
  Search,
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import {
  dispatchAgent,
  cancelAgentDispatch,
  type AgentScope,
} from "@/lib/livekitAgent";

interface AgentRow {
  id: string;
  scope: AgentScope | string | null;
  scope_id: string | null;
  room_name: string | null;
  agent_name: string | null;
  dispatch_id: string | null;
  metadata: any;
  status: string | null;
  error: string | null;
  initiator_id: string | null;
  created_at: string;
  dispatched_at: string | null;
  ended_at: string | null;
}

export default function AdminAgentDispatches() {
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showDispatch, setShowDispatch] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [scope, setScope] = useState<AgentScope>("live");
  const [scopeId, setScopeId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [agentName, setAgentName] = useState("");
  const [metadataText, setMetadataText] = useState("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await adminSupabase
        .from("agent_dispatches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        toast.error("Failed to load dispatches");
        return;
      }
      setRows((data || []) as AgentRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);
  useAdminRealtime(["agent_dispatches"], () => fetchRows());

  const resetForm = () => {
    setScope("live");
    setScopeId("");
    setRoomName("");
    setAgentName("");
    setMetadataText("");
  };

  const handleDispatch = useCallback(async () => {
    if (!roomName.trim() || !agentName.trim()) {
      toast.error("Room name + agent name required");
      return;
    }
    let metadata: Record<string, unknown> | undefined;
    if (metadataText.trim()) {
      try {
        const parsed = JSON.parse(metadataText);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          metadata = parsed;
        } else {
          toast.error("Metadata must be a JSON object");
          return;
        }
      } catch {
        toast.error("Invalid JSON metadata");
        return;
      }
    }
    setSubmitting(true);
    const res = await dispatchAgent({
      scope,
      scopeId: scopeId.trim() || undefined,
      roomName: roomName.trim(),
      agentName: agentName.trim(),
      metadata,
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success("Agent dispatched");
      setShowDispatch(false);
      resetForm();
      fetchRows();
    } else {
      toast.error(res.error || "Dispatch failed");
    }
  }, [scope, scopeId, roomName, agentName, metadataText, fetchRows]);

  const handleCancel = useCallback(async (row: AgentRow) => {
    if (!row.dispatch_id || !row.room_name) {
      toast.error("Missing dispatch id or room");
      return;
    }
    if (!confirm(`Cancel agent "${row.agent_name}" in ${row.room_name}?`)) return;
    setBusyId(row.id);
    const res = await cancelAgentDispatch({
      dispatchId: row.dispatch_id,
      roomName: row.room_name,
    });
    setBusyId(null);
    if (res.ok) {
      toast.success("Cancel signal sent");
      fetchRows();
    } else {
      toast.error(res.error || "Cancel failed");
    }
  }, [fetchRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.room_name?.toLowerCase().includes(q) ||
      r.agent_name?.toLowerCase().includes(q) ||
      r.dispatch_id?.toLowerCase().includes(q) ||
      r.scope?.toLowerCase().includes(q) ||
      r.status?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((r) => r.status === "dispatched" || r.status === "pending").length,
    ended: rows.filter((r) => r.status === "ended" || r.status === "cancelled").length,
    failed: rows.filter((r) => r.status === "failed").length,
  }), [rows]);

  const statusBadge = (s: string | null) => {
    if (!s) return <Badge variant="secondary">—</Badge>;
    if (s === "dispatched") return <Badge className="bg-emerald-500 text-white animate-pulse">dispatched</Badge>;
    if (s === "pending") return <Badge className="bg-amber-500 text-white">pending</Badge>;
    if (s === "ended") return <Badge className="bg-slate-500 text-white">ended</Badge>;
    if (s === "cancelled") return <Badge className="bg-slate-600 text-white">cancelled</Badge>;
    if (s === "failed") return <Badge className="bg-red-600 text-white">failed</Badge>;
    return <Badge variant="secondary">{s}</Badge>;
  };

  const scopeBadge = (sc: string | null) => {
    const color =
      sc === "call" ? "bg-sky-500" :
      sc === "live" ? "bg-fuchsia-500" :
      sc === "party" ? "bg-purple-500" :
      "bg-slate-500";
    return <Badge className={`${color} text-white text-[10px]`}>{sc || "—"}</Badge>;
  };

  return (
    <div className="admin-pro-shell space-y-4 sm:space-y-6 px-2 sm:px-0">
      <div className="bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-600 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Bot className="w-6 h-6" />
              LiveKit Agents (Voice AI)
            </h1>
            <p className="text-slate-700 text-xs sm:text-sm mt-1">
              Dispatch registered agent workers into any room. Kill-switch
              <code className="ml-1 px-1.5 py-0.5 rounded bg-black/20 text-[10px]">agent</code>.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchRows} variant="outline" className="border-white/30 text-slate-900 hover:bg-white/20">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => setShowDispatch(true)} className="bg-white text-indigo-700 hover:bg-white/90">
              <Plus className="w-4 h-4 mr-2" />
              Dispatch
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Total</p>
            <p className="text-slate-900 font-bold text-xl">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Active</p>
            <p className="text-emerald-400 font-bold text-xl">{stats.active}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Ended</p>
            <p className="text-slate-300 font-bold text-xl">{stats.ended}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Failed</p>
            <p className="text-red-400 font-bold text-xl">{stats.failed}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search room / agent / scope / status…"
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
            <Bot className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400">No agent dispatches yet.</p>
            <p className="text-slate-500 text-xs mt-2">
              Click <b>Dispatch</b> to send a registered agent worker into a room.
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
              <Card className="bg-slate-50 border-slate-200 hover:border-cyan-500/40 transition-colors">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                    <Bot className="w-5 h-5 text-cyan-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {statusBadge(r.status)}
                        {scopeBadge(r.scope)}
                        <span className="text-sm text-slate-900 font-medium truncate">
                          {r.agent_name || "—"}
                        </span>
                        <span className="text-xs text-slate-500">·</span>
                        <span className="text-xs text-slate-300 font-mono truncate">
                          {r.room_name || "—"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>dispatch: <span className="font-mono">{r.dispatch_id?.slice(0, 14) || "—"}…</span></span>
                        {r.scope_id && <span>scope_id: <span className="font-mono">{r.scope_id.slice(0, 10)}…</span></span>}
                        <span>created: {format(new Date(r.created_at), "dd MMM HH:mm")}</span>
                        {r.dispatched_at && <span>dispatched: {format(new Date(r.dispatched_at), "HH:mm")}</span>}
                        {r.ended_at && <span>ended: {format(new Date(r.ended_at), "HH:mm")}</span>}
                      </div>
                      {r.error && (
                        <p className="text-[11px] text-red-400 mt-1 truncate">Error: {r.error}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 sm:ml-auto">
                      {(r.status === "dispatched" || r.status === "pending") && r.dispatch_id && (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === r.id}
                          onClick={() => handleCancel(r)}
                        >
                          {busyId === r.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <X className="w-3.5 h-3.5 mr-1" />
                          )}
                          Cancel
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

      <Dialog open={showDispatch} onOpenChange={(o) => { setShowDispatch(o); if (!o) resetForm(); }}>
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-cyan-400" />
              Dispatch Agent
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Scope</label>
              <Select value={scope} onValueChange={(v) => setScope(v as AgentScope)}>
                <SelectTrigger className="bg-slate-50 border-slate-200 text-slate-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-50 border-slate-200 text-slate-900">
                  <SelectItem value="call">call</SelectItem>
                  <SelectItem value="live">live</SelectItem>
                  <SelectItem value="party">party</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Scope ID (optional — stream/call/party id)</label>
              <Input
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                placeholder="uuid"
                className="bg-slate-50 border-slate-200 text-slate-900"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Room Name *</label>
              <Input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="live_<streamId> / party_<id> / call_<id>"
                className="bg-slate-50 border-slate-200 text-slate-900 font-mono text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Agent Name * (registered with LiveKit)</label>
              <Input
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="moderator / transcriber / assistant"
                className="bg-slate-50 border-slate-200 text-slate-900"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Metadata (JSON object, optional)</label>
              <Textarea
                value={metadataText}
                onChange={(e) => setMetadataText(e.target.value)}
                placeholder='{"lang":"en","persona":"friendly"}'
                rows={3}
                className="bg-slate-50 border-slate-200 text-slate-900 font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDispatch(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleDispatch}
              disabled={submitting}
              className="bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
