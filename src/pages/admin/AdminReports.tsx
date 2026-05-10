import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import {
  TrendingUp,
  Users,
  Coins,
  Gift,
  Video,
  Phone,
  Calendar,
  Download,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
export default function AdminReports() {
  const [period, setPeriod] = useState("week");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    newUsersToday: 0,
    totalCoinsSpent: 0,
    totalGiftsSent: 0,
    totalStreams: 0,
    totalCalls: 0
  });

  const [chartData, setChartData] = useState<any[]>([]);
  const [giftData, setGiftData] = useState<any[]>([]);

  useEffect(() => {
    fetchReportData();
  }, [period]);

  useAdminRealtime(['profiles', 'gift_transactions', 'live_streams', 'private_calls'], () => fetchReportData());

  const fetchReportData = async () => {
    setLoading(true);
    try {
      // Pkg10: single RPC replaces 4 count + 3 large-fetch queries (server-side aggregation)
      const { data, error } = await supabase.rpc('admin_reports_overview_stats' as any);
      if (error) throw error;

      const payload: any = data || {};
      setStats({
        totalUsers: Number(payload.total_users || 0),
        newUsersToday: Number(payload.new_users_today || 0),
        totalCoinsSpent: Number(payload.total_coins_spent_90d || 0),
        totalGiftsSent: Number(payload.total_gifts_sent || 0),
        totalStreams: Number(payload.total_streams || 0),
        totalCalls: Number(payload.total_calls || 0),
      });

      // Slice the 90-day series to selected period
      const days = period === "week" ? 7 : period === "month" ? 30 : 90;
      const series: any[] = Array.isArray(payload.series) ? payload.series : [];
      const sliced = series.slice(-days).map((row: any) => {
        const d = new Date(row.date);
        return {
          date: d.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
          users: Number(row.users || 0),
          coins: Number(row.coins || 0),
          streams: Number(row.streams || 0),
        };
      });
      setChartData(sliced);

      const giftDistribution = [
        { name: "Small Gifts", value: 35, color: "#22c55e" },
        { name: "Medium Gifts", value: 40, color: "#3b82f6" },
        { name: "Large Gifts", value: 20, color: "#a855f7" },
        { name: "Special Gifts", value: 5, color: "#f59e0b" }
      ];
      setGiftData(giftDistribution);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminReports.ErrorFetchingReportData", message: formatAdminError(error)});
      toast.error("Failed to load report data");
    } finally {
      setLoading(false);
    }
  };

  const formatCoins = (coins: number) => {
    if (coins >= 1000000) return `${(coins / 1000000).toFixed(1)}M`;
    if (coins >= 1000) return `${(coins / 1000).toFixed(1)}K`;
    return coins.toString();
  };

  const StatCard = ({ 
    icon: Icon, 
    label, 
    value, 
    change, 
    color 
  }: { 
    icon: any; 
    label: string; 
    value: string | number; 
    change?: number; 
    color: string;
  }) => (
    <Card className="bg-white/5 border-white/10">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className={`w-12 h-12 rounded-xl bg-${color}-500/20 flex items-center justify-center`}>
            <Icon className={`w-6 h-6 text-${color}-400`} />
          </div>
          {change !== undefined && (
            <div className={`flex items-center gap-1 text-sm ${change >= 0 ? "text-green-400" : "text-red-400"}`}>
              {change >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
              {Math.abs(change)}%
            </div>
          )}
        </div>
        <div className="mt-3">
          <p className="text-white/60 text-sm">{label}</p>
          <p className="text-white font-bold text-2xl">{value}</p>
        </div>
      </CardContent>
    </Card>
  );

  const StatCardNew = ({ 
    icon: Icon, 
    label, 
    value, 
    change, 
    colorClass 
  }: { 
    icon: any; 
    label: string; 
    value: string | number; 
    change?: number; 
    colorClass: string;
  }) => (
    <Card className={`${colorClass} border shadow-md`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow`} style={{ backgroundColor: 'rgba(255,255,255,0.5)' }}>
            <Icon className="w-6 h-6" />
          </div>
          {change !== undefined && (
            <div className={`flex items-center gap-1 text-sm font-medium ${change >= 0 ? "text-green-600" : "text-red-600"}`}>
              {change >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
              {Math.abs(change)}%
            </div>
          )}
        </div>
        <div className="mt-3">
          <p className="text-sm font-medium opacity-80">{label}</p>
          <p className="font-bold text-2xl">{value}</p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-700 rounded-2xl p-6 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <TrendingUp className="w-7 h-7" />
            Reports & Analytics
          </h1>
          <p className="text-white/80 text-sm mt-1">App Performance Analysis</p>
        </div>
        <div className="flex gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40 bg-white/20 border-white/30 text-white">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700 text-white">
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
              <SelectItem value="quarter">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="border-white/40 text-white bg-white/10 hover:bg-white/20">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCardNew
          icon={Users}
          label="Total Users"
          value={stats.totalUsers}
          change={12}
          colorClass="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-300"
        />
        <StatCardNew
          icon={Users}
          label="New Today"
          value={stats.newUsersToday}
          change={5}
          colorClass="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30 text-green-300"
        />
        <StatCardNew
          icon={Coins}
          label="Total Diamonds Spent"
          value={formatCoins(stats.totalCoinsSpent)}
          change={8}
          colorClass="bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30 text-amber-300"
        />
        <StatCardNew
          icon={Gift}
          label="Total Gifts"
          value={stats.totalGiftsSent}
          change={15}
          colorClass="bg-gradient-to-br from-pink-500/20 to-pink-600/10 border-pink-500/30 text-pink-300"
        />
        <StatCardNew
          icon={Video}
          label="Total Streams"
          value={stats.totalStreams}
          change={-3}
          colorClass="bg-gradient-to-br from-red-500/20 to-red-600/10 border-red-500/30 text-red-300"
        />
        <StatCardNew
          icon={Phone}
          label="Total Calls"
          value={stats.totalCalls}
          change={20}
          colorClass="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-300"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Growth Chart */}
        <Card className="bg-slate-900 border-slate-700/50 shadow-lg">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              New Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: 8 }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Bar dataKey="users" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Coins Chart */}
        <Card className="bg-slate-900 border-slate-700/50 shadow-lg">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-400" />
              Diamonds Spent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: 8 }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="coins"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ fill: "#f59e0b", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gift Distribution */}
        <Card className="bg-slate-900 border-slate-700/50 shadow-lg">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Gift className="w-5 h-5 text-pink-400" />
              Gift Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={giftData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {giftData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: 8 }}
                  />
                  <Legend
                    formatter={(value) => <span style={{ color: "#e2e8f0" }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Streams Chart */}
        <Card className="bg-slate-900 border-slate-700/50 shadow-lg">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Video className="w-5 h-5 text-red-400" />
              Live Streams
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: 8 }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Bar dataKey="streams" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
