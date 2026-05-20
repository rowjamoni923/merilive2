import { useEffect, useMemo, useState, useCallback } from "react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { ShieldCheck, ShieldX, RefreshCw, Search, History, Crown } from "lucide-react";
import { toast } from "sonner";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";

interface TraderRow {
  helper_id: string;
  user_id: string;
  display_name: string | null;
  app_uid: string | null;
  avatar_url: string | null;
  country_code: string | null;
  country_flag: string | null;
  trader_level: number | null;
  wallet_balance: number;
  total_sold: number;
  is_active: boolean;
  is_verified: boolean;
  is_approved: boolean;
  updated_at: string;
}

interface LogRow {
  id: string;
  helper_id: string;
  user_id: string;
  display_name: string | null;
  app_uid: string | null;
  action: "approve" | "revoke";
  previous_trader_level: number | null;
  new_trader_level: number | null;
  previous_is_verified: boolean | null;
  new_is_verified: boolean | null;
  reason: string | null;
  performed_by_name: string | null;
  created_at: string;
}

const TIER_MIN: Record<number, number> = { 1: 50000, 2: 100000, 3: 150000, 4: 200000, 5: 300000 };

const fmtNum = (n: number) => (n ?? 0).toLocaleString();
const fmtDate = (iso: string) => new Date(iso).toLocaleString();

