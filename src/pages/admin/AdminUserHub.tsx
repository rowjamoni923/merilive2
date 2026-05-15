import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Ban, UserCheck, Shield, Globe, TrendingUp,
  Activity, ScanFace, Crown, ArrowUpRight, ArrowDownRight,
  Sparkles, Eye, UserPlus
} from "lucide-react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { getCurrentAdminId } from "@/utils/adminSession";
import AdminLuxuryStatCard from "@/components/admin/AdminLuxuryStatCard";
import AdminUserManagement from "./AdminUserManagement";
import { recordAdminError } from "@/utils/adminErrorLog";
import { cn } from "@/lib/utils";

import { formatAdminError } from "@/utils/formatAdminError";
interface CountryData {
  country_name: string | null;
  country_code: string | null;
  country_flag: string | null;
  count: number;
}

const AdminUserHub = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    verifiedUsers: 0,
    bannedUsers: 0,
    activeToday: 0,
    onlineNow: 0,
    newToday: 0,
    hosts: 0,
    faceVerified: 0,
  });
  const [countryStats, setCountryStats] = useState<CountryData[]>([]);
  const [isLoadingCountries, setIsLoadingCountries] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      // Pkg36: single server-side aggregation RPC (bypasses 500-row REST cap, no 8-roundtrip cost)
      const { data, error } = await supabase.rpc("admin_user_stats");
      if (error) throw error;
      const s = (data || {}) as Record<string, number>;
      setStats({
        totalUsers: Number(s.total || 0),
        verifiedUsers: Number(s.face_verified || 0),
        bannedUsers: Number(s.blocked || 0),
        activeToday: Number(s.active_today || 0),
        onlineNow: Number(s.online || 0),
        newToday: Number(s.today || 0),
        hosts: Number(s.hosts || 0),
        faceVerified: Number(s.face_verified || 0),
      });
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserHub.fetchStats", message: formatAdminError(error) });
    }
  }, []);

  const fetchCountryStats = useCallback(async () => {
    try {
      setIsLoadingCountries(true);
      // Pkg36: server-side aggregation via admin_country_distribution RPC
      // (replaces direct profiles SELECT that hit the 500-row admin cap on 3,656 profiles)
      const adminId = getCurrentAdminId();
      if (!adminId) {
        setCountryStats([]);
        return;
      }
      const { data, error } = await supabase.rpc("admin_country_distribution", { _admin_id: adminId });
      if (error) throw error;
      const rows = (data || []).map((r: any) => ({
        country_name: r.country_name,
        country_code: r.country_code,
        country_flag: r.country_flag,
        count: Number(r.total ?? 0),
      })) as CountryData[];
      setCountryStats(rows);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserHub.fetchCountryStats", message: formatAdminError(error) });
    } finally {
      setIsLoadingCountries(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchCountryStats();
  }, [fetchStats, fetchCountryStats]);

  useAdminRealtime(['profiles'], () => {
    fetchStats();
    fetchCountryStats();
  });

  const totalCountryUsers = countryStats.reduce((s, c) => s + c.count, 0);

  return (
    <div className="space-y-6">
      {/* Premium Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#0f0a1a] via-[#0d0815] to-[#080510] p-6 shadow-[0_20px_60px_-20px_rgba(139,92,246,0.3)]"
      >
        {/* Decorative elements */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.08),transparent_70%)]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-violet-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-fuchsia-500/5 rounded-full blur-3xl" />

        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-600 shadow-lg shadow-violet-500/30 ring-2 ring-violet-400/20">
                <Users className="h-7 w-7 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-[#0f0a1a] animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">User Management Hub</h1>
              <p className="text-sm text-violet-300/50 font-medium">Real-time user monitoring & control center</p>
            </div>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-lg shadow-emerald-400/40" />
              <span className="text-xs text-emerald-400 font-semibold">{stats.onlineNow} Online</span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-xs text-violet-400 font-semibold">+{stats.newToday} today</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid - 2 rows of 4 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <AdminLuxuryStatCard icon={Users} label="Total Users" value={stats.totalUsers.toLocaleString()} tone="gold" />
        <AdminLuxuryStatCard icon={UserCheck} label="Verified" value={stats.verifiedUsers.toLocaleString()} tone="accent" />
        <AdminLuxuryStatCard icon={Activity} label="Active Today" value={stats.activeToday.toLocaleString()} tone="royal" />
        <AdminLuxuryStatCard icon={Ban} label="Banned" value={stats.bannedUsers.toLocaleString()} tone="danger" />
        <AdminLuxuryStatCard icon={Crown} label="Hosts" value={stats.hosts.toLocaleString()} tone="gold" />
        <AdminLuxuryStatCard icon={ScanFace} label="Face Verified" value={stats.faceVerified.toLocaleString()} tone="accent" />
        <AdminLuxuryStatCard icon={Eye} label="Online Now" value={stats.onlineNow.toLocaleString()} tone="soft" />
        <AdminLuxuryStatCard icon={UserPlus} label="New Today" value={stats.newToday.toLocaleString()} tone="royal" />
      </div>

      {/* Country-wise User Distribution */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#0d0f14] via-[#0a0c10] to-[#080910]"
      >
        {/* Decorative */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-500/20 to-transparent" />
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-sky-500/5 rounded-full blur-3xl" />

        {/* Header */}
        <div className="relative flex items-center justify-between p-5 pb-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30">
              <Globe className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Country Distribution</h2>
              <p className="text-xs text-white/30 font-medium">
                {countryStats.length} countries • {totalCountryUsers.toLocaleString()} users tracked
              </p>
            </div>
          </div>
        </div>

        {/* Country List */}
        <div className="relative p-5">
          {isLoadingCountries ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />
              ))}
            </div>
          ) : countryStats.length === 0 ? (
            <div className="text-center py-10 text-white/30 text-sm">No country data available</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {countryStats.slice(0, 20).map((country, index) => {
                const percentage = totalCountryUsers > 0 ? (country.count / totalCountryUsers) * 100 : 0;
                const isTop3 = index < 3;

                return (
                  <motion.div
                    key={country.country_code || index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className={cn(
                      "group relative flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300 overflow-hidden",
                      isTop3
                        ? "bg-gradient-to-r from-amber-500/[0.06] to-transparent border-amber-500/15 hover:border-amber-400/30"
                        : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04]"
                    )}
                  >
                    {/* Progress bar background */}
                    <div
                      className={cn(
                        "absolute left-0 top-0 bottom-0 transition-all duration-500",
                        isTop3 ? "bg-amber-500/[0.06]" : "bg-sky-500/[0.04]"
                      )}
                      style={{ width: `${Math.max(percentage, 2)}%` }}
                    />

                    {/* Rank */}
                    <div className={cn(
                      "relative flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold",
                      index === 0 ? "bg-gradient-to-br from-amber-400 to-yellow-600 text-black" :
                      index === 1 ? "bg-gradient-to-br from-slate-300 to-slate-500 text-black" :
                      index === 2 ? "bg-gradient-to-br from-amber-600 to-amber-800 text-white" :
                      "bg-white/[0.06] text-white/40"
                    )}>
                      {index + 1}
                    </div>

                    {/* Flag */}
                    <span className="relative text-xl flex-shrink-0">
                      {country.country_flag || '🌍'}
                    </span>

                    {/* Country name */}
                    <div className="relative flex-1 min-w-0">
                      <p className={cn(
                        "text-sm font-semibold truncate",
                        isTop3 ? "text-amber-100" : "text-white/80"
                      )}>
                        {country.country_name || country.country_code || 'Unknown'}
                      </p>
                      <p className="text-[10px] text-white/25 font-medium uppercase tracking-wider">
                        {country.country_code || '—'}
                      </p>
                    </div>

                    {/* Count & Percentage */}
                    <div className="relative text-right flex-shrink-0">
                      <p className={cn(
                        "text-sm font-bold tabular-nums",
                        isTop3 ? "text-amber-300" : "text-white/60"
                      )}>
                        {country.count.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-white/25 font-semibold">
                        {percentage.toFixed(1)}%
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Show more indicator */}
          {countryStats.length > 20 && (
            <div className="text-center mt-4">
              <span className="text-xs text-white/25 font-medium">
                +{countryStats.length - 20} more countries
              </span>
            </div>
          )}
        </div>
      </motion.div>

      {/* User Management Table */}
      <AdminUserManagement />
    </div>
  );
};

export default AdminUserHub;
