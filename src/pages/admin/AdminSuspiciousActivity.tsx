import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, AlertTriangle, ShieldAlert, Zap } from "lucide-react";

type Cluster = {
  cluster_key: string;
  cluster_type: "ip" | "device";
  user_count: number;
  event_count: number;
  total_credited: number;
  user_ids: string[] | null;
  first_seen: string;
  last_seen: string;
};

type Rapid = {
  user_id: string;
  currency: string;
  source_type: string;
  hour_bucket: string;
  event_count: number;
  total_delta: number;
};

type Drift = {
  user_id: string;
  currency: string;
  profile_balance: number;
  ledger_sum: number;
  drift: number;
  ledger_entries: number;
  last_movement: string | null;
};

export default function AdminSuspiciousActivity() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [rapid, setRapid] = useState<Rapid[]>([]);
  const [drift, setDrift] = useState<Drift[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, r, d] = await Promise.all([
      supabase.from("admin_wallet_suspicious_clusters" as any).select("*").limit(200),
      supabase.from("admin_wallet_rapid_earners" as any).select("*").limit(200),
      supabase.from("admin_wallet_reconciliation" as any).select("*").neq("drift", 0).order("drift", { ascending: false }).limit(200),
    ]);
    setClusters(((c.data as any) ?? []) as Cluster[]);
    setRapid(((r.data as any) ?? []) as Rapid[]);
    setDrift(((d.data as any) ?? []) as Drift[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-6 bg-white min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-500" /> Suspicious Wallet Activity
          </h1>
          <p className="text-sm text-slate-500">IP/device clusters, rapid-fire earning, balance drift</p>
        </div>
        <Button onClick={load} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Cluster alerts" value={clusters.length} />
        <StatCard icon={<Zap className="w-4 h-4" />} label="Rapid earners (7d)" value={rapid.length} />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Users with drift" value={drift.length} />
      </div>

      <Tabs defaultValue="clusters" className="w-full">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="clusters">IP / Device clusters</TabsTrigger>
          <TabsTrigger value="rapid">Rapid-fire earners</TabsTrigger>
          <TabsTrigger value="drift">Balance drift</TabsTrigger>
        </TabsList>

        <TabsContent value="clusters">
          <Card className="border-slate-200">
            <CardHeader><CardTitle>Shared IP / device rewards (30d)</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Spinner /> : (
                <table className="w-full text-xs">
                  <thead className="text-left text-slate-500">
                    <tr><th className="py-2">Type</th><th>Key</th><th>Users</th><th>Events</th><th>Credited</th><th>Window</th><th></th></tr>
                  </thead>
                  <tbody>
                    {clusters.map((c, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-2"><Badge variant="outline">{c.cluster_type}</Badge></td>
                        <td className="font-mono max-w-[180px] truncate" title={c.cluster_key}>{c.cluster_key}</td>
                        <td className="font-semibold text-rose-700">{c.user_count}</td>
                        <td>{c.event_count}</td>
                        <td>{Number(c.total_credited).toLocaleString()}</td>
                        <td className="text-slate-500">{new Date(c.first_seen).toLocaleDateString()} → {new Date(c.last_seen).toLocaleDateString()}</td>
                        <td>
                          {c.user_ids && c.user_ids.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {c.user_ids.slice(0, 3).map(uid => (
                                <Link key={uid} to={`/admin/users/${uid}/wallet`} className="text-blue-600 hover:underline font-mono text-[10px]">{uid.slice(0, 6)}…</Link>
                              ))}
                              {c.user_ids.length > 3 && <span className="text-slate-400 text-[10px]">+{c.user_ids.length - 3}</span>}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {clusters.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-slate-500">No clusters detected</td></tr>}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rapid">
          <Card className="border-slate-200">
            <CardHeader><CardTitle>≥10 credits in single hour (7d)</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Spinner /> : (
                <table className="w-full text-xs">
                  <thead className="text-left text-slate-500">
                    <tr><th className="py-2">Hour</th><th>User</th><th>Source</th><th>Currency</th><th>Count</th><th>Total Δ</th></tr>
                  </thead>
                  <tbody>
                    {rapid.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-2 text-slate-500">{new Date(r.hour_bucket).toLocaleString()}</td>
                        <td><Link to={`/admin/users/${r.user_id}/wallet`} className="text-blue-600 hover:underline font-mono">{r.user_id.slice(0, 8)}…</Link></td>
                        <td><Badge variant="outline">{r.source_type}</Badge></td>
                        <td>{r.currency}</td>
                        <td className="font-semibold text-amber-700">{r.event_count}</td>
                        <td>{Number(r.total_delta).toLocaleString()}</td>
                      </tr>
                    ))}
                    {rapid.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-slate-500">No rapid earners</td></tr>}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drift">
          <Card className="border-slate-200">
            <CardHeader><CardTitle>Profile balance vs ledger mismatch</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Spinner /> : (
                <table className="w-full text-xs">
                  <thead className="text-left text-slate-500">
                    <tr><th className="py-2">User</th><th>Currency</th><th>Profile</th><th>Ledger sum</th><th>Drift</th><th>Entries</th></tr>
                  </thead>
                  <tbody>
                    {drift.map((d, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-2"><Link to={`/admin/users/${d.user_id}/wallet`} className="text-blue-600 hover:underline font-mono">{d.user_id.slice(0, 8)}…</Link></td>
                        <td className="capitalize">{d.currency}</td>
                        <td>{Number(d.profile_balance).toLocaleString()}</td>
                        <td>{Number(d.ledger_sum).toLocaleString()}</td>
                        <td className="font-semibold text-rose-700">{Number(d.drift).toLocaleString()}</td>
                        <td>{d.ledger_entries}</td>
                      </tr>
                    ))}
                    {drift.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-slate-500">All balances reconcile ✓</td></tr>}
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

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-slate-500 flex items-center gap-1">{icon} {label}</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Spinner() {
  return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
}
