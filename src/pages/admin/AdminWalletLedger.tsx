import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, RefreshCw, Radio } from "lucide-react";
import { toast } from "sonner";

type LedgerRow = {
  id: number;
  user_id: string;
  currency: "beans" | "diamonds" | "coins";
  delta: number;
  balance_before: number | null;
  balance_after: number | null;
  source_type: string;
  source_id: string | null;
  source_table: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  ip_address: string | null;
  device_id: string | null;
  admin_id: string | null;
  metadata: any;
  created_at: string;
};

const SOURCE_TYPES = [
  "all", "recharge", "gift_sent", "gift_received", "daily_login",
  "rating_reward", "invitation_reward", "new_host_bonus", "task_reward",
  "withdrawal", "admin_adjust", "game", "pk_battle", "agency_transfer",
  "coin_tx", "self_recharge", "unknown",
];

const CURRENCIES = ["all", "beans", "diamonds", "coins"] as const;

export default function AdminWalletLedger() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFilter, setUserFilter] = useState("");
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>("all");
  const [source, setSource] = useState<string>("all");
  const [days, setDays] = useState<string>("7");
  const [realtime, setRealtime] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("wallet_ledger_audit" as any)
      .select("*")
      .gte("created_at", new Date(Date.now() - parseInt(days) * 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(500);
    if (currency !== "all") q = q.eq("currency", currency);
    if (source !== "all") q = q.eq("source_type", source);
    if (userFilter.trim()) q = q.eq("user_id", userFilter.trim());
    const { data, error } = await q;
    if (error) toast.error(error.message);
    else setRows((data as any) ?? []);
    setLoading(false);
  }, [currency, source, days, userFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!realtime) return;
    const ch = supabase
      .channel("wallet_ledger_tail")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wallet_ledger_audit" }, (payload) => {
        setRows((prev) => {
          const r = payload.new as LedgerRow;
          if (currency !== "all" && r.currency !== currency) return prev;
          if (source !== "all" && r.source_type !== source) return prev;
          if (userFilter.trim() && r.user_id !== userFilter.trim()) return prev;
          return [r, ...prev].slice(0, 500);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [realtime, currency, source, userFilter]);

  const totals = useMemo(() => {
    const t = { beans: 0, diamonds: 0, coins: 0, count: rows.length };
    rows.forEach((r) => { t[r.currency] += Number(r.delta) || 0; });
    return t;
  }, [rows]);

  const exportCsv = () => {
    if (!rows.length) return;
    const headers = ["created_at","user_id","currency","delta","balance_before","balance_after","source_type","source_id","source_table","payment_method","payment_reference","ip_address","device_id","admin_id"];
    const csv = [headers.join(",")].concat(
      rows.map(r => headers.map(h => JSON.stringify((r as any)[h] ?? "")).join(","))
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `wallet-ledger-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-white p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Wallet Ledger Audit
          </h1>
          <p className="text-sm text-slate-500">Every beans / diamonds / coins movement across the platform.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRealtime(v => !v)}>
            <Radio className={`h-4 w-4 mr-1 ${realtime ? "text-emerald-500 animate-pulse" : "text-slate-400"}`} />
            {realtime ? "Live" : "Paused"}
          </Button>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" />CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Movements" value={totals.count.toLocaleString()} />
        <StatCard label="Net Beans" value={totals.beans.toLocaleString()} tint={totals.beans >= 0 ? "emerald" : "rose"} />
        <StatCard label="Net Diamonds" value={totals.diamonds.toLocaleString()} tint={totals.diamonds >= 0 ? "emerald" : "rose"} />
        <StatCard label="Net Coins" value={totals.coins.toLocaleString()} tint={totals.coins >= 0 ? "emerald" : "rose"} />
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-700">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input placeholder="User ID (UUID)" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} />
          <Select value={currency} onValueChange={(v) => setCurrency(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SOURCE_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-slate-700">Latest 500 movements</CardTitle>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="p-2 text-left">Time</th>
                <th className="p-2 text-left">User</th>
                <th className="p-2 text-left">Currency</th>
                <th className="p-2 text-right">Delta</th>
                <th className="p-2 text-right">Balance</th>
                <th className="p-2 text-left">Source</th>
                <th className="p-2 text-left">Reference</th>
                <th className="p-2 text-left">Method</th>
                <th className="p-2 text-left">IP / Device</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-2 text-slate-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-2 font-mono text-xs">{r.user_id.slice(0, 8)}…</td>
                  <td className="p-2"><Badge variant="outline">{r.currency}</Badge></td>
                  <td className={`p-2 text-right font-mono ${Number(r.delta) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {Number(r.delta) >= 0 ? "+" : ""}{Number(r.delta).toLocaleString()}
                  </td>
                  <td className="p-2 text-right font-mono text-slate-500 text-xs">
                    {r.balance_before ?? "—"} → {r.balance_after ?? "—"}
                  </td>
                  <td className="p-2"><Badge className="bg-blue-50 text-blue-700 border border-blue-200">{r.source_type}</Badge></td>
                  <td className="p-2 font-mono text-xs text-slate-500">{r.payment_reference ?? r.source_id?.slice(0, 12) ?? "—"}</td>
                  <td className="p-2 text-xs text-slate-500">{r.payment_method ?? "—"}</td>
                  <td className="p-2 text-xs text-slate-500">{r.ip_address ?? "—"}{r.device_id ? ` / ${r.device_id.slice(0,8)}` : ""}</td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr><td colSpan={9} className="p-8 text-center text-slate-400">No movements found for the selected filters.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tint }: { label: string; value: string; tint?: "emerald" | "rose" }) {
  const color = tint === "rose" ? "text-rose-600" : tint === "emerald" ? "text-emerald-600" : "text-slate-900";
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${color}`} style={{ fontFamily: "Space Grotesk, sans-serif" }}>{value}</div>
      </CardContent>
    </Card>
  );
}
