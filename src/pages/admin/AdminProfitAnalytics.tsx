import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  TrendingUp,
  DollarSign,
  Receipt,
  CreditCard,
  Percent,
  Download,
  RefreshCw,
  Calendar as CalendarIcon,
  PieChart as PieIcon,
  BarChart3,
  ShoppingCart,
  Table as TableIcon,
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import CompanyHealthGauge from "@/components/admin/CompanyHealthGauge";
import { ReportExportMenu } from "@/components/admin/ReportExportMenu";

type Preset = "today" | "yesterday" | "week" | "month" | "custom";

interface SectorRow {
  sector_key: string;
  display_name: string;
  gross_revenue_usd: number;
  company_cut_usd: number;
  payouts_usd: number;
  gateway_cost_usd: number;
  net_profit_usd: number;
  transaction_count: number;
  company_cut_percent: number;
}

interface TimelineRow {
  day: string;
  sector_key: string;
  gross_revenue_usd: number;
  company_cut_usd: number;
  payouts_usd: number;
  gateway_cost_usd: number;
  net_profit_usd: number;
  transaction_count: number;
}

interface PayoutTimelineRow {
  day: string;
  category_key: string;
  payout_usd: number;
  payout_diamonds: number;
  transaction_count: number;
}

const fmtUsd = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
    Number.isFinite(v) ? v : 0,
  );

const fmtInt = (v: number) => new Intl.NumberFormat("en-US").format(v ?? 0);

const SECTOR_COLORS: Record<string, string> = {
  recharge: "#06b6d4",
  helper_order: "#0ea5e9",
  gift: "#f43f5e",
  private_call: "#a855f7",
  agency_withdrawal_fee: "#10b981",
  exchange: "#eab308",
  game: "#f97316",
  vip_subscription: "#ec4899",
  noble_subscription: "#8b5cf6",
  subscription_order: "#22d3ee",
  shop_purchase: "#84cc16",
  party_room: "#94a3b8",
  pk_battle: "#fb923c",
  lucky_gift: "#facc15",
};

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
    case "custom":
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

