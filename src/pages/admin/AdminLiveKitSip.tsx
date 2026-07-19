/**
 * Pkg138 UI — Admin LiveKit SIP Ops Dashboard.
 *
 * Read-only inspection of SIP trunks (inbound / outbound) and dispatch rules.
 * Safe deletions with confirmation dialog. No creation UI (stays in Pkg115 inbound
 * + Pkg110 outbound edge functions).
 *
 * Server kill-switch: app_settings.livekit_signaling_enabled.sip_ops
 * Backend: livekit-sip-ops edge fn (Pkg138) — admin-only via x-admin-access-token.
 *
 * Adheres to admin no-auto-refresh policy (Pkg39) + $1400-rule.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Phone,
  RefreshCw,
  Loader2,
  Search,
  PhoneIncoming,
  PhoneOutgoing,
  Route,
  Trash2,
  Eye,
  X,
  AlertTriangle,
  ShieldCheck,
  Globe,
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
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  listLiveKitInboundTrunks,
  listLiveKitOutboundTrunks,
  listLiveKitDispatchRules,
  deleteLiveKitInboundTrunk,
  deleteLiveKitOutboundTrunk,
  deleteLiveKitDispatchRule,
  type LiveKitInboundTrunkSummary,
  type LiveKitOutboundTrunkSummary,
  type LiveKitDispatchRuleSummary,
} from "@/lib/livekitSipOps";

type TabKey = "inbound" | "outbound" | "dispatch";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "inbound", label: "Inbound Trunks", icon: PhoneIncoming },
  { key: "outbound", label: "Outbound Trunks", icon: PhoneOutgoing },
  { key: "dispatch", label: "Dispatch Rules", icon: Route },
];

function maskSecret(val: string | null): string {
  if (!val) return "—";
  if (val.length <= 4) return "••••";
  return `${val.slice(1, 3)}•••${val.slice(-3)}`;
}

export default function AdminLiveKitSip() {
  const [tab, setTab] = useState<TabKey>("inbound");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [inbound, setInbound] = useState<LiveKitInboundTrunkSummary[]>([]);
  const [outbound, setOutbound] = useState<LiveKitOutboundTrunkSummary[]>([]);
  const [dispatch, setDispatch] = useState<LiveKitDispatchRuleSummary[]>([]);

  const [detail, setDetail] = useState<
    | LiveKitInboundTrunkSummary
    | LiveKitOutboundTrunkSummary
    | LiveKitDispatchRuleSummary
    | null
  >(null);

  const [confirmDelete, setConfirmDelete] = useState<{
    type: TabKey;
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [inb, out, disp] = await Promise.all([
        listLiveKitInboundTrunks().catch((e) => {
          handleError(e, "inbound");
          return [] as LiveKitInboundTrunkSummary[];
        }),
        listLiveKitOutboundTrunks().catch((e) => {
          handleError(e, "outbound");
          return [] as LiveKitOutboundTrunkSummary[];
        }),
        listLiveKitDispatchRules().catch((e) => {
          handleError(e, "dispatch");
          return [] as LiveKitDispatchRuleSummary[];
        }),
      ]);
      setInbound(inb);
      setOutbound(out);
      setDispatch(disp);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleError(e: any, label: string) {
    const msg = String(e?.message || e || "");
    if (/sip_ops_disabled/i.test(msg)) {
      toast.error("Kill-switch 'sip_ops' is OFF. Enable in Pricing Hub → LiveKit.");
    } else {
      toast.error(`Failed to load ${label}: ${msg || "unknown"}`);
    }
  }

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let src: any[] = [];
    if (tab === "inbound") src = inbound;
    else if (tab === "outbound") src = outbound;
    else src = dispatch;
    if (!q) return src;
    return src.filter((item) =>
      JSON.stringify(item).toLowerCase().includes(q),
    );
  }, [tab, inbound, outbound, dispatch, search]);

  const stats = useMemo(() => ({
    inbound: inbound.length,
    outbound: outbound.length,
    dispatch: dispatch.length,
  }), [inbound, outbound, dispatch]);

  const onDelete = useCallback(async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.type === "inbound") {
        await deleteLiveKitInboundTrunk(confirmDelete.id);
        setInbound((prev) => prev.filter((t) => t.sipTrunkId !== confirmDelete.id));
      } else if (confirmDelete.type === "outbound") {
        await deleteLiveKitOutboundTrunk(confirmDelete.id);
        setOutbound((prev) => prev.filter((t) => t.sipTrunkId !== confirmDelete.id));
      } else {
        await deleteLiveKitDispatchRule(confirmDelete.id);
        setDispatch((prev) => prev.filter((r) => r.sipDispatchRuleId !== confirmDelete.id));
      }
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(`Delete failed: ${e?.message || "unknown"}`);
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }, [confirmDelete]);

  const currentTab = TABS.find((t) => t.key === tab)!;

  return (
    <div className="admin-pro-shell space-y-4 sm:space-y-6 px-2 sm:px-0 admin-content">
      <div className="bg-gradient-to-r from-teal-600 via-cyan-600 to-sky-600 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Phone className="w-6 h-6" />
              LiveKit SIP
            </h1>
            <p className="text-slate-700 text-xs sm:text-sm mt-1">
              Pkg138 — read-only SIP trunk / dispatch rule inspection. Kill-switch
              <code className="ml-1 px-1.5 py-0.5 rounded bg-black/20 text-[10px]">
                sip_ops
              </code>
              .
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={fetchAll}
              variant="outline"
              disabled={loading}
              className="border-white/30 text-slate-900 hover:bg-white/20"
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

      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Inbound Trunks</p>
            <p className="text-teal-400 font-bold text-xl">{stats.inbound}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Outbound Trunks</p>
            <p className="text-cyan-400 font-bold text-xl">{stats.outbound}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-slate-400 text-xs">Dispatch Rules</p>
            <p className="text-sky-400 font-bold text-xl">{stats.dispatch}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setSearch("");
              }}
              variant={active ? "default" : "outline"}
              className={
                active
                  ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white border-transparent"
                  : "border-slate-200 text-slate-300 hover:bg-slate-700 hover:text-white"
              }
            >
              <t.icon className="w-4 h-4 mr-1.5" />
              {t.label}
            </Button>
          );
        })}
      </div>

      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder={`Search ${currentTab.label.toLowerCase()}…`}
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
            <Phone className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400">No {currentTab.label.toLowerCase()} found.</p>
            <p className="text-slate-500 text-xs mt-2">
              Trunks and rules appear here once configured in LiveKit Cloud SIP.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((item: any) => {
            const isInbound = tab === "inbound";
            const isOutbound = tab === "outbound";
            const isDispatch = tab === "dispatch";
            const id =
              item.sipTrunkId || item.sipDispatchRuleId || "—";
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="bg-slate-50 border-slate-200 hover:border-teal-500/50 transition-colors">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                      <currentTab.icon className="w-5 h-5 text-teal-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge className="bg-slate-600 text-white text-[10px]">
                            {tab}
                          </Badge>
                          <span className="text-sm text-slate-900 font-mono truncate">
                            {item.name || id}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                          {isInbound && (
                            <>
                              <span className="flex items-center gap-1">
                                <PhoneIncoming className="w-3 h-3" />
                                {(item.numbers || []).length} number(s)
                              </span>
                              <span className="flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" />
                                auth: {item.authUsername ? "yes" : "no"}
                              </span>
                              <span className="flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                {(item.allowedAddresses || []).length} allow-list
                              </span>
                            </>
                          )}
                          {isOutbound && (
                            <>
                              <span className="flex items-center gap-1">
                                <PhoneOutgoing className="w-3 h-3" />
                                {(item.numbers || []).length} number(s)
                              </span>
                              <span className="flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                {item.address || "—"}
                              </span>
                              <span className="flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" />
                              </span>
                            </>
                          )}
                          {isDispatch && (
                            <>
                              <span className="flex items-center gap-1">
                                <Route className="w-3 h-3" />
                                {(item.trunkIds || []).length} trunk(s)
                              </span>
                              <span>
                                hide phone: {item.hidePhoneNumber ? "yes" : "no"}
                              </span>
                            </>
                          )}
                          <span className="font-mono">{id.slice(0, 16)}…</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-slate-200 text-slate-300 hover:bg-slate-700"
                          onClick={() => setDetail(item)}
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Inspect
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-700/50 text-red-400 hover:bg-red-950/40 hover:text-red-300"
                          onClick={() =>
                            setConfirmDelete({
                              id,
                            })
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Inspect dialog */}
      <Dialog
        open={!!detail}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
      >
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <currentTab.icon className="w-5 h-5 text-teal-400" />
              <span className="font-mono truncate">
                {(detail as any)?.name || (detail as any)?.sipTrunkId || (detail as any)?.sipDispatchRuleId || "—"}
              </span>
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-2">
              <pre className="bg-slate-50 rounded p-3 text-[11px] text-slate-300 overflow-x-auto">
                {JSON.stringify(detail, null, 2)}
              </pre>
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

      {/* Delete confirmation */}
      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null);
        }}
      >
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Confirm Delete
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Remove <span className="text-slate-900 font-mono">{confirmDelete?.name}</span>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              className="border-slate-200 text-slate-300 hover:bg-slate-700"
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={onDelete}
            >
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
