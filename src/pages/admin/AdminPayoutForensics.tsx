import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, ShieldAlert, TrendingUp, Users } from "lucide-react";

type PayoutRow = {
  source: string;
  id: string;
  entity_id: string;
  user_id: string | null;
  entity_name: string | null;
  amount_native: number | null;
  usd_amount: number | null;
  status: string;
  payment_method: string | null;
  payment_method_type: string | null;
  processed_by: string | null;
  created_at: string;
  processed_at: string | null;
};

type FraudRow = PayoutRow & {
  username: string | null;
  account_created_at: string | null;
  account_age_days_at_request: number | null;
  signal: string | null;
};

type ProcessorRow = {
  processed_by: string;
  source: string;
  payout_count: number;
  total_usd: number;
  first_processed: string;
  last_processed: string;
};

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800",
  approved: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  rejected: "bg-rose-100 text-rose-800",
  reversed: "bg-rose-100 text-rose-800",
};

const SIGNAL_COLORS: Record<string, string> = {
  same_day_signup_withdraw: "bg-rose-100 text-rose-800",
  new_account_high_value: "bg-rose-100 text-rose-800",
  first_week_withdraw: "bg-amber-100 text-amber-800",
  unknown_account: "bg-slate-200 text-slate-800",
};

export default function AdminPayoutForensics() {
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [fraud, setFraud] = useState<FraudRow[]>([]);
  const [processors, setProcessors] = useState<ProcessorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [p, f, s] = await Promise.all([
      supabase.from("admin_payout_unified" as any).select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
      supabase.from("admin_payout_fraud_signals" as any).select("*").limit(300),
      supabase.from("admin_payout_processor_stats" as any).select("*").limit(100),
    ]);
    setPayouts(((p.data as any) ?? []) as PayoutRow[]);
    setFraud(((f.data as any) ?? []) as FraudRow[]);
    setProcessors(((s.data as any) ?? []) as ProcessorRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => payouts.filter(r => {
    if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.entity_name?.toLowerCase().includes(s)) ||
        r.entity_id.toLowerCase().includes(s) ||
        (r.user_id?.toLowerCase().includes(s)) ||
        r.id.toLowerCase().includes(s);
    }
    return true;
  }), [payouts, sourceFilter, statusFilter, search]);

  const totals = useMemo(() => {
    const paid = filtered.filter(r => r.status === "paid" || r.status === "approved");
    return {
      count: filtered.length,
      paidCount: paid.length,
      paidUsd: paid.reduce((a, r) => a + Number(r.usd_amount ?? 0), 0),
      pendingCount: filtered.filter(r => r.status === "pending" || r.status === "processing").length,
    };
  }, [filtered]);

  return (
    <div className="p-6 space-y-6 bg-white min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-600" /> Payout Forensics
          </h1>
          <p className="text-sm text-slate-500">Agency withdrawals · Helper withdrawals · Agency transfers · Fraud signals</p>
        </div>
        <Button onClick={load} variant="outline" size="sm"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total payouts (30d)" value={totals.count} />
        <Stat label="Paid / approved" value={totals.paidCount} tone="ok" />
        <Stat label="Pending" value={totals.pendingCount} tone="warn" />
        <Stat label="Paid USD (30d)" value={`$${totals.paidUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
      </div>

      <Tabs defaultValue="unified" className="w-full">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="unified">Unified feed</TabsTrigger>
          <TabsTrigger value="fraud">
            <ShieldAlert className="w-4 h-4 mr-1" /> Fraud signals ({fraud.length})
          </TabsTrigger>
          <TabsTrigger value="processors">
            <Users className="w-4 h-4 mr-1" /> Processor audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unified">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-slate-900">All payouts (last 30d)</CardTitle>
              <div className="flex flex-wrap gap-2 mt-3">
                <Input placeholder="Search user / agency / ID…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
                {["all", "agency_withdrawal", "helper_withdrawal", "agency_earnings_transfer"].map(s => (
                  <Button key={s} size="sm" variant={sourceFilter === s ? "default" : "outline"} onClick={() => setSourceFilter(s)}>
                    {s.replace(/_/g, " ")}
                  </Button>
                ))}
                {["all", "pending", "processing", "paid", "approved", "rejected"].map(s => (
                  <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <Spinner /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-slate-500">
                      <tr>
                        <th className="py-2">Time</th><th>Source</th><th>Entity</th><th>User</th>
                        <th>USD</th><th>Native</th><th>Status</th><th>Method</th><th>Processed by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 500).map(r => (
                        <tr key={`${r.source}-${r.id}`} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="py-2 text-slate-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                          <td><Badge variant="outline" className="text-[10px]">{r.source.replace(/_/g, " ")}</Badge></td>
                          <td className="max-w-[180px] truncate" title={r.entity_name || r.entity_id}>
                            {r.entity_name || <span className="font-mono text-slate-500">{r.entity_id.slice(0, 8)}…</span>}
                          </td>
                          <td>
                            {r.user_id ? (
                              <Link to={`/admin/users/${r.user_id}/wallet`} className="text-blue-600 hover:underline font-mono">
                                {r.user_id.slice(0, 8)}…
                              </Link>
                            ) : "—"}
                          </td>
                          <td className="font-medium">${Number(r.usd_amount ?? 0).toLocaleString()}</td>
                          <td className="text-slate-500">{Number(r.amount_native ?? 0).toLocaleString()}</td>
                          <td><Badge className={STATUS_COLORS[r.status] || "bg-slate-100 text-slate-700"}>{r.status}</Badge></td>
                          <td className="text-slate-500">{r.payment_method_type || r.payment_method || "—"}</td>
                          <td className="font-mono text-slate-500">{r.processed_by ? r.processed_by.slice(0, 8) + "…" : "—"}</td>
                        </tr>
                      ))}
                      {filtered.length === 0 && <tr><td colSpan={9} className="text-center py-6 text-slate-500">No payouts</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fraud">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-slate-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-500" /> New-account withdrawals (90d)
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Accounts withdrawing within 7 days of signup. Same-day + $50+ new-account = highest risk.
              </p>
            </CardHeader>
            <CardContent>
              {loading ? <Spinner /> : (
                <table className="w-full text-xs">
                  <thead className="text-left text-slate-500">
                    <tr><th className="py-2">Signal</th><th>Time</th><th>User</th><th>Age (days)</th><th>Source</th><th>USD</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {fraud.map(r => (
                      <tr key={`${r.source}-${r.id}`} className="border-t border-slate-100">
                        <td className="py-2">
                          {r.signal && <Badge className={SIGNAL_COLORS[r.signal] || "bg-slate-100 text-slate-700"}>{r.signal.replace(/_/g, " ")}</Badge>}
                        </td>
                        <td className="text-slate-500">{new Date(r.created_at).toLocaleString()}</td>
                        <td>
                          {r.user_id && (
                            <Link to={`/admin/users/${r.user_id}/wallet`} className="text-blue-600 hover:underline">
                              {r.username || <span className="font-mono">{r.user_id.slice(0, 8)}…</span>}
                            </Link>
                          )}
                        </td>
                        <td>{r.account_age_days_at_request !== null ? Number(r.account_age_days_at_request).toFixed(1) : "—"}</td>
                        <td><Badge variant="outline">{r.source.replace(/_/g, " ")}</Badge></td>
                        <td className="font-medium">${Number(r.usd_amount ?? 0).toLocaleString()}</td>
                        <td><Badge className={STATUS_COLORS[r.status] || "bg-slate-100 text-slate-700"}>{r.status}</Badge></td>
                      </tr>
                    ))}
                    {fraud.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-slate-500">No new-account withdrawals ✓</td></tr>}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="processors">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-slate-900">Who is processing payouts? (90d)</CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Concentration or unusual actor = escalate.
              </p>
            </CardHeader>
            <CardContent>
              {loading ? <Spinner /> : (
                <table className="w-full text-xs">
                  <thead className="text-left text-slate-500">
                    <tr><th className="py-2">Admin / helper</th><th>Source</th><th>Count</th><th>Total USD</th><th>First</th><th>Last</th></tr>
                  </thead>
                  <tbody>
                    {processors.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-2 font-mono">{r.processed_by.slice(0, 12)}…</td>
                        <td><Badge variant="outline">{r.source.replace(/_/g, " ")}</Badge></td>
                        <td className="font-medium">{r.payout_count}</td>
                        <td className="font-medium">${Number(r.total_usd).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="text-slate-500">{new Date(r.first_processed).toLocaleDateString()}</td>
                        <td className="text-slate-500">{new Date(r.last_processed).toLocaleDateString()}</td>
                      </tr>
                    ))}
                    {processors.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-slate-500">No processor activity</td></tr>}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "warn" }) {
  const color = tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-slate-900";
  return (
    <Card className="border-slate-200">
      <CardContent className="p-4">
        <div className="text-xs uppercase text-slate-500">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${color}`}>{typeof value === "number" ? value.toLocaleString() : value}</div>
      </CardContent>
    </Card>
  );
}

function Spinner() {
  return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
}