export default function AdminProfitAnalytics() {
  const [preset, setPreset] = useState<Preset>("today");
  const initial = presetRange("today");
  const [startDate, setStartDate] = useState<string>(toInputDate(initial.start));
  const [endDate, setEndDate] = useState<string>(toInputDate(initial.end));
  const [loading, setLoading] = useState(false);
  const [sectors, setSectors] = useState<SectorRow[]>([]);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [payoutTimeline, setPayoutTimeline] = useState<PayoutTimelineRow[]>([]);
  const [salesSources, setSalesSources] = useState<
    Array<{
      source_key: string;
      display_name: string;
      gross_usd: number;
      transaction_count: number;
      unique_buyers: number;
    }>
  >([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [includeTimeline, setIncludeTimeline] = useState(true);
  const [diamondRate, setDiamondRate] = useState<number | null>(null);

  const handlePreset = useCallback((p: Preset) => {
    setPreset(p);
    if (p === "custom") return;
    const r = presetRange(p);
    setStartDate(toInputDate(r.start));
    setEndDate(toInputDate(r.end));
  }, []);

  useEffect(() => {
    supabase.rpc("get_official_diamond_usd_rate").then(({ data }) => {
      if (typeof data === "number" || (typeof data === "string" && !isNaN(Number(data)))) {
        setDiamondRate(Number(data));
      }
    });
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const startTs = new Date(`${startDate}T00:00:00`).toISOString();
        const endTs = new Date(`${endDate}T23:59:59.999`).toISOString();

        const [sectorRes, sourcesRes] = await Promise.all([
          supabase.rpc("compute_profit_for_range", { p_start: startTs, p_end: endTs }),
          supabase.rpc("compute_sales_by_source", { p_start: startTs, p_end: endTs }),
        ]);
        if (sectorRes.error) throw sectorRes.error;
        if (sourcesRes.error) throw sourcesRes.error;

        let timelineData: TimelineRow[] = [];
        let payoutTimelineData: PayoutTimelineRow[] = [];
        if (includeTimeline) {
          const dayDiff =
            Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000) + 1;
          if (dayDiff <= 92) {
            const [tlRes, ptlRes] = await Promise.all([
              supabase.rpc("compute_profit_timeline", { p_start: startTs, p_end: endTs }),
              supabase.rpc("compute_payouts_timeline", { p_start: startTs, p_end: endTs }),
            ]);
            if (tlRes.error) throw tlRes.error;
            if (ptlRes.error) throw ptlRes.error;
            timelineData = (tlRes.data as TimelineRow[]) ?? [];
            payoutTimelineData = (ptlRes.data as PayoutTimelineRow[]) ?? [];
          }
        }

        if (cancelled) return;
        setSectors((sectorRes.data as SectorRow[]) ?? []);
        setSalesSources((sourcesRes.data as any[]) ?? []);
        setTimeline(timelineData);
        setPayoutTimeline(payoutTimelineData);
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e?.message || "Failed to load profit analytics");
          setSectors([]);
          setSalesSources([]);
          setTimeline([]);
          setPayoutTimeline([]);
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
    const t = {
      gross: 0,
      company_cut: 0,
      payouts: 0,
      gateway: 0,
      net: 0,
      txns: 0,
    };
    for (const s of sectors) {
      t.gross += Number(s.gross_revenue_usd) || 0;
      t.company_cut += Number(s.company_cut_usd) || 0;
      t.payouts += Number(s.payouts_usd) || 0;
      t.gateway += Number(s.gateway_cost_usd) || 0;
      t.net += Number(s.net_profit_usd) || 0;
      t.txns += Number(s.transaction_count) || 0;
    }
    return t;
  }, [sectors]);

  const margin = totals.gross > 0 ? (totals.net / totals.gross) * 100 : 0;

  // Pivot timeline for stacked net-profit area chart (per sector)
  const chartData = useMemo(() => {
    const map = new Map<string, Record<string, number | string>>();
    for (const row of timeline) {
      const key = row.day;
      if (!map.has(key)) map.set(key, { day: key });
      const obj = map.get(key)!;
      obj[row.sector_key] = (Number(obj[row.sector_key]) || 0) + (Number(row.net_profit_usd) || 0);
    }
    return Array.from(map.values()).sort((a, b) =>
      String(a.day).localeCompare(String(b.day)),
    );
  }, [timeline]);

  const sectorKeysInChart = useMemo(() => {
    const set = new Set<string>();
    timeline.forEach((r) => set.add(r.sector_key));
    return Array.from(set);
  }, [timeline]);

  // Per-day rollup (all sectors aggregated) — used for Daily Sales chart + table
  const dailyRollup = useMemo(() => {
    const map = new Map<
      string,
      {
        day: string;
        gross: number;
        company_cut: number;
        payouts: number;
        gateway: number;
        net: number;
        txns: number;
      }
    >();
    for (const r of timeline) {
      const k = r.day;
      if (!map.has(k))
        map.set(k, { day: k, gross: 0, company_cut: 0, payouts: 0, gateway: 0, net: 0, txns: 0 });
      const o = map.get(k)!;
      o.gross += Number(r.gross_revenue_usd) || 0;
      o.company_cut += Number(r.company_cut_usd) || 0;
      o.payouts += Number(r.payouts_usd) || 0;
      o.gateway += Number(r.gateway_cost_usd) || 0;
      o.net += Number(r.net_profit_usd) || 0;
      o.txns += Number(r.transaction_count) || 0;
    }
    return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [timeline]);

  // Per-day Profit vs Payouts (full outflows incl. withdrawals, helper diamonds, host payroll, game winnings)
  const dailyTotals = useMemo(() => {
    const map = new Map<string, { day: string; profit: number; payouts: number }>();
    for (const r of timeline) {
      const k = r.day;
      if (!map.has(k)) map.set(k, { day: k, profit: 0, payouts: 0 });
      map.get(k)!.profit += Number(r.net_profit_usd) || 0;
    }
    for (const r of payoutTimeline) {
      const k = r.day;
      if (!map.has(k)) map.set(k, { day: k, profit: 0, payouts: 0 });
      map.get(k)!.payouts += Number(r.payout_usd) || 0;
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, net: r.profit - r.payouts }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [timeline, payoutTimeline]);

  const dailyTotalsSummary = useMemo(() => {
    const t = { profit: 0, payouts: 0 };
    for (const r of dailyTotals) {
      t.profit += r.profit;
      t.payouts += r.payouts;
    }
    return { ...t, net: t.profit - t.payouts };
  }, [dailyTotals]);

  const handleExport = useCallback(() => {
    if (!sectors.length) return;
    const headers = [
      "Sector",
      "Gross Revenue (USD)",
      "Company Cut (USD)",
      "Payouts (USD)",
      "Gateway Cost (USD)",
      "Net Profit (USD)",
      "Transactions",
      "Company Cut %",
    ];
    const rows = sectors.map((s) => [
      s.display_name,
      s.gross_revenue_usd,
      s.company_cut_usd,
      s.payouts_usd,
      s.gateway_cost_usd,
      s.net_profit_usd,
      s.transaction_count,
      s.company_cut_percent,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `profit-analytics-${startDate}_to_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sectors, startDate, endDate]);

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
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Profit Analytics</h1>
              <p className="text-sm text-slate-900/60">
                Sector-wise company revenue, payouts and net profit
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
              rows={sectors as any}
              columns={[
                { key: "sector", label: "Sector", weight: 1.4 },
                { key: "revenue", label: "Revenue (USD)", weight: 1, format: (v) => v != null ? `$${Number(v).toFixed(2)}` : "—" },
                { key: "payout", label: "Payout (USD)", weight: 1, format: (v) => v != null ? `$${Number(v).toFixed(2)}` : "—" },
                { key: "profit", label: "Net Profit (USD)", weight: 1.1, format: (v) => v != null ? `$${Number(v).toFixed(2)}` : "—" },
                { key: "margin", label: "Margin %", weight: 0.8, format: (v) => v != null ? `${Number(v).toFixed(1)}%` : "—" },
              ]}
              meta={{
                title: "Profit Analytics",
                subtitle: "Sector-wise revenue, payouts and net profit",
                fileName: "profit-analytics",
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
                  className="accent-violet-500"
                />
                Include daily timeline (≤92 days)
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Company Health Gauge */}
        <CompanyHealthGauge startDate={startDate} endDate={endDate} refreshKey={refreshKey} />

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPI label="Gross Revenue" value={fmtUsd(totals.gross)} icon={DollarSign} accent="#06b6d4" loading={loading} />
          <KPI label="Company Cut" value={fmtUsd(totals.company_cut)} icon={TrendingUp} accent="#10b981" loading={loading} />
          <KPI label="Payouts" value={fmtUsd(totals.payouts)} icon={Receipt} accent="#f43f5e" loading={loading} />
          <KPI label="Gateway Cost" value={fmtUsd(totals.gateway)} icon={CreditCard} accent="#eab308" loading={loading} />
          <KPI label="Net Profit" value={fmtUsd(totals.net)} icon={PieIcon} accent="#a855f7" loading={loading} highlight />
          <KPI label="Profit Margin" value={`${margin.toFixed(2)}%`} icon={Percent} accent="#22d3ee" loading={loading} />
        </div>

        {/* Timeline chart */}
        {includeTimeline && (
          <Card className="bg-white border-slate-200">
            <CardHeader className="border-b border-slate-200 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
                <BarChart3 className="h-4 w-4 text-violet-400" />
                Net Profit Timeline (USD)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {loading ? (
                <Skeleton className="h-72 w-full bg-slate-50" />
              ) : chartData.length === 0 ? (
                <div className="h-72 grid place-items-center text-slate-900/40 text-sm">
                  No data for the selected range
                </div>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        {sectorKeysInChart.map((k) => (
                          <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={SECTOR_COLORS[k] || "#8884d8"} stopOpacity={0.7} />
                            <stop offset="100%" stopColor={SECTOR_COLORS[k] || "#8884d8"} stopOpacity={0.05} />
                          </linearGradient>
                        ))}
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
                      {sectorKeysInChart.map((k) => (
                        <Area
                          key={k}
                          type="monotone"
                          dataKey={k}
                          stackId="1"
                          stroke={SECTOR_COLORS[k] || "#8884d8"}
                          fill={`url(#grad-${k})`}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Daily Sales (gross) vs Net Profit chart */}
        {includeTimeline && (
          <Card className="bg-white border-slate-200">
            <CardHeader className="border-b border-slate-200 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
                <ShoppingCart className="h-4 w-4 text-cyan-400" />
                Daily Sales vs Net Profit
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {loading ? (
                <Skeleton className="h-64 w-full bg-slate-50" />
              ) : dailyRollup.length === 0 ? (
                <div className="h-64 grid place-items-center text-slate-900/40 text-sm">
                  No data
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyRollup}>
                      <defs>
                        <linearGradient id="grad-gross" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="grad-net" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a855f7" stopOpacity={0.7} />
                          <stop offset="100%" stopColor="#a855f7" stopOpacity={0.05} />
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
                      <Area type="monotone" dataKey="gross" name="Gross Sales" stroke="#06b6d4" fill="url(#grad-gross)" />
                      <Area type="monotone" dataKey="net" name="Net Profit" stroke="#a855f7" fill="url(#grad-net)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Per-day breakdown table */}
        {includeTimeline && (
          <Card className="bg-white border-slate-200">
            <CardHeader className="border-b border-slate-200 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
                <TableIcon className="h-4 w-4 text-amber-400" />
                Day-by-Day Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4"><Skeleton className="h-40 w-full bg-slate-50" /></div>
              ) : dailyRollup.length === 0 ? (
                <div className="p-6 text-center text-slate-900/40 text-sm">No data</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-900/60 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="text-left px-3 py-2">Date</th>
                        <th className="text-right px-3 py-2">Gross Sales</th>
                        <th className="text-right px-3 py-2">Company Cut</th>
                        <th className="text-right px-3 py-2">Payouts</th>
                        <th className="text-right px-3 py-2">Gateway</th>
                        <th className="text-right px-3 py-2">Net Profit</th>
                        <th className="text-right px-3 py-2">Margin</th>
                        <th className="text-right px-3 py-2">Txns</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...dailyRollup].reverse().map((r) => {
                        const m = r.gross > 0 ? (r.net / r.gross) * 100 : 0;
                        return (
                          <tr key={r.day} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
                            <td className="px-3 py-2 font-mono text-slate-900/80">{r.day}</td>
                            <td className="px-3 py-2 text-right text-cyan-300">{fmtUsd(r.gross)}</td>
                            <td className="px-3 py-2 text-right text-emerald-300">{fmtUsd(r.company_cut)}</td>
                            <td className="px-3 py-2 text-right text-rose-300">{fmtUsd(r.payouts)}</td>
                            <td className="px-3 py-2 text-right text-yellow-300">{fmtUsd(r.gateway)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-violet-300">{fmtUsd(r.net)}</td>
                            <td className="px-3 py-2 text-right text-slate-900/70">{m.toFixed(1)}%</td>
                            <td className="px-3 py-2 text-right text-slate-900/70">{fmtInt(r.txns)}</td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                        <td className="px-3 py-2">TOTAL</td>
                        <td className="px-3 py-2 text-right text-cyan-300">{fmtUsd(totals.gross)}</td>
                        <td className="px-3 py-2 text-right text-emerald-300">{fmtUsd(totals.company_cut)}</td>
                        <td className="px-3 py-2 text-right text-rose-300">{fmtUsd(totals.payouts)}</td>
                        <td className="px-3 py-2 text-right text-yellow-300">{fmtUsd(totals.gateway)}</td>
                        <td className="px-3 py-2 text-right text-violet-300">{fmtUsd(totals.net)}</td>
                        <td className="px-3 py-2 text-right text-slate-900/70">{margin.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right text-slate-900/70">{fmtInt(totals.txns)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Daily Totals — Company Profit vs Total Payouts (one glance) */}
        {includeTimeline && (
          <Card className="bg-white border-slate-200">
            <CardHeader className="border-b border-slate-200 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
                <TableIcon className="h-4 w-4 text-emerald-400" />
                Daily Totals — Profit vs Payouts
                <span className="ml-auto text-[10px] text-slate-900/40 normal-case font-normal">
                  Profit kept by company vs total paid out to users / hosts / agencies / helpers
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {/* Summary tiles */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-300/80">
                    Total Company Profit
                  </div>
                  <div className="mt-1 text-2xl font-bold text-emerald-300">
                    {fmtUsd(dailyTotalsSummary.profit)}
                  </div>
                </div>
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-rose-300/80">
                    Total Payouts (paid out)
                  </div>
                  <div className="mt-1 text-2xl font-bold text-rose-300">
                    {fmtUsd(dailyTotalsSummary.payouts)}
                  </div>
                </div>
                <div
                  className={cn(
                    "rounded-lg border p-3",
                    dailyTotalsSummary.net >= 0
                      ? "border-violet-500/30 bg-violet-500/[0.06]"
                      : "border-red-500/40 bg-red-500/[0.08]",
                  )}
                >
                  <div
                    className={cn(
                      "text-[10px] uppercase tracking-wider",
                      dailyTotalsSummary.net >= 0 ? "text-violet-300/80" : "text-red-300/80",
                    )}
                  >
                    Net Retained (Profit − Payouts)
                  </div>
                  <div
                    className={cn(
                      "mt-1 text-2xl font-bold",
                      dailyTotalsSummary.net >= 0 ? "text-violet-300" : "text-red-300",
                    )}
                  >
                    {fmtUsd(dailyTotalsSummary.net)}
                  </div>
                </div>
              </div>

              {/* Per-day table */}
              {loading ? (
                <Skeleton className="h-40 w-full bg-slate-50" />
              ) : dailyTotals.length === 0 ? (
                <div className="p-6 text-center text-slate-900/40 text-sm">No data</div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-900/60 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="text-left px-3 py-2">Date</th>
                        <th className="text-right px-3 py-2">Company Profit</th>
                        <th className="text-right px-3 py-2">Total Payouts</th>
                        <th className="text-right px-3 py-2">Net Retained</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...dailyTotals].reverse().map((r) => (
                        <tr key={r.day} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
                          <td className="px-3 py-2 font-mono text-slate-900/80">{r.day}</td>
                          <td className="px-3 py-2 text-right text-emerald-300">{fmtUsd(r.profit)}</td>
                          <td className="px-3 py-2 text-right text-rose-300">{fmtUsd(r.payouts)}</td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right font-semibold",
                              r.net >= 0 ? "text-violet-300" : "text-red-400",
                            )}
                          >
                            {fmtUsd(r.net)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                        <td className="px-3 py-2">TOTAL</td>
                        <td className="px-3 py-2 text-right text-emerald-300">
                          {fmtUsd(dailyTotalsSummary.profit)}
                        </td>
                        <td className="px-3 py-2 text-right text-rose-300">
                          {fmtUsd(dailyTotalsSummary.payouts)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right",
                            dailyTotalsSummary.net >= 0 ? "text-violet-300" : "text-red-400",
                          )}
                        >
                          {fmtUsd(dailyTotalsSummary.net)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Sales by Source — official vs helper level 1..5 */}
        <Card className="bg-white border-slate-200">
          <CardHeader className="border-b border-slate-200 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
              <ShoppingCart className="h-4 w-4 text-cyan-400" />
              Sales by Source
              <span className="ml-auto text-[10px] text-slate-900/40 normal-case font-normal">
                Official + every helper level
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {loading ? (
              <Skeleton className="h-24 w-full bg-slate-50" />
            ) : salesSources.length === 0 ? (
              <div className="text-center text-slate-900/40 py-6 text-sm">No sales in this range</div>
            ) : (
              (() => {
                const totalSales = salesSources.reduce(
                  (a, s) => a + (Number(s.gross_usd) || 0),
                  0,
                );
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {salesSources
                      .slice()
                      .sort((a, b) => Number(b.gross_usd) - Number(a.gross_usd))
                      .map((s) => {
                        const isOfficial = s.source_key === "official_recharge";
                        const color = isOfficial ? "#06b6d4" : "#a855f7";
                        const share =
                          totalSales > 0 ? (Number(s.gross_usd) / totalSales) * 100 : 0;
                        return (
                          <div
                            key={s.source_key}
                            className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-black/40 to-black/10 p-3"
                          >
                            <div
                              className="absolute inset-y-0 left-0 w-1"
                              style={{ background: color }}
                            />
                            <div className="text-[10px] uppercase tracking-wider text-slate-900/50">
                              {isOfficial ? "Official" : "Helper Sales"}
                            </div>
                            <div className="text-sm font-semibold mt-0.5 truncate">
                              {s.display_name}
                            </div>
                            <div
                              className="text-lg font-bold mt-1.5"
                              style={{ color }}
                            >
                              {fmtUsd(Number(s.gross_usd))}
                            </div>
                            <div className="text-[10px] text-slate-900/40">
                              {share.toFixed(1)}% · {fmtInt(Number(s.transaction_count))} txns ·{" "}
                              {fmtInt(Number(s.unique_buyers))} buyers
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })()
            )}
          </CardContent>
        </Card>

        {/* Sector grid */}
        <Card className="bg-white border-slate-200">
          <CardHeader className="border-b border-slate-200 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
              <PieIcon className="h-4 w-4 text-emerald-400" />
              Sector Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full bg-slate-50" />
                ))}
              </div>
            ) : sectors.length === 0 ? (
              <div className="text-center text-slate-900/40 py-12 text-sm">No data available for the selected range</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {sectors.map((s) => {
                  const share = totals.net > 0 ? (s.net_profit_usd / totals.net) * 100 : 0;
                  const color = SECTOR_COLORS[s.sector_key] || "#8884d8";
                  return (
                    <div
                      key={s.sector_key}
                      className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-black/40 to-black/10 p-4"
                    >
                      <div
                        className="absolute inset-y-0 left-0 w-1"
                        style={{ background: color }}
                      />
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="text-xs uppercase tracking-wider text-slate-900/50">
                            {s.sector_key}
                          </div>
                          <div className="text-base font-semibold mt-0.5">{s.display_name}</div>
                        </div>
                        <Badge
                          variant="outline"
                          className="border-slate-200 text-slate-900/80 text-[10px]"
                        >
                          {Number(s.company_cut_percent).toFixed(0)}% cut
                        </Badge>
                      </div>
                      <div className="text-2xl font-bold" style={{ color }}>
                        {fmtUsd(Number(s.net_profit_usd))}
                      </div>
                      <div className="text-[11px] text-slate-900/40 mt-0.5">
                        {share.toFixed(1)}% of net profit
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 text-[11px] text-slate-900/60">
                        <div className="flex justify-between">
                          <span>Gross</span>
                          <span className="text-slate-900/90">{fmtUsd(Number(s.gross_revenue_usd))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Payouts</span>
                          <span className="text-slate-900/90">{fmtUsd(Number(s.payouts_usd))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Gateway</span>
                          <span className="text-slate-900/90">{fmtUsd(Number(s.gateway_cost_usd))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Txns</span>
                          <span className="text-slate-900/90">{fmtInt(Number(s.transaction_count))}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-900/60 leading-relaxed space-y-1">
          <div>
            <span className="text-slate-900/80 font-semibold">Official diamond rate:</span>{" "}
            {diamondRate
              ? `${(1 / diamondRate).toLocaleString("en-US", { maximumFractionDigits: 0 })} diamonds = $1 USD`
              : "loading…"}{" "}
            <span className="text-slate-900/40">
              (auto-computed from active top-up packages)
            </span>
          </div>
          <div className="text-slate-900/40">
            Add / edit packages in Admin → Top-up Packages and this rate updates instantly.
            Party Room / PK Battle / Lucky Gift are informational counters only — their diamond
            flow is already captured in the Gift sector to prevent double-counting.
          </div>
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
  icon: React.ElementType;
  accent: string;
  loading: boolean;
  highlight?: boolean;
}) {
  return (
    <Card
      className={cn(
        "bg-white border-white/[0.06] overflow-hidden relative",
        highlight && "ring-1 ring-violet-500/40",
      )}
    >
      <div
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ background: accent }}
      />
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
