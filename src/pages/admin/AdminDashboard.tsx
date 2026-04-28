import { useState, useEffect, useCallback, useMemo, memo } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import {
  Users,
  UserCheck,
  Building2,
  Video,
  PartyPopper,
  Gift,
  Coins,
  TrendingUp,
  TrendingDown,
  Activity,
  Eye,
  Ban,
  Clock,
  Zap,
  ArrowRight,
  Shield,
  Wallet,
  Phone,
  CalendarCheck,
  CreditCard,
  RefreshCw,
  Sparkles,
  BarChart3
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { cn } from "@/lib/utils";
import { SystemHealthCheck } from "@/components/admin/SystemHealthCheck";
import { AdminDashboardSkeleton } from "@/components/admin/AdminDashboardSkeleton";
import { AdminAnalyticsCharts } from "@/components/admin/AdminAnalyticsCharts";
import ErrorBoundary from "@/components/ErrorBoundary";
import { PremiumSpinner } from "@/components/ui/premium-spinner";

interface DashboardStats {
  total_users: number;
  total_hosts: number;
  total_agencies: number;
  active_streams: number;
  active_party_rooms: number;
  total_gifts_today: number;
  total_calls_today: number;
  online_users: number;
  blocked_users: number;
  blocked_agencies: number;
  pending_host_applications: number;
  daily_reward_claims_today: number;
  daily_recharges_today: number;
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: number;
  accentFrom: string;
  accentTo: string;
  glowColor: string;
  delay?: number;
  link?: string;
}

const StatCard = memo(({ title, value, icon: Icon, trend, accentFrom, accentTo, glowColor, delay = 0, link }: StatCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4, ease: "easeOut" }}
    className="group"
  >
    <Link to={link || "#"} className="block">
      <div className={cn(
        "relative overflow-hidden rounded-2xl md:rounded-3xl p-[1px]",
        "bg-gradient-to-br",
        accentFrom, accentTo,
        "hover:shadow-2xl transition-all duration-500"
      )}
        style={{ boxShadow: `0 8px 32px -8px ${glowColor}` }}
      >
        <div className="relative bg-[#0c0c14]/90 backdrop-blur-2xl rounded-[15px] md:rounded-[23px] p-4 md:p-6 h-full">
          {/* Ambient glow */}
          <div className={cn("absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-500")}
            style={{ background: `linear-gradient(135deg, ${glowColor}, transparent)` }}
          />

          <div className="relative z-10 flex items-start justify-between">
            <div className="space-y-1 md:space-y-2">
              <p className="text-[10px] md:text-xs text-slate-400 font-semibold uppercase tracking-widest">{title}</p>
              <p className="text-2xl md:text-4xl font-black text-white tracking-tight">
                {typeof value === 'number' ? value.toLocaleString() : value}
              </p>
              {trend !== undefined && (
                <div className={cn(
                  "inline-flex items-center gap-1 text-[10px] md:text-xs px-2 py-0.5 rounded-full font-bold",
                  trend >= 0
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                    : "bg-red-500/15 text-red-400 border border-red-500/20"
                )}>
                  {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {Math.abs(trend)}%
                </div>
              )}
            </div>

            <div className={cn(
              "w-11 h-11 md:w-14 md:h-14 rounded-2xl flex items-center justify-center",
              "bg-gradient-to-br shadow-lg group-hover:scale-110 transition-transform duration-300",
              accentFrom.replace('from-', 'from-'), accentTo.replace('to-', 'to-')
            )}>
              <Icon className="w-5 h-5 md:w-7 md:h-7 text-white" />
            </div>
          </div>

          <div className="mt-3 md:mt-4 flex items-center gap-1 text-[10px] md:text-xs text-slate-500 group-hover:text-slate-300 transition-colors font-medium">
            <span>View details</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </Link>
  </motion.div>
));
StatCard.displayName = 'StatCard';

interface AlertCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  link: string;
  gradientFrom: string;
  gradientTo: string;
  textColor: string;
  delay: number;
}

