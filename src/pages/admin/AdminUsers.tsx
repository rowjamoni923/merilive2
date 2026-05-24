import { useState, useEffect, useCallback } from "react";
import { getAdminCache, setAdminCache, makeCacheKey } from "@/utils/adminDataCache";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Search,
  Filter,
  MoreVertical,
  Ban,
  CheckCircle,
  Eye,
  Edit,
  Trash2,
  Crown,
  Shield,
  ChevronLeft,
  ChevronRight,
  User,
  Mail,
  Phone,
  Calendar,
  Coins,
  Video,
  RefreshCw,
  Users
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
import { getDisplayAvatar } from "@/utils/placeholderAvatar";
interface UserProfile {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  app_uid: string | null;
  is_host: boolean | null;
  is_verified: boolean | null;
  is_online: boolean | null;
  is_blocked: boolean | null;
  blocked_reason: string | null;
  coins: number | null;
  user_level: number | null;
  host_level: number | null;
  total_earnings: number | null;
  gender: string | null;
  country_name: string | null;
  created_at: string | null;
}

export default function AdminUsers() {
  const location = useLocation();
  const [users, setUsers] = useState<UserProfile[]>(() => getAdminCache<UserProfile[]>('admin_users_list') || []);
  const [loading, setLoading] = useState(() => !getAdminCache('admin_users_list'));
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"name" | "uid">("name");
  const [filterType, setFilterType] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [banDevice, setBanDevice] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [blockedCount, setBlockedCount] = useState(0);
  
  const pageSize = 20;

  const fetchUsers = useCallback(async () => {
    if (users.length === 0) setLoading(true);
    try {
      let query = supabase
        .from("profiles")
        .select("*", { count: "exact" });

      // Apply filters
      if (filterType === "hosts") {
        query = query.eq("is_host", true);
      } else if (filterType === "blocked") {
        query = query.eq("is_blocked", true);
      } else if (filterType === "online") {
        query = query.eq("is_online", true);
      } else if (filterType === "verified") {
        query = query.eq("is_verified", true);
      }

      // Apply search
      if (searchQuery) {
        const trimmedSearch = searchQuery.trim();
        if (searchType === "uid") {
          query = query.or(`app_uid.eq.${trimmedSearch},app_uid.ilike.%${trimmedSearch}%`);
        } else {
          query = query.or(`display_name.ilike.%${trimmedSearch}%,username.ilike.%${trimmedSearch}%`);
        }
      }

      // Pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      setUsers(data || []);
      setAdminCache('admin_users_list', data || []);
      setTotalUsers(count || 0);

      // Pkg5: server-side aggregation via admin_user_stats RPC
      // (single round-trip, exact counts beyond 500-row REST cap)
      const { data: statsData } = await supabase.rpc('admin_user_stats');
      const s = (statsData || {}) as { blocked?: number };
      setBlockedCount(Number(s.blocked || 0));
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUsers.ErrorFetchingUsers", message: formatAdminError(error)});
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [currentPage, filterType, searchQuery, searchType]);

  useAdminRealtime(['profiles'], () => {
    void fetchUsers();
  });

  useEffect(() => {
    fetchUsers();
  }, [location.pathname, fetchUsers]);

  const handleBlockUser = async () => {
    if (!selectedUser) return;
    
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc("admin_block_user", {
        _user_id: selectedUser.id,
        _block: !selectedUser.is_blocked,
        _reason: blockReason || null,
        _ban_device: banDevice
      });

      if (error) throw error;
      
      const action = selectedUser.is_blocked ? "Unblocked" : (banDevice ? "Blocked + Device Banned" : "Blocked");
      toast.success(`${action} successfully`);
      setShowBlockDialog(false);
      setBlockReason("");
      setBanDevice(false);
      fetchUsers();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUsers.ErrorBlockingUser", message: formatAdminError(error)});
      toast.error((error as any)?.message || "Operation failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMakeHost = async (userId: string, isHost: boolean) => {
    try {
      const targetGender = isHost ? 'male' : 'female';
      const { error } = await supabase.rpc('admin_update_user_gender', {
        _user_id: userId,
        _gender: targetGender,
      });

      if (error) throw error;
      toast.success(isHost ? "Converted to User (Male)" : "Converted to Host (Female)");
      fetchUsers();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUsers.ErrorUpdatingHostStatus", message: formatAdminError(error)});
      toast.error((error as any)?.message || "Operation failed");
    }
  };

  const handleVerifyUser = async (userId: string, isVerified: boolean) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_verified: !isVerified })
        .eq("id", userId);

      if (error) throw error;
      toast.success(isVerified ? "Verification removed" : "User verified");
      fetchUsers();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUsers.ErrorVerifyingUser", message: formatAdminError(error)});
      toast.error((error as any)?.message || "Operation failed");
    }
  };

  const totalPages = Math.ceil(totalUsers / pageSize);

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 md:p-6 bg-gradient-to-r from-white via-purple-50/50 to-blue-50/50 rounded-xl md:rounded-2xl shadow-lg border border-slate-200/50">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-100">
            <Users className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">User Management</h1>
            <p className="text-sm md:text-base text-slate-600 font-medium">Total {totalUsers} Users</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchUsers}
          disabled={loading}
          className="gap-2 bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* Filters */}
      <Card className="bg-white border-slate-200 shadow-md">
        <CardContent className="p-3 md:p-4">
          <div className="flex flex-col gap-3">
            {/* Search Type Toggle */}
            <div className="flex gap-2">
              <Button
                variant={searchType === "name" ? "default" : "outline"}
                size="sm"
                onClick={() => setSearchType("name")}
                className={cn(
                  "flex-1 md:flex-none text-xs md:text-sm",
                  searchType === "name" ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white" : "bg-white border-slate-200 text-slate-700"
                )}
              >
                <User className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                Name
              </Button>
              <Button
                variant={searchType === "uid" ? "default" : "outline"}
                size="sm"
                onClick={() => setSearchType("uid")}
                className={cn(
                  "flex-1 md:flex-none text-xs md:text-sm",
                  searchType === "uid" ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white" : "bg-white border-slate-200 text-slate-700"
                )}
              >
                🆔 UID
              </Button>
            </div>
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder={searchType === "uid" ? "Search by UID..." : "Search by name..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-50 border-slate-200 text-slate-800 h-10 text-sm"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full md:w-40 bg-slate-50 border-slate-200 text-slate-700 h-10 text-sm">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="hosts">Hosts</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                   <SelectItem value="blocked">Blocked {blockedCount > 0 && `(${blockedCount})`}</SelectItem>
                 </SelectContent>
               </Select>
             </div>
           </div>
         </CardContent>
       </Card>

       {/* Blocked Users Warning Banner */}
       {blockedCount > 0 && filterType !== "blocked" && (
         <div 
           className="flex items-center gap-3 p-3 rounded-xl bg-red-100 border border-red-200 cursor-pointer hover:bg-red-200/70 transition-colors"
           onClick={() => setFilterType("blocked")}
         >
           <Ban className="w-5 h-5 text-red-500" />
           <div className="flex-1">
             <p className="text-sm font-medium text-red-700">
                {blockedCount} Blocked Users
              </p>
              <p className="text-xs text-red-500/70">Click to view</p>
           </div>
           <Badge className="bg-red-500 text-white">{blockedCount}</Badge>
         </div>
       )}

       {/* Users Table */}
      <Card className="bg-white border-slate-200 shadow-xl overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-black/60">
              <User className="w-12 h-12 mb-4" />
              <p className="font-bold">No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto touch-pan-y">
              <table className="w-full touch-pan-y select-none">
                <thead>
                  <tr className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-purple-50/30">
                    <th className="text-left p-4 text-black font-bold">User</th>
                    <th className="text-left p-4 text-black font-bold hidden md:table-cell">Status</th>
                    <th className="text-left p-4 text-black font-bold hidden lg:table-cell">Diamonds</th>
                    <th className="text-left p-4 text-black font-bold hidden lg:table-cell">Level</th>
                    <th className="text-left p-4 text-black font-bold hidden xl:table-cell">Joined</th>
                    <th className="text-right p-4 text-black font-bold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, i) => (
                    <motion.tr
                      key={user.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-slate-100 hover:bg-gradient-to-r hover:from-purple-50/50 hover:to-blue-50/50 transition-colors touch-pan-y select-none"
                    >
                      <td className="p-4 touch-pan-y select-none">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar className="w-10 h-10 border-2 border-slate-200 shadow-sm">
                              <AvatarImage
                                src={getDisplayAvatar(user.id, user.avatar_url, { gender: (user.gender as any) || 'female' })}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                              <AvatarFallback className="bg-gradient-to-br from-pink-400 to-purple-500 text-white">
                                {user.display_name?.charAt(0) || "U"}
                              </AvatarFallback>
                            </Avatar>
                            {user.is_online && (
                              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                            )}
                          </div>
                          <div>
                            <p className="text-black font-bold flex items-center gap-2 select-none">
                              {user.display_name || "Unknown"}
                              {user.is_verified && (
                                <CheckCircle className="w-4 h-4 text-blue-500" />
                              )}
                              {user.is_host && (
                                <Crown className="w-4 h-4 text-amber-500" />
                              )}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm text-slate-500 select-none">@{user.username || user.id.slice(0, 8)}</p>
                              {user.app_uid && (
                                <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200">
                                  {user.app_uid}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          {user.is_blocked ? (
                            <Badge className="bg-red-100 text-red-600 border-red-200">
                              <Ban className="w-3 h-3 mr-1" />
                              Blocked
                            </Badge>
                          ) : user.is_online ? (
                            <Badge className="bg-green-100 text-green-600 border-green-200">
                              Online
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-600 border-slate-200">
                              Offline
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <div className="flex items-center gap-1 text-amber-600 font-medium">
                          <Coins className="w-4 h-4" />
                          <span>{user.coins?.toLocaleString() || 0}</span>
                        </div>
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <Badge className="bg-purple-100 text-purple-700 border-purple-200 font-semibold">
                          Lv. {user.user_level || 0}
                        </Badge>
                      </td>
                      <td className="p-4 hidden xl:table-cell text-slate-500 text-sm">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString("en-US") : "-"}
                      </td>
                      <td className="p-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-800 hover:bg-slate-100">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-xl">
                            <DropdownMenuItem 
                              className="text-black font-semibold hover:bg-slate-100"
                              onClick={() => {
                                setSelectedUser(user);
                                setShowUserDialog(true);
                              }}
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-black font-semibold hover:bg-slate-100"
                              onClick={() => handleVerifyUser(user.id, user.is_verified || false)}
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              {user.is_verified ? "Remove Verify" : "Verify User"}
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-black font-semibold hover:bg-slate-100"
                              onClick={() => handleMakeHost(user.id, user.is_host || false)}
                            >
                              <Crown className="w-4 h-4 mr-2" />
                              {user.is_host ? "Remove Host" : "Make Host"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-slate-200" />
                            <DropdownMenuItem 
                              className={user.is_blocked ? "text-green-600 font-bold" : "text-red-600 font-bold"}
                              onClick={() => {
                                setSelectedUser(user);
                                setShowBlockDialog(true);
                              }}
                            >
                              <Ban className="w-4 h-4 mr-2" />
                              {user.is_blocked ? "Unblock" : "Block"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
            className="bg-white border-slate-300 text-black font-bold"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-black font-bold px-4">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
            className="bg-white border-slate-300 text-black font-bold"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white font-bold">
              {selectedUser?.is_blocked ? "Unblock User" : "Block User"}
            </DialogTitle>
            <DialogDescription className="text-slate-400 font-semibold">
              Do you want to {selectedUser?.is_blocked ? "unblock" : "block"} {selectedUser?.display_name}?
            </DialogDescription>
          </DialogHeader>
          {!selectedUser?.is_blocked && (
            <div className="space-y-3">
              <Textarea
                placeholder="Reason for blocking (optional)"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className="bg-slate-800 border-slate-600 text-white font-semibold"
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={banDevice}
                  onChange={(e) => setBanDevice(e.target.checked)}
                  className="w-4 h-4 rounded border-red-500 text-red-600 focus:ring-red-500"
                />
                <span className="text-red-400 font-semibold text-sm">🔒 Also ban device permanently</span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBlockDialog(false)}
              className="bg-slate-800 border-slate-600 text-white font-bold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBlockUser}
              disabled={actionLoading}
              className={selectedUser?.is_blocked ? "bg-green-600 font-bold" : "bg-red-600 font-bold"}
            >
              {actionLoading ? "Please wait..." : selectedUser?.is_blocked ? "Unblock" : "Block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Details Dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent className="bg-slate-800 border-white/10 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">User Details</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16 border-2 border-primary/50">
                  <AvatarImage
                    src={getDisplayAvatar(selectedUser.id, selectedUser.avatar_url, { gender: (selectedUser.gender as any) || 'female' })}
                    referrerPolicy="no-referrer"
                  />
                  <AvatarFallback className="bg-primary/20 text-primary text-xl">
                    {selectedUser.display_name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-white font-bold text-lg">{selectedUser.display_name}</p>
                  <p className="text-white/50">@{selectedUser.username || selectedUser.id.slice(0, 8)}</p>
                  {/* App UID with Copy Button */}
                  {selectedUser.app_uid && (
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 font-mono">
                        {selectedUser.app_uid}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6 text-white/50 hover:text-white"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedUser.app_uid || "");
                          toast.success("App UID copied");
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-white/50 text-sm">Diamonds</p>
                  <p className="text-yellow-400 font-bold">{selectedUser.coins?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-white/50 text-sm">Level</p>
                  <p className="text-purple-400 font-bold">Lv. {selectedUser.user_level || 0}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-white/50 text-sm">Earnings</p>
                  <p className="text-green-400 font-bold">{selectedUser.total_earnings?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-white/50 text-sm">Country</p>
                  <p className="text-white font-bold">{selectedUser.country_name || "-"}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedUser.is_host && (
                  <Badge className="bg-yellow-500/20 text-yellow-400">
                    <Crown className="w-3 h-3 mr-1" />
                    Host
                  </Badge>
                )}
                {selectedUser.is_verified && (
                  <Badge className="bg-blue-500/20 text-blue-400">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Verified
                  </Badge>
                )}
                {selectedUser.is_blocked && (
                  <Badge className="bg-red-500/20 text-red-400">
                    <Ban className="w-3 h-3 mr-1" />
                    Blocked
                  </Badge>
                )}
              </div>

              {selectedUser.blocked_reason && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-red-400 text-sm font-medium">Block Reason:</p>
                  <p className="text-white/70 text-sm">{selectedUser.blocked_reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
