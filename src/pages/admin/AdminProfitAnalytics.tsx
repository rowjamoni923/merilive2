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
  net_profit_usd: number;
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [includeTimeline, setIncludeTimeline] = useState(true);
  const [coinRate, setCoinRate] = useState<number | null>(null);

  const handlePreset = useCallback((p: Preset) => {
    setPreset(p);
    if (p === "custom") return;
    const r = presetRange(p);
    setStartDate(toInputDate(r.start));
    setEndDate(toInputDate(r.end));
  }, []);

  useEffect(() => {
    supabase.rpc("get_official_coin_usd_rate").then(({ data }) => {
      if (typeof data === "number" || (typeof data === "string" && !isNaN(Number(data)))) {
        setCoinRate(Number(data));
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

        const { data: sectorData, error: sectorErr } = await supabase.rpc(
          "compute_profit_for_range",
          { p_start: startTs, p_end: endTs },
        );
        if (sectorErr) throw sectorErr;

        let timelineData: TimelineRow[] = [];
        if (includeTimeline) {
          const dayDiff =
            Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000) + 1;
          if (dayDiff <= 92) {
            const { data: tlData, error: tlErr } = await supabase.rpc("compute_profit_timeline", {
              p_start: startTs,
              p_end: endTs,
            });
            if (tlErr) throw tlErr;
            timelineData = (tlData as TimelineRow[]) ?? [];
          }
        }

        if (cancelled) return;
        setSectors((sectorData as SectorRow[]) ?? []);
        setTimeline(timelineData);
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e?.message || "Failed to load profit analytics");
          setSectors([]);
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

  // Pivot timeline for stacked area chart
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
    <div className="min-h-screen bg-[#06060a] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/admin">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Profit Analytics</h1>
              <p className="text-sm text-white/60">
                Sector-wise company revenue, payouts and net profit
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="border-white/20 text-white hover:bg-white/10"
            >
              <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={!sectors.length}
              className="border-white/20 text-white hover:bg-white/10"
            >
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Date filter */}
        <Card className="bg-[#0c0c14] border-white/[0.06]">
          <CardContent className="p-4 space-y-3">
            <Tabs value={preset} onValueChange={(v) => handlePreset(v as Preset)}>
              <TabsList className="bg-black/40 border border-white/10">
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="yesterday">Yesterday</TabsTrigger>
                <TabsTrigger value="week">Last 7 days</TabsTrigger>
                <TabsTrigger value="month">Last 30 days</TabsTrigger>
                <TabsTrigger value="custom">Custom</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-white/60" />
                <span className="text-white/60">From</span>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPreset("custom");
                  }}
                  className="bg-black/40 border-white/10 text-white w-auto"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white/60">To</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPreset("custom");
                  }}
                  className="bg-black/40 border-white/10 text-white w-auto"
                />
              </div>
              <label className="flex items-center gap-2 text-white/60 ml-auto cursor-pointer">
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
          <Card className="bg-[#0c0c14] border-white/[0.06]">
            <CardHeader className="border-b border-white/[0.06] pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
                <BarChart3 className="h-4 w-4 text-violet-400" />
                Net Profit Timeline (USD)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {loading ? (
                <Skeleton className="h-72 w-full bg-white/5" />
              ) : chartData.length === 0 ? (
                <div className="h-72 grid place-items-center text-white/40 text-sm">
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

        {/* Sector grid */}
        <Card className="bg-[#0c0c14] border-white/[0.06]">
          <CardHeader className="border-b border-white/[0.06] pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
              <PieIcon className="h-4 w-4 text-emerald-400" />
              Sector Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full bg-white/5" />
                ))}
              </div>
            ) : sectors.length === 0 ? (
              <div className="text-center text-white/40 py-12 text-sm">No data available for the selected range</div>
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
                          <div className="text-xs uppercase tracking-wider text-white/50">
                            {s.sector_key}
                          </div>
                          <div className="text-base font-semibold mt-0.5">{s.display_name}</div>
                        </div>
                        <Badge
                          variant="outline"
                          className="border-white/20 text-white/80 text-[10px]"
                        >
                          {Number(s.company_cut_percent).toFixed(0)}% cut
                        </Badge>
                      </div>
                      <div className="text-2xl font-bold" style={{ color }}>
                        {fmtUsd(Number(s.net_profit_usd))}
                      </div>
                      <div className="text-[11px] text-white/40 mt-0.5">
                        {share.toFixed(1)}% of net profit
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 text-[11px] text-white/60">
                        <div className="flex justify-between">
                          <span>Gross</span>
                          <span className="text-white/90">{fmtUsd(Number(s.gross_revenue_usd))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Payouts</span>
                          <span className="text-white/90">{fmtUsd(Number(s.payouts_usd))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Gateway</span>
                          <span className="text-white/90">{fmtUsd(Number(s.gateway_cost_usd))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Txns</span>
                          <span className="text-white/90">{fmtInt(Number(s.transaction_count))}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-[11px] text-white/40 leading-relaxed">
          Coin/Bean → USD conversion uses rates from <code>profit_config._global</code>. Edit
          <code> meta.coin_to_usd_rate</code> and <code>meta.bean_to_usd_rate</code> in the
          database to match your current economy. Party Room / PK Battle / Lucky Gift are listed
          as informational counters because their coin flow is already captured in the Gift
          sector and counting them again would double-bill.
        </p>
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
        "bg-[#0c0c14] border-white/[0.06] overflow-hidden relative",
        highlight && "ring-1 ring-violet-500/40",
      )}
    >
      <div
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ background: accent }}
      />
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-white/50">{label}</span>
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
        {loading ? (
          <Skeleton className="h-7 w-24 bg-white/5" />
        ) : (
          <div className="text-xl md:text-2xl font-bold">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}
