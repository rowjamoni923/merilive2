import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import AdminPagination from "@/components/admin/AdminPagination";
import { getAdminCache, setAdminCache } from "@/utils/adminDataCache";
import { motion } from "framer-motion";
import {
  UserCheck, 
  Search, 
  Filter, 
  MoreVertical, 
  Eye, 
  Ban, 
  CheckCircle, 
  XCircle, 
  Star, 
  Phone, 
  Camera, 
  Clock, 
  Coins, 
  TrendingUp, 
  Download} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
import { getDisplayAvatar } from "@/utils/placeholderAvatar";
interface Host {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_blocked: boolean;
  host_level: number;
  host_status: string;
  call_rate_per_minute: number;
  total_earnings: number;
  total_call_minutes: number;
  total_calls_received: number;
  agency_id: string | null;
  created_at: string;
  agencies?: {
    name: string;
    agency_code: string;
  } | null;
}

interface LevelRate {
  level: number;
  rate: number;
}

export default function AdminHosts() {
  const [hosts, setHosts] = useState<Host[]>(() => getAdminCache<Host[]>('admin_hosts_list') || []);
  const [loading, setLoading] = useState(() => !getAdminCache('admin_hosts_list'));
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedHost, setSelectedHost] = useState<Host | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [levelRates, setLevelRates] = useState<LevelRate[]>([]);
  const [defaultRate, setDefaultRate] = useState(0);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;
  const [stats, setStats] = useState({
    totalHosts: 0,
    activeHosts: 0,
    pendingHosts: 0,
    blockedHosts: 0,
    totalEarnings: 0
  });

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Reset page when filter/search changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchHosts();
    fetchStats();
    fetchCallRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, debouncedSearch, page]);

  useAdminRealtime(['profiles'], () => {
    fetchHosts();
    fetchStats();
  });

  const fetchHosts = async () => {
    if (hosts.length === 0) setLoading(true);
    try {
      // Pkg5: server-side paginated host listing via admin_list_hosts_paginated RPC
      // (bypasses 500-row REST cap, supports filter+search server-side)
      const { data, error } = await supabase.rpc('admin_list_hosts_paginated', {
        _status: statusFilter === 'all' ? null : statusFilter,
        _search: debouncedSearch || null,
        _limit: pageSize,
        _offset: (page - 1) * pageSize,
      });

      if (error) throw error;
      const payload = (data || {}) as { rows?: Host[]; total?: number };
      const rows = (payload.rows || []) as Host[];
      setHosts(rows);
      setTotalCount(Number(payload.total || 0));
      setAdminCache('admin_hosts_list', rows);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminHosts.ErrorFetchingHosts", message: formatAdminError(error)});
      toast.error("Failed to load hosts");
    } finally {
      setLoading(false);
    }
  };

  const fetchCallRates = async () => {
    try {
      const { data } = await supabase
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", "call_rates")
        .maybeSingle();
      if (data?.setting_value) {
        const val = data.setting_value as any;
        setLevelRates(val.level_rates || []);
        setDefaultRate(val.default_rate || 0);
      }
    } catch (e) {
      recordAdminError({ kind: "rpc", label: "AdminHosts.ErrorFetchingCallRates", message: formatAdminError(e)});
    }
  };

  const getHostRate = (host: Host): number => {
    // First check if host has a custom rate set
    if (host.call_rate_per_minute && host.call_rate_per_minute > 0) {
      return host.call_rate_per_minute;
    }
    // Otherwise use level-based rate from app_settings
    const levelRate = levelRates.find(lr => lr.level === (host.host_level || 0));
    return levelRate?.rate || defaultRate;
  };

  const fetchStats = async () => {
    try {
      // Pkg5: server-side aggregation via admin_host_stats RPC
      // (avoids 500-row REST cap and inaccurate client-side SUM of total_earnings)
      const { data, error } = await supabase.rpc('admin_host_stats');
      if (error) throw error;
      const s = (data || {}) as {
        total_hosts?: number;
        active_hosts?: number;
        pending_hosts?: number;
        blocked_hosts?: number;
        total_earnings?: number | string;
      };
      setStats({
        totalHosts: Number(s.total_hosts || 0),
        activeHosts: Number(s.active_hosts || 0),
        pendingHosts: Number(s.pending_hosts || 0),
        blockedHosts: Number(s.blocked_hosts || 0),
        totalEarnings: Number(s.total_earnings || 0),
      });
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminHosts.ErrorFetchingHostStats", message: formatAdminError(error)});
    }
  };

  const handleApproveHost = async (hostId: string) => {
    try {
      const { error } = await supabase.rpc('admin_convert_user_role', {
        _user_id: hostId,
        _to_host: true,
      });

      if (error) throw error;
      toast.success("Host approved successfully");
      fetchHosts();
      fetchStats();
    } catch (error) {
      toast.error("Failed to approve host");
    }
  };

  const handleRejectHost = async (hostId: string) => {
    try {
      const { error } = await supabase.rpc('admin_convert_user_role', {
        _user_id: hostId,
        _to_host: false,
      });

      if (error) throw error;
      toast.success("Host rejected successfully");
      fetchHosts();
      fetchStats();
    } catch (error) {
      toast.error("Failed to reject host");
    }
  };

  const handleBlockHost = async (hostId: string, block: boolean) => {
    try {
      const { error } = await supabase.rpc("admin_block_user", {
        _user_id: hostId,
        _block: block,
        _reason: block ? "Blocked by admin" : null
      });

      if (error) throw error;
      toast.success(block ? "Host blocked successfully" : "Host unblocked successfully");
      fetchHosts();
      fetchStats();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminHosts.ErrorBlockingHost", message: formatAdminError(error)});
      toast.error(formatAdminError(error));
    }
  };

  const filteredHosts = hosts;

  const formatCoins = (diamonds: number) => {
    if (diamonds >= 1000000) return `${(diamonds / 1000000).toFixed(1)}M`;
    if (diamonds >= 1000) return `${(diamonds / 1000).toFixed(1)}K`;
    return diamonds.toString();
  };

  return (
    <div className="space-y-4 md:space-y-6 admin-pro-shell -mx-4 -my-4 sm:-mx-6 sm:-my-6 px-4 sm:px-6 py-6 sm:py-8">
      {/* Cloud White Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 border border-blue-100">
            <UserCheck className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Host Management</h1>
            <p className="text-xs md:text-sm text-slate-500 font-medium">Manage all hosts across the platform</p>
          </div>
        </div>
        <Button variant="outline" className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 w-full md:w-auto" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Download Report
        </Button>
      </div>

      {/* Cloud White Stat Cards — uniform surface, color only in icon tile */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        {[
          { label: "Total Hosts", value: stats.totalHosts, Icon: UserCheck, tint: "blue" },
          { label: "Active", value: stats.activeHosts, Icon: CheckCircle, tint: "emerald" },
          { label: "Pending", value: stats.pendingHosts, Icon: Clock, tint: "amber" },
          { label: "Blocked", value: stats.blockedHosts, Icon: Ban, tint: "rose" },
          { label: "Total Earnings", value: formatCoins(stats.totalEarnings), Icon: Coins, tint: "violet" },
        ].map(({ label, value, Icon, tint }) => {
          const tintMap: Record<string, string> = {
            blue: "bg-blue-50 border-blue-100 text-blue-600",
            emerald: "bg-emerald-50 border-emerald-100 text-emerald-600",
            amber: "bg-amber-50 border-amber-100 text-amber-600",
            rose: "bg-rose-50 border-rose-100 text-rose-600",
            violet: "bg-violet-50 border-violet-100 text-violet-600",
          };
          return (
            <Card key={label} className="bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${tintMap[tint]}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] md:text-xs font-semibold uppercase tracking-wide text-slate-500 truncate">{label}</p>
                    <p className="text-slate-900 font-bold text-lg md:text-xl">{value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="bg-white border-slate-200/50 shadow-lg">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-500"
              />
            </div>
             <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48 bg-slate-50 border-slate-200 text-slate-900">
                <SelectValue placeholder="Filter Status" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending">Pending {stats.pendingHosts > 0 && `(${stats.pendingHosts})`}</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
           </div>
         </CardContent>
       </Card>

       {/* Blocked/Pending Hosts Warning Banners */}
       {stats.blockedHosts > 0 && statusFilter !== "blocked" && (
         <div 
           className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 cursor-pointer hover:bg-red-500/20 transition-colors"
           onClick={() => setStatusFilter("blocked")}
         >
           <Ban className="w-5 h-5 text-red-400" />
           <div className="flex-1">
             <p className="text-sm font-medium text-red-300">
              {stats.blockedHosts} Blocked Host(s)
             </p>
             <p className="text-xs text-red-400/70">Click to view</p>
           </div>
           <Badge className="bg-red-500 text-white">{stats.blockedHosts}</Badge>
         </div>
       )}
       {stats.pendingHosts > 0 && statusFilter !== "pending" && (
         <div 
           className="flex items-center gap-3 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 cursor-pointer hover:bg-yellow-500/20 transition-colors"
           onClick={() => setStatusFilter("pending")}
         >
           <Clock className="w-5 h-5 text-yellow-400" />
           <div className="flex-1">
             <p className="text-sm font-medium text-yellow-300">
              {stats.pendingHosts} Pending Host(s) awaiting approval
             </p>
             <p className="text-xs text-yellow-400/70">Click to view</p>
           </div>
           <Badge className="bg-yellow-500 text-white">{stats.pendingHosts}</Badge>
         </div>
       )}

       {/* Hosts Table */}
      <Card className="bg-white/5 border-white/10">
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto"><Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-slate-600">Host</TableHead>
                <TableHead className="text-slate-600">Level</TableHead>
                <TableHead className="text-slate-600">Status</TableHead>
                <TableHead className="text-slate-600">Rate/Min</TableHead>
                <TableHead className="text-slate-600">Total Earnings</TableHead>
                <TableHead className="text-slate-600">Call Minutes</TableHead>
                <TableHead className="text-slate-600">Agency</TableHead>
                <TableHead className="text-slate-600 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-600 py-10">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredHosts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-600 py-10">
                    No hosts found
                  </TableCell>
                </TableRow>
              ) : (
                filteredHosts.map((host) => (
                  <TableRow key={host.id} className="border-white/10 hover:bg-white/5">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10 border-2 border-pink-500/50">
                          <AvatarImage
                            src={getDisplayAvatar(host.id, host.avatar_url, { gender: 'female' })}
                           
                            referrerPolicy="no-referrer"
                          />
                          <AvatarFallback className="bg-pink-500/20 text-pink-400">
                            {host.display_name?.charAt(0) || "H"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-slate-900 font-medium flex items-center gap-1">
                            {host.display_name}
                            {host.is_verified && <CheckCircle className="w-4 h-4 text-blue-400" />}
                          </p>
                          <p className="text-slate-500 text-xs">{host.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-400" />
                        <span className="text-slate-900">{host.host_level || 1}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        host.is_blocked
                          ? "bg-red-500/20 text-red-400 border-red-500/30"
                          : host.host_status === "approved"
                          ? "bg-green-500/20 text-green-400 border-green-500/30"
                          : host.host_status === "pending"
                          ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                          : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                      }>
                        {host.is_blocked ? "Blocked" : host.host_status === "approved" ? "Active" : host.host_status === "pending" ? "Pending" : "Rejected"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-yellow-400 font-medium">
                        {getHostRate(host).toLocaleString()} 🪙
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-green-400 font-medium">
                        {formatCoins(host.total_earnings || 0)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-slate-900">
                        {host.total_call_minutes || 0} mins
                      </span>
                    </TableCell>
                    <TableCell>
                      {host.agencies ? (
                        <span className="text-purple-400">{host.agencies.name}</span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-900 hover:bg-slate-100">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg">
                          <DropdownMenuItem
                            className="text-slate-600 hover:text-slate-900"
                            onClick={() => { setSelectedHost(host); setShowDetails(true); }}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          {host.host_status === "pending" && (
                            <>
                              <DropdownMenuItem
                                className="text-green-400 hover:text-green-300"
                                onClick={() => handleApproveHost(host.id)}
                              >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Approve
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-400 hover:text-red-300"
                                onClick={() => handleRejectHost(host.id)}
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                Reject
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem
                            className={host.is_blocked ? "text-green-400" : "text-red-400"}
                            onClick={() => handleBlockHost(host.id, !host.is_blocked)}
                          >
                            <Ban className="w-4 h-4 mr-2" />
                            {host.is_blocked ? "Unblock" : "Block"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table></div>
          <AdminPagination
            page={page}
            totalPages={Math.max(1, Math.ceil(totalCount / pageSize))}
            totalCount={totalCount}
            pageSize={pageSize}
            onPageChange={setPage}
            className="border-t border-white/10"
          />
        </CardContent>
      </Card>

      {/* Host Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="bg-white border-white/10 text-slate-900 max-w-2xl w-screen sm:w-auto h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Host Details</DialogTitle>
          </DialogHeader>
          {selectedHost && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="w-20 h-20 border-4 border-pink-500/50">
                  <AvatarImage
                    src={getDisplayAvatar(selectedHost.id, selectedHost.avatar_url, { gender: 'female' })}
                    referrerPolicy="no-referrer"
                  />
                  <AvatarFallback className="bg-pink-500/20 text-pink-400 text-2xl">
                    {selectedHost.display_name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-xl font-bold">{selectedHost.display_name}</h3>
                  <p className="text-slate-500 text-sm">ID: {selectedHost.id}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {selectedHost.is_verified && (
                      <Badge className="bg-blue-500/20 text-blue-400">Verified</Badge>
                    )}
                    <Badge className="bg-yellow-500/20 text-yellow-400">
                      Level {selectedHost.host_level || 1}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/5 rounded-lg p-4 text-center">
                  <Phone className="w-6 h-6 text-green-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-slate-900">{selectedHost.total_calls_received || 0}</p>
                  <p className="text-slate-500 text-xs">Total Calls</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4 text-center">
                  <Clock className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-slate-900">{selectedHost.total_call_minutes || 0}</p>
                  <p className="text-slate-500 text-xs">Call Minutes</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4 text-center">
                  <Coins className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-slate-900">{formatCoins(selectedHost.total_earnings || 0)}</p>
                  <p className="text-slate-500 text-xs">Total Earnings</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4 text-center">
                  <TrendingUp className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-slate-900">{getHostRate(selectedHost).toLocaleString()}</p>
                  <p className="text-slate-500 text-xs">Rate/Min</p>
                </div>
              </div>

              {selectedHost.agencies && (
                <div className="bg-white/5 rounded-lg p-4">
                  <h4 className="text-slate-600 text-sm mb-2">Agency Info</h4>
                  <p className="text-slate-900 font-medium">{selectedHost.agencies.name}</p>
                  <p className="text-slate-500 text-sm">Code: {selectedHost.agencies.agency_code}</p>
                </div>
              )}

              <div className="flex gap-3">
                {selectedHost.host_status === "pending" && (
                  <>
                    <Button
                      className="flex-1 bg-green-500 hover:bg-green-600"
                      onClick={() => { handleApproveHost(selectedHost.id); setShowDetails(false); }}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => { handleRejectHost(selectedHost.id); setShowDetails(false); }}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                  </>
                )}
                <Button
                  variant={selectedHost.is_blocked ? "default" : "destructive"}
                  className="flex-1"
                  onClick={() => { handleBlockHost(selectedHost.id, !selectedHost.is_blocked); setShowDetails(false); }}
                >
                  <Ban className="w-4 h-4 mr-2" />
                  {selectedHost.is_blocked ? "Unblock" : "Block"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
