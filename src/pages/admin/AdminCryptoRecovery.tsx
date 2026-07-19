import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Search, AlertTriangle, CheckCircle2, Clock, XCircle, Gem, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { format } from "date-fns";
import { CopyableUid } from "@/components/admin/CopyableUid";

type Topup = {
  id: string;
  user_id: string;
  status: string;
  diamonds_amount: number;
  price_usd: number;
  pay_currency: string;
  pay_network: string | null;
  pay_address: string | null;
  pay_amount: number | null;
  external_user_id: string;
  payment_id: string | null;
  target_type: string;
  created_at: string;
  paid_at: string | null;
  credited_at: string | null;
  last_polled_at: string | null;
  error_message: string | null;
};

const STATUS_META: Record<string, { color: string; icon: any; label: string }> = {
  pending:  { color: "bg-amber-500/20 text-amber-300 border-amber-500/40", icon: Clock,         label: "Pending" },
  paid:     { color: "bg-blue-500/20 text-blue-300 border-blue-500/40",    icon: CheckCircle2,  label: "Paid (crediting)" },
  credited: { color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", icon: CheckCircle2, label: "Credited" },
  expired:  { color: "bg-rose-500/20 text-rose-300 border-rose-500/40",    icon: XCircle,       label: "Expired" },
  failed:   { color: "bg-rose-500/20 text-rose-300 border-rose-500/40",    icon: AlertTriangle, label: "Failed" },
};

const AdminCryptoRecovery = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Topup[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("expired");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [stats, setStats] = useState<{ status: string; count: number; usd: number }[]>([]);

  const loadStats = useCallback(async () => {
    const { data, error } = await supabase
      .from("swift_pay_topups")
      .select("status, price_usd");
    if (error) return;
    const grouped = new Map<string, { count: number; usd: number }>();
    (data || []).forEach((r: any) => {
      const s = r.status || "unknown";
      const g = grouped.get(s) || { count: 0, usd: 0 };
      g.count++;
      g.usd += Number(r.price_usd || 0);
      grouped.set(s, g);
    });
    setStats([...grouped.entries()].map(([status, v]) => ({ status, ...v })));
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("swift_pay_topups")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (error) {
      toast.error("Load failed: " + error.message);
    } else {
      setRows((data || []) as Topup[]);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { loadRows(); loadStats(); }, [loadRows, loadStats]);

  const handleRecover = async (row: Topup) => {
    setBusyId(row.id);
    try {
      // Step 1: reopen the row (admin RPC, idempotent)
      if (row.status === "expired" || row.status === "failed") {
        const { data, error } = await (supabase as any).rpc("recover_swift_pay_topup", { p_topup_id: row.id });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "reopen_failed");
      }
      // Step 2: ask poll function to recheck this specific topup against SwiftPay gateway
      const { data: pollData, error: pollErr } = await (supabase as any).functions.invoke(
        "swift-pay-poll-deposits",
        { body: {}, method: "POST", headers: {}, query: { topup_id: row.id } as any },
      );
      // functions.invoke doesn't accept query, fall back to direct fetch
      const session = (await supabase.auth.getSession()).data.session;
      const projectId = (import.meta as any).env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/swift-pay-poll-deposits?topup_id=${encodeURIComponent(row.id)}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          apikey: (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({}),
      });
      const json = await resp.json();
      const result = json?.results?.[0];
      if (json?.credited && json.credited > 0) {
        toast.success(`✅ Credited ${row.diamonds_amount.toLocaleString()} diamonds`);
      } else if (result?.waiting) {
        toast.message("Still waiting", {
          description: `SwiftPay balance: $${result.balance?.toFixed?.(2) ?? 0} / needed $${result.needed?.toFixed?.(2) ?? row.price_usd}. Row reopened — will auto-credit when gateway detects the deposit.`,
        });
      } else if (result?.skipped) {
        toast.warning(`Gateway unreachable: ${result.skipped}`);
      } else if (result?.error) {
        toast.error(result.error);
      } else {
        toast.message("Reopened — next poll cycle will recheck", { description: JSON.stringify(json).slice(0, 200) });
      }
      await loadRows();
      await loadStats();
    } catch (e: any) {
      toast.error(e?.message || "Recovery failed");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.id.toLowerCase().includes(q) ||
      r.user_id.toLowerCase().includes(q) ||
      r.external_user_id?.toLowerCase().includes(q) ||
      r.payment_id?.toLowerCase().includes(q) ||
      r.pay_address?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <div className="admin-pro-shell min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 text-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="text-slate-700">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Button size="sm" variant="outline" onClick={() => { loadRows(); loadStats(); }} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Crypto Top-up Recovery</h1>
          <p className="text-slate-600 text-sm mt-1">
            Reopen expired Swift Pay deposits and force a fresh balance check. Use this when a user paid on-chain
            but didn't get credited automatically.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {stats.map((s) => {
            const meta = STATUS_META[s.status] || { color: "bg-white/10 text-slate-900/80 border-white/20", icon: Clock, label: s.status };
            const Icon = meta.icon;
            return (
              <Card key={s.status} className={`border ${meta.color} bg-white/5`}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80">
                    <Icon className="w-3.5 h-3.5" /> {meta.label}
                  </div>
                  <div className="mt-1 text-xl font-bold">{s.count}</div>
                  <div className="text-xs opacity-70 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> {s.usd.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Filters */}
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-3 flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Search by user ID, topup ID, payment ID, or address"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-white/5 border-white/10 text-slate-900 placeholder:text-slate-900/40"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48 bg-white/5 border-white/10 text-slate-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid (crediting)</SelectItem>
                <SelectItem value="credited">Credited</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Rows */}
        <div className="space-y-2">
          {loading && <div className="text-center text-slate-500 py-10">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="text-center text-slate-500 py-10">No rows match.</div>
          )}
          {filtered.map((row) => {
            const meta = STATUS_META[row.status] || STATUS_META.expired;
            return (
              <Card key={row.id} className="bg-white/5 border-white/10">
                <CardContent className="p-3 md:p-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={`${meta.color} border`}>{meta.label}</Badge>
                        <Badge variant="outline" className="border-white/20 text-white/80">
                          {row.pay_currency?.toUpperCase()}
                        </Badge>
                        <span className="text-sm font-semibold flex items-center gap-1">
                          <Gem className="w-3.5 h-3.5 text-amber-300" />
                          {row.diamonds_amount.toLocaleString()}
                        </span>
                        <span className="text-sm font-semibold flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-300" />
                          {Number(row.price_usd).toFixed(2)}
                        </span>
                        <Badge variant="outline" className="border-white/15 text-white/60 text-[10px]">
                          {row.target_type}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>User: <CopyableUid value={row.user_id} label="" /></span>
                        <span>Created: {format(new Date(row.created_at), "yyyy-MM-dd HH:mm")}</span>
                        {row.last_polled_at && <span>Last poll: {format(new Date(row.last_polled_at), "HH:mm")}</span>}
                        {row.credited_at && <span className="text-emerald-300">Credited: {format(new Date(row.credited_at), "yyyy-MM-dd HH:mm")}</span>}
                      </div>
                      {row.pay_address && (
                        <div className="text-[11px] text-slate-500 font-mono truncate">addr: {row.pay_address}</div>
                      )}
                      {row.error_message && (
                        <div className="text-[11px] text-rose-300/80">⚠ {row.error_message}</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {row.status !== "credited" && (
                        <Button
                          size="sm"
                          onClick={() => handleRecover(row)}
                          disabled={busyId === row.id}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                          {busyId === row.id ? (
                            <><RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> Checking…</>
                          ) : (
                            <><RefreshCw className="w-3.5 h-3.5 mr-1" /> Recheck & Recover</>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AdminCryptoRecovery;
