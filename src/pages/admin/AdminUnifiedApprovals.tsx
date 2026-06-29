/**
 * Unified Approvals Hub — single owner page for every pending financial/admin action
 * across the platform: Sub-Admins, Support Admins, Country Super Admins.
 *
 * Sources:
 *   - admin_pending_actions   → sub-admin / support-admin queued actions
 *   - csa_pending_actions     → CSA queued actions (settings + financial reviews)
 *
 * Owner can approve / reject each one; every action is server-authoritative and
 * idempotent. Counts are live (10s refresh) so the menu badge stays accurate.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Check, X, ShieldCheck, Globe2, Inbox, Clock } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import AdminCsaApprovals from "@/components/admin/agency/AdminCsaApprovals";

type SubAdminRow = {
  id: string;
  action_type: string;
  payload: any;
  reason: string | null;
  status: string;
  requested_by_name: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  owner_notes: string | null;
  created_at: string;
};

const ACTION_COLOR: Record<string, string> = {
  user_ban: "admin-bg-danger/20 text-rose-300 border-rose-500/40",
  user_unban: "admin-bg-success/20 text-emerald-300 border-emerald-500/40",
  balance_adjust: "admin-bg-warning/20 text-amber-300 border-amber-500/40",
  agency_close: "admin-bg-danger/20 text-rose-300 border-rose-500/40",
  agency_reactivate: "admin-bg-success/20 text-emerald-300 border-emerald-500/40",
  default: "bg-violet-500/20 text-violet-300 border-violet-500/40",
};

export default function AdminUnifiedApprovals() {
  const [tab, setTab] = useState<"subadmin" | "csa">("subadmin");
  const [subStatus, setSubStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [subRows, setSubRows] = useState<SubAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [counts, setCounts] = useState({ sub: 0, csa: 0 });

  const loadSub = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_pending_actions" as any)
      .select("*")
      .eq("status", subStatus)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    setSubRows((data as any[]) || []);
    setLoading(false);
  }, [subStatus]);

  const loadCounts = useCallback(async () => {
    const [{ count: sub }, { count: csa }] = await Promise.all([
      supabase.from("admin_pending_actions" as any).select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("csa_pending_actions" as any).select("*", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    setCounts({ sub: sub || 0, csa: csa || 0 });
  }, []);

  useEffect(() => { loadSub(); }, [loadSub]);
  useEffect(() => {
    loadCounts();
    const t = setInterval(loadCounts, 10000);
    return () => clearInterval(t);
  }, [loadCounts]);

  const approveSub = async (id: string) => {
    setBusy(id);
    try {
      const { error } = await supabase.rpc("admin_approve_pending_action" as any, { _id: id, _notes: null });
      if (error) throw error;
      toast.success("Approved & executed");
      loadSub(); loadCounts();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally { setBusy(null); }
  };

  const rejectSub = async (id: string) => {
    const reason = prompt("Reject reason (sent to requester):");
    if (!reason) return;
    setBusy(id);
    try {
      const { error } = await supabase.rpc("admin_reject_pending_action" as any, { _id: id, _notes: reason });
      if (error) throw error;
      toast.success("Rejected");
      loadSub(); loadCounts();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally { setBusy(null); }
  };

  const totalPending = counts.sub + counts.csa;

  return (
    <div className="admin-pro-shell min-h-screen p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="rounded-2xl admin-surface border admin-border p-5 relative overflow-hidden shadow-[var(--admin-shadow-3d)]">
        <div className="relative flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold admin-text flex items-center gap-2">
              <Inbox className="w-7 h-7 admin-accent-primary" /> Owner Approvals Hub
            </h1>
            <p className="text-sm admin-text-soft mt-1">
              Every financial / admin action queued by Sub-Admins, Support Admins and Country Super Admins lands here for your final approval.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="admin-chip-danger admin-accent-danger border border-rose-200 text-sm px-3 py-1">
              {totalPending} pending
            </Badge>
          </div>
        </div>
      </div>

      {/* Two top-level sources */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="space-y-4">
        <TabsList className="admin-surface-sunken border admin-border p-1 grid grid-cols-2 w-full md:w-auto md:inline-flex">
          <TabsTrigger value="subadmin" className="data-[state=active]:admin-surface data-[state=active]:admin-accent-primary data-[state=active]:shadow-sm gap-2">
            <ShieldCheck className="w-4 h-4" /> Sub-Admin & Support
            {counts.sub > 0 && <Badge className="admin-bg-danger text-white ml-1">{counts.sub}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="csa" className="data-[state=active]:admin-surface data-[state=active]:admin-accent-warning data-[state=active]:shadow-sm gap-2">
            <Globe2 className="w-4 h-4" /> Country Super Admin
            {counts.csa > 0 && <Badge className="admin-bg-danger text-white ml-1">{counts.csa}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* SUB-ADMIN / SUPPORT */}
        <TabsContent value="subadmin" className="space-y-3">
          <Tabs value={subStatus} onValueChange={(v) => setSubStatus(v as any)}>
            <TabsList className="admin-surface-sunken border admin-border">
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
          </Tabs>

          {loading ? (
            <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin admin-accent-primary" /></div>
          ) : subRows.length === 0 ? (
            <Card className="p-10 text-center">
              <Clock className="w-10 h-10 admin-text-muted mx-auto mb-2" />
              <p className="admin-text-muted text-sm">No {subStatus} sub-admin requests</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {subRows.map((r) => {
                const color = ACTION_COLOR[r.action_type] || ACTION_COLOR.default;
                return (
                  <Card key={r.id} className="p-4 hover:border-violet-300 transition">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={color}>{r.action_type.replace(/_/g, " ")}</Badge>
                          <span className="text-xs admin-text-muted">
                            by <b className="admin-text-soft">{r.requested_by_name || "—"}</b>
                            {" · "}{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        {r.reason && <p className="text-sm admin-text-soft mt-2">{r.reason}</p>}
                        {r.payload && (
                          <pre className="mt-2 text-[11px] admin-surface-soft border admin-border rounded p-2 max-h-32 overflow-auto admin-text-soft">
                            {JSON.stringify(r.payload, null, 2)}
                          </pre>
                        )}
                        {r.owner_notes && (
                          <p className="text-[11px] admin-accent-warning mt-2">Owner note: {r.owner_notes}</p>
                        )}
                      </div>
                      {r.status === "pending" && (
                        <div className="flex flex-col gap-2 shrink-0">
                          <Button size="sm" onClick={() => approveSub(r.id)} disabled={busy === r.id}
                            className="admin-bg-success text-white hover:admin-bg-success">
                            {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => rejectSub(r.id)} disabled={busy === r.id}
                            className="border-rose-200 admin-accent-danger hover:admin-chip-danger">
                            <X className="w-3.5 h-3.5 mr-1" /> Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* CSA */}
        <TabsContent value="csa" className="space-y-3">
          <AdminCsaApprovals />
        </TabsContent>
      </Tabs>
    </div>
  );
}