const AlertCard = memo(({ title, value, icon: Icon, link, gradientFrom, gradientTo, textColor, delay }: AlertCardProps) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay, duration: 0.3 }}
  >
    <Link to={link}>
      <Card className={cn(
        "bg-[#0c0c14] border-2 transition-all duration-300 group cursor-pointer",
        `border-${gradientFrom.split('-')[1]}-500/25 hover:border-${gradientFrom.split('-')[1]}-400/50`,
        "hover:shadow-xl"
      )}
        style={{ boxShadow: `0 4px 20px -4px ${textColor}33` }}
      >
        <CardContent className="p-5 md:p-6 flex items-center gap-4">
          <div className={cn(
            "w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center",
            "bg-gradient-to-br shadow-lg group-hover:scale-110 transition-transform",
            gradientFrom, gradientTo
          )}>
            <Icon className="w-7 h-7 md:w-8 md:h-8 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-3xl md:text-4xl font-black" style={{ color: textColor }}>
              {value.toLocaleString()}
            </p>
            <p className="text-sm font-semibold text-slate-400 mt-0.5">{title}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-white/5 group-hover:bg-white/10 flex items-center justify-center transition-all">
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
          </div>
        </CardContent>
      </Card>
    </Link>
  </motion.div>
));
AlertCard.displayName = 'AlertCard';

interface QuickActionProps {
  title: string;
  description: string;
  icon: React.ElementType;
  link: string;
  accentColor: string;
  delay: number;
}

