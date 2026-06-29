/**
 * Pkg115: Admin SIP Inbound Routes — PSTN → LiveKit room.
 *
 * Admins create LiveKit-managed inbound SIP trunks (DIDs) and dispatch rules
 * that route incoming calls into a target room. Identity prefix lets the
 * room UI (`isSipInboundIdentity`) distinguish phone callers.
 *
 * Server kill-switch: app_settings.livekit_signaling_enabled.sip_inbound
 * Reads `sip_inbound_routes` (admin-session RLS only); writes via edge fn.
 */
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  PhoneIncoming,
  Plus,
  RefreshCw,
  Loader2,
  Trash2,
  Search,
  Power,
  PowerOff,
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
  listInboundRoutes,
  createInboundTrunk,
  createInboundRoute,
  deleteInboundRoute,
  setInboundRouteEnabled,
  type SipInboundRoute,
  type SipInboundRuleType,
} from "@/lib/livekitSipInbound";

export default function AdminSipInbound() {
  const [rows, setRows] = useState<SipInboundRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [numbersText, setNumbersText] = useState("");
  const [ruleType, setRuleType] = useState<SipInboundRuleType>("direct");
  const [roomName, setRoomName] = useState("");
  const [roomPrefix, setRoomPrefix] = useState("");
  const [identityPrefix, setIdentityPrefix] = useState("sip_");
  const [creating, setCreating] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listInboundRoutes();
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const resetForm = () => {
    setName("");
    setNumbersText("");
    setRuleType("direct");
    setRoomName("");
    setRoomPrefix("");
    setIdentityPrefix("sip_");
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const numbers = numbersText
      .split(/[\n,]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (numbers.length === 0) {
      toast.error("Add at least one phone number (E.164, one per line)");
      return;
    }
    if (ruleType === "direct" && !roomName.trim()) {
      toast.error("Direct routing needs a target room name");
      return;
    }
    setCreating(true);
    try {
      // 1) Trunk
      const trunkId = await createInboundTrunk(name.trim(), numbers);
      if (!trunkId) {
        toast.error("Couldn't create SIP trunk. Admin kill-switch may be off.");
        return;
      }
      // 2) Route + dispatch rule
      const route = await createInboundRoute({
        name: name.trim(),
        trunkId,
        numbers,
        roomName: ruleType === "direct" ? roomName.trim() : undefined,
        roomPrefix: ruleType === "individual" ? (roomPrefix.trim() || undefined) : undefined,
        ruleType,
        participantIdentityPrefix: identityPrefix.trim() || "sip_",
      });
      if (!route) {
        toast.error("Trunk created but dispatch rule failed — check logs");
        return;
      }
      toast.success("SIP inbound route created");
      resetForm();
      setShowCreate(false);
      fetchRows();
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (row: SipInboundRoute) => {
    setBusyId(row.id);
    const ok = await setInboundRouteEnabled(row.id, !row.enabled);
    setBusyId(null);
    if (ok) {
      toast.success(`Route ${row.enabled ? "disabled" : "enabled"}`);
      fetchRows();
    } else {
      toast.error("Couldn't update route");
    }
  };

  const handleDelete = async (row: SipInboundRoute) => {
    if (!confirm(`Delete SIP route "${row.name}"? This also deletes the LiveKit trunk + dispatch rule.`)) return;
    setBusyId(row.id);
    const ok = await deleteInboundRoute(row.id);
    setBusyId(null);
    if (ok) {
      toast.success("Route deleted");
      fetchRows();
    } else {
      toast.error("Couldn't delete route");
    }
  };

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.room_name?.toLowerCase().includes(q) ||
      r.room_prefix?.toLowerCase().includes(q) ||
      r.phone_numbers.some((n) => n.toLowerCase().includes(q))
    );
  });

  const enabledCount = rows.filter((r) => r.enabled).length;
  const totalNumbers = rows.reduce((sum, r) => sum + (r.phone_numbers?.length || 0), 0);

  return (
    <div className="admin-pro-shell space-y-4 sm:space-y-6 px-2 sm:px-0">
      <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <PhoneIncoming className="w-6 h-6" />
              SIP Inbound Routes
            </h1>
            <p className="text-slate-700 text-xs sm:text-sm mt-1">
              PSTN phone numbers (DIDs) → LiveKit rooms. Kill-switch
              <code className="ml-1 px-1.5 py-0.5 rounded bg-black/20 text-[10px]">sip_inbound</code>.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchRows} variant="outline" className="border-white/30 text-slate-900 hover:bg-white/20">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => setShowCreate(true)} className="bg-white text-emerald-700 hover:bg-white/90">
              <Plus className="w-4 h-4 mr-2" />
              New Route
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Routes</p>
            <p className="text-slate-900 font-bold text-xl">{rows.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Enabled</p>
            <p className="text-emerald-400 font-bold text-xl">{enabledCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">DIDs</p>
            <p className="text-cyan-400 font-bold text-xl">{totalNumbers}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search name / room / phone number…"
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
            <PhoneIncoming className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400">No SIP inbound routes yet.</p>
            <p className="text-slate-500 text-xs mt-2">
              Click <strong>New Route</strong> to map a phone number to a room.
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
              <Card className={`bg-slate-50 border-slate-200 hover:border-emerald-500/40 transition-colors ${!r.enabled ? "opacity-60" : ""}`}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge className={r.enabled ? "bg-emerald-500 text-white" : "bg-slate-600 text-white"}>
                          {r.enabled ? "enabled" : "disabled"}
                        </Badge>
                        <Badge variant="outline" className="border-cyan-500/50 text-cyan-300 text-[10px]">
                          {r.rule_type}
                        </Badge>
                        <span className="text-sm font-medium text-slate-900 truncate">{r.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>
                          {r.rule_type === "direct" ? "room" : "prefix"}:{" "}
                          <span className="font-mono text-slate-900">
                            {r.rule_type === "direct" ? (r.room_name || "—") : (r.room_prefix || "—")}
                          </span>
                        </span>
                        <span>identity: <span className="font-mono">{r.participant_identity_prefix}</span></span>
                        {r.trunk_id && <span>trunk: <span className="font-mono">{r.trunk_id.slice(0, 12)}…</span></span>}
                        <span>created: {format(new Date(r.created_at), "dd MMM HH:mm")}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.phone_numbers.map((n) => (
                          <span key={n} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-slate-200 text-emerald-300">
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:ml-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === r.id}
                        onClick={() => handleToggle(r)}
                        className="text-xs"
                      >
                        {busyId === r.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : r.enabled ? (
                          <><PowerOff className="w-3.5 h-3.5 mr-1" />Disable</>
                        ) : (
                          <><Power className="w-3.5 h-3.5 mr-1" />Enable</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busyId === r.id}
                        onClick={() => handleDelete(r)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={(v) => { if (!v && !creating) setShowCreate(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneIncoming className="w-5 h-5 text-emerald-500" />
              New SIP Inbound Route
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Support hotline"
                disabled={creating}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Phone numbers (E.164, one per line)
              </label>
              <textarea
                value={numbersText}
                onChange={(e) => setNumbersText(e.target.value)}
                placeholder={"+18005551234\n+18005555678"}
                disabled={creating}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Routing rule</label>
              <Select value={ruleType} onValueChange={(v) => setRuleType(v as SipInboundRuleType)} disabled={creating}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Direct (all calls → one room)</SelectItem>
                  <SelectItem value="individual">Individual (one room per caller)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {ruleType === "direct" ? (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Target room name</label>
                <Input
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="support-hotline"
                  disabled={creating}
                  className="font-mono text-xs"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Room name prefix (optional)</label>
                <Input
                  value={roomPrefix}
                  onChange={(e) => setRoomPrefix(e.target.value)}
                  placeholder="caller_"
                  disabled={creating}
                  className="font-mono text-xs"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Participant identity prefix
              </label>
              <Input
                value={identityPrefix}
                onChange={(e) => setIdentityPrefix(e.target.value)}
                placeholder="sip_"
                disabled={creating}
                className="font-mono text-xs"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Room UI uses <code>isSipInboundIdentity(id, '{identityPrefix || "sip_"}')</code> to tag callers.
              </p>
            </div>

            <Button
              onClick={handleCreate}
              disabled={creating}
              className="w-full"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Trunk + Route
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
