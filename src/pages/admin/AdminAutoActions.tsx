import { useCallback, useEffect, useMemo, useState } from "react";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { RefreshCw, Undo2, Loader2, ShieldCheck, History } from "lucide-react";
import AdminPagination from "@/components/admin/AdminPagination";

type Row = {
  action_type: string;
  action_id: string;
  subject_id: string | null;
  agency_id: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  processed_at: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
  method: string | null;
  money_amount: number | null;
  total_count: number;
};

const TYPES = [
  { value: "all", label: "All" },
  { value: "recharge", label: "Recharge" },
  { value: "agency_withdrawal", label: "Agency Withdrawal" },
  { value: "helper_withdrawal", label: "Helper Withdrawal" },
  { value: "payroll", label: "Payroll" },
  { value: "commission", label: "Commission" },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map(t => [t.value, t.label]));

const PAGE_SIZE = 50;

export default function AdminAutoActions() {
  const [type, setType] = useState("all");
  const [status, setStatus] = useState<string>("all");
  const [reversedFilter, setReversedFilter] = useState<"all" | "active" | "reversed">("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<Row | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseBusy, setReverseBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await adminSupabase.rpc("admin_list_auto_actions", {
      _types: type === "all" ? null : [type],
      _status: status === "all" ? null : status,
      _only_reversed:
        reversedFilter === "all" ? null : reversedFilter === "reversed",
      _from: null,
      _to: null,
      _limit: PAGE_SIZE,
      _offset: (page - 1) * PAGE_SIZE,
    });
    setLoading(false);
    if (error) {
      toast.error(`Load failed: ${error.message}`);
      return;
    }
    const list = (data || []) as Row[];
    setRows(list);
    setTotal(list[0]?.total_count ?? 0);
  }, [type, status, reversedFilter, page]);

  useEffect(() => { setPage(1); }, [type, status, reversedFilter]);
  useEffect(() => { load(); }, [load]);

  const openReverse = (r: Row) => {
    setReverseTarget(r);
    setReverseReason("");
  };

  const submitReverse = async () => {
    if (!reverseTarget) return;
    const reason = reverseReason.trim();
    if (reason.length < 5) {
      toast.error("Reversal reason must be at least 5 characters.");
      return;
    }
    setReverseBusy(true);
    const { data, error } = await adminSupabase.rpc("admin_reverse_auto_action", {
      _action_type: reverseTarget.action_type,
      _action_id: reverseTarget.action_id,
      _reason: reason,
    });
    setReverseBusy(false);
    if (error) {
      toast.error(`Reverse failed: ${error.message}`);
      return;
    }
    const res = data as any;
    if (res?.pending) {
      toast.success("Submitted for Owner Approval");
    } else if (res?.success) {
      toast.success("Reversed successfully — balance refunded.");
    } else {
      toast.error(res?.error || "Reverse failed");
      setReverseBusy(false);
      return;
    }
    setReverseTarget(null);
    load();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const statusBadge = (r: Row) => {
    if (r.reversed_at) return <Badge variant="destructive">Reversed</Badge>;
    const s = (r.status || "").toLowerCase();
    if (s === "completed" || s === "approved" || s === "credited" || s === "success")
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">{r.status}</Badge>;
    if (s === "pending") return <Badge variant="secondary">Pending</Badge>;
    if (s === "failed" || s === "rejected" || s === "cancelled") return <Badge variant="destructive">{r.status}</Badge>;
    return <Badge variant="outline">{r.status}</Badge>;
  };

  return (
    <div className="admin-content space-y-6 p-4 md:p-6">
      <AdminPageHeader
        icon={History}
        title="Auto Actions Log"
        subtitle="Every automatic financial action — recharge, withdrawal, commission, payroll. Verify and reverse with full audit."
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Tabs value={type} onValueChange={setType} className="flex-1 min-w-[260px]">
              <TabsList className="flex flex-wrap h-auto">
                {TYPES.map(t => (
                  <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="completed">completed</SelectItem>
                <SelectItem value="approved">approved</SelectItem>
                <SelectItem value="credited">credited</SelectItem>
                <SelectItem value="pending">pending</SelectItem>
                <SelectItem value="failed">failed</SelectItem>
                <SelectItem value="reversed">reversed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={reversedFilter} onValueChange={(v: any) => setReversedFilter(v)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="reversed">Reversed only</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Sub-admin reversals require Owner approval. Owner reversals execute immediately. Each row can be reversed only once.
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No actions found.
                  </TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={`${r.action_type}-${r.action_id}`}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {format(new Date(r.created_at), "MMM dd, HH:mm")}
                    </TableCell>
                    <TableCell><Badge variant="outline">{TYPE_LABEL[r.action_type] || r.action_type}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">
                      {(r.subject_id || r.agency_id || "—").toString().slice(0, 12)}…
                    </TableCell>
                    <TableCell className="font-medium">
                      {Number(r.amount).toLocaleString()} <span className="text-xs text-muted-foreground">{r.currency}</span>
                      {r.money_amount ? <div className="text-xs text-muted-foreground">${Number(r.money_amount).toFixed(2)}</div> : null}
                    </TableCell>
                    <TableCell className="text-xs">{r.method || "—"}</TableCell>
                    <TableCell>
                      {statusBadge(r)}
                      {r.reversed_at && r.reversal_reason && (
                        <div className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate" title={r.reversal_reason}>
                          {r.reversal_reason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!!r.reversed_at}
                        onClick={() => openReverse(r)}
                      >
                        <Undo2 className="h-3 w-3 mr-1" />
                        {r.reversed_at ? "Reversed" : "Reverse"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <AdminPagination
            page={page}
            totalPages={totalPages}
            totalCount={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <Dialog open={!!reverseTarget} onOpenChange={(o) => !o && setReverseTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse Auto Action</DialogTitle>
            <DialogDescription>
              {reverseTarget && (
                <>
                  <strong>{TYPE_LABEL[reverseTarget.action_type]}</strong> of{" "}
                  <strong>{Number(reverseTarget.amount).toLocaleString()} {reverseTarget.currency}</strong>.<br />
                  This refunds the balance and marks the row as reversed. Cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason (min 5 chars) — e.g. 'Duplicate credit caught in audit'"
            value={reverseReason}
            onChange={(e) => setReverseReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReverseTarget(null)} disabled={reverseBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submitReverse} disabled={reverseBusy}>
              {reverseBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Undo2 className="h-4 w-4 mr-2" />}
              Confirm Reverse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
