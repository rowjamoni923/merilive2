import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, MoreVertical, Plus, Minus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { formatAdminError } from "@/utils/formatAdminError";
import { recordAdminError } from "@/utils/adminErrorLog";

interface CommissionRow {
  id: string;
  agency_id: string;
  agency_name?: string | null;
  transaction_type: string;
  original_amount: number;
  commission_rate: number;
  commission_amount: number;
  period_start: string | null;
  notes: string | null;
  created_at: string;
}

const fmt = (n: number) => {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${sign}${(a / 1_000).toFixed(1)}K`;
  return `${sign}${a}`;
};

const typeLabel: Record<string, { label: string; color: string }> = {
  weekly_aggregate: { label: "Weekly Tier", color: "bg-green-500/15 text-green-600" },
  upper_referral_bonus: { label: "Upper Bonus", color: "bg-purple-500/15 text-purple-600" },
  manual_adjustment: { label: "Manual Adjust", color: "bg-amber-500/15 text-amber-600" },
  weekly_distribution: { label: "Weekly (legacy)", color: "bg-slate-500/15 text-slate-600" },
  gift: { label: "Gift (legacy)", color: "bg-slate-500/15 text-slate-600" },
  call: { label: "Call (legacy)", color: "bg-slate-500/15 text-slate-600" },
};

const AdminAgencyCommissionLog = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [target, setTarget] = useState<CommissionRow | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSign, setAdjustSign] = useState<"plus" | "minus">("plus");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("agency_commission_history")
        .select("id, agency_id, transaction_type, original_amount, commission_rate, commission_amount, period_start, notes, created_at, agencies(name)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      setRows((data || []).map((r: any) => ({
        ...r,
        agency_name: r.agencies?.name ?? null,
      })));
    } catch (e) {
      recordAdminError({ kind: "rpc", label: "AdminAgencyCommissionLog.load", message: formatAdminError(e) });
      toast.error("Failed to load commission log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdjust = (row: CommissionRow, sign: "plus" | "minus") => {
    setTarget(row);
    setAdjustSign(sign);
    setAdjustAmount("");
    setAdjustReason("");
    setAdjustOpen(true);
  };

  const submitAdjust = async () => {
    if (!target) return;
    const amt = Math.floor(Number(adjustAmount));
    if (!amt || amt <= 0) { toast.error("Enter a positive bean amount"); return; }
    if (adjustReason.trim().length < 4) { toast.error("Reason required (min 4 chars)"); return; }
    setSubmitting(true);
    try {
      const delta = adjustSign === "plus" ? amt : -amt;
      const { data, error } = await supabase.rpc("admin_adjust_agency_commission", {
        _agency_id: target.agency_id,
        _delta_beans: delta,
        _reason: adjustReason.trim(),
      });
      if (error) throw error;
      toast.success(`Adjusted ${adjustSign === "plus" ? "+" : "-"}${fmt(amt)} beans`);
      setAdjustOpen(false);
      await load();
    } catch (e) {
      recordAdminError({ kind: "rpc", label: "AdminAgencyCommissionLog.adjust", message: formatAdminError(e) });
      toast.error(formatAdminError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = rows.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (r.agency_name || "").toLowerCase().includes(q)
      || r.transaction_type.toLowerCase().includes(q)
      || (r.notes || "").toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-card border-b border-border p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Agency Commission Log</h1>
          <p className="text-xs text-muted-foreground">Weekly tier-based commission + manual adjustments</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="w-4 h-4" /> Filter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Search agency, type, or note..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-10">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-10">No commission records</p>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((r) => {
                  const t = typeLabel[r.transaction_type] || { label: r.transaction_type, color: "bg-muted" };
                  const isNeg = r.commission_amount < 0;
                  return (
                    <div key={r.id} className="p-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge className={t.color} variant="secondary">{t.label}</Badge>
                          {r.period_start && (
                            <span className="text-xs text-muted-foreground">
                              week {new Date(r.period_start).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-semibold truncate">{r.agency_name || r.agency_id}</div>
                        {r.notes && <div className="text-xs text-muted-foreground truncate">{r.notes}</div>}
                        <div className="text-xs text-muted-foreground">
                          on {fmt(r.original_amount)} beans @ {Number(r.commission_rate).toFixed(2)}%
                          {" · "}
                          {new Date(r.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-base font-bold ${isNeg ? "text-red-500" : "text-green-500"}`}>
                          {isNeg ? "" : "+"}{fmt(r.commission_amount)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">beans</div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openAdjust(r, "plus")}>
                            <Plus className="w-4 h-4 mr-2 text-green-500" /> Add beans
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openAdjust(r, "minus")}>
                            <Minus className="w-4 h-4 mr-2 text-red-500" /> Subtract beans
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjustSign === "plus" ? "Add beans to" : "Subtract beans from"} {target?.agency_name || "agency"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount (beans)</Label>
              <Input
                type="number"
                min={1}
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="e.g. 50000"
              />
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Why this adjustment? (audit trail)"
                rows={3}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This {adjustSign === "plus" ? "credits" : "debits"} the agency's beans balance and is logged in commission history.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button
              className={adjustSign === "plus" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
              onClick={submitAdjust}
              disabled={submitting}
            >
              {submitting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm {adjustSign === "plus" ? "Add" : "Subtract"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAgencyCommissionLog;
