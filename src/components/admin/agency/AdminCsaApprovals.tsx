import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Check, X, Clock, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface PendingAction {
  id: string;
  csa_user_id: string;
  country_code: string;
  action_type: string;
  description: string | null;
  payload: any;
  target_table: string | null;
  target_id: string | null;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  reject_reason: string | null;
  csa_email?: string;
  csa_agency_name?: string;
}

const ACTION_LABEL: Record<string, { label: string; color: string }> = {
  topup_method_upsert: { label: "Top-up Method", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  topup_method_delete: { label: "Delete Top-up", color: "bg-rose-500/20 text-rose-300 border-rose-500/40" },
  withdrawal_method_upsert: { label: "Withdrawal Method", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" },
  withdrawal_method_delete: { label: "Delete Withdrawal", color: "bg-rose-500/20 text-rose-300 border-rose-500/40" },
  helper_topup_review: { label: "Helper Top-up", color: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  helper_withdrawal_review: { label: "Helper Withdrawal", color: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  agency_withdrawal_review: { label: "Agency Withdrawal", color: "bg-violet-500/20 text-violet-300 border-violet-500/40" },
};

export default function AdminCsaApprovals() {
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [rows, setRows] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("csa_pending_actions")
      .select("*")
      .eq("status", tab)
      .order("requested_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);

    // enrich CSA info
    const userIds = Array.from(new Set((data || []).map(r => r.csa_user_id)));
    let enrich: Record<string, { email: string; agency_name: string }> = {};
    if (userIds.length) {
      const { data: csaRows } = await supabase
        .from("country_super_admins")
        .select("user_id, email, agency_id, agencies:agency_id(name)")
        .in("user_id", userIds);
      enrich = Object.fromEntries(
        (csaRows || []).map((r: any) => [r.user_id, { email: r.email, agency_name: r.agencies?.name || "—" }])
      );
    }
    setRows((data || []).map((r: any) => ({
      ...r,
      csa_email: enrich[r.csa_user_id]?.email,
      csa_agency_name: enrich[r.csa_user_id]?.agency_name,
    })));
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const approve = async (id: string) => {
    if (!confirm("Approve this CSA action? It will be executed immediately.")) return;
    setBusyId(id);
    const { error } = await supabase.rpc("admin_approve_csa_action", { _action_id: id });
    setBusyId(null);
    if (error) toast.error(error.message);
    else { toast.success("Approved & executed"); load(); }
  };

  const reject = async (id: string) => {
    const reason = prompt("Reject reason (optional)") || "";
    setBusyId(id);
    const { error } = await supabase.rpc("admin_reject_csa_action", { _action_id: id, _reason: reason });
    setBusyId(null);
    if (error) toast.error(error.message);
    else { toast.success("Rejected"); load(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-400" />
            CSA Approval Queue
          </h2>
          <p className="text-xs text-white/50">Country Super Admin actions waiting for owner approval</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="bg-slate-800 border-slate-700">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="pending" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">
            <Clock className="w-4 h-4 mr-1" /> Pending
          </TabsTrigger>
          <TabsTrigger value="approved" className="data-[state=active]:bg-emerald-600">
            <Check className="w-4 h-4 mr-1" /> Approved
          </TabsTrigger>
          <TabsTrigger value="rejected" className="data-[state=active]:bg-rose-600">
            <X className="w-4 h-4 mr-1" /> Rejected
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
          ) : rows.length === 0 ? (
            <Card className="bg-slate-800/60 border-slate-700 p-8 text-center text-white/50">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No {tab} actions.
            </Card>
          ) : rows.map((r) => {
            const meta = ACTION_LABEL[r.action_type] || { label: r.action_type, color: "bg-slate-500/20 text-slate-300" };
            return (
              <Card key={r.id} className="bg-slate-800/60 border-slate-700 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge className={`${meta.color} border text-[10px]`}>{meta.label}</Badge>
                      <Badge className="bg-slate-700 text-white/80 text-[10px]">{r.country_code}</Badge>
                      <span className="text-[10px] text-white/40">
                        {formatDistanceToNow(new Date(r.requested_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-white">{r.description || r.action_type}</p>
                    <p className="text-[10px] text-white/40 mt-1">
                      by {r.csa_agency_name} · {r.csa_email}
                    </p>
                    {r.reject_reason && (
                      <p className="text-xs text-rose-300 mt-1">Reject reason: {r.reject_reason}</p>
                    )}
                    <details className="mt-2">
                      <summary className="text-[10px] text-white/40 cursor-pointer hover:text-white/60">View payload</summary>
                      <pre className="mt-1 text-[10px] bg-slate-900 p-2 rounded overflow-x-auto text-white/70 max-h-40">
{JSON.stringify(r.payload, null, 2)}
                      </pre>
                    </details>
                  </div>
                  {tab === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" onClick={() => approve(r.id)} disabled={busyId === r.id}
                        className="bg-emerald-600 hover:bg-emerald-500">
                        {busyId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => reject(r.id)} disabled={busyId === r.id}
                        className="bg-rose-950 border-rose-500/40 text-rose-300 hover:bg-rose-900">
                        <X className="w-4 h-4 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
