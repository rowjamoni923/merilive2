import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import {
  Users, Ban, UserCheck, ScanFace, Crown,
  Eye, UserPlus
} from "lucide-react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import AdminLuxuryStatCard from "@/components/admin/AdminLuxuryStatCard";
import AdminUserManagement from "./AdminUserManagement";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";

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

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useAdminRealtime(['profiles'], () => {
    fetchStats();
  });


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

      {/* Country Distribution removed — available in dedicated Country Detection menu */}

      {/* User Management Table */}
      <AdminUserManagement />
    </div>
  );
};

export default AdminUserHub;
