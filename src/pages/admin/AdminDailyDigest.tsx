import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Newspaper } from "lucide-react";
import { exportToCsv } from "@/utils/exportLogs";

type LedgerRow = { user_id: string; currency: string; delta: number; source_type: string };

export default function AdminDailyDigest() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [clusterCount, setClusterCount] = useState(0);
  const [driftCount, setDriftCount] = useState(0);
  const [orphanCount, setOrphanCount] = useState(0);
  const [fraudCount, setFraudCount] = useState(0);
  const [range, setRange] = useState<"1" | "7" | "30">("1");

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - parseInt(range) * 86400000).toISOString();
    const [l, c, d, o, f] = await Promise.all([
      supabase.from("wallet_ledger_audit" as any).select("user_id,currency,delta,source_type").gte("created_at", since).limit(10000),
      supabase.from("admin_wallet_suspicious_clusters" as any).select("cluster_key", { count: "exact", head: true }),
      supabase.from("admin_wallet_reconciliation" as any).select("user_id", { count: "exact", head: true }).neq("drift", 0),
      supabase.from("user_payment_claims" as any).select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("admin_payout_fraud_signals" as any).select("id", { count: "exact", head: true }),
    ]);
    setRows(((l.data as any) ?? []) as LedgerRow[]);
    setClusterCount(c.count ?? 0);
    setDriftCount(d.count ?? 0);
    setOrphanCount(o.count ?? 0);
    setFraudCount(f.count ?? 0);
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => {
    const byCurr: Record<string, { credit: number; debit: number }> = {};
    const perUser: Record<string, number> = {};
    const perSource: Record<string, number> = {};
    for (const r of rows) {
      const c = r.currency;
      byCurr[c] ??= { credit: 0, debit: 0 };
      if (r.delta >= 0) byCurr[c].credit += Number(r.delta);
      else byCurr[c].debit += Math.abs(Number(r.delta));
      perUser[r.user_id] = (perUser[r.user_id] ?? 0) + Number(r.delta);
      perSource[r.source_type] = (perSource[r.source_type] ?? 0) + Math.abs(Number(r.delta));
    }
    const topEarners = Object.entries(perUser).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const topSpenders = Object.entries(perUser).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, 10);
    const topSources = Object.entries(perSource).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return { byCurr, topEarners, topSpenders, topSources };
  }, [rows]);

  const exportDigest = () => {
    const flat = [
      ...Object.entries(summary.byCurr).flatMap(([curr, v]) => [
        { section: "totals", key: `${curr}_credit`, value: v.credit },
        { section: "totals", key: `${curr}_debit`, value: v.debit },
      ]),
      ...summary.topEarners.map(([uid, v]) => ({ section: "top_earner", key: uid, value: v })),
      ...summary.topSpenders.map(([uid, v]) => ({ section: "top_spender", key: uid, value: v })),
      ...summary.topSources.map(([src, v]) => ({ section: "top_source", key: src, value: v })),
    ];
    exportToCsv(`daily-digest-${range}d-${new Date().toISOString().slice(0, 10)}.csv`, flat);
  };

  return (
    <div className="p-6 space-y-6 bg-white min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Newspaper className="w-6 h-6 text-blue-600" /> Owner Daily Digest
          </h1>
          <p className="text-sm text-slate-500">At-a-glance forensic summary — beans in/out, top movers, active anomalies</p>
        </div>
        <div className="flex gap-2">
          {(["1", "7", "30"] as const).map(r => (
            <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>{r}d</Button>
          ))}
          <Button onClick={load} variant="outline" size="sm"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button onClick={exportDigest} variant="outline" size="sm">CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AlertCard label="Suspicious clusters" value={clusterCount} to="/admin/suspicious-activity" tone={clusterCount > 0 ? "warn" : "ok"} />
        <AlertCard label="Balance drift" value={driftCount} to="/admin/suspicious-activity" tone={driftCount > 0 ? "danger" : "ok"} />
        <AlertCard label="Orphan payments" value={orphanCount} to="/admin/orphan-payments" tone={orphanCount > 0 ? "warn" : "ok"} />
        <AlertCard label="Payout fraud signals" value={fraudCount} to="/admin/payout-forensics" tone={fraudCount > 0 ? "warn" : "ok"} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : (
        <>
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-slate-900">Currency flow ({range}d)</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {(["beans", "diamonds", "diamonds"] as const).map(c => {
                const v = summary.byCurr[c] || { credit: 0, debit: 0 };
                const net = v.credit - v.debit;
                return (
                  <div key={c} className="rounded-lg border border-slate-200 p-4">
                    <div className="text-xs uppercase text-slate-500">{c}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-700 font-semibold">+{v.credit.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-rose-600" />
                      <span className="text-rose-700 font-semibold">−{v.debit.toLocaleString()}</span>
                    </div>
                    <div className="mt-2 text-sm">
                      Net: <span className={net >= 0 ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold"}>{net.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-slate-200">
              <CardHeader><CardTitle className="text-slate-900">Top 10 net earners</CardTitle></CardHeader>
              <CardContent>
                <MoverTable rows={summary.topEarners} tone="ok" />
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardHeader><CardTitle className="text-slate-900">Top 10 net spenders</CardTitle></CardHeader>
              <CardContent>
                <MoverTable rows={summary.topSpenders} tone="danger" />
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-slate-900">Top sources by volume</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-xs">
                <thead className="text-left text-slate-500"><tr><th className="py-2">Source</th><th>Volume (|Δ|)</th></tr></thead>
                <tbody>
                  {summary.topSources.map(([src, v]) => (
                    <tr key={src} className="border-t border-slate-100">
                      <td className="py-2"><Badge variant="outline">{src}</Badge></td>
                      <td className="font-medium">{v.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function AlertCard({ label, value, to, tone }: { label: string; value: number; to: string; tone: "ok" | "warn" | "danger" }) {
  const color = tone === "danger" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : "text-emerald-700";
  return (
    <Link to={to}>
      <Card className="border-slate-200 hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          <div className="text-xs uppercase text-slate-500 flex items-center gap-1">
            {tone !== "ok" && <AlertTriangle className="w-3 h-3" />} {label}
          </div>
          <div className={`text-2xl font-bold mt-1 ${color}`}>{value.toLocaleString()}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

function MoverTable({ rows, tone }: { rows: [string, number][]; tone: "ok" | "danger" }) {
  const color = tone === "ok" ? "text-emerald-700" : "text-rose-700";
  if (rows.length === 0) return <div className="text-center py-4 text-slate-400 text-sm">No movement</div>;
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-slate-500"><tr><th className="py-2">User</th><th>Net Δ</th></tr></thead>
      <tbody>
        {rows.map(([uid, v]) => (
          <tr key={uid} className="border-t border-slate-100">
            <td className="py-2">
              <Link to={`/admin/users/${uid}/wallet`} className="text-blue-600 hover:underline font-mono">{uid.slice(0, 10)}…</Link>
            </td>
            <td className={`font-semibold ${color}`}>{v.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
