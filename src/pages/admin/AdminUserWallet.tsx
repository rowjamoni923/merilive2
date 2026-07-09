import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertTriangle, ArrowLeft } from "lucide-react";
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

type Profile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  beans: number | null;
  diamonds: number | null;
  coins: number | null;
  created_at: string;
};

type ReconRow = {
  user_id: string;
  currency: string;
  profile_balance: number;
  ledger_sum: number;
  drift: number;
  ledger_entries: number;
  last_movement: string | null;
};

export default function AdminUserWallet() {
  const { userId = "" } = useParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [recon, setRecon] = useState<ReconRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currencyFilter, setCurrencyFilter] = useState<"all" | "beans" | "diamonds" | "coins">("all");

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [pRes, lRes, rRes] = await Promise.all([
      supabase.from("profiles").select("id,username,avatar_url,beans,diamonds,coins,created_at").eq("id", userId).maybeSingle(),
      supabase.from("wallet_ledger_audit" as any).select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1000),
      supabase.from("admin_wallet_reconciliation" as any).select("*").eq("user_id", userId),
    ]);
    if (pRes.error) toast.error(pRes.error.message);
    setProfile((pRes.data as any) ?? null);
    setRows(((lRes.data as any) ?? []) as LedgerRow[]);
    setRecon(((rRes.data as any) ?? []) as ReconRow[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => currencyFilter === "all" ? rows : rows.filter(r => r.currency === currencyFilter),
    [rows, currencyFilter]
  );

  const totals = useMemo(() => {
    const acc: Record<string, { credit: number; debit: number; count: number }> = {};
    for (const r of rows) {
      const k = r.currency;
      acc[k] ??= { credit: 0, debit: 0, count: 0 };
      if (r.delta >= 0) acc[k].credit += Number(r.delta);
      else acc[k].debit += Math.abs(Number(r.delta));
      acc[k].count++;
    }
    return acc;
  }, [rows]);

  return (
    <div className="p-6 space-y-6 bg-white min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/wallet-ledger"><ArrowLeft className="w-4 h-4 mr-1" /> Ledger</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">User Wallet Forensics</h1>
            <p className="text-sm text-slate-500 font-mono">{userId}</p>
          </div>
        </div>
        <Button onClick={load} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {profile && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-slate-900">{profile.username || "(no username)"}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Metric label="Beans (profile)" value={profile.beans ?? 0} />
            <Metric label="Diamonds (profile)" value={profile.diamonds ?? 0} />
            <Metric label="Coins (profile)" value={profile.coins ?? 0} />
            <Metric label="Ledger entries" value={rows.length} />
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader><CardTitle className="text-slate-900 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Balance Reconciliation</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr><th className="py-2">Currency</th><th>Profile balance</th><th>Sum(ledger delta)</th><th>Drift</th><th>Entries</th><th>Last movement</th></tr>
            </thead>
            <tbody>
              {recon.map(r => (
                <tr key={r.currency} className="border-t border-slate-100">
                  <td className="py-2 font-medium capitalize">{r.currency}</td>
                  <td>{Number(r.profile_balance).toLocaleString()}</td>
                  <td>{Number(r.ledger_sum).toLocaleString()}</td>
                  <td>
                    {Math.abs(Number(r.drift)) < 0.01
                      ? <Badge className="bg-emerald-100 text-emerald-800">✓ Match</Badge>
                      : <Badge className="bg-rose-100 text-rose-800">{Number(r.drift).toLocaleString()}</Badge>}
                  </td>
                  <td>{r.ledger_entries}</td>
                  <td className="text-slate-500">{r.last_movement ? new Date(r.last_movement).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-500 mt-3">
            Drift = profile balance − sum of ledger deltas. Non-zero drift after Phase 0 backfill = pre-audit history or silent write path.
          </p>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-slate-900">Totals (currently loaded)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {(["beans", "diamonds", "coins"] as const).map(c => (
            <div key={c} className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs uppercase text-slate-500">{c}</div>
              <div className="mt-1 text-emerald-700">+ {(totals[c]?.credit ?? 0).toLocaleString()}</div>
              <div className="text-rose-700">− {(totals[c]?.debit ?? 0).toLocaleString()}</div>
              <div className="text-slate-500 text-xs mt-1">{totals[c]?.count ?? 0} events</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-slate-900">Lifetime Timeline ({filtered.length})</CardTitle>
          <div className="flex gap-1">
            {(["all", "beans", "diamonds", "coins"] as const).map(c => (
              <Button key={c} size="sm" variant={currencyFilter === c ? "default" : "outline"} onClick={() => setCurrencyFilter(c)}>{c}</Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">No ledger entries</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-2">Time</th><th>Currency</th><th>Δ</th><th>Balance after</th>
                    <th>Source</th><th>Ref</th><th>IP</th><th>Device</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="py-2 text-slate-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="capitalize">{r.currency}</td>
                      <td className={r.delta >= 0 ? "text-emerald-700 font-medium" : "text-rose-700 font-medium"}>
                        {r.delta >= 0 ? "+" : ""}{Number(r.delta).toLocaleString()}
                      </td>
                      <td>{r.balance_after !== null ? Number(r.balance_after).toLocaleString() : "—"}</td>
                      <td><Badge variant="outline" className="text-xs">{r.source_type}</Badge></td>
                      <td className="font-mono text-slate-500 max-w-[160px] truncate" title={r.payment_reference || r.source_id || ""}>
                        {r.payment_reference || r.source_id || "—"}
                      </td>
                      <td className="font-mono text-slate-500">{r.ip_address || "—"}</td>
                      <td className="font-mono text-slate-500 max-w-[120px] truncate" title={r.device_id || ""}>{r.device_id || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900 mt-1">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}
