import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import {
  Users, Ban, UserCheck, ScanFace, Crown, Activity,
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
    <div className="space-y-6 admin-pro-shell -mx-4 -my-4 sm:-mx-6 sm:-my-6 px-4 sm:px-6 py-6 sm:py-8">
      {/* Cloud White Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 border border-blue-100">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">User Management Hub</h1>
            <p className="text-xs md:text-sm text-slate-500 font-medium">Real-time user monitoring &amp; control center</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-700">{stats.onlineNow.toLocaleString()} Online</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100">
            <UserPlus className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-xs font-semibold text-blue-700">+{stats.newToday.toLocaleString()} today</span>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid - 2 rows of 4 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <AdminLuxuryStatCard icon={Users} label="Total Users" value={stats.totalUsers.toLocaleString()} tone="gold" />
        <AdminLuxuryStatCard icon={UserCheck} label="Face Verified" value={stats.verifiedUsers.toLocaleString()} tone="accent" />
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