const QuickAction = memo(({ title, description, icon: Icon, link, accentColor, delay }: QuickActionProps) => (
  <motion.div
    initial={{ opacity: 0, x: -12 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay }}
  >
    <Link to={link}>
      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[#0c0c14] border border-white/5 hover:border-white/15 transition-all group">
        <div className="w-1 h-10 rounded-full" style={{ background: accentColor }} />
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 group-hover:bg-white/10 transition-colors">
          <Icon className="w-5 h-5" style={{ color: accentColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
      </div>
    </Link>
  </motion.div>
));
QuickAction.displayName = 'QuickAction';

const DASHBOARD_STATS_CACHE_KEY = "meri_admin_dashboard_stats";

const loadCachedDashboardStats = (): DashboardStats | null => {
  try {
    const raw = localStorage.getItem(DASHBOARD_STATS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardStats;
    // Invalidate stale all-zero cache
    if (parsed.total_users === 0 && parsed.total_hosts === 0 && parsed.total_agencies === 0) {
      localStorage.removeItem(DASHBOARD_STATS_CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const saveCachedDashboardStats = (stats: DashboardStats) => {
  // Don't cache all-zero stats — they represent failed fetches
  if (stats.total_users === 0 && stats.total_hosts === 0 && stats.total_agencies === 0) return;
  try {
    localStorage.setItem(DASHBOARD_STATS_CACHE_KEY, JSON.stringify(stats));
  } catch {}
};

export default function AdminDashboard() {
  const location = useLocation();
  const [stats, setStats] = useState<DashboardStats | null>(() => loadCachedDashboardStats());
  const [loading, setLoading] = useState(false);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dailyActiveUsers, setDailyActiveUsers] = useState(0);
  const [dailyActiveHosts, setDailyActiveHosts] = useState(0);

  const loadData = useCallback(async () => {
    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data, error } = await supabase.rpc("get_admin_dashboard_stats");
        if (error) throw error;
        const parsed = data as any;
        // RPC now returns daily_active_* + recent_activities in same payload — single round trip.
        setStats(parsed as DashboardStats);
        saveCachedDashboardStats(parsed as DashboardStats);
        if (typeof parsed?.daily_active_users === 'number') setDailyActiveUsers(parsed.daily_active_users);
        if (typeof parsed?.daily_active_hosts === 'number') setDailyActiveHosts(parsed.daily_active_hosts);
        if (Array.isArray(parsed?.recent_activities)) setRecentActivities(parsed.recent_activities);
        setLastRefreshTime(new Date());
        return;
      } catch (error: any) {
        lastError = error;
        const message = String(error?.message || "").toLowerCase();
        const authIssue = message.includes("not authorized") || message.includes("jwt") || message.includes("session");
        if (authIssue && attempt < 2) {
          await supabase.auth.refreshSession();
          await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
          continue;
        }
        break;
      }
    }
    if (lastError) console.error("Error fetching stats:", lastError);
  }, []);

  useAdminRealtime(
    ['profiles', 'gift_transactions', 'live_streams', 'agencies', 'private_calls', 'face_verification_submissions'],
    () => { loadData(, { enableRealtimeRefresh: true }); }
  );

  useEffect(() => {
    let isMounted = true;
    if (!stats) setLoading(true);
    loadData().finally(() => {
      if (isMounted) setLoading(false);
    });
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted || !session?.user) return;
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') loadData();
    });
    return () => { isMounted = false; authSubscription.unsubscribe(); };
  }, [location.pathname, loadData]);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  }, [loadData]);

  if (loading && !stats) return <AdminDashboardSkeleton />;

  return (
    <div className="space-y-5 md:space-y-8 p-2 md:p-0">

      {/* ━━━ HEADER ━━━ */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#0c0c14] p-4 md:p-6 rounded-2xl md:rounded-3xl border border-white/[0.06]"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">Command Center</h1>
            <p className="text-slate-500 text-xs md:text-sm font-medium">
              Live overview
              {lastRefreshTime && (
                <span className="ml-1.5 text-slate-600">
                  • {lastRefreshTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="text-slate-400 hover:text-white hover:bg-white/5 gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
            {isRefreshing ? "..." : "Refresh"}
          </Button>
          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 font-semibold text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse inline-block" />
            Live
          </Badge>
          <Badge className="bg-white/5 text-slate-400 border border-white/10 px-3 py-1.5 font-medium text-xs hidden sm:flex">
            <Clock className="w-3 h-3 mr-1.5" />
            {new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
          </Badge>
        </div>
      </motion.div>

      {/* ━━━ CORE METRICS — Row 1 ━━━ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          title="Total Users"
          value={stats?.total_users || 0}
          icon={Users}
          accentFrom="from-blue-500"
          accentTo="to-cyan-400"
          glowColor="#3b82f6"
          delay={0.05}
          link="/admin/users"
        />
        <StatCard
          title="Total Hosts"
          value={stats?.total_hosts || 0}
          icon={UserCheck}
          accentFrom="from-violet-500"
          accentTo="to-purple-400"
          glowColor="#8b5cf6"
          delay={0.1}
          link="/admin/hosts"
        />
        <StatCard
          title="Total Agencies"
          value={stats?.total_agencies || 0}
          icon={Building2}
          accentFrom="from-indigo-500"
          accentTo="to-blue-400"
          glowColor="#6366f1"
          delay={0.15}
          link="/admin/agencies"
        />
        <StatCard
          title="Online Now"
          value={stats?.online_users || 0}
          icon={Eye}
          accentFrom="from-emerald-500"
          accentTo="to-teal-400"
          glowColor="#10b981"
          delay={0.2}
          link="/admin/online-users"
        />
      </div>

      {/* ━━━ LIVE METRICS — Row 2 ━━━ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          title="Active Streams"
          value={stats?.active_streams || 0}
          icon={Video}
          accentFrom="from-rose-500"
          accentTo="to-pink-400"
          glowColor="#f43f5e"
          delay={0.25}
          link="/admin/streams"
        />
        <StatCard
          title="Party Rooms"
          value={stats?.active_party_rooms || 0}
          icon={PartyPopper}
          accentFrom="from-orange-500"
          accentTo="to-amber-400"
          glowColor="#f97316"
          delay={0.3}
          link="/admin/party-rooms"
        />
        <StatCard
          title="Today's Gifts"
          value={`${((stats?.total_gifts_today || 0) >= 1000000 
            ? `${((stats?.total_gifts_today || 0) / 1000000).toFixed(1)}M` 
            : (stats?.total_gifts_today || 0).toLocaleString())} ♦`}
          icon={Gift}
          accentFrom="from-fuchsia-500"
          accentTo="to-pink-500"
          glowColor="#d946ef"
          delay={0.35}
          link="/admin/gift-transactions"
        />
        <StatCard
          title="Today's Calls"
          value={stats?.total_calls_today || 0}
          icon={Phone}
          accentFrom="from-sky-500"
          accentTo="to-blue-400"
          glowColor="#0ea5e9"
          delay={0.4}
          link="/admin/today-calls"
        />
      </div>

      {/* ━━━ DAILY ACTIVE TRACKING ━━━ */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <StatCard
          title="Today's Active Users"
          value={dailyActiveUsers}
          icon={Activity}
          accentFrom="from-cyan-500"
          accentTo="to-blue-500"
          glowColor="#06b6d4"
          delay={0.42}
          link="/admin/users"
        />
        <StatCard
          title="Today's Active Hosts"
          value={dailyActiveHosts}
          icon={Sparkles}
          accentFrom="from-amber-500"
          accentTo="to-orange-500"
          glowColor="#f59e0b"
          delay={0.44}
          link="/admin/hosts"
        />
      </div>

      {/* ━━━ SECONDARY METRICS — Row 3 ━━━ */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <StatCard
          title="Daily Rewards"
          value={stats?.daily_reward_claims_today || 0}
          icon={CalendarCheck}
          accentFrom="from-lime-500"
          accentTo="to-green-400"
          glowColor="#84cc16"
          delay={0.45}
          link="/admin/reward-claims-history"
        />
        <StatCard
          title="Today's Recharges"
          value={stats?.daily_recharges_today || 0}
          icon={CreditCard}
          accentFrom="from-teal-500"
          accentTo="to-cyan-400"
          glowColor="#14b8a6"
          delay={0.5}
          link="/admin/recharge-history"
        />
      </div>

      {/* ━━━ ALERT STRIP ━━━ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <AlertCard
          title="Pending Host Apps"
          value={stats?.pending_host_applications || 0}
          icon={Clock}
          link="/admin/host-applications"
          gradientFrom="from-amber-500"
          gradientTo="to-yellow-400"
          textColor="#fbbf24"
          delay={0.55}
        />
        <AlertCard
          title="Blocked Users"
          value={stats?.blocked_users || 0}
          icon={Ban}
          link="/admin/blocked"
          gradientFrom="from-red-500"
          gradientTo="to-rose-400"
          textColor="#f87171"
          delay={0.6}
        />
        <AlertCard
          title="Blocked Agencies"
          value={stats?.blocked_agencies || 0}
          icon={Building2}
          link="/admin/agencies"
          gradientFrom="from-orange-500"
          gradientTo="to-amber-400"
          textColor="#fb923c"
          delay={0.65}
        />
      </div>

      {/* ━━━ ANALYTICS CHARTS ━━━ */}
      <ErrorBoundary
        componentName="AdminAnalyticsCharts"
        fallback={
          <div className="rounded-2xl border border-white/[0.06] bg-[#0c0c14] p-6 text-center text-slate-400 text-sm">
            Analytics charts are temporarily unavailable. Other dashboard data is still live.
          </div>
        }
      >
        <AdminAnalyticsCharts />
      </ErrorBoundary>

      {/* ━━━ QUICK ACTIONS + ACTIVITY ━━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Quick Actions */}
        <div className="lg:col-span-1 space-y-3">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 mb-1"
          >
            <Zap className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Quick Actions</h3>
          </motion.div>
          
          <QuickAction title="Host Applications" description="Review new applications" icon={Shield} link="/admin/host-applications" accentColor="#a78bfa" delay={0.7} />
          <QuickAction title="Commissions" description="Manage rates & payouts" icon={Coins} link="/admin/commissions" accentColor="#f97316" delay={0.75} />
          <QuickAction title="Payment Gateways" description="Configure payments" icon={Wallet} link="/admin/payment-gateways" accentColor="#ec4899" delay={0.8} />
          <QuickAction title="Withdrawals" description="Process pending requests" icon={Wallet} link="/admin/withdrawals" accentColor="#10b981" delay={0.85} />
          <QuickAction title="Reports" description="Analytics & insights" icon={TrendingUp} link="/admin/reports" accentColor="#0ea5e9" delay={0.9} />
        </div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.95 }}
          className="lg:col-span-2"
        >
          <Card className="bg-[#0c0c14] border-white/[0.06] h-full">
            <CardHeader className="border-b border-white/[0.06] pb-4">
              <CardTitle className="text-white flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
                <Activity className="w-4 h-4 text-emerald-400" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recentActivities.length > 0 ? (
                <div className="divide-y divide-white/[0.04]">
                  {recentActivities.map((activity, i) => (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 1 + i * 0.04 }}
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className={cn(
                        "w-2.5 h-2.5 rounded-full ring-2 ring-offset-1 ring-offset-[#0c0c14]",
                        activity.action_type.includes("block") ? "bg-red-500 ring-red-500/30" : 
                        activity.action_type.includes("approve") ? "bg-emerald-500 ring-emerald-500/30" :
                        activity.action_type.includes("reject") ? "bg-orange-500 ring-orange-500/30" :
                        "bg-blue-500 ring-blue-500/30"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-semibold truncate">{activity.action_type}</p>
                        <p className="text-[11px] text-slate-500">
                          {new Date(activity.created_at).toLocaleString("en-US")}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-white/10 text-slate-500 font-medium">
                        {activity.target_type || 'action'}
                      </Badge>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
                    <Activity className="w-6 h-6 text-slate-600" />
                  </div>
                  <p className="text-slate-500 text-sm font-medium">No recent activity</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ━━━ SYSTEM HEALTH ━━━ */}
      <ErrorBoundary
        componentName="SystemHealthCheck"
        fallback={
          <div className="rounded-2xl border border-white/[0.06] bg-[#0c0c14] p-6 text-center text-slate-400 text-sm">
            System health check is temporarily unavailable.
          </div>
        }
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
        >
          <SystemHealthCheck />
        </motion.div>
      </ErrorBoundary>
    </div>
  );
}
