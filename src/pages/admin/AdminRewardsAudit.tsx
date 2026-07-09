import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

type HealthRow = {
  pipeline: string;
  total_rows: number;
  completed_rows: number;
  reward_claimed_rows: number;
  last_activity: string | null;
};

const PIPELINE_LABELS: Record<string, { label: string; desc: string; ledgerSource: string }> = {
  daily_task_progress: { label: "Daily Tasks", desc: "Per-user daily task completion & reward claiming", ledgerSource: "task_reward" },
  new_host_live_bonus: { label: "New Host Live Bonus", desc: "Hourly live-time bonus for newly-approved hosts", ledgerSource: "new_host_live_bonus" },
  daily_login_claims: { label: "Daily Login Rewards", desc: "Login streak coin/beans payout", ledgerSource: "daily_login" },
  rating_reward_claims: { label: "Play Store Rating Rewards", desc: "Screenshot-verified rating claim", ledgerSource: "rating_reward" },
  invitation_reward_claims: { label: "Invitation Rewards", desc: "Inviter payout when friends sign up / recharge", ledgerSource: "invitation_reward" },
  registration_bonus_claims: { label: "Registration Bonus", desc: "One-time signup welcome coins", ledgerSource: "registration_bonus" },
  first_recharge_claims: { label: "First Recharge Bonus", desc: "Bonus coins on the user's first paid recharge", ledgerSource: "first_recharge_bonus" },
};

export default function AdminRewardsAudit() {
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("admin_rewards_health" as any).select("*");
    if (error) toast.error(error.message);
    else setRows((data as any) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalRewards = rows.reduce((s, r) => s + Number(r.reward_claimed_rows || 0), 0);
  const brokenPipelines = rows.filter(r => Number(r.total_rows) === 0).length;
  const staleThreshold = Date.now() - 7 * 86400000;
  const stalePipelines = rows.filter(r => r.last_activity && new Date(r.last_activity).getTime() < staleThreshold).length;

  return (
    <div className="min-h-screen bg-white p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Rewards Pipeline Audit
          </h1>
          <p className="text-sm text-slate-500">Every reward source, its health, and a jump-through to the full ledger.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
          <Link to="/admin/wallet-ledger">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
              Open Wallet Ledger <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Reward Pipelines" value={rows.length.toString()} />
        <Stat label="Total Claims Paid" value={totalRewards.toLocaleString()} />
        <Stat label="Broken (0 rows)" value={brokenPipelines.toString()} tint={brokenPipelines > 0 ? "rose" : "emerald"} />
        <Stat label="Stale (&gt;7 days)" value={stalePipelines.toString()} tint={stalePipelines > 0 ? "amber" : "emerald"} />
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-slate-700">Pipeline Health</CardTitle>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="p-3 text-left">Pipeline</th>
                <th className="p-3 text-right">Total Rows</th>
                <th className="p-3 text-right">Completed</th>
                <th className="p-3 text-right">Rewarded</th>
                <th className="p-3 text-left">Last Activity</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const meta = PIPELINE_LABELS[r.pipeline] ?? { label: r.pipeline, desc: "", ledgerSource: "" };
                const broken = Number(r.total_rows) === 0;
                const stale = r.last_activity && new Date(r.last_activity).getTime() < staleThreshold;
                const healthy = !broken && !stale;
                return (
                  <tr key={r.pipeline} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-3">
                      <div className="font-medium text-slate-900">{meta.label}</div>
                      <div className="text-xs text-slate-500">{meta.desc}</div>
                    </td>
                    <td className="p-3 text-right font-mono">{Number(r.total_rows).toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">{Number(r.completed_rows).toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">{Number(r.reward_claimed_rows).toLocaleString()}</td>
                    <td className="p-3 text-xs text-slate-500">{r.last_activity ? new Date(r.last_activity).toLocaleString() : "—"}</td>
                    <td className="p-3">
                      {broken ? (
                        <Badge className="bg-rose-50 text-rose-700 border border-rose-200"><AlertTriangle className="h-3 w-3 mr-1" />No data</Badge>
                      ) : stale ? (
                        <Badge className="bg-amber-50 text-amber-700 border border-amber-200"><AlertTriangle className="h-3 w-3 mr-1" />Stale</Badge>
                      ) : (
                        <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="h-3 w-3 mr-1" />Healthy</Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {meta.ledgerSource && !broken && (
                        <Link to={`/admin/wallet-ledger?source=${meta.ledgerSource}`}>
                          <Button size="sm" variant="ghost">View <ArrowRight className="h-3 w-3 ml-1" /></Button>
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && !loading && (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">No pipelines found.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {brokenPipelines > 0 && (
        <Card className="border-rose-200 bg-rose-50/40 shadow-sm">
          <CardContent className="p-4 text-sm text-rose-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold">Broken reward pipelines detected</div>
                <div className="text-rose-700/90">
                  {rows.filter(r => Number(r.total_rows) === 0).map(r => PIPELINE_LABELS[r.pipeline]?.label ?? r.pipeline).join(", ")} — table exists but 0 rows.
                  Either the feature isn't wired in the app, or the write path is failing silently. Check the corresponding admin settings page and the edge function logs.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: "emerald" | "rose" | "amber" }) {
  const color =
    tint === "rose" ? "text-rose-600" :
    tint === "amber" ? "text-amber-600" :
    tint === "emerald" ? "text-emerald-600" : "text-slate-900";
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${color}`} style={{ fontFamily: "Space Grotesk, sans-serif" }}>{value}</div>
      </CardContent>
    </Card>
  );
}
