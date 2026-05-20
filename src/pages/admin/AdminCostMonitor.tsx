/**
 * AdminCostMonitor — Pkg59
 *
 * Realtime monitoring dashboard for DB-read load and billing throughput
 * across Live / Call / Party. Data is sampled by `sample_cost_monitor()`
 * pg_cron job every minute and surfaced via `admin_cost_monitor_stats(hours)`.
 *
 * Per Pkg39 admin policy: NO refetchInterval. Manual refresh + Pkg37
 * realtime push (admin-cost-monitor query key) only.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, AlertTriangle, ShieldOff, ShieldCheck, Activity, Database, Radio, CircleDollarSign, Check, Zap, Sparkles } from "lucide-react";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type LatestRow = { source: string; metric: string; value: number; sampled_at: string };
type AggRow = { source: string; metric: string; total: number; peak: number; avg_v: number };
type SeriesRow = { source: string; metric: string; points: { t: number; v: number }[] };
type AlertRow = {
  id: number;
  triggered_at: string;
  severity: "warn" | "critical";
  source: string;
  metric: string;
  value: number;
  threshold: number;
  message: string;
  acknowledged_at: string | null;
};

interface Stats {
  latest: LatestRow[];
  aggregates: AggRow[];
  series: SeriesRow[];
  realtime_kill_switch_enabled: boolean;
  broadcast_events_this_hour: number;
  recent_alerts: AlertRow[];
  thresholds: Record<string, number> | null;
  sampled_at: string;
}

const HOUR_OPTIONS = [
  { label: "1h", value: 1 },
  { label: "6h", value: 6 },
  { label: "24h", value: 24 },
  { label: "7d", value: 168 },
];

const TABLE_SOURCES = [
  "live_streams", "private_calls", "party_rooms",
  "profiles", "agencies", "gift_transactions", "balance_audit_log",
];

function findLatest(stats: Stats | undefined, source: string, metric: string): number {
  return Number(stats?.latest?.find((r) => r.source === source && r.metric === metric)?.value ?? 0);
}
function findAgg(stats: Stats | undefined, source: string, metric: string): AggRow | undefined {
  return stats?.aggregates?.find((r) => r.source === source && r.metric === metric);
}
function findSeries(stats: Stats | undefined, source: string, metric: string): { t: number; v: number }[] {
  return stats?.series?.find((r) => r.source === source && r.metric === metric)?.points ?? [];
}

function compactNum(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 10_000) return (n / 1_000).toFixed(0) + "K";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function Sparkline({ data, color = "#f59e0b" }: { data: { t: number; v: number }[]; color?: string }) {
  if (!data || data.length < 2) {
    return <div className="h-10 flex items-center justify-center text-[10px] text-slate-400">— no data —</div>;
  }
  const w = 220, h = 40, pad = 2;
  const max = Math.max(1, ...data.map((d) => d.v));
  const min = Math.min(0, ...data.map((d) => d.v));
  const range = max - min || 1;
  const step = (w - pad * 2) / (data.length - 1);
  const points = data.map((d, i) => {
    const x = pad + i * step;
    const y = h - pad - ((d.v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const lastY = (() => {
    const d = data[data.length - 1];
    return h - pad - ((d.v - min) / range) * (h - pad * 2);
  })();
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={points} />
      <circle cx={(pad + (data.length - 1) * step).toFixed(1)} cy={lastY.toFixed(1)} r="2.2" fill={color} />
    </svg>
  );
}

function StatCard({
  icon: Icon, label, value, unit, sub, accent = "amber", spark,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  accent?: "amber" | "rose" | "emerald" | "indigo" | "sky";
  spark?: { t: number; v: number }[];
}) {
  const accentMap: Record<string, { bg: string; text: string; border: string; spark: string }> = {
    amber:   { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   spark: "#f59e0b" },
    rose:    { bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200",    spark: "#e11d48" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", spark: "#10b981" },
    indigo:  { bg: "bg-indigo-50",  text: "text-indigo-700",  border: "border-indigo-200",  spark: "#6366f1" },
    sky:     { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200",     spark: "#0ea5e9" },
  };
  const a = accentMap[accent];
  return (
    <Card className="p-4 flex flex-col gap-2 border">
      <div className="flex items-center gap-2">
        <div className={cn("w-8 h-8 rounded-lg border flex items-center justify-center", a.bg, a.border)}>
          <Icon className={cn("w-4 h-4", a.text)} />
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-slate-800">{typeof value === "number" ? compactNum(value) : value}</span>
        {unit && <span className="text-[11px] text-slate-500">{unit}</span>}
      </div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
      {spark && spark.length > 1 && <Sparkline data={spark} color={a.spark} />}
    </Card>
  );
}

export default function AdminCostMonitor() {
  const qc = useQueryClient();
  const [hours, setHours] = useState(1);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-cost-monitor", hours],
    queryFn: async (): Promise<Stats> => {
      const { data, error } = await adminSupabase.rpc("admin_cost_monitor_stats", { _hours: hours });
      if (error) throw error;
      return (data ?? {}) as Stats;
    },
  });

  // Realtime push from Pkg37 → cost_monitor_samples / cost_monitor_alerts
  useEffect(() => {
    const handler = () => qc.invalidateQueries({ queryKey: ["admin-cost-monitor"] });
    window.addEventListener("admin-broadcast:cost_monitor_samples", handler);
    window.addEventListener("admin-broadcast:cost_monitor_alerts", handler);
    return () => {
      window.removeEventListener("admin-broadcast:cost_monitor_samples", handler);
      window.removeEventListener("admin-broadcast:cost_monitor_alerts", handler);
    };
  }, [qc]);

  const ackAlert = useCallback(async (id: number) => {
    const { error } = await adminSupabase.rpc("admin_cost_monitor_ack_alert", { _id: id });
    if (error) toast.error(error.message);
    else {
      toast.success("Alert acknowledged");
      qc.invalidateQueries({ queryKey: ["admin-cost-monitor"] });
    }
  }, [qc]);

  const toggleKillSwitch = useCallback(async () => {
    const currentlyOn = !!data?.realtime_kill_switch_enabled;
    const next = currentlyOn ? "false" : "true";
    const { error } = await adminSupabase
      .from("app_settings")
      .upsert({ setting_key: "realtime_admin_broadcast_enabled", setting_value: next }, { onConflict: "setting_key" });
    if (error) toast.error(error.message);
    else {
      toast.success(`Realtime broadcast ${next === "true" ? "ENABLED" : "DISABLED"}`);
      qc.invalidateQueries({ queryKey: ["admin-cost-monitor"] });
    }
  }, [data, qc]);

  const activeAlerts = useMemo(
    () => (data?.recent_alerts ?? []).filter((a) => !a.acknowledged_at),
    [data],
  );

  return (
    <div className="admin-content space-y-5">
      <AdminPageHeader
        icon={Activity}
        title="Cost Monitor"
        description="Live DB-read load + billing throughput across Live, Call, and Party. Sampled every minute."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-slate-200 overflow-hidden">
              {HOUR_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setHours(o.value)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    hours === o.value
                      ? "bg-amber-500 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Active alerts banner */}
      {activeAlerts.length > 0 && (
        <Card className="border-rose-300 bg-rose-50/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <div className="font-semibold text-rose-800 text-sm">
              {activeAlerts.length} active alert{activeAlerts.length === 1 ? "" : "s"}
            </div>
          </div>
          <ul className="space-y-1.5">
            {activeAlerts.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-start gap-2 text-[12px]">
                <Badge variant={a.severity === "critical" ? "destructive" : "secondary"} className="text-[10px] uppercase">
                  {a.severity}
                </Badge>
                <div className="flex-1">
                  <div className="text-slate-800">{a.message}</div>
                  <div className="text-[10px] text-slate-500">{new Date(a.triggered_at).toLocaleString()}</div>
                </div>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => ackAlert(a.id)}>
                  <Check className="w-3 h-3 mr-1" /> Ack
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Live workload */}
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Active workload (now)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Radio} label="Live streams" accent="rose"
            value={findLatest(data, "live", "active")} unit="active"
            spark={findSeries(data, "live", "active")}
            sub={`Peak ${hours}h: ${compactNum(findAgg(data, "live", "active")?.peak ?? 0)}`} />
          <StatCard icon={Activity} label="Private calls" accent="indigo"
            value={findLatest(data, "call", "active")} unit="active"
            spark={findSeries(data, "call", "active")}
            sub={`Peak ${hours}h: ${compactNum(findAgg(data, "call", "active")?.peak ?? 0)}`} />
          <StatCard icon={Sparkles} label="Party rooms" accent="amber"
            value={findLatest(data, "party", "active")} unit="active"
            spark={findSeries(data, "party", "active")}
            sub={`Peak ${hours}h: ${compactNum(findAgg(data, "party", "active")?.peak ?? 0)}`} />
          <StatCard icon={Zap} label="Realtime events" accent="sky"
            value={data?.broadcast_events_this_hour ?? 0} unit="/hour"
            sub={data?.realtime_kill_switch_enabled ? "Broadcast ON" : "Broadcast OFF (kill switch)"}
            spark={findSeries(data, "realtime", "events_per_hour")} />
        </div>
      </section>

      {/* DB read pressure per table */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">DB reads per table (per minute)</h2>
          <div className="text-[10px] text-slate-400">
            Threshold: {compactNum(data?.thresholds?.reads_per_min_per_table ?? 0)} reads/min
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {TABLE_SOURCES.map((t) => {
            const latest = findLatest(data, t, "reads_per_min");
            const agg = findAgg(data, t, "reads_per_min");
            const fetched = findLatest(data, t, "rows_fetched_per_min");
            const threshold = data?.thresholds?.reads_per_min_per_table ?? 0;
            const hot = threshold > 0 && latest > threshold * 0.7;
            return (
              <Card key={t} className={cn("p-3.5 border", hot && "border-rose-300 bg-rose-50/30")}>
                <div className="flex items-center gap-2 mb-1">
                  <Database className={cn("w-3.5 h-3.5", hot ? "text-rose-600" : "text-slate-500")} />
                  <span className="font-mono text-[12px] font-semibold text-slate-800">{t}</span>
                  {hot && <Badge variant="destructive" className="ml-auto text-[9px] uppercase">Hot</Badge>}
                </div>
                <div className="flex items-baseline gap-3 mb-1">
                  <div>
                    <div className="text-lg font-bold text-slate-800">{compactNum(latest)}</div>
                    <div className="text-[10px] text-slate-500 uppercase">reads/min</div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-[12px] font-semibold text-slate-700">{compactNum(fetched)}</div>
                    <div className="text-[10px] text-slate-500 uppercase">rows fetched/min</div>
                  </div>
                </div>
                <Sparkline data={findSeries(data, t, "reads_per_min")} color={hot ? "#e11d48" : "#6366f1"} />
                <div className="text-[10px] text-slate-500 mt-1">
                  {hours}h: avg {compactNum(agg?.avg_v ?? 0)} · peak {compactNum(agg?.peak ?? 0)}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Billing throughput */}
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Billing throughput</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={CircleDollarSign} label="Beans / min" accent="emerald"
            value={findLatest(data, "billing", "beans_per_min")}
            sub={`Peak ${hours}h: ${compactNum(findAgg(data, "billing", "beans_per_min")?.peak ?? 0)} · threshold ${compactNum(data?.thresholds?.beans_per_min ?? 0)}`}
            spark={findSeries(data, "billing", "beans_per_min")} />
          <StatCard icon={Sparkles} label="Gifts / min" accent="amber"
            value={findLatest(data, "billing", "gifts_per_min")}
            sub={`Total ${hours}h: ${compactNum(findAgg(data, "billing", "gifts_per_min")?.total ?? 0)}`}
            spark={findSeries(data, "billing", "gifts_per_min")} />
          <StatCard icon={CircleDollarSign} label={`Beans total (${hours}h)`} accent="indigo"
            value={findAgg(data, "billing", "beans_per_min")?.total ?? 0}
            sub="Sum of audited beans deltas" />
          <StatCard icon={Sparkles} label={`Gifts total (${hours}h)`} accent="rose"
            value={findAgg(data, "billing", "gifts_per_min")?.total ?? 0}
            sub="From gift_transactions" />
        </div>
      </section>

      {/* Realtime kill switch */}
      <section>
        <Card className="p-4 flex items-center gap-3 border">
          {data?.realtime_kill_switch_enabled ? (
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          ) : (
            <ShieldOff className="w-5 h-5 text-rose-600" />
          )}
          <div className="flex-1">
            <div className="font-semibold text-slate-800 text-sm">
              Realtime broadcast: {data?.realtime_kill_switch_enabled ? "ENABLED" : "DISABLED"}
            </div>
            <div className="text-[11px] text-slate-500">
              Pkg53 cost guard. Disable instantly to stop all admin → app realtime push
              (auto-trips when events/hour exceed {compactNum(data?.thresholds?.events_per_hour ?? 0)}).
            </div>
          </div>
          <Button
            size="sm"
            variant={data?.realtime_kill_switch_enabled ? "destructive" : "default"}
            onClick={toggleKillSwitch}
          >
            {data?.realtime_kill_switch_enabled ? "Disable" : "Enable"}
          </Button>
        </Card>
      </section>

      {/* Alert history */}
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Recent alerts ({data?.recent_alerts?.length ?? 0})
        </h2>
        <Card className="overflow-hidden">
          {(!data?.recent_alerts || data.recent_alerts.length === 0) ? (
            <div className="admin-empty-state p-8 text-center text-[12px] text-slate-500">
              No alerts in the last 30 days. System is within thresholds.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Severity</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Metric</th>
                    <th className="px-3 py-2 text-right">Value / Threshold</th>
                    <th className="px-3 py-2">Message</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_alerts.map((a) => (
                    <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                        {new Date(a.triggered_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={a.severity === "critical" ? "destructive" : "secondary"} className="text-[9px] uppercase">
                          {a.severity}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-700">{a.source}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{a.metric}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">
                        {compactNum(a.value)} / {compactNum(a.threshold)}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{a.message}</td>
                      <td className="px-3 py-2">
                        {a.acknowledged_at ? (
                          <span className="text-[10px] text-emerald-700 inline-flex items-center gap-1">
                            <Check className="w-3 h-3" /> Acknowledged
                          </span>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => ackAlert(a.id)}>
                            Ack
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <div className="text-[10px] text-slate-400 text-center pt-2">
        Sampled {data?.sampled_at ? new Date(data.sampled_at).toLocaleString() : "—"} · Pkg59 cost monitor
      </div>
    </div>
  );
}
