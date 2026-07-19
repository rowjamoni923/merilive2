import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Wallet,
  Gem,
  Users,
  Receipt,
  RefreshCw,
  Download,
  Calendar as CalendarIcon,
  TrendingDown,
  Table as TableIcon,
  BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import CompanyHealthGauge from "@/components/admin/CompanyHealthGauge";
import { ReportExportMenu } from "@/components/admin/ReportExportMenu";

type Preset = "today" | "yesterday" | "week" | "month" | "custom";

interface PayoutRow {
  category_key: string;
  display_name: string;
  payout_usd: number;
  payout_diamonds: number;
  transaction_count: number;
  recipient_count: number;
}

interface TimelineRow {
  day: string;
  category_key: string;
  payout_usd: number;
  payout_diamonds: number;
  transaction_count: number;
}

interface HelperRow {
  helper_id: string;
  helper_name: string;
  diamonds_topped_up: number;
  usd_withdrawn: number;
  diamond_withdrawal_reward: number;
  commission_usd: number;
  topup_count: number;
  withdrawal_count: number;
  order_count: number;
}

const CAT_COLORS: Record<string, string> = {
  agency_withdrawal: "#10b981",
  helper_withdrawal: "#f43f5e",
  helper_topup: "#06b6d4",
  helper_commission: "#a855f7",
  host_payroll: "#eab308",
  agency_host_transfer: "#22d3ee",
  beans_exchange: "#f97316",
  game_winnings: "#ec4899",
};

const fmtUsd = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
    Number.isFinite(v) ? v : 0,
  );
const fmtInt = (v: number) => new Intl.NumberFormat("en-US").format(Math.round(v ?? 0));

function presetRange(preset: Preset): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  switch (preset) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "yesterday":
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case "week":
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case "month":
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      break;
  }
  return { start, end };
}

const toInputDate = (d: Date) => {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
};

