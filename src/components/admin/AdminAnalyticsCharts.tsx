import { useState, useEffect, useCallback, memo } from "react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Users, Gift, Phone, DollarSign, Loader2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import useAdminRealtime from "@/hooks/useAdminRealtime";

type TimeRange = "7d" | "30d" | "90d";

interface AnalyticsData {
  user_growth: { date: string; new_users: number; new_hosts: number; total_users: number }[];
  gift_revenue: { date: string; coins: number; transactions: number }[];
  call_activity: { date: string; calls: number; total_minutes: number }[];
  recharge_revenue: { date: string; revenue: number; count: number }[];
  agency_distribution: { active: number; inactive: number; blocked: number };
  summary: {
    total_revenue_period: number;
    total_gifts_period: number;
    total_calls_period: number;
    total_new_users_period: number;
    total_new_hosts_period: number;
  };
}

const COLORS = {
  users: "#8b5cf6",
  hosts: "#ec4899",
  coins: "#f59e0b",
  calls: "#06b6d4",
  revenue: "#10b981",
  pie: ["#10b981", "#94a3b8", "#ef4444"],
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const formatNumber = (num: number) => {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-600/50 rounded-xl px-4 py-3 shadow-2xl">
      <p className="text-xs text-slate-400 font-semibold mb-1.5">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm font-bold" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' ? formatNumber(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
};

const TimeRangeSelector = memo(({ value, onChange }: { value: TimeRange; onChange: (v: TimeRange) => void }) => (
  <div className="flex gap-1 bg-slate-800/80 rounded-lg p-1 border border-slate-700/50">
    {(["7d", "30d", "90d"] as TimeRange[]).map((range) => (
      <Button
        key={range}
        variant="ghost"
        size="sm"
        onClick={() => onChange(range)}
        className={cn(
          "h-7 px-3 text-xs font-bold rounded-md transition-all",
          value === range
            ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
            : "text-slate-400 hover:text-white hover:bg-slate-700/50"
        )}
      >
        {range === "7d" ? "7 Days" : range === "30d" ? "30 Days" : "90 Days"}
      </Button>
    ))}
  </div>
));
TimeRangeSelector.displayName = "TimeRangeSelector";

const SummaryCard = memo(({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) => (
  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/30">
    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
      <Icon className="w-4 h-4" style={{ color }} />
    </div>
    <div>
      <p className="text-lg font-black text-white">{value}</p>
      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{label}</p>
    </div>
  </div>
));
SummaryCard.displayName = "SummaryCard";

export const AdminAnalyticsCharts = memo(() => {
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
      const { data: result, error } = await (supabase.rpc as any)("get_admin_analytics_chart_data", { p_days: days });
      if (error) throw error;
      setData(result as unknown as AnalyticsData);
    } catch (e) {
      console.error("[Analytics] Error loading chart data:", e);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  // Auto-refresh on relevant table changes
  useAdminRealtime(
    ['gift_transactions', 'private_calls', 'recharge_transactions', 'profiles'],
    () => loadData()
  );

  const chartUserGrowth = data?.user_growth?.map(d => ({
    date: formatDate(d.date),
    "New Users": d.new_users,
    "New Hosts": d.new_hosts,
  })) || [];

  const chartGiftRevenue = data?.gift_revenue?.map(d => ({
    date: formatDate(d.date),
    Coins: d.coins,
  })) || [];

  const chartCallActivity = data?.call_activity?.map(d => ({
    date: formatDate(d.date),
    Calls: d.calls,
    Minutes: d.total_minutes,
  })) || [];

  const chartRechargeRevenue = data?.recharge_revenue?.map(d => ({
    date: formatDate(d.date),
    Revenue: d.revenue,
    Count: d.count,
  })) || [];

  const pieData = data?.agency_distribution ? [
    { name: "Active", value: data.agency_distribution.active, color: COLORS.pie[0] },
    { name: "Inactive", value: data.agency_distribution.inactive, color: COLORS.pie[1] },
    { name: "Blocked", value: data.agency_distribution.blocked, color: COLORS.pie[2] },
  ].filter(d => d.value > 0) : [];

  const summary = data?.summary;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="space-y-5"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-white">Live Analytics</h3>
            <p className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Real-time data from Supabase
            </p>
          </div>
        </div>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Period Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard icon={DollarSign} label="Revenue" value={formatNumber(summary.total_revenue_period)} color={COLORS.revenue} />
          <SummaryCard icon={Gift} label="Gifts (Coins)" value={formatNumber(summary.total_gifts_period)} color={COLORS.coins} />
          <SummaryCard icon={Phone} label="Calls" value={formatNumber(summary.total_calls_period)} color={COLORS.calls} />
          <SummaryCard icon={Users} label="New Users" value={formatNumber(summary.total_new_users_period)} color={COLORS.users} />
          <SummaryCard icon={Zap} label="New Hosts" value={formatNumber(summary.total_new_hosts_period)} color={COLORS.hosts} />
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* User Growth */}
            <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 border-slate-700/40 backdrop-blur-sm shadow-xl overflow-hidden">
              <CardHeader className="pb-2 border-b border-slate-700/30">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" />
                  User & Host Growth
                  <Badge className="bg-emerald-600/20 text-emerald-300 border-emerald-500/30 text-[10px] ml-auto">REAL</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 pb-2">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartUserGrowth} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorNewUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.users} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={COLORS.users} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorNewHosts" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.hosts} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={COLORS.hosts} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                    <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="New Users" stroke={COLORS.users} fill="url(#colorNewUsers)" strokeWidth={2.5} />
                    <Area type="monotone" dataKey="New Hosts" stroke={COLORS.hosts} fill="url(#colorNewHosts)" strokeWidth={2.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Recharge Revenue */}
            <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 border-slate-700/40 backdrop-blur-sm shadow-xl overflow-hidden">
              <CardHeader className="pb-2 border-b border-slate-700/30">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  Recharge Revenue
                  <Badge className="bg-emerald-600/20 text-emerald-300 border-emerald-500/30 text-[10px] ml-auto">REAL</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 pb-2">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartRechargeRevenue} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.revenue} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={COLORS.revenue} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                    <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="Revenue" stroke={COLORS.revenue} fill="url(#colorRevenue)" strokeWidth={2.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Gift Revenue (Coins) */}
            <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 border-slate-700/40 backdrop-blur-sm shadow-xl overflow-hidden">
              <CardHeader className="pb-2 border-b border-slate-700/30">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <Gift className="w-4 h-4 text-amber-400" />
                  Gift Volume (Coins)
                  <Badge className="bg-amber-600/20 text-amber-300 border-amber-500/30 text-[10px] ml-auto">REAL</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 pb-2">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartGiftRevenue} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCoins" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.coins} stopOpacity={0.9} />
                        <stop offset="100%" stopColor={COLORS.coins} stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                    <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Coins" fill="url(#colorCoins)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Call Activity */}
            <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 border-slate-700/40 backdrop-blur-sm shadow-xl overflow-hidden">
              <CardHeader className="pb-2 border-b border-slate-700/30">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <Phone className="w-4 h-4 text-cyan-400" />
                  Call Activity
                  <Badge className="bg-cyan-600/20 text-cyan-300 border-cyan-500/30 text-[10px] ml-auto">REAL</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 pb-2">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartCallActivity} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                    <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="Calls" stroke={COLORS.calls} strokeWidth={2.5} dot={{ r: 3, fill: COLORS.calls }} />
                    <Line type="monotone" dataKey="Minutes" stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Agency Distribution (smaller) */}
          {pieData.length > 0 && (
            <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 border-slate-700/40 backdrop-blur-sm shadow-xl overflow-hidden max-w-md">
              <CardHeader className="pb-2 border-b border-slate-700/30">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  Agency Distribution
                  <Badge className="bg-emerald-600/20 text-emerald-300 border-emerald-500/30 text-[10px] ml-auto">REAL</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 pb-2 flex items-center justify-center">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value" stroke="none">
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend formatter={(value: string) => <span className="text-xs text-slate-300 font-semibold">{value}</span>} iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </motion.div>
  );
});

AdminAnalyticsCharts.displayName = "AdminAnalyticsCharts";
