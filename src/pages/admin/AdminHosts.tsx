import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
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
  Video,
  Clock,
  Coins,
  TrendingUp,
  Download
} from "lucide-react";
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedHost, setSelectedHost] = useState<Host | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [levelRates, setLevelRates] = useState<LevelRate[]>([]);
  const [defaultRate, setDefaultRate] = useState(0);
  const [stats, setStats] = useState({
    totalHosts: 0,
    activeHosts: 0,
    pendingHosts: 0,
    blockedHosts: 0,
    totalEarnings: 0
  });

  useEffect(() => {
    // Skip initial mount — useAdminRealtime handles it after auth
    if (statusFilter !== 'all') {
      fetchHosts();
      fetchStats();
      fetchCallRates();
    }
  }, [statusFilter]);

  useAdminRealtime(['profiles'], () => {
    fetchHosts();
    fetchStats();
  });

  const fetchHosts = async () => {
    if (hosts.length === 0) setLoading(true);
    try {
      let query = supabase
        .from("profiles")
        .select(`
          id, display_name, avatar_url, is_verified, is_blocked,
          host_level, host_status, call_rate_per_minute, total_earnings,
          total_call_minutes, total_calls_received, agency_id, created_at,
          agencies(name, agency_code)
        `)
        .eq("is_host", true)
        .order("total_earnings", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("host_status", statusFilter);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;
      setHosts((data as unknown as Host[]) || []);
      setAdminCache('admin_hosts_list', (data as unknown as Host[]) || []);
    } catch (error) {
      console.error("Error fetching hosts:", error);
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
      console.error("Error fetching call rates:", e);
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
      const [totalRes, activeRes, pendingRes, blockedRes, earningsRes] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_host", true),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_host", true).eq("host_status", "approved").eq("is_blocked", false),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_host", true).eq("host_status", "pending"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_host", true).eq("is_blocked", true),
        supabase.from("profiles").select("total_earnings").eq("is_host", true),
      ]);

      setStats({
        totalHosts: totalRes.count || 0,
        activeHosts: activeRes.count || 0,
        pendingHosts: pendingRes.count || 0,
        blockedHosts: blockedRes.count || 0,
        totalEarnings: (earningsRes.data || []).reduce((sum, h) => sum + (h.total_earnings || 0), 0)
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const handleApproveHost = async (hostId: string) => {
    try {
      const { error } = await supabase.rpc('admin_update_user_gender', {
        _user_id: hostId,
        _gender: 'female',
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
      const { error } = await supabase.rpc('admin_update_user_gender', {
        _user_id: hostId,
        _gender: 'male',
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
      toast.error("Operation failed");
    }
  };

  const filteredHosts = hosts.filter(host =>
    host.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    host.id.includes(searchQuery)
  );

  const formatCoins = (coins: number) => {
    if (coins >= 1000000) return `${(coins / 1000000).toFixed(1)}M`;
    if (coins >= 1000) return `${(coins / 1000).toFixed(1)}K`;
    return coins.toString();
  };

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2 md:gap-3">
            <UserCheck className="w-5 h-5 md:w-7 md:h-7" />
            Host Management
          </h1>
          <p className="text-white/80 text-xs md:text-sm mt-1">Manage all hosts</p>
        </div>
        <Button className="bg-white text-green-600 hover:bg-green-50 shadow-md w-full md:w-auto" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Download Report
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 shadow-md">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-blue-500 flex items-center justify-center shadow">
                <UserCheck className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <div>
                <p className="text-blue-600 text-[10px] md:text-xs font-medium">Total Hosts</p>
                <p className="text-blue-900 font-bold text-lg md:text-xl">{stats.totalHosts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 shadow-md">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-green-500 flex items-center justify-center shadow">
                <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <div>
                <p className="text-green-600 text-[10px] md:text-xs font-medium">Active</p>
                <p className="text-green-900 font-bold text-lg md:text-xl">{stats.activeHosts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-500 flex items-center justify-center shadow">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-yellow-600 text-xs font-medium">Pending</p>
                <p className="text-yellow-900 font-bold text-xl">{stats.pendingHosts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center shadow">
                <Ban className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-red-600 text-xs font-medium">Blocked</p>
                <p className="text-red-900 font-bold text-xl">{stats.blockedHosts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center shadow">
                <Coins className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-purple-600 text-xs font-medium">Total Earnings</p>
                <p className="text-purple-900 font-bold text-xl">{formatCoins(stats.totalEarnings)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-slate-900 border-slate-700/50 shadow-lg">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>
             <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48 bg-slate-800 border-slate-600 text-white">
                <SelectValue placeholder="Filter Status" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
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
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white/70">Host</TableHead>
                <TableHead className="text-white/70">Level</TableHead>
                <TableHead className="text-white/70">Status</TableHead>
                <TableHead className="text-white/70">Rate/Min</TableHead>
                <TableHead className="text-white/70">Total Earnings</TableHead>
                <TableHead className="text-white/70">Call Minutes</TableHead>
                <TableHead className="text-white/70">Agency</TableHead>
                <TableHead className="text-white/70 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-white/60 py-10">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredHosts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-white/60 py-10">
                    No hosts found
                  </TableCell>
                </TableRow>
              ) : (
                filteredHosts.map((host) => (
                  <TableRow key={host.id} className="border-white/10 hover:bg-white/5">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10 border-2 border-pink-500/50">
                          <AvatarImage src={host.avatar_url || ""} />
                          <AvatarFallback className="bg-pink-500/20 text-pink-400">
                            {host.display_name?.charAt(0) || "H"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-white font-medium flex items-center gap-1">
                            {host.display_name}
                            {host.is_verified && <CheckCircle className="w-4 h-4 text-blue-400" />}
                          </p>
                          <p className="text-white/50 text-xs">{host.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-400" />
                        <span className="text-white">{host.host_level || 1}</span>
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
                      <span className="text-white">
                        {host.total_call_minutes || 0} mins
                      </span>
                    </TableCell>
                    <TableCell>
                      {host.agencies ? (
                        <span className="text-purple-400">{host.agencies.name}</span>
                      ) : (
                        <span className="text-white/40">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-white/50 hover:text-white">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-slate-800 border-white/10">
                          <DropdownMenuItem
                            className="text-white/70 hover:text-white"
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
          </Table>
        </CardContent>
      </Card>

      {/* Host Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Host Details</DialogTitle>
          </DialogHeader>
          {selectedHost && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="w-20 h-20 border-4 border-pink-500/50">
                  <AvatarImage src={selectedHost.avatar_url || ""} />
                  <AvatarFallback className="bg-pink-500/20 text-pink-400 text-2xl">
                    {selectedHost.display_name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-xl font-bold">{selectedHost.display_name}</h3>
                  <p className="text-white/50 text-sm">ID: {selectedHost.id}</p>
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
                  <p className="text-2xl font-bold text-white">{selectedHost.total_calls_received || 0}</p>
                  <p className="text-white/50 text-xs">Total Calls</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4 text-center">
                  <Clock className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">{selectedHost.total_call_minutes || 0}</p>
                  <p className="text-white/50 text-xs">Call Minutes</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4 text-center">
                  <Coins className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">{formatCoins(selectedHost.total_earnings || 0)}</p>
                  <p className="text-white/50 text-xs">Total Earnings</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4 text-center">
                  <TrendingUp className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">{getHostRate(selectedHost).toLocaleString()}</p>
                  <p className="text-white/50 text-xs">Rate/Min</p>
                </div>
              </div>

              {selectedHost.agencies && (
                <div className="bg-white/5 rounded-lg p-4">
                  <h4 className="text-white/70 text-sm mb-2">Agency Info</h4>
                  <p className="text-white font-medium">{selectedHost.agencies.name}</p>
                  <p className="text-white/50 text-sm">Code: {selectedHost.agencies.agency_code}</p>
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