export default function AdminPayoutsAnalytics() {
  const [preset, setPreset] = useState<Preset>("today");
  const initial = presetRange("today");
  const [startDate, setStartDate] = useState<string>(toInputDate(initial.start));
  const [endDate, setEndDate] = useState<string>(toInputDate(initial.end));
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [helpers, setHelpers] = useState<HelperRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [includeTimeline, setIncludeTimeline] = useState(true);

  const handlePreset = useCallback((p: Preset) => {
    setPreset(p);
    if (p === "custom") return;
    const r = presetRange(p);
    setStartDate(toInputDate(r.start));
    setEndDate(toInputDate(r.end));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const startTs = new Date(`${startDate}T00:00:00`).toISOString();
        const endTs = new Date(`${endDate}T23:59:59.999`).toISOString();

        const [summaryRes, helperRes] = await Promise.all([
          supabase.rpc("compute_payouts_for_range", { p_start: startTs, p_end: endTs }),
          supabase.rpc("compute_helper_diamond_payouts", {
            p_start: startTs,
            p_end: endTs,
            p_limit: 200,
          }),
        ]);
        if (summaryRes.error) throw summaryRes.error;
        if (helperRes.error) throw helperRes.error;

        let tl: TimelineRow[] = [];
        if (includeTimeline) {
          const dayDiff =
            Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000) + 1;
          if (dayDiff <= 92) {
            const { data, error } = await supabase.rpc("compute_payouts_timeline", {
            });
            if (error) throw error;
            tl = (data as TimelineRow[]) ?? [];
          }
        }

        if (cancelled) return;
        setRows((summaryRes.data as PayoutRow[]) ?? []);
        setHelpers((helperRes.data as HelperRow[]) ?? []);
        setTimeline(tl);
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e?.message || "Failed to load payouts");
          setRows([]);
          setHelpers([]);
          setTimeline([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, includeTimeline, refreshKey]);

  const totals = useMemo(() => {
    const t = { usd: 0, dia: 0, txns: 0, recipients: 0 };
    for (const r of rows) {
      t.usd += Number(r.payout_usd) || 0;
      t.dia += Number(r.payout_diamonds) || 0;
      t.txns += Number(r.transaction_count) || 0;
      t.recipients += Number(r.recipient_count) || 0;
    }
    return t;
  }, [rows]);

  const dailyRollup = useMemo(() => {
    const map = new Map<string, { day: string; usd: number; dia: number; txns: number }>();
    for (const r of timeline) {
      if (!map.has(r.day)) map.set(r.day, { day: r.day, usd: 0, dia: 0, txns: 0 });
      const o = map.get(r.day)!;
      o.usd += Number(r.payout_usd) || 0;
      o.dia += Number(r.payout_diamonds) || 0;
      o.txns += Number(r.transaction_count) || 0;
    }
    return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [timeline]);

  const handleExport = useCallback(() => {
    if (!rows.length && !helpers.length) return;
    const lines: string[] = [];
    lines.push("=== PAYOUT CATEGORIES ===");
    lines.push("Category,Payout USD,Payout Diamonds,Transactions,Recipients");
    rows.forEach((r) =>
      lines.push(
        [r.display_name, r.payout_usd, r.payout_diamonds, r.transaction_count, r.recipient_count]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    );
    lines.push("");
    lines.push("=== PER-HELPER DIAMOND PAYOUTS ===");
    lines.push(
      "Helper,Diamonds Topped-up,USD Withdrawn,Diamond Reward,Commission USD,Topups,Withdrawals,Orders",
    );
    helpers.forEach((h) =>
      lines.push(
        [
          h.helper_name,
          h.diamonds_topped_up,
          h.usd_withdrawn,
          h.diamond_withdrawal_reward,
          h.commission_usd,
          h.topup_count,
          h.withdrawal_count,
          h.order_count,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payouts-${startDate}_to_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, helpers, startDate, endDate]);

  return (
    <div className="admin-pro-shell admin-content -mx-4 -my-4 sm:-mx-6 sm:-my-6">
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/admin">
              <Button variant="ghost" size="icon" className="text-slate-900 hover:bg-slate-50">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Payouts Analytics</h1>
              <p className="text-sm text-slate-900/60">
                Money + diamond outflow — agencies, helpers, hosts, exchanges
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="border-slate-200 text-slate-900 hover:bg-slate-50"
            >
              <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <ReportExportMenu
              rows={rows as any}
              columns={[
                { key: "category", label: "Category", weight: 1.4 },
                { key: "amount", label: "Amount (USD)", weight: 1, format: (v) => v != null ? `$${Number(v).toFixed(2)}` : "—" },
                { key: "count", label: "Count", weight: 0.8 },
                { key: "period", label: "Period", weight: 1 },
              ]}
              meta={{
                title: "Payouts Analytics",
                subtitle: "Money + diamond outflow • agencies, helpers, hosts, exchanges",
                fileName: "payouts-analytics",
              }}
            />
          </div>
        </div>

        {/* Date filter */}
        <Card className="bg-white border-slate-200">
          <CardContent className="p-4 space-y-3">
            <Tabs value={preset} onValueChange={(v) => handlePreset(v as Preset)}>
              <TabsList className="bg-slate-50 border border-slate-200">
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="yesterday">Yesterday</TabsTrigger>
                <TabsTrigger value="week">Last 7 days</TabsTrigger>
                <TabsTrigger value="month">Last 30 days</TabsTrigger>
                <TabsTrigger value="custom">Custom</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-slate-900/60" />
                <span className="text-slate-900/60">From</span>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPreset("custom");
                  }}
                  className="bg-slate-50 border-slate-200 text-slate-900 w-auto"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-900/60">To</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPreset("custom");
                  }}
                  className="bg-slate-50 border-slate-200 text-slate-900 w-auto"
                />
              </div>
              <label className="flex items-center gap-2 text-slate-900/60 ml-auto cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTimeline}
                  onChange={(e) => setIncludeTimeline(e.target.checked)}
                  className="accent-rose-500"
                />
                Daily timeline (≤92 days)
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Company Health Gauge */}
        <CompanyHealthGauge startDate={startDate} endDate={endDate} refreshKey={refreshKey} />

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Total USD Out" value={fmtUsd(totals.usd)} icon={Wallet} accent="#f43f5e" loading={loading} highlight />
          <KPI label="Total Diamonds Out" value={fmtInt(totals.dia)} icon={Gem} accent="#06b6d4" loading={loading} />
          <KPI label="Payout Transactions" value={fmtInt(totals.txns)} icon={Receipt} accent="#a855f7" loading={loading} />
          <KPI label="Unique Recipients" value={fmtInt(totals.recipients)} icon={Users} accent="#10b981" loading={loading} />
        </div>

        {/* Daily payouts chart */}
        {includeTimeline && (
          <Card className="bg-white border-slate-200">
            <CardHeader className="border-b border-slate-200 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
                <BarChart3 className="h-4 w-4 text-rose-400" />
                Daily Payout Outflow (USD)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {loading ? (
                <Skeleton className="h-64 w-full bg-slate-50" />
              ) : dailyRollup.length === 0 ? (
                <div className="h-64 grid place-items-center text-slate-900/40 text-sm">No data</div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyRollup}>
                      <defs>
                        <linearGradient id="grad-payout" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.7} />
                          <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
                      <XAxis dataKey="day" tick={{ fill: "#ffffff80", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#ffffff80", fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                      <RTooltip
                        contentStyle={{ background: "#0c0c14", border: "1px solid #ffffff20", borderRadius: 8 }}
                        labelStyle={{ color: "#fff" }}
                        formatter={(v: any, name: string) => [fmtUsd(Number(v)), name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="usd" name="Payout USD" stroke="#f43f5e" fill="url(#grad-payout)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Category breakdown grid */}
        <Card className="bg-white border-slate-200">
          <CardHeader className="border-b border-slate-200 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
              <TrendingDown className="h-4 w-4 text-rose-400" />
              Payout Categories
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full bg-slate-50" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center text-slate-900/40 py-12 text-sm">No payouts in this range</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {rows.map((r) => {
                  const color = CAT_COLORS[r.category_key] || "#8884d8";
                  const share = totals.usd > 0 ? (r.payout_usd / totals.usd) * 100 : 0;
                  return (
                    <div
                      key={r.category_key}
                      className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-black/40 to-black/10 p-4"
                    >
                      <div className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
                      <div className="text-xs uppercase tracking-wider text-slate-900/50">
                        {r.category_key}
                      </div>
                      <div className="text-base font-semibold mt-0.5">{r.display_name}</div>
                      <div className="text-2xl font-bold mt-2" style={{ color }}>
                        {fmtUsd(Number(r.payout_usd))}
                      </div>
                      <div className="text-[11px] text-slate-900/40 mt-0.5">
                        {share.toFixed(1)}% of total payouts
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 text-[11px] text-slate-900/60">
                        <div className="flex justify-between">
                          <span>Diamonds</span>
                          <span className="text-cyan-300">{fmtInt(Number(r.payout_diamonds))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Txns</span>
                          <span className="text-slate-900/90">{fmtInt(Number(r.transaction_count))}</span>
                        </div>
                        <div className="flex justify-between col-span-2">
                          <span>Recipients</span>
                          <span className="text-slate-900/90">{fmtInt(Number(r.recipient_count))}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Day-by-day table */}
        {includeTimeline && dailyRollup.length > 0 && (
          <Card className="bg-white border-slate-200">
            <CardHeader className="border-b border-slate-200 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
                <TableIcon className="h-4 w-4 text-amber-400" />
                Day-by-Day Payouts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-900/60 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-right px-3 py-2">Payout USD</th>
                      <th className="text-right px-3 py-2">Diamonds</th>
                      <th className="text-right px-3 py-2">Transactions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...dailyRollup].reverse().map((r) => (
                      <tr key={r.day} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
                        <td className="px-3 py-2 font-mono text-slate-900/80">{r.day}</td>
                        <td className="px-3 py-2 text-right text-rose-300 font-semibold">{fmtUsd(r.usd)}</td>
                        <td className="px-3 py-2 text-right text-cyan-300">{fmtInt(r.dia)}</td>
                        <td className="px-3 py-2 text-right text-slate-900/70">{fmtInt(r.txns)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                      <td className="px-3 py-2">TOTAL</td>
                      <td className="px-3 py-2 text-right text-rose-300">{fmtUsd(totals.usd)}</td>
                      <td className="px-3 py-2 text-right text-cyan-300">{fmtInt(totals.dia)}</td>
                      <td className="px-3 py-2 text-right text-slate-900/70">{fmtInt(totals.txns)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Per-helper diamond payouts */}
        <Card className="bg-white border-slate-200">
          <CardHeader className="border-b border-slate-200 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
              <Gem className="h-4 w-4 text-cyan-400" />
              Per-Helper Diamond + Cash Payouts
              <span className="ml-auto text-[10px] text-slate-900/40 normal-case font-normal">
                Top 200 by total diamonds
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4"><Skeleton className="h-40 w-full bg-slate-50" /></div>
            ) : helpers.length === 0 ? (
              <div className="p-6 text-center text-slate-900/40 text-sm">No helper activity in this range</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-900/60 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="text-left px-3 py-2">Helper</th>
                      <th className="text-right px-3 py-2">Diamonds Topped-up</th>
                      <th className="text-right px-3 py-2">USD Withdrawn</th>
                      <th className="text-right px-3 py-2">Withdrawal Diamonds</th>
                      <th className="text-right px-3 py-2">Commission USD</th>
                      <th className="text-right px-3 py-2">Topups</th>
                      <th className="text-right px-3 py-2">Withdrawals</th>
                      <th className="text-right px-3 py-2">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {helpers.map((h) => (
                      <tr key={h.helper_id} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
                        <td className="px-3 py-2 text-slate-900/90 font-medium">{h.helper_name}</td>
                        <td className="px-3 py-2 text-right text-cyan-300 font-semibold">
                          {fmtInt(Number(h.diamonds_topped_up))}
                        </td>
                        <td className="px-3 py-2 text-right text-rose-300">{fmtUsd(Number(h.usd_withdrawn))}</td>
                        <td className="px-3 py-2 text-right text-cyan-200">
                          {fmtInt(Number(h.diamond_withdrawal_reward))}
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-300">
                          {fmtUsd(Number(h.commission_usd))}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-900/70">{fmtInt(Number(h.topup_count))}</td>
                        <td className="px-3 py-2 text-right text-slate-900/70">
                          {fmtInt(Number(h.withdrawal_count))}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-900/70">{fmtInt(Number(h.order_count))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-900/60 leading-relaxed">
          <span className="text-slate-900/80 font-semibold">Sources:</span>{" "}
          agency_withdrawals · helper_withdrawal_requests · helper_topup_requests · helper_orders ·
          payroll_requests · agency_earnings_transfers · user_beans_exchanges. Diamond → USD uses the
          official diamond rate (auto-derived from top-up packages).
        </div>
      </div>
    </div>
  );
}

function KPI({
  label,
  value,
  icon: Icon,
  accent,
  loading,
  highlight,
}: {
  label: string;
  value: string;
  accent: string;
  loading: boolean;
  highlight?: boolean;
}) {
  return (
    <Card
      className={cn(
        "bg-white border-white/[0.06] overflow-hidden relative",
        highlight && "ring-1 ring-rose-500/40",
      )}
    >
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: accent }} />
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-900/50">{label}</span>
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
        {loading ? (
          <Skeleton className="h-7 w-24 bg-slate-50" />
        ) : (
          <div className="text-xl md:text-2xl font-bold">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}