export default function AdminTopupTraderApprovals() {
  const [traders, setTraders] = useState<TraderRow[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "not_approved">("all");
  const [dialog, setDialog] = useState<{ row: TraderRow; mode: "approve" | "revoke" } | null>(null);
  const [dialogLevel, setDialogLevel] = useState<number>(1);
  const [dialogReason, setDialogReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: tData, error: tErr }, { data: lData, error: lErr }] = await Promise.all([
        supabase.rpc("admin_list_topup_traders_for_approval", { _limit: 500 }),
        supabase.rpc("admin_list_topup_trader_approval_log", { _limit: 200 }),
      ]);
      if (tErr) throw tErr;
      if (lErr) throw lErr;
      setTraders((tData || []) as TraderRow[]);
      setLog((lData || []) as LogRow[]);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Pkg37 realtime refresh on any topup_helpers change
  useAdminRealtime(["topup_helpers", "topup_trader_approval_log"], () => load());

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return traders.filter((r) => {
      if (statusFilter === "approved" && !r.is_approved) return false;
      if (statusFilter === "not_approved" && r.is_approved) return false;
      if (!needle) return true;
      return (
        (r.display_name || "").toLowerCase().includes(needle) ||
        (r.app_uid || "").toLowerCase().includes(needle) ||
        (r.country_code || "").toLowerCase().includes(needle)
      );
    });
  }, [traders, q, statusFilter]);

  const openApprove = (row: TraderRow) => {
    setDialog({ row, mode: "approve" });
    setDialogLevel(Math.min(5, Math.max(1, row.trader_level || 1)));
    setDialogReason("");
  };
  const openRevoke = (row: TraderRow) => {
    setDialog({ row, mode: "revoke" });
    setDialogReason("");
  };

  const submit = async () => {
    if (!dialog) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("admin_set_topup_trader_approval", {
        _helper_id: dialog.row.helper_id,
        _approve: dialog.mode === "approve",
        _trader_level: dialog.mode === "approve" ? dialogLevel : null,
        _reason: dialogReason || null,
      });
      if (error) throw error;
      const res = data as any;
      if (res?.success === false) throw new Error(res?.error || "Action failed");
      toast.success(dialog.mode === "approve" ? "Trader approved" : "Trader revoked");
      setDialog(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  const approvedCount = traders.filter((t) => t.is_approved).length;

  return (
    <div className="admin-content space-y-4 p-4 md:p-6">
      <AdminPageHeader
        icon={ShieldCheck}
        title="Top-up Trader Approvals"
        subtitle="Approve or revoke Level 1–5 helper-traders for UID top-up permission. Changes apply instantly to the Diamond Store."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total Helpers</div><div className="text-2xl font-bold mt-1">{traders.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Approved (L1–L5)</div><div className="text-2xl font-bold text-emerald-600 mt-1">{approvedCount}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Not Approved</div><div className="text-2xl font-bold text-rose-600 mt-1">{traders.length - approvedCount}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Recent Changes</div><div className="text-2xl font-bold mt-1">{log.length}</div></Card>
      </div>

      <Tabs defaultValue="traders">
        <TabsList>
          <TabsTrigger value="traders"><ShieldCheck className="w-4 h-4 mr-1.5" />Helpers</TabsTrigger>
          <TabsTrigger value="log"><History className="w-4 h-4 mr-1.5" />Approval Log</TabsTrigger>
        </TabsList>

        <TabsContent value="traders" className="space-y-3">
          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, UID, country…" className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="approved">Approved only</SelectItem>
                <SelectItem value="not_approved">Not approved</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Helper</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No helpers match.</TableCell></TableRow>
                ) : filtered.map((r) => {
                  const lvl = Math.max(1, Math.min(5, r.trader_level || 1));
                  const meetsMin = (r.wallet_balance || 0) >= (TIER_MIN[lvl] ?? 50000);
                  return (
                    <TableRow key={r.helper_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <img src={r.avatar_url || "/placeholder.svg"} className="w-8 h-8 rounded-full object-cover ring-1 ring-border" alt="" />
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{r.display_name || "Helper"}</div>
                            <div className="text-[10px] text-muted-foreground">UID: {r.app_uid || "—"}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><span className="text-sm">{r.country_flag || "🌍"} {r.country_code || "—"}</span></TableCell>
                      <TableCell>
                        <Badge className={lvl >= 5 ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-700"}>
                          {lvl >= 5 && <Crown className="w-3 h-3 mr-0.5" />}Lv.{lvl}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className={`text-sm font-mono ${meetsMin ? "text-foreground" : "text-rose-600"}`}>{fmtNum(r.wallet_balance)} 💎</div>
                        <div className="text-[10px] text-muted-foreground">min L{lvl}: {fmtNum(TIER_MIN[lvl] ?? 50000)}</div>
                      </TableCell>
                      <TableCell>
                        {r.is_approved ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0">✓ Approved</Badge>
                        ) : (
                          <Badge className="bg-rose-100 text-rose-700 border-0">✕ Not Approved</Badge>
                        )}
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {r.is_verified ? "verified" : "unverified"} · {r.is_active ? "active" : "inactive"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {r.is_approved ? (
                          <Button size="sm" variant="destructive" onClick={() => openRevoke(r)}>
                            <ShieldX className="w-3.5 h-3.5 mr-1" />Revoke
                          </Button>
                        ) : (
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openApprove(r)}>
                            <ShieldCheck className="w-3.5 h-3.5 mr-1" />Approve
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="log">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Helper</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Before → After</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No approval changes yet.</TableCell></TableRow>
                ) : log.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.created_at)}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{r.display_name || "Helper"}</div>
                      <div className="text-[10px] text-muted-foreground">UID: {r.app_uid || "—"}</div>
                    </TableCell>
                    <TableCell>
                      {r.action === "approve" ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-0">Approved</Badge>
                      ) : (
                        <Badge className="bg-rose-100 text-rose-700 border-0">Revoked</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      Lv.{r.previous_trader_level ?? "—"} ({r.previous_is_verified ? "✓" : "✕"}) →
                      {" "}Lv.{r.new_trader_level ?? "—"} ({r.new_is_verified ? "✓" : "✕"})
                    </TableCell>
                    <TableCell className="text-xs max-w-[220px] truncate" title={r.reason || ""}>{r.reason || "—"}</TableCell>
                    <TableCell className="text-xs">{r.performed_by_name || "admin"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "approve" ? "Approve UID top-up permission" : "Revoke UID top-up permission"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.mode === "approve"
                ? "This helper will be allowed to process UID top-ups immediately."
                : "This helper will no longer be able to process UID top-ups. Their record stays for history."}
            </DialogDescription>
          </DialogHeader>
          {dialog && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                <img src={dialog.row.avatar_url || "/placeholder.svg"} className="w-9 h-9 rounded-full object-cover" alt="" />
                <div>
                  <div className="font-semibold text-sm">{dialog.row.display_name || "Helper"}</div>
                  <div className="text-[10px] text-muted-foreground">UID {dialog.row.app_uid || "—"} · {dialog.row.country_flag} {dialog.row.country_code}</div>
                </div>
              </div>

              {dialog.mode === "approve" && (
                <div>
                  <label className="text-xs font-medium">Trader Level</label>
                  <Select value={String(dialogLevel)} onValueChange={(v) => setDialogLevel(parseInt(v, 10))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((l) => (
                        <SelectItem key={l} value={String(l)}>Level {l} — min wallet {fmtNum(TIER_MIN[l])}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <label className="text-xs font-medium">Reason {dialog.mode === "revoke" ? "(recommended)" : "(optional)"}</label>
                <Textarea value={dialogReason} onChange={(e) => setDialogReason(e.target.value)} placeholder="Short note for the audit log…" rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={submitting}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={submitting}
              className={dialog?.mode === "approve" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
              variant={dialog?.mode === "revoke" ? "destructive" : "default"}
            >
              {submitting ? "Saving…" : dialog?.mode === "approve" ? "Approve" : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
